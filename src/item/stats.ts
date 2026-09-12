/**
 * 属性聚合（核心纯函数）：base + 装备(基础+强化+词条+宝石) → BattleStats。
 * 不依赖 pixi、不修改任何入参，可脱离渲染层单独测试。
 */
import type { BattleStats } from '../shared/types';
import { EQUIPMENT_SLOTS, STAT_KEYS } from './types';
import type { EquipmentSlots, GemDef, InventoryItem, StatKey, StrengthenConfig } from './types';
import { getGem } from './gems';
import type { GemTable } from './gems';

/** 装备入参：接受 Equipment.all() 的槽位记录、已穿装备数组，或 Equipment 实例本身 */
export type EquipmentInput =
  | EquipmentSlots
  | readonly InventoryItem[]
  | { all(): EquipmentSlots };

function isItemList(eq: EquipmentInput): eq is readonly InventoryItem[] {
  return Array.isArray(eq);
}

/** 鸭子类型识别 Equipment 实例，避免调用方误传实例导致静默产出 undefined */
function hasAllMethod(eq: EquipmentInput): eq is { all(): EquipmentSlots } {
  return typeof (eq as { all?: unknown }).all === 'function';
}

function toItemList(equipment: EquipmentInput): InventoryItem[] {
  if (isItemList(equipment)) return [...equipment];
  const slots: EquipmentSlots = hasAllMethod(equipment) ? equipment.all() : equipment;
  return EQUIPMENT_SLOTS.map((s) => slots[s]).filter((it): it is InventoryItem => it != null);
}

/**
 * 单件装备的总属性贡献（纯函数）：
 * 品质加成(基础 × qualityMult) + 强化加成(round(基础 × bonusPerLevel × 等级)) + 词条 + 宝石。
 * qualityMult 省略时按 1.0（手工构造的实例向后兼容，docs/02 品质体系）。
 */
export function itemStats(
  item: InventoryItem,
  gemTable: GemTable,
  strengthen: StrengthenConfig,
): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  const add = (k: StatKey, v: number) => {
    out[k] = (out[k] ?? 0) + v;
  };
  const qMult = item.qualityMult ?? 1;
  for (const k of STAT_KEYS) {
    const bv = item.baseStats[k];
    if (bv === undefined) continue;
    const withQuality = qMult === 1 ? bv : Math.round(bv * qMult);
    add(k, withQuality);
    const bonus = Math.round(bv * strengthen.bonusPerLevel * item.strengthenLevel);
    if (bonus !== 0) add(k, bonus);
  }
  for (const a of item.affixes) add(a.stat, a.value);
  for (const gid of item.sockets) {
    if (gid === null) continue;
    const g = getGem(gemTable, gid);
    if (g) add(g.stat, g.value);
  }
  return out;
}

/**
 * 属性聚合（纯函数）：recalcStats(base, equipment, gems, strengthen)。
 * 返回全新的 BattleStats；不修改 base / 装备 / 宝石表 / 强化配置中的任何数据。
 * hp/mp 只被钳制到各自上限（装备不自动回血/回蓝）。
 */
export function recalcStats(
  base: BattleStats,
  equipment: EquipmentInput,
  gemTable: GemTable,
  strengthen: StrengthenConfig,
): BattleStats {
  const out: BattleStats = { ...base };
  for (const item of toItemList(equipment)) {
    const contrib = itemStats(item, gemTable, strengthen);
    for (const k of STAT_KEYS) {
      const v = contrib[k];
      if (v !== undefined) out[k] = out[k] + v;
    }
  }
  if (out.hp > out.maxHp) out.hp = out.maxHp;
  if (out.mp > out.maxMp) out.mp = out.maxMp;
  return out;
}
