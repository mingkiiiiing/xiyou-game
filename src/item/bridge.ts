/**
 * IT-1.2 装备↔战斗 桥接层：
 * 把「存档进度 + 已穿装备 + 宝石 + 强化」翻译成战斗用的 BattleStats，
 * 并把怪物掉落表解析成地面掉落物。
 */
import type { BattleStats, MonsterDef, ItemDef } from '../shared/types';
import type { Equipment } from './equipment';
import type { GemTable } from './gems';
import type { InventoryItem, StrengthenConfig } from './types';
import { STRENGTHEN_CONFIG, ITEM_TABLE } from './data';
import { recalcStats } from './stats';
import { DropResolver, type DropRule } from './dropResolver';

/** 默认使用模块内置的强化配置与物品表（集成时可由调用方覆盖） */
export interface LoadoutOptions {
  strengthen?: StrengthenConfig;
  gemTable: GemTable;
}

/**
 * 由基础裸身属性聚合出最终战斗属性（纯函数，不改入参）。
 * base 通常来自 src/meta/save.ts 的 playerBaseStats(save)。
 */
export function buildLoadoutStats(
  base: BattleStats,
  equipment: Equipment | readonly InventoryItem[] | null,
  opts: LoadoutOptions,
): BattleStats {
  const strengthen = opts.strengthen ?? STRENGTHEN_CONFIG;
  if (!equipment) return { ...base };
  const input = equipment instanceof Object && 'all' in equipment && typeof (equipment as Equipment).all === 'function'
    ? (equipment as Equipment).all()
    : (equipment as readonly InventoryItem[]);
  return recalcStats({ ...base }, input, opts.gemTable, strengthen);
}

/**
 * 解析某个怪物的实际掉落（装备实例）。使用与关卡掉落一致的 DropResolver。
 * 返回空数组表示本次未掉落。
 */
export function resolveMonsterDrops(
  monster: MonsterDef,
  resolver: DropResolver,
): InventoryItem[] {
  return resolver.resolve((monster.drops ?? []) as readonly DropRule[]);
}

/** 构造一个使用当前配置表的默认 DropResolver（装备定义取自 config/items.json） */
export function createDefaultDropResolver(uidPrefix = 'loot'): DropResolver {
  let n = 0;
  return new DropResolver({
    items: ITEM_TABLE as readonly ItemDef[],
    uidFactory: () => `${uidPrefix}_${++n}`,
  });
}
