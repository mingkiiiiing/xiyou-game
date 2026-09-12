/**
 * IT-1.1/P3 伤害公式（headless 纯函数，不依赖 pixi）。
 * 唯一实现来源：src/battle/PlayerFighter、src/enemy/EnemyBase、scripts/smoke-test 都调用它，
 * 避免"公式内嵌在需要渲染的类里、测试只能独立复刻导致漂移"。
 * 规格：docs/02-数值与数据表设计.md
 */
import type { DamageInfo } from '../shared/types';

export interface FormulaConfig {
  variance: number;          // 伤害浮动，0.05 = ±5%
  defenseK: number;          // 防御减伤常数
  defenseLevelFactor: number; // 等级参与的减伤系数
}

export interface AttackerStats {
  atk: number;
  critRate: number;  // 百分数
  critDmg: number;   // 百分数，150 = 1.5 倍
}

export interface DefenderInfo {
  def: number;
  level: number;
}

export interface DamageResult {
  amount: number;
  isCrit: boolean;
  raw: number;
  /** BT-3.2 韧性伤害：重击（高倍率）破韧更多 */
  poiseDamage: number;
}

/** 每点倍率对应的基础韧性伤害 */
const POISE_PER_MUL = 12;

/**
 * 计算一次伤害（纯函数，随机源可注入以便测试复现）。
 * 公式：raw = atk × mul × (1 ± variance)；crit → × critDmg/100；
 *       减伤 = 1 - def / (def + defenseK + defenseLevelFactor × level)
 */
export function computeDamage(
  attacker: AttackerStats,
  defender: DefenderInfo,
  damageMul: number,
  cfg: FormulaConfig,
  rng: () => number = Math.random,
): DamageResult {
  const raw = attacker.atk * damageMul * (1 - cfg.variance + rng() * cfg.variance * 2);
  const isCrit = rng() * 100 < attacker.critRate;
  let dmg = raw * (isCrit ? attacker.critDmg / 100 : 1);
  const mitig = defender.def / (defender.def + cfg.defenseK + cfg.defenseLevelFactor * defender.level);
  dmg *= 1 - mitig;
  return {
    amount: Math.max(1, Math.round(dmg)),
    isCrit,
    raw,
    poiseDamage: Math.max(1, Math.round(POISE_PER_MUL * damageMul)),
  };
}

/** 由攻击方与防御方构造 DamageInfo（击退/顿帧由调用方决定） */
export function buildDamageInfo(
  attacker: AttackerStats,
  defender: DefenderInfo,
  damageMul: number,
  cfg: FormulaConfig,
  opts: { fromX: number; knockbackX: number; hitstopMs: number },
  rng: () => number = Math.random,
): DamageInfo {
  const { amount, isCrit, poiseDamage } = computeDamage(attacker, defender, damageMul, cfg, rng);
  return { amount, isCrit, fromX: opts.fromX, knockbackX: opts.knockbackX, hitstopMs: opts.hitstopMs, poiseDamage };
}
