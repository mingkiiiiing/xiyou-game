/**
 * IT-1.5 冒烟测试（headless）。
 * 覆盖：数据表完整性 → 玩家成长 → 属性聚合 → 掉落 → 拾取 → 战斗数值 → 结算与存档。
 *
 * 运行：npx tsx scripts/smoke-test.ts（或 npm run smoke）
 * 约束：不 import 任何 pixi / DOM 模块（scenes/、core/Game 等一律不碰）；
 *       只依赖 item / data / meta 三层纯逻辑，可在无浏览器环境下跑。
 *
 * 断言风格对齐 src/item/test.ts：通过输出 ✓，失败输出 ✗ 并 exit 1。
 */
import {
  config,
  getConfig,
  playerStatsAtLevel,
  powerOf,
} from '../src/data/ConfigLoader';
import { DropResolver } from '../src/item/dropResolver';
import type { DropRule } from '../src/item/dropResolver';
import { Inventory } from '../src/item/inventory';
import { Equipment } from '../src/item/equipment';
import { recalcStats, itemStats } from '../src/item/stats';
import { gemMapOf } from '../src/item/gems';
import { mulberry32 } from '../src/item/rng';
import {
  ITEM_TABLE,
  STRENGTHEN_CONFIG,
  DEFAULT_GEMS,
  DEFAULT_AFFIX_POOL,
  QUALITY_AFFIX_COUNT,
  findItemDef,
} from '../src/item/data';
import { SOCKET_COUNT, QUALITY_ORDER } from '../src/item/types';
import type { InventoryItem } from '../src/item/types';
import type { BattleStats, MonsterDef } from '../src/shared/types';
import { defaultSave, gainExp, expNeeded, clearReward, playerBaseStats } from '../src/meta/save';
import { LevelFlow, isLevelUnlocked } from '../src/meta/levelFlow';
import { buildLoadoutStats, resolveMonsterDrops } from '../src/item/bridge';
import { BattleDirector } from '../src/game/BattleDirector';

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

function throws(name: string, fn: () => unknown): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  check(name, threw, '期望抛错但没有');
}

function section(title: string): void {
  console.log(`\n■ ${title}`);
}

// ───────────────────────── 测试用工厂 ─────────────────────────
let uidSeq = 0;
function makeItem(patch: Partial<InventoryItem> = {}): InventoryItem {
  return {
    uid: `s${++uidSeq}`,
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

const BASE: BattleStats = {
  hp: 50, maxHp: 100, mp: 20, maxMp: 50,
  atk: 10, def: 5, critRate: 8, critDmg: 150, moveSpeed: 320,
};

// ═════════════════════════ 1. 数据表完整性 ═════════════════════════
section('1. 数据表完整性（ConfigLoader 加载 + getter 命中/抛错）');
{
  check('player / formula / strengthen 表已加载', !!config.player && !!config.formula && !!config.strengthen);
  check(
    'skills / monsters / items / gems / levels 表非空',
    config.skills.length > 0 &&
      config.monsters.length > 0 &&
      config.items.length > 0 &&
      config.gems.length > 0 &&
      config.levels.length > 0,
  );

  const mon = getConfig.monster('monkey_soldier');
  check('getConfig.monster 命中已存在 id', mon.id === 'monkey_soldier' && mon.stats.hp > 0);
  throws('getConfig.monster 对不存在 id 抛错', () => getConfig.monster('no_such_monster'));

  const item = getConfig.item('iron_blade');
  check('getConfig.item 命中已存在 id', item.id === 'iron_blade' && item.name.length > 0);
  throws('getConfig.item 对不存在 id 抛错', () => getConfig.item('no_such_item'));

  check('getConfig.gem 命中', getConfig.gem('gem_atk_1').value === 2);
  throws('getConfig.gem 对不存在 id 抛错', () => getConfig.gem('gem_xxx'));

  check('getConfig.level 命中', getConfig.level('1-1').chapter === 1);
  throws('getConfig.level 对不存在 id 抛错', () => getConfig.level('9-9'));

  // data.ts 的 ITEM_TABLE 与 ConfigLoader 的 items 同源一致
  check(
    'ITEM_TABLE 与 ConfigLoader.items 同源',
    ITEM_TABLE.length === getConfig.allItems().length &&
      findItemDef('iron_blade')?.name === getConfig.item('iron_blade').name,
  );
}

// ═════════════════════════ 2. 玩家成长 ═════════════════════════
section('2. 玩家成长（等级锚点 / 单调性 / 战力）');
{
  const lv1 = playerStatsAtLevel(1);
  eq('Lv1 锚点 hp/mp/atk/def', [lv1.maxHp, lv1.maxMp, lv1.atk, lv1.def], [100, 50, 10, 5]);

  const lv10 = playerStatsAtLevel(10);
  const lv50 = playerStatsAtLevel(50);
  check(
    'Lv50 相对低等级 atk/hp 单调增长',
    lv50.atk > lv10.atk && lv10.atk > lv1.atk && lv50.maxHp > lv10.maxHp && lv10.maxHp > lv1.maxHp,
    `atk=${lv1.atk}/${lv10.atk}/${lv50.atk} hp=${lv1.maxHp}/${lv10.maxHp}/${lv50.maxHp}`,
  );
  check('等级取整：playerStatsAtLevel(1.9) === (1)', JSON.stringify(playerStatsAtLevel(1.9)) === JSON.stringify(lv1));

  eq('Lv1 裸身战力 = atk×10+def×8+maxHp+critRate×5 = 280', powerOf(lv1.maxHp, lv1.atk, lv1.def, 8), 280);
  eq('powerOf 参数口径（maxHp,atk,def,critRate）', powerOf(200, 20, 10, 10), 20 * 10 + 10 * 8 + 200 + 10 * 5);
}

// ═════════════════════════ 3. 属性聚合 ═════════════════════════
section('3. 属性聚合 recalcStats（强化 + 词条 + 宝石，手算校验 + 纯函数）');
{
  // 武器：base atk6，强化 2 级 → round(6×0.08×2)=round(0.96)=1；词条 atk+4；宝石 gem_atk_1(+2)
  // 贡献 = 6 + 1 + 4 + 2 = 13
  const weapon = makeItem({
    uid: 'w1', slot: 'weapon', defId: 'iron_blade', name: '精铁刀',
    baseStats: { atk: 6 },
    affixes: [{ id: 'affix_atk', stat: 'atk', value: 4 }],
    strengthenLevel: 2,
    sockets: ['gem_atk_1', null, null],
  });
  // 护甲：base maxHp20/def2，强化 3 级 → maxHp round(20×0.08×3)=round(4.8)=5，def round(0.48)=0
  // 词条 maxHp+5；双血珀石 gem_hp_1(+10)×2
  // maxHp 贡献 = 20 + 5 + 5 + 20 = 50；def 贡献 = 2 + 0 = 2
  const armor = makeItem({
    uid: 'a1', slot: 'body', defId: 'cloth_robe', name: '粗布袍',
    baseStats: { maxHp: 20, def: 2 },
    affixes: [{ id: 'affix_maxHp', stat: 'maxHp', value: 5 }],
    strengthenLevel: 3,
    sockets: ['gem_hp_1', 'gem_hp_1', null],
  });

  eq('单件贡献 atk（基础+强化+词条+宝石）', itemStats(weapon, DEFAULT_GEMS, STRENGTHEN_CONFIG).atk, 13);
  eq('单件贡献 maxHp', itemStats(armor, DEFAULT_GEMS, STRENGTHEN_CONFIG).maxHp, 50);
  eq('单件贡献 def（强化取整为 0）', itemStats(armor, DEFAULT_GEMS, STRENGTHEN_CONFIG).def, 2);

  const total = recalcStats(BASE, [weapon, armor], DEFAULT_GEMS, STRENGTHEN_CONFIG);
  eq('atk 增量 = 13', total.atk - BASE.atk, 13);
  eq('def 增量 = 2', total.def - BASE.def, 2);
  eq('maxHp 增量 = 50', total.maxHp - BASE.maxHp, 50);
  eq('聚合后 atk/def/maxHp 绝对值', [total.atk, total.def, total.maxHp], [23, 7, 150]);
  eq('hp 不被装备抬高（不自动回血）', total.hp, 50);
  eq('mp/maxMp/critDmg/moveSpeed 不变', [total.mp, total.maxMp, total.critDmg, total.moveSpeed], [20, 50, 150, 320]);

  // 纯函数：不修改任何入参
  const snapBase = JSON.stringify(BASE);
  const snapItems = JSON.stringify([weapon, armor]);
  const snapGems = JSON.stringify(DEFAULT_GEMS);
  const snapCfg = JSON.stringify(STRENGTHEN_CONFIG);
  recalcStats(BASE, [weapon, armor], DEFAULT_GEMS, STRENGTHEN_CONFIG);
  check(
    '纯函数：调用前后 base/装备/宝石表/强化配置深度相等',
    snapBase === JSON.stringify(BASE) &&
      snapItems === JSON.stringify([weapon, armor]) &&
      snapGems === JSON.stringify(DEFAULT_GEMS) &&
      snapCfg === JSON.stringify(STRENGTHEN_CONFIG),
  );

  // Equipment.all() 与数组入参等价
  const eqp = new Equipment();
  eqp.equip(weapon);
  eqp.equip(armor);
  eq(
    'Equipment.all() 与数组入参结果一致',
    recalcStats(BASE, eqp.all(), DEFAULT_GEMS, STRENGTHEN_CONFIG),
    recalcStats(BASE, [weapon, armor], DEFAULT_GEMS, STRENGTHEN_CONFIG),
  );
  // 宝石表数组 / Map 等价
  eq(
    '宝石表传数组或 Map 等价',
    recalcStats(BASE, [weapon], gemMapOf(DEFAULT_GEMS), STRENGTHEN_CONFIG),
    recalcStats(BASE, [weapon], DEFAULT_GEMS, STRENGTHEN_CONFIG),
  );
}

// ═════════════════════════ 3b. 装备→战斗桥接（IT-1.2） ═════════════════════════
section('3b. 桥接层 buildLoadoutStats / resolveMonsterDrops（IT-1.2 接口）');
{
  // buildLoadoutStats（存档裸身属性 + 已穿装备）应等价于 recalcStats
  const saveBase = playerBaseStats(defaultSave()); // Lv1: hp100/mp50/atk10/def5...
  const weapon = makeItem({
    uid: 'bw', slot: 'weapon', defId: 'iron_blade', name: '精铁刀',
    baseStats: { atk: 6 },
    affixes: [{ id: 'affix_atk', stat: 'atk', value: 4 }],
    strengthenLevel: 2,
    sockets: ['gem_atk_1', null, null],
  });
  const eqp = new Equipment();
  eqp.equip(weapon);
  check(
    'buildLoadoutStats(Equipment) 等价 recalcStats',
    JSON.stringify(buildLoadoutStats(saveBase, eqp, { gemTable: DEFAULT_GEMS })) ===
      JSON.stringify(recalcStats(saveBase, [weapon], DEFAULT_GEMS, STRENGTHEN_CONFIG)),
  );
  check('buildLoadoutStats(null) 原样返回裸身属性', buildLoadoutStats(saveBase, null, { gemTable: DEFAULT_GEMS }).atk === saveBase.atk);

  // resolveMonsterDrops：chance=1 必出、不存在的 id 跳过
  const mon = { ...(getConfig.monster('monkey_soldier') as unknown as MonsterDef) };
  mon.drops = [{ itemId: 'iron_blade', chance: 1 }, { itemId: 'no_such_item', chance: 1 }];
  const r = new DropResolver({ items: ITEM_TABLE, rng: mulberry32(3) });
  const drops = resolveMonsterDrops(mon, r);
  eq('resolveMonsterDrops 命中 chance=1 且跳过未知 id', drops.length, 1);
  check('resolveMonsterDrops 引用正确物品', drops[0].defId === 'iron_blade');
}

// ═════════════════════════ 4. 掉落 ═════════════════════════
section('4. 掉落 DropResolver（chance / 品质 / 词条 / uid）');
{
  const resolver = new DropResolver({ items: ITEM_TABLE, rng: mulberry32(42) });

  const always = resolver.resolve([{ itemId: 'iron_blade', chance: 1 }]);
  eq('chance=1 必掉落 1 件', always.length, 1);
  eq('chance=0 必不掉落', resolver.resolve([{ itemId: 'iron_blade', chance: 0 }]).length, 0);
  eq('不存在的 itemId 被跳过', resolver.resolve([{ itemId: 'no_such_item', chance: 1 }]).length, 0);

  const drop = always[0];
  check('掉落实例字段来自 ItemDef', drop.defId === 'iron_blade' && drop.name === '精铁刀' && drop.slot === 'weapon');
  check('实例初始强化 0 级 + 3 个空孔', drop.strengthenLevel === 0 && drop.sockets.length === SOCKET_COUNT && drop.sockets.every((s) => s === null));
  check('掉落品质合法', QUALITY_ORDER.includes(drop.quality));

  // 品质强制 → 词条数量符合配置表
  const purple = new DropResolver({ items: ITEM_TABLE, rng: mulberry32(7), qualityWeights: { purple: 1 } });
  const pItems = purple.resolve([{ itemId: 'wooden_staff', chance: 1 }, { itemId: 'cloth_robe', chance: 1 }]);
  check('权重全压紫 → 品质均为 purple', pItems.length === 2 && pItems.every((i) => i.quality === 'purple'));
  eq('紫装词条数 = QUALITY_AFFIX_COUNT.purple', pItems[0].affixes.length, QUALITY_AFFIX_COUNT.purple);

  const red = new DropResolver({ items: ITEM_TABLE, rng: mulberry32(99), qualityWeights: { red: 1 } });
  const rItem = red.resolve([{ itemId: 'iron_blade', chance: 1 }])[0];
  eq('红装词条数 = QUALITY_AFFIX_COUNT.red', rItem.affixes.length, QUALITY_AFFIX_COUNT.red);
  check(
    '词条来自词条池且值在区间内、id 不重复',
    rItem.affixes.every((a) => {
      const def = DEFAULT_AFFIX_POOL.find((d) => d.id === a.id);
      return def !== undefined && a.stat === def.stat && a.value >= def.min && a.value <= def.max;
    }) && new Set(rItem.affixes.map((a) => a.id)).size === rItem.affixes.length,
  );

  const white = new DropResolver({ items: ITEM_TABLE, rng: mulberry32(1), qualityWeights: { white: 1 } });
  eq('白装词条数为 0', white.resolve([{ itemId: 'wooden_staff', chance: 1 }])[0].affixes.length, 0);

  // uid 唯一
  const uidResolver = new DropResolver({ items: ITEM_TABLE, rng: mulberry32(5) });
  const rules: DropRule[] = [
    { itemId: 'wooden_staff', chance: 0.8 },
    { itemId: 'iron_blade', chance: 0.8 },
    { itemId: 'cloth_robe', chance: 0.8 },
  ];
  const uids: string[] = [];
  for (let i = 0; i < 30; i++) for (const it of uidResolver.resolve(rules)) uids.push(it.uid);
  check('同一装备 uid 全局唯一', uids.length > 50 && new Set(uids).size === uids.length, `count=${uids.length}`);

  // 同种子可复现
  const qw = { white: 3, green: 2, blue: 3, purple: 2, orange: 1, red: 1 };
  const ra = new DropResolver({ items: ITEM_TABLE, rng: mulberry32(2024), qualityWeights: qw });
  const rb = new DropResolver({ items: ITEM_TABLE, rng: mulberry32(2024), qualityWeights: qw });
  eq('同种子掉落序列一致（可复现）', JSON.stringify(ra.resolve(rules)), JSON.stringify(rb.resolve(rules)));
}

// ═════════════════════════ 5. 拾取（背包） ═════════════════════════
section('5. 拾取 Inventory（add / remove / 容量满不丢数据）');
{
  const resolver = new DropResolver({ items: ITEM_TABLE, rng: mulberry32(11) });
  const [drop] = resolver.resolve([{ itemId: 'iron_blade', chance: 1 }]);

  const inv = new Inventory(2);
  const before = inv.size;
  check('掉落实例 add 后 size 增加', inv.add(drop) === true && inv.size === before + 1 && inv.has(drop.uid));

  const got = inv.remove(drop.uid);
  check('remove 可取回同一实例', got === drop && inv.get(drop.uid) === null && inv.size === before);

  // 容量满：add 返回 false 且不丢数据
  const inv2 = new Inventory(2);
  const i1 = makeItem({ uid: 'i1' });
  const i2 = makeItem({ uid: 'i2' });
  const i3 = makeItem({ uid: 'i3' });
  inv2.add(i1);
  inv2.add(i2);
  const snapI3 = JSON.stringify(i3);
  check('容量满时 add 返回 false', inv2.add(i3) === false);
  check('容量满时不丢数据（size 不变 + 入参对象完好）', inv2.size === 2 && inv2.isFull && JSON.stringify(i3) === snapI3 && inv2.get('i3') === null);

  const inv3 = new Inventory(1);
  const { added, overflow } = inv3.addAll([i1, i3]);
  check('addAll 区分 added/overflow 且溢出项保留引用', added.length === 1 && added[0] === i1 && overflow.length === 1 && overflow[0] === i3);
}

// ═════════════════════════ 6. 战斗数值 ═════════════════════════
section('6. 战斗数值（docs/02 公式：浮动 → 暴击 → 防御减伤，手算对照）');
{
  const fm = getConfig.formula();
  eq('formula 常量与 docs/02 一致', [fm.variance, fm.defenseK, fm.defenseLevelFactor, fm.mpRegenPerSec], [0.05, 100, 12, 4]);

  /**
   * 独立实现 docs/02 公式（仅用于断言，与生产 PlayerFighter 解耦）：
   *   raw = atk × mul × (1 ± variance)
   *   dmg = raw × (isCrit ? critDmg/100 : 1)
   *   dmg ×= 1 - def / (def + defenseK + defenseLevelFactor × 目标等级)
   *   amount = max(1, round(dmg))
   * varianceRoll=0.5 → 浮动系数恰为 1.0；critRoll 决定暴击。
   */
  function damageOnce(
    atk: number, mul: number, critRate: number, critDmg: number,
    targetDef: number, targetLevel: number,
    critRoll: number, varianceRoll: number,
  ): { amount: number; isCrit: boolean } {
    const raw = atk * mul * (1 - fm.variance + varianceRoll * fm.variance * 2);
    const isCrit = critRoll * 100 < critRate;
    let dmg = raw * (isCrit ? critDmg / 100 : 1);
    dmg *= 1 - targetDef / (targetDef + fm.defenseK + fm.defenseLevelFactor * targetLevel);
    return { amount: Math.max(1, Math.round(dmg)), isCrit };
  }

  // 手算：atk100 mul1.5 def25 lv5 critDmg150，减伤系数 = 1 - 25/185 = 32/37
  // 暴击：100*1.5*1.5 = 225；225×32/37 = 194.594… → 195
  const crit = damageOnce(100, 1.5, 50, 150, 25, 5, 0, 0.5);
  eq('暴击伤害（含防御减伤）= 195', crit.amount, 195);
  check('暴击标记正确', crit.isCrit === true);

  // 非暴击：150×32/37 = 129.729… → 130
  const normal = damageOnce(100, 1.5, 50, 150, 25, 5, 0.99, 0.5);
  eq('非暴击伤害（含防御减伤）= 130', normal.amount, 130);
  check('非暴击标记正确', normal.isCrit === false);

  // 防御为 0 → 不减伤
  eq('def=0 时无减伤（100×1×1）', damageOnce(100, 1, 50, 150, 0, 1, 0.99, 0.5).amount, 100);
  // 高防 → 保底 1
  eq('极高防御时伤害保底为 1', damageOnce(1, 1, 50, 150, 100000, 100, 0.99, 0.5).amount, 1);
  // 暴击倍率取自属性（critDmg=200 → ×2）
  eq('critDmg=200 时暴击倍率 2.0', damageOnce(50, 2, 100, 200, 0, 1, 0, 0.5).amount, 200);
}

// ═════════════════════════ 7. 结算与存档 ═════════════════════════
section('7. 结算与存档（levelFlow.settle + save.gainExp 跨界升级）');
{
  // 存档默认值
  const d1 = defaultSave();
  const d2 = defaultSave();
  check('defaultSave 为独立新对象', d1 !== d2);
  eq('defaultSave 初始值（v2）', [d1.playerLevel, d1.exp, d1.clearedLevels.length, d1.version, d1.skillPoints, d1.potions.hp], [1, 0, 0, 2, 3, 3]);

  // 经验曲线锚点
  eq('expNeeded 锚点 (1/2/3)', [expNeeded(1), expNeeded(2), expNeeded(3)], [20, 70, 144]);

  // 跨界升级：Lv1 +100 → Lv3 余 10，升 2 级
  const s = defaultSave();
  const ups = gainExp(s, 100);
  eq('gainExp 跨界升级：升 2 级', [ups, s.playerLevel, s.exp], [2, 3, 10]);

  // 边界：恰好升 1 级 / 差 1 点不升
  const sExact = defaultSave();
  eq('经验恰好等于需求时升级且余 0', [gainExp(sExact, 20), sExact.playerLevel, sExact.exp], [1, 2, 0]);
  const sShort = defaultSave();
  eq('经验差 1 点不升级', [gainExp(sShort, 19), sShort.playerLevel, sShort.exp], [0, 1, 19]);

  // 关卡结算（S 评级，用时 <90s）
  const levels = getConfig.allLevels();
  const lv11 = getConfig.level('1-1');
  const flow = new LevelFlow();
  const save = defaultSave();
  flow.enter(lv11);
  flow.enteredAt = performance.now() - 5_000; // 5s → S
  const res = flow.settle(save);
  eq('结算奖励：1-1 S = 120×1.5 = 180', [res.expGain, res.rating], [180, 'S']);
  eq('结算后等级/经验结转', [save.playerLevel, save.exp, res.levelUps], [3, 90, 2]);
  check('通关写入 clearedLevels 且状态为 settle', save.clearedLevels.includes('1-1') && flow.state === 'settle');
  check('结算掉落为字符串数组（去重）', Array.isArray(res.drops) && res.drops.every((x) => typeof x === 'string'));

  // A 评级（90s ≤ t < 150s）：120×1.2 = 144
  const flowA = new LevelFlow();
  const saveA = defaultSave();
  flowA.enter(lv11);
  flowA.enteredAt = performance.now() - 100_000; // 100s → A
  const resA = flowA.settle(saveA);
  eq('结算奖励：1-1 A = 120×1.2 = 144', [resA.expGain, resA.rating], [144, 'A']);
  eq('clearReward(1-1)=120', clearReward('1-1'), 120);

  // 解锁进度
  const lv12 = getConfig.level('1-2');
  check('1-1 默认解锁', isLevelUnlocked(defaultSave(), lv11, levels));
  check('未通关 1-1 时 1-2 未解锁', isLevelUnlocked(defaultSave(), lv12, levels) === false);
  const unlockedSave = defaultSave();
  unlockedSave.clearedLevels.push('1-1');
  check('通关 1-1 后 1-2 解锁', isLevelUnlocked(unlockedSave, lv12, levels));
}

// ═════════════════════════ 8. 战斗编排（headless） ═════════════════════════
section('8. 战斗编排 BattleDirector（波次 → 怪物死亡 → Boss → 通关）');
{
  const spawned: string[] = [];
  const host = {
    alive: 0,
    bossSpawned: '' as string | null,
    spawnMonster(id: string): void { spawned.push(id); this.alive++; },
    aliveMonsterCount(): number { return this.alive; },
    spawnBoss(id: string): void { this.bossSpawned = id; },
    isBossAlive(): boolean { return true; },
  };
  const dir = new BattleDirector(
    [{ monsterId: 'monkey_soldier', count: 3, intervalMs: 0 }],
    'demon_king',
    host,
  );

  let guard = 0;
  while (dir.status === 'waves' && guard++ < 50) {
    dir.update();
    host.alive = 0; // 模拟本帧清空已刷小怪（怪物死亡）
  }
  eq('波次刷出全部小怪（3 只）', spawned, ['monkey_soldier', 'monkey_soldier', 'monkey_soldier']);
  eq('小怪清空后进入 Boss 阶段并召唤 Boss', [dir.status, host.bossSpawned], ['boss', 'demon_king']);

  dir.notifyBossDefeated();
  eq('Boss 死亡 → 通关', dir.status, 'cleared');

  // 无 Boss 关卡：清完波次直接通关
  const host2 = { alive: 0, spawnMonster(): void { this.alive++; }, aliveMonsterCount(): number { return this.alive; }, spawnBoss(): void {}, isBossAlive(): boolean { return false; } };
  const dir2 = new BattleDirector([{ monsterId: 'shaman', count: 2, intervalMs: 0 }], null, host2);
  let g2 = 0;
  while (dir2.status === 'waves' && g2++ < 50) { dir2.update(); host2.alive = 0; }
  eq('无 Boss 关卡清场即通关', dir2.status, 'cleared');

  // fail() 终止
  const host3 = { alive: 9, spawnMonster(): void {}, aliveMonsterCount(): number { return this.alive; }, spawnBoss(): void {}, isBossAlive(): boolean { return true; } };
  const dir3 = new BattleDirector([{ monsterId: 'monkey_soldier', count: 1, intervalMs: 0 }], null, host3);
  dir3.fail();
  dir3.update();
  eq('fail() 后状态锁定为 failed', dir3.status, 'failed');
}

// ───────────────────────── 汇总 ─────────────────────────
console.log(`\n========== ${passed} 通过 / ${failures.length} 失败 ==========`);
if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
process.exit(0);
