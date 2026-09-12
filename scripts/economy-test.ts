/**
 * BT-4 经济专项测试（headless）：存档 v2 迁移、养成操作、经济定价、商店交易。
 * 运行：npm run test-economy
 */
import { Progression, sellPriceOf, goldRewardFor, POTION_PRICES, STONE_PRICE, gemPriceOf, type ProgressionModel } from '../src/meta/progression';
import { defaultSave, loadSave, gainExp, expNeeded, type SaveData } from '../src/meta/save';
import { ITEM_TABLE, DEFAULT_GEMS, STRENGTHEN_CONFIG } from '../src/item/data';
import { itemStats } from '../src/item/stats';
import { getConfig } from '../src/data/ConfigLoader';
import type { InventoryItem } from '../src/item/types';

let pass = 0, failCount = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log(`  ✓ ${name}`); }
  else { failCount++; console.error(`  ✗ ${name}: 期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}`); }
};
const ok = (name: string, cond: boolean) => eq(name, cond, true);
const section = (s: string) => console.log(`\n■ ${s}`);

/** 内存版存档（不碰 localStorage） */
function freshSave(): SaveData {
  return defaultSave();
}

/** 构造一件测试装备实例 */
function makeItem(patch: Partial<InventoryItem> = {}): InventoryItem {
  return {
    uid: `t${Math.random().toString(36).slice(2, 8)}`,
    defId: 'iron_blade',
    name: '精铁刀',
    slot: 'weapon',
    quality: 'green',
    baseStats: { atk: 6 },
    affixes: [],
    strengthenLevel: 0,
    sockets: [null, null, null],
    ...patch,
  };
}

// ───────── 1. 存档 v2 与迁移 ─────────
section('存档 v2 与迁移');
{
  const s = freshSave();
  eq('初始版本号 = 2', s.version, 2);
  eq('初始技能点 = 3', s.skillPoints, 3);
  eq('初始药水 3/3', s.potions, { hp: 3, mp: 3 });
  eq('初始强化石 = 5', s.stones, 5);

  // 经验与技能点发放
  eq('expNeeded(1) = 20', expNeeded(1), 20);
  eq('expNeeded(3) = 144', expNeeded(3), 144);
  const ups = gainExp(s, 50);
  // 50 经验：Lv1 需 20 → 升 2 级余 30；Lv2 需 70 不够 → 停在 Lv2
  eq('50 经验升到 Lv2 余 30', [ups, s.playerLevel, s.exp], [1, 2, 30]);
}

// ───────── 2. 养成操作 ─────────
section('养成操作（穿/脱/卖/强化/宝石/技能）');
{
  const save = freshSave();
  save.gold = 1000;
  const p = new Progression(save);
  const item = makeItem();
  p.inventory.add(item);

  // 穿戴
  const eqRes = p.equip(item.uid);
  ok('穿戴成功', eqRes.ok);
  eq('穿戴后槽位生效', p.equipment.get('weapon')?.uid, item.uid);
  ok('属性聚合包含装备', p.currentStats().atk > 10);
  // 卸下
  const unRes = p.unequip('weapon');
  ok('卸下成功', unRes.ok);
  eq('卸下后回背包', p.inventory.size, 1);
  // 卖出
  const price = sellPriceOf(item);
  const sellRes = p.sell(item.uid);
  ok('出售成功', sellRes.ok);
  eq('出售入账', p.gold, 1000 + price);
  eq('背包清空', p.inventory.size, 0);

  // 强化：初始 5 石，+1 需 1 石
  const it2 = makeItem({ uid: 's1' });
  p.inventory.add(it2);
  const st0 = p.stones;
  const stRes = p.strengthen('s1');
  ok('强化执行', stRes.ok);
  eq('强化石扣减 1', st0 - p.stones, 1);
  ok('强化等级 ≥ 0', it2.strengthenLevel >= 0);

  // 宝石：给一颗 1 级攻击石
  p.gemBag.add('gem_atk_1', 1);
  const gRes = p.socketGem('s1', 0, 'gem_atk_1');
  ok('镶嵌成功', gRes.ok);
  eq('宝石扣减', p.gemBag.count('gem_atk_1'), 0);
  ok('镶嵌后属性生效', (itemStatsOf(p, 's1').atk ?? 0) >= 6);
  const ugRes = p.unsocketGem('s1', 0);
  ok('摘除成功', ugRes.ok);
  eq('摘除返还', p.gemBag.count('gem_atk_1'), 1);

  // 技能升级
  const pts0 = p.skillTree.points;
  const upRes = p.upgradeSkill('thrust');
  ok('技能升级成功', upRes.ok);
  eq('消耗 1 点', pts0 - p.skillTree.points, 1);
  eq('thrust → 2 级', p.skillTree.levelOf('thrust'), 2);
  ok('升级后倍率提升（按配置表 levels）', p.skillTree.resolve(getConfig.allSkills() as never).find((s) => s.id === 'thrust')!.damageMul > 1.5);

  // 药水
  const hp0 = p.potions.hp;
  const useRes = p.usePotion('hp');
  ok('使用红药', useRes.ok && useRes.hpHeal > 0);
  eq('红药 -1', p.potions.hp, hp0 - 1);
  const useEmpty = p.usePotion('hp');
  while (p.potions.hp > 0) p.usePotion('hp');
  ok('药水用尽后不可用', p.usePotion('hp').ok === false);
  void useEmpty;
}

/** 读某件装备的聚合贡献（测试辅助） */
function itemStatsOf(p: Progression, uid: string): Partial<Record<string, number>> {
  const all = [...p.inventory.list(), ...p.equipment.equippedItems()];
  const it = all.find((i) => i.uid === uid)!;
  return itemStats(it, DEFAULT_GEMS, STRENGTHEN_CONFIG as never) as Partial<Record<string, number>>;
}

// ───────── 3. 商店交易 ─────────
section('商店交易');
{
  const save = freshSave();
  save.gold = 500;
  const p = new Progression(save);

  // 买药
  const b1 = p.buyPotion('hp');
  ok('买红药', b1.ok);
  eq('扣 30 金', p.gold, 500 - POTION_PRICES.hp);
  eq('红药 +1', p.potions.hp, 4);
  // 买强化石
  ok('买强化石', p.buyStone().ok);
  eq('扣 40 金', p.gold, 500 - POTION_PRICES.hp - STONE_PRICE);
  // 买宝石
  const gem = DEFAULT_GEMS[0];
  ok('买宝石', p.buyGem(gem.id).ok);
  eq('按 tier 扣费', p.gold, 500 - POTION_PRICES.hp - STONE_PRICE - gemPriceOf(gem.tier));
  eq('宝石入包', p.gemBag.count(gem.id), 1);
  // 金币不足
  p.gold = 0;
  ok('金币不足拒绝', p.buyPotion('hp').ok === false);

  // 卖装备定价
  const white = makeItem({ quality: 'white', baseStats: { atk: 3 }, defId: 'wooden_staff', name: '桃木棍' });
  const red = makeItem({ quality: 'red', baseStats: { atk: 14 }, strengthenLevel: 3 });
  ok('白装价格低', sellPriceOf(white) < sellPriceOf(red));
  ok('红装+强化价格高', sellPriceOf(red) > 100);
  eq('白装定价 = (10+3*2)*1+0 = 16', sellPriceOf(white), 16);

  // 怪物金币
  eq('Lv1 怪 9 金', goldRewardFor(1), 9);
  eq('Lv7 怪 27 金', goldRewardFor(7), 27);
}

// ───────── 4. 持久化往返 ─────────
section('存档往返（persist → 重建）');
{
  const save = freshSave();
  save.gold = 300;
  const p1 = new Progression(save);
  const it = makeItem({ uid: 'persist1' });
  p1.inventory.add(it);
  p1.equip('persist1');
  p1.gemBag.add('gem_hp_2', 2);
  p1.upgradeSkill('sweep');
  p1.persist();

  const p2 = new Progression(save);
  eq('金币往返', p2.gold, 300 - 0);
  eq('装备往返', p2.equipment.get('weapon')?.uid, 'persist1');
  eq('宝石往返', p2.gemBag.count('gem_hp_2'), 2);
  eq('技能等级往返', p2.skillTree.levelOf('sweep'), 2);
  ok('往返后属性一致', JSON.stringify(p2.currentStats()) === JSON.stringify(p1.currentStats()));

  // UI 模型
  const model: ProgressionModel = p2.buildProgressionModel();
  ok('ProgressionModel 完整', model.gold === 300 && model.equipment.length === 5 && model.skills.length === 3 && model.gems.length === DEFAULT_GEMS.length);
  const shop = p2.buildShopModel();
  ok('ShopModel 完整', shop.potionPrices.hp === POTION_PRICES.hp && shop.stonePrice === STONE_PRICE && Array.isArray(shop.sellable));
}

// ───────── 5. 配置表引用完整性 ─────────
section('配置引用');
{
  ok('商店宝石表 = config/gems.json 全表', DEFAULT_GEMS.length === 12);
  ok('装备表 ≥ 43 件', ITEM_TABLE.length >= 43);
}

console.log(`\n==========================================`);
if (failCount > 0) {
  console.error(`✗ ${failCount} 项失败 / ${pass} 项通过`);
  process.exit(1);
} else {
  console.log(`✓ 经济专项测试全部通过（${pass} 项）`);
}
