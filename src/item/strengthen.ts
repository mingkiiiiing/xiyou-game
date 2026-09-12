/**
 * 强化：消耗强化石 + 成功率表（config/strengthen.json）。
 * v1：失败不掉级（failPenalty = 'none'）；成功 +1 级。
 * 加成公式：装备自身 baseStats × bonusPerLevel × 当前等级（每级 +8%）。
 */
import type { StrengthenConfig, InventoryItem } from './types';
import type { Rng } from './rng';

/**
 * 本次强化消耗的强化石数量。
 * TODO(D): 消耗曲线应迁入 config/strengthen.json（材料种类+数量），当前内置线性消耗 targetLevel = current+1。
 */
export function strengthenCost(currentLevel: number): number {
  return currentLevel + 1;
}

/** 升级成功率（百分数）；已满级返回 null */
export function strengthenSuccessRate(cfg: StrengthenConfig, currentLevel: number): number | null {
  if (currentLevel >= cfg.maxLevel) return null;
  const rate = cfg.successRate[currentLevel];
  if (rate === undefined) return 0;
  return Math.max(0, Math.min(100, rate));
}

export interface StrengthenOutcome {
  /** 是否实际执行了一次强化（等级/材料校验通过） */
  performed: boolean;
  success: boolean;
  fromLevel: number;
  toLevel: number;
  /** 实际扣除的强化石数量（执行成功时调用方应扣除） */
  cost: number;
  /** performed=false 时的失败原因 */
  reason?: string;
}

/**
 * 尝试强化一件装备（会修改 item.strengthenLevel）。
 * 成功/失败都消耗材料；失败不掉级（若配置 failPenalty='dropLevel' 则降 1 级，下限 0）。
 */
export function tryStrengthen(
  item: InventoryItem,
  cfg: StrengthenConfig,
  stonesAvailable: number,
  rng: Rng,
): StrengthenOutcome {
  const from = item.strengthenLevel;
  const base: StrengthenOutcome = { performed: false, success: false, fromLevel: from, toLevel: from, cost: 0 };
  if (from >= cfg.maxLevel) return { ...base, reason: '已达最大强化等级' };
  const cost = strengthenCost(from);
  if (stonesAvailable < cost) return { ...base, reason: `强化石不足（需要 ${cost}）` };

  const rate = strengthenSuccessRate(cfg, from) ?? 0;
  const success = rng() * 100 < rate;
  let to = from;
  if (success) to = from + 1;
  else if (cfg.failPenalty === 'dropLevel') to = Math.max(0, from - 1);

  item.strengthenLevel = to;
  return { performed: true, success, fromLevel: from, toLevel: to, cost };
}
