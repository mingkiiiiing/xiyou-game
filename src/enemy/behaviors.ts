/**
 * BT-3.4 怪物行为库：配置化行为（charge/leap/shield/summon/fanShot/retreat）。
 *
 * 设计：
 *  - 行为**数据驱动**（monsters.json 的 `behaviors: string[]`）；
 *  - 依赖通过 `BehaviorHost` 回调注入（发射弹幕/召唤/跳跃），便于测试与复用；
 *  - 不配置 behaviors 的怪物行为与 BT-1 完全一致（向后兼容）。
 */
import type { Damageable } from '../shared/types';

export type BehaviorId = 'charge' | 'leap' | 'shield' | 'summon' | 'fanShot' | 'retreat';

export const ALL_BEHAVIORS: readonly BehaviorId[] = ['charge', 'leap', 'shield', 'summon', 'fanShot', 'retreat'];

export function isBehaviorId(s: string): s is BehaviorId {
  return (ALL_BEHAVIORS as readonly string[]).includes(s);
}

/** 行为执行所需的宿主能力（由 Enemy 注入） */
export interface BehaviorHost {
  x: number;
  y: number;
  facing: 1 | -1;
  target: Damageable | null;
  hpRatio: number;
  distToTarget: number;
  onGround: boolean;
  fireProjectile(vx: number, vy: number, dmgMul: number): void;
  summon(monsterId: string, offsetX: number): void;
  setDamageReduction(v: number): void;
  setSuperArmor(on: boolean): void;
  heal(amount: number): void;
  requestMoveX(vx: number): void;
  requestJump(vy: number): void;
}

/** 单个行为的参数 */
export interface ChargeParams { windupMs: number; durationMs: number; speed: number; cooldownMs: number }
export interface LeapParams { windupMs: number; vy: number; forwardSpeed: number; durationMs: number; cooldownMs: number }
export interface ShieldParams { holdMs: number; reduction: number; cooldownMs: number }
export interface SummonParams { count: number; cooldownMs: number; monsterId: string }
export interface FanShotParams { shots: number; spreadRad: number; speed: number; damageMul: number; cooldownMs: number }
export interface RetreatParams { hpThreshold: number; durationMs: number; speed: number; healPerSec: number; cooldownMs: number }

export const BEHAVIOR_PARAMS: {
  charge: ChargeParams; leap: LeapParams; shield: ShieldParams;
  summon: SummonParams; fanShot: FanShotParams; retreat: RetreatParams;
} = {
  charge: { windupMs: 420, durationMs: 520, speed: 560, cooldownMs: 4200 },
  leap: { windupMs: 300, vy: -620, forwardSpeed: 340, durationMs: 700, cooldownMs: 3600 },
  shield: { holdMs: 1400, reduction: 0.7, cooldownMs: 5200 },
  summon: { count: 2, cooldownMs: 7000, monsterId: 'monkey_soldier' },
  fanShot: { shots: 5, spreadRad: 0.5, speed: 360, damageMul: 0.9, cooldownMs: 2800 },
  retreat: { hpThreshold: 0.4, durationMs: 1200, speed: -220, healPerSec: 6, cooldownMs: 6000 },
};

/** 每个怪物实例持有的行为运行时状态 */
export interface BehaviorRuntime {
  active: BehaviorId | null;
  startedAt: number;
  until: number;
  cooldownUntil: Partial<Record<BehaviorId, number>>;
  stage: number;
  shieldApplied: boolean;
}

export function newBehaviorRuntime(): BehaviorRuntime {
  return { active: null, startedAt: 0, until: 0, cooldownUntil: {}, stage: 0, shieldApplied: false };
}

/** 行为总时长（毫秒） */
export function behaviorDuration(b: BehaviorId): number {
  switch (b) {
    case 'charge': return BEHAVIOR_PARAMS.charge.windupMs + BEHAVIOR_PARAMS.charge.durationMs;
    case 'leap': return BEHAVIOR_PARAMS.leap.windupMs + BEHAVIOR_PARAMS.leap.durationMs;
    case 'shield': return BEHAVIOR_PARAMS.shield.holdMs;
    case 'summon': return 400;
    case 'fanShot': return 320;
    case 'retreat': return BEHAVIOR_PARAMS.retreat.durationMs;
  }
}

/** 入战时错开各行为首次冷却，避免同帧齐发 */
export function initBehaviorCooldowns(rt: BehaviorRuntime, behaviors: readonly BehaviorId[], now: number, level: number): void {
  behaviors.forEach((b, i) => {
    const base = BEHAVIOR_PARAMS[b].cooldownMs;
    const eased = Math.max(600, base * (1 - Math.min(0.4, level * 0.04)));
    rt.cooldownUntil[b] = now + 800 + i * 250 + Math.random() * 400;
    void eased;
  });
}

/** 该行为现在是否可用（冷却结束 + 距离合适 + 特殊条件） */
export function behaviorReady(
  b: BehaviorId,
  rt: BehaviorRuntime,
  dist: number,
  hpRatio: number,
  now: number,
): boolean {
  if (now < (rt.cooldownUntil[b] ?? 0)) return false;
  switch (b) {
    case 'fanShot': return dist > 120 && dist < 520;
    case 'summon': return dist > 200;
    case 'shield': return dist < 300;
    case 'charge': return dist > 160 && dist < 700;
    case 'leap': return dist > 100 && dist < 420;
    case 'retreat': return hpRatio <= BEHAVIOR_PARAMS.retreat.hpThreshold;
  }
}

/**
 * 挑选一个行为（纯函数，便于测试）。
 * 优先级体现"压迫感"：冲锋 > 跳扑 > 散射 > 召唤 > 举盾 > 后撤。
 */
export function pickBehavior(
  behaviors: readonly BehaviorId[],
  rt: BehaviorRuntime,
  dist: number,
  hpRatio: number,
  now: number,
): BehaviorId | null {
  const priority: BehaviorId[] = ['charge', 'leap', 'fanShot', 'summon', 'shield', 'retreat'];
  const avail = behaviors.filter((b) => behaviorReady(b, rt, dist, hpRatio, now));
  if (avail.length === 0) return null;
  avail.sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
  return avail[0];
}

export function startBehavior(rt: BehaviorRuntime, b: BehaviorId, now: number): void {
  rt.active = b;
  rt.startedAt = now;
  rt.stage = 0;
  rt.until = now + behaviorDuration(b);
}

export function endBehavior(rt: BehaviorRuntime, now: number, host: BehaviorHost): void {
  const b = rt.active;
  if (b) rt.cooldownUntil[b] = now + BEHAVIOR_PARAMS[b].cooldownMs;
  if (rt.shieldApplied) {
    host.setDamageReduction(0);
    rt.shieldApplied = false;
  }
  host.setSuperArmor(false);
  rt.active = null;
  rt.stage = 0;
}

/**
 * 行为推进一帧。返回 true 表示行为仍在进行（调用方应跳过常规 AI）。
 */
export function tickBehavior(rt: BehaviorRuntime, host: BehaviorHost, now: number): boolean {
  const b = rt.active;
  if (!b) return false;
  const t = Math.max(0, Math.min(1, (now - rt.startedAt) / Math.max(1, rt.until - rt.startedAt)));

  switch (b) {
    case 'charge': {
      const p = BEHAVIOR_PARAMS.charge;
      host.setSuperArmor(true); // 蓄力与冲锋期间霸体
      const wf = p.windupMs / (p.windupMs + p.durationMs);
      host.requestMoveX(t < wf ? 0 : host.facing * p.speed);
      break;
    }
    case 'leap': {
      const p = BEHAVIOR_PARAMS.leap;
      const wf = p.windupMs / (p.windupMs + p.durationMs);
      if (t < wf) {
        host.requestMoveX(0);
      } else if (rt.stage === 0) {
        rt.stage = 1;
        host.requestJump(p.vy);
        host.requestMoveX(host.facing * p.forwardSpeed);
      }
      break;
    }
    case 'shield': {
      const p = BEHAVIOR_PARAMS.shield;
      rt.shieldApplied = true;
      host.setDamageReduction(p.reduction);
      host.requestMoveX(0);
      break;
    }
    case 'summon': {
      const p = BEHAVIOR_PARAMS.summon;
      if (rt.stage === 0) {
        rt.stage = 1;
        for (let i = 0; i < p.count; i++) host.summon(p.monsterId, i === 0 ? -60 : 60);
      }
      break;
    }
    case 'fanShot': {
      const p = BEHAVIOR_PARAMS.fanShot;
      if (rt.stage === 0) {
        rt.stage = 1;
        const base = host.facing > 0 ? 0 : Math.PI;
        const flip = host.facing > 0 ? 1 : -1;
        for (let i = 0; i < p.shots; i++) {
          const spread = (i / Math.max(1, p.shots - 1) - 0.5) * p.spreadRad;
          const ang = base + spread * flip;
          host.fireProjectile(Math.cos(ang) * p.speed, Math.sin(ang) * p.speed * 0.35, p.damageMul);
        }
      }
      break;
    }
    case 'retreat': {
      const p = BEHAVIOR_PARAMS.retreat;
      host.requestMoveX(host.facing * p.speed); // 负向 = 后撤
      host.heal(p.healPerSec / 60);
      break;
    }
  }

  if (now >= rt.until) {
    endBehavior(rt, now, host);
    return false;
  }
  return true;
}
