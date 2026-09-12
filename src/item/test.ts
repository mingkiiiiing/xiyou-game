/**
 * TASK-E 单元测试（纯逻辑，不依赖 pixi）。
 * 运行：npx tsx src/item/test.ts —— 全部通过输出 ✓；任一失败输出 ✗ 并 exit 1。
 */
import { mulberry32, randInt, pickWeighted } from './rng';
import { DropResolver } from './dropResolver';
import type { DropRule } from './dropResolver';
import { Inventory } from './inventory';
import { Equipment } from './equipment';
import { tryStrengthen, strengthenCost, strengthenSuccessRate } from './strengthen';
import { recalcStats, itemStats } from './stats';
import { socketGem, unsocketGem, emptySocketCount, GemBag, gemMapOf, getGem } from './gems';
import { ITEM_TABLE, STRENGTHEN_CONFIG, DEFAULT_AFFIX_POOL, DEFAULT_GEMS, QUALITY_AFFIX_COUNT } from './data';
import { EQUIPMENT_SLOTS, QUALITY_ORDER, SOCKET_COUNT } from './types';
import type { InventoryItem, StrengthenConfig } from './types';
import type { BattleStats } from '../shared/types';

// ───────────────────────── 断言工具 ─────────────────────────
let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ' | ' + detail : ''}`);
    console.log(`  ✗ ${name}${detail ? ' | ' + detail : ''}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  check(name, a === b, `actual=${a} expected=${b}`);
}

function section(title: string): void {
  console.log(`\n■ ${title}`);
}

// ───────────────────────── 测试用工厂 ─────────────────────────
let uidSeq = 0;
function makeItem(patch: Partial<InventoryItem> = {}): InventoryItem {
  return {
    uid: `t${++uidSeq}`,
    defId: 'test_def',
    name: '测试装备',
    slot: 'weapon',
    quality: 'blue',
    baseStats: { atk: 6 },
    affixes: [],
    strengthenLevel: 0,
    sockets: [null, null, null],
    ...patch,
  };
}

function mkCfg(over: Partial<StrengthenConfig> = {}): StrengthenConfig {
  return {
    maxLevel: 15,
    bonusPerLevel: 0.08,
    successRate: [100, 100, 90, 80, 70, 60, 50, 40, 30, 20, 15, 12, 10, 8, 6],
    failPenalty: 'none',
    ...over,
  };
}

const BASE: BattleStats = {
  hp: 50, maxHp: 100, mp: 20, maxMp: 50,
  atk: 10, def: 5, critRate: 8, critDmg: 150, moveSpeed: 320,
};

// ───────────────────────── RNG ─────────────────────────
section('RNG 可注入随机源');
{
  const ra = mulberry32(7);
  const rb = mulberry32(7);
  const seqA = [ra(), ra(), ra(), ra(), ra()];
  const seqB = [rb(), rb(), rb(), rb(), rb()];
  eq('同种子序列完全一致', seqA, seqB);

  const rr = mulberry32(123);
  let inRange = true;
  for (let i = 0; i < 500; i++) {
    const v = randInt(rr, 2, 5);
    if (!Number.isInteger(v) || v < 2 || v > 5) inRange = false;
  }
  check('randInt 在闭区间内取整', inRange);

  eq('pickWeighted：权重 0 不被选中', pickWeighted(() => 0.99, [['x', 0] as [string, number], ['y', 5]]), 'y');
  eq('pickWeighted：rng=0 选中首个有权重项', pickWeighted(() => 0, [['x', 3], ['y', 5]]), 'x');
}

// ───────────────────────── DropResolver ─────────────────────────
section('DropResolver 掉落（品质 + 词条 roll）');
{
  const items = ITEM_TABLE;
  const r1 = new DropResolver({ items, rng: mulberry32(42) });

  eq('chance=0 不掉落', r1.resolve([{ itemId: 'wooden_staff', chance: 0 }]).length, 0);
  const always = r1.resolve([{ itemId: 'iron_blade', chance: 1 }]);
  eq('chance=1 必掉落', always.length, 1);
  const it0 = always[0];
  check('实例字段来自 ItemDef', it0.defId === 'iron_blade' && it0.name === '精铁刀' && it0.slot === 'weapon');
  check('baseStats 为快照', JSON.stringify(it0.baseStats) === JSON.stringify({ atk: 6 }));
  eq('初始强化等级 0', it0.strengthenLevel, 0);
  check('3 个空宝石孔', it0.sockets.length === SOCKET_COUNT && it0.sockets.every((s) => s === null));

  eq('未知 itemId 被跳过', r1.resolve([{ itemId: 'no_such_item', chance: 1 }]).length, 0);

  const forced = new DropResolver({ items, rng: mulberry32(7), qualityWeights: { purple: 1 } });
  const rolled = forced.resolve([{ itemId: 'wooden_staff', chance: 1 }, { itemId: 'cloth_robe', chance: 1 }]);
  check('品质权重全压紫 → 全部 purple', rolled.length === 2 && rolled.every((i) => i.quality === 'purple'));
  eq('紫装词条数 = QUALITY_AFFIX_COUNT.purple', rolled[0].affixes.length, QUALITY_AFFIX_COUNT.purple);

  const whiteOnly = new DropResolver({ items, rng: mulberry32(1), qualityWeights: { white: 1 } });
  const whiteItem = whiteOnly.resolve([{ itemId: 'wooden_staff', chance: 1 }])[0];
  eq('白装无词条', whiteItem.affixes.length, 0);

  const red = new DropResolver({ items, rng: mulberry32(99), qualityWeights: { red: 1 } });
  const redItem = red.resolve([{ itemId: 'iron_blade', chance: 1 }])[0];
  eq('红装词条数 = 4', redItem.affixes.length, QUALITY_AFFIX_COUNT.red);
  check('词条 id 互不重复', new Set(redItem.affixes.map((a) => a.id)).size === redItem.affixes.length);
  check(
    '词条值在定义区间内',
    redItem.affixes.every((a) => {
      const def = DEFAULT_AFFIX_POOL.find((d) => d.id === a.id);
      return def !== undefined && a.value >= def.min && a.value <= def.max;
    }),
  );

  // 确定性：同种子两次解析结果完全一致
  const qw = { white: 3, green: 2, blue: 3, purple: 2, orange: 1, red: 1 };
  const a = new DropResolver({ items, rng: mulberry32(2024), qualityWeights: qw });
  const b = new DropResolver({ items, rng: mulberry32(2024), qualityWeights: qw });
  const drops: DropRule[] = [
    { itemId: 'wooden_staff', chance: 0.8 },
    { itemId: 'iron_blade', chance: 0.8 },
    { itemId: 'cloth_robe', chance: 0.8 },
  ];
  eq('同种子掉落序列完全一致', JSON.stringify(a.resolve(drops)), JSON.stringify(b.resolve(drops)));

  // uid 唯一性（默认递增工厂）
  const c = new DropResolver({ items, rng: mulberry32(5) });
  const uids: string[] = [];
  for (let i = 0; i < 20; i++) for (const it of c.resolve(drops)) uids.push(it.uid);
  check('uid 全局唯一', uids.length > 30 && new Set(uids).size === uids.length, `count=${uids.length}`);
}

// ───────────────────────── Inventory ─────────────────────────
section('Inventory 背包（容量 / add / remove）');
{
  const inv = new Inventory(2);
  const i1 = makeItem({ uid: 'i1' });
  const i2 = makeItem({ uid: 'i2' });
  const i3 = makeItem({ uid: 'i3' });
  check('add 成功', inv.add(i1) === true && inv.add(i2) === true);
  check('容量上限生效', inv.add(i3) === false && inv.size === 2 && inv.isFull);
  check('get 命中', inv.get('i1') === i1 && inv.has('i2'));
  const removed = inv.remove('i1');
  check('remove 返回被移除项', removed === i1 && inv.get('i1') === null && inv.size === 1);
  check('remove 不存在返回 null', inv.remove('zzz') === null);
  const res2 = inv.addAll([i1, i3]);
  check(
    'addAll 区分 added/overflow',
    res2.added.length === 1 && res2.added[0] === i1 && res2.overflow.length === 1 && res2.overflow[0] === i3,
  );
}

section('Inventory 排序');
{
  const inv2 = new Inventory(10);
  const wA = makeItem({ uid: 'a', slot: 'weapon', quality: 'white', name: '木棍' });
  const wC = makeItem({ uid: 'c', slot: 'weapon', quality: 'green', name: '铁刀' });
  const bB = makeItem({ uid: 'b', slot: 'body', quality: 'blue', name: '布袍' });
  inv2.add(bB);
  inv2.add(wA);
  inv2.add(wC);
  inv2.sort();
  eq('默认排序：槽位 → 品质降序', inv2.list().map((i) => i.uid), ['c', 'a', 'b']);
  inv2.sort((x, y) => x.uid.localeCompare(y.uid));
  eq('自定义比较器生效', inv2.list().map((i) => i.uid), ['a', 'b', 'c']);
}

// ───────────────────────── Equipment ─────────────────────────
section('Equipment 装备栏（穿戴 / 换装 / 卸下）');
{
  const eq2 = new Equipment();
  const wpn = makeItem({ uid: 'w', slot: 'weapon' });
  const resE = eq2.equip(wpn);
  check('穿戴成功', resE.ok && resE.replaced === null && eq2.get('weapon') === wpn);

  const wpn2 = makeItem({ uid: 'w2', slot: 'weapon' });
  const resE2 = eq2.equip(wpn2);
  check('换装返回旧装备', resE2.ok && resE2.replaced === wpn && eq2.get('weapon') === wpn2);

  const hat = makeItem({ uid: 'h', slot: 'head' });
  eq2.equip(hat);
  eq('equippedItems 只含已穿戴', eq2.equippedItems().map((i) => i.uid).sort(), ['h', 'w2']);
  check('all() 其余槽位为 null', eq2.all().body === null && eq2.all().accessory === null);

  check('卸下返回装备', eq2.unequip('weapon') === wpn2);
  check('重复卸下返回 null', eq2.unequip('weapon') === null && eq2.get('weapon') === null);
  eq2.clear();
  check('clear 清空全部', eq2.equippedItems().length === 0);
}

// ───────────────────────── recalcStats ─────────────────────────
section('recalcStats 属性聚合（纯函数）');
{
  // weapon: atk 6 + 强化 round(6*0.08*2)=1 + 词条4 + 宝石2 = 13
  const weapon = makeItem({
    uid: 'w1', slot: 'weapon', defId: 'iron_blade', name: '精铁刀',
    baseStats: { atk: 6 },
    affixes: [{ id: 'affix_atk', stat: 'atk', value: 4 }],
    strengthenLevel: 2,
    sockets: ['gem_atk_1', null, null],
  });
  // body: maxHp 20+5(强化)+5(词条)+10+10(双血珀石)=50；def 2+round(2*0.08*3)=0
  const armor = makeItem({
    uid: 'b1', slot: 'body', defId: 'cloth_robe', name: '粗布袍',
    baseStats: { maxHp: 20, def: 2 },
    affixes: [
      { id: 'affix_critRate', stat: 'critRate', value: 3 },
      { id: 'affix_maxHp', stat: 'maxHp', value: 5 },
    ],
    strengthenLevel: 3,
    sockets: ['gem_hp_1', 'gem_hp_1', null],
  });

  const wContrib = itemStats(weapon, DEFAULT_GEMS, STRENGTHEN_CONFIG);
  eq('单件贡献 atk（基础+强化+词条+宝石）', wContrib.atk, 13);
  const bContrib = itemStats(armor, DEFAULT_GEMS, STRENGTHEN_CONFIG);
  eq('单件贡献 maxHp', bContrib.maxHp, 50);
  eq('单件贡献 def（强化取整后为 0）', bContrib.def, 2);

  const total = recalcStats(BASE, [weapon, armor], DEFAULT_GEMS, STRENGTHEN_CONFIG);
  eq('atk = 10 + 13', total.atk, 23);
  eq('maxHp = 100 + 50', total.maxHp, 150);
  eq('def = 5 + 2', total.def, 7);
  eq('critRate = 8 + 3', total.critRate, 11);
  eq('hp 不被装备抬高（不自动回血）', total.hp, 50);
  eq('critDmg 不变', total.critDmg, 150);
  eq('moveSpeed 不变', total.moveSpeed, 320);
  eq('mp/maxMp 不变', [total.mp, total.maxMp], [20, 50]);

  // 纯函数：不修改任何入参
  const snapBase = JSON.stringify(BASE);
  const snapItems = JSON.stringify([weapon, armor]);
  const snapGems = JSON.stringify(DEFAULT_GEMS);
  const snapCfg = JSON.stringify(STRENGTHEN_CONFIG);
  recalcStats(BASE, [weapon, armor], DEFAULT_GEMS, STRENGTHEN_CONFIG);
  check(
    '纯函数：不修改 base/装备/宝石表/强化配置',
    snapBase === JSON.stringify(BASE) &&
      snapItems === JSON.stringify([weapon, armor]) &&
      snapGems === JSON.stringify(DEFAULT_GEMS) &&
      snapCfg === JSON.stringify(STRENGTHEN_CONFIG),
  );

  // hp 钳制
  const weirdBase: BattleStats = { ...BASE, hp: 100, maxHp: 80 };
  const t2 = recalcStats(weirdBase, [], DEFAULT_GEMS, STRENGTHEN_CONFIG);
  eq('hp 超上限时钳制到 maxHp', t2.hp, 80);

  // Equipment 记录 与 数组 两种入参等价
  const eqp = new Equipment();
  eqp.equip(weapon);
  const t3 = recalcStats(BASE, eqp.all(), DEFAULT_GEMS, STRENGTHEN_CONFIG);
  const t4 = recalcStats(BASE, [weapon], DEFAULT_GEMS, STRENGTHEN_CONFIG);
  eq('Equipment.all() 与数组入参等价', t3, t4);

  // 宝石表 数组 / Map 等价
  const tArr = recalcStats(BASE, [weapon], DEFAULT_GEMS, STRENGTHEN_CONFIG);
  const tMap = recalcStats(BASE, [weapon], gemMapOf(DEFAULT_GEMS), STRENGTHEN_CONFIG);
  eq('宝石表传数组或 Map 等价', tMap, tArr);
}

// ───────────────────────── 强化 ─────────────────────────
section('强化（成功率表 / 材料 / 失败不掉级）');
{
  eq('strengthenCost(0) = 1', strengthenCost(0), 1);
  eq('strengthenCost(5) = 6', strengthenCost(5), 6);
  eq('0→1 成功率 100%（来自 config）', strengthenSuccessRate(STRENGTHEN_CONFIG, 0), 100);
  eq('已满级返回 null', strengthenSuccessRate(mkCfg({ maxLevel: 2 }), 2), null);

  const sItem = makeItem({ uid: 's1', strengthenLevel: 0 });
  const rS = tryStrengthen(sItem, mkCfg(), 10, () => 0);
  check('必成强化成功 +1 级', rS.performed && rS.success && rS.toLevel === 1 && sItem.strengthenLevel === 1);
  eq('成功消耗 1 强化石', rS.cost, 1);

  const fItem = makeItem({ uid: 'f1', strengthenLevel: 4 });
  const rF = tryStrengthen(fItem, mkCfg(), 10, () => 0.999);
  check(
    '失败不掉级（failPenalty=none）',
    rF.performed && !rF.success && rF.fromLevel === 4 && rF.toLevel === 4 && fItem.strengthenLevel === 4,
  );
  eq('失败也消耗材料', rF.cost, 5);

  const dItem = makeItem({ uid: 'd1', strengthenLevel: 3 });
  const rD = tryStrengthen(dItem, mkCfg({ failPenalty: 'dropLevel', successRate: [50, 50, 50, 50, 50] }), 10, () => 0.999);
  check('dropLevel 惩罚时失败降 1 级', rD.performed && !rD.success && dItem.strengthenLevel === 2);

  const pItem = makeItem({ uid: 'p1', strengthenLevel: 0 });
  const rP = tryStrengthen(pItem, mkCfg(), 0, () => 0);
  check('强化石不足不执行', !rP.performed && pItem.strengthenLevel === 0 && (rP.reason ?? '').includes('强化石不足'));

  const mItem = makeItem({ uid: 'm1', strengthenLevel: 15 });
  const rM = tryStrengthen(mItem, mkCfg(), 99, () => 0);
  check('满级不可再强化', !rM.performed && mItem.strengthenLevel === 15);
}

// ───────────────────────── 宝石 ─────────────────────────
section('宝石系统（3 级体系 / 镶嵌 / 摘除 / 3 孔）');
{
  check('每件装备固定 3 孔', SOCKET_COUNT === 3);

  const gItem = makeItem({ uid: 'g1', sockets: [null, null, null] });
  check('镶嵌成功', socketGem(gItem, 0, 'gem_atk_1', DEFAULT_GEMS).ok && gItem.sockets[0] === 'gem_atk_1');
  check('重复镶嵌同一孔失败', socketGem(gItem, 0, 'gem_def_1', DEFAULT_GEMS).ok === false);
  check(
    '孔位越界失败',
    socketGem(gItem, 3, 'gem_atk_1', DEFAULT_GEMS).ok === false &&
      socketGem(gItem, -1, 'gem_atk_1', DEFAULT_GEMS).ok === false,
  );
  check('未知宝石失败', socketGem(gItem, 1, 'gem_xxx', DEFAULT_GEMS).ok === false);
  eq('空孔数 = 2', emptySocketCount(gItem), 2);

  const u1 = unsocketGem(gItem, 0);
  check('摘除返回宝石并清孔', u1.ok && u1.gemId === 'gem_atk_1' && gItem.sockets[0] === null);
  check('摘除空孔失败', unsocketGem(gItem, 0).ok === false);

  const bag2 = new GemBag();
  bag2.add('gem_atk_1', 2);
  eq('GemBag 计数', bag2.count('gem_atk_1'), 2);
  check('GemBag 数量不足不可移除', bag2.remove('gem_atk_1', 3) === false);
  check('GemBag 移除成功', bag2.remove('gem_atk_1', 2) === true && bag2.count('gem_atk_1') === 0);
  eq('GemBag 总数归零', bag2.total(), 0);

  const tiers = DEFAULT_GEMS.filter((g) => g.id.startsWith('gem_atk_')).map((g) => g.tier);
  eq('攻击石 3 级体系', tiers, [1, 2, 3]);
  check('宝石 id 唯一', new Set(DEFAULT_GEMS.map((g) => g.id)).size === DEFAULT_GEMS.length);
  const g1 = getGem(DEFAULT_GEMS, 'gem_atk_1');
  const g2 = getGem(DEFAULT_GEMS, 'gem_atk_2');
  const g3 = getGem(DEFAULT_GEMS, 'gem_atk_3');
  check('宝石数值随 tier 递增', g1 !== undefined && g2 !== undefined && g3 !== undefined && g1.value < g2.value && g2.value < g3.value);
  const gm = gemMapOf(DEFAULT_GEMS);
  check('gemMapOf/getGem 可用（数组与 Map）', gm.size === DEFAULT_GEMS.length && getGem(gm, 'gem_hp_3') !== undefined && getGem(DEFAULT_GEMS, 'gem_hp_3') !== undefined);
}

// ───────────────────────── 数据表 sanity ─────────────────────────
section('数据表 sanity');
{
  check('ITEM_TABLE 非空', ITEM_TABLE.length > 0);
  check(
    'ItemDef 槽位/品质合法',
    ITEM_TABLE.every((d) => (EQUIPMENT_SLOTS as readonly string[]).includes(d.slot) && QUALITY_ORDER.includes(d.quality)),
  );
  check('strengthen 表长度与 maxLevel 一致', STRENGTHEN_CONFIG.successRate.length === STRENGTHEN_CONFIG.maxLevel);
  check('strengthen successRate 均在 0-100', STRENGTHEN_CONFIG.successRate.every((r) => r >= 0 && r <= 100));
  check('failPenalty 为 none（v1 失败不掉级）', STRENGTHEN_CONFIG.failPenalty === 'none');
}

// ───────────────────────── 汇总 ─────────────────────────
console.log(`\n========== ${passed} 通过 / ${failures.length} 失败 ==========`);
if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
process.exit(0);
