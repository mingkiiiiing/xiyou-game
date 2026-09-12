/**
 * BT-3.3 连招指令表（配置化）：把「情境 + 按键」映射到具体攻击动作。
 * 与普攻三连互补——三连是"连点攻击"，指令是"方向/状态 + 攻击"的变体。
 *
 * 设计：纯函数 matchCombo(state, input) → ComboCommand | null，便于测试与扩展。
 */
import type { HitboxDef } from '../shared/types';

export type ComboId = 'low_sweep' | 'air_slam' | 'dash_slash';

export interface ComboCommand {
  id: ComboId;
  name: string;
  /** 伤害倍率（× atk） */
  damageMul: number;
  /** 判定框 */
  hitbox: HitboxDef;
  /** 释放时的水平位移（0 = 原地） */
  dashSpeed: number;
  knockbackX: number;
  hitstopMs: number;
  /** 是否把自身弹起（空中下劈用） */
  selfHop?: number;
  /** 是否把自身砸向地面（空中下劈用） */
  slamDown?: boolean;
}

/** 连招定义表（可在此扩展新指令） */
export const COMBO_TABLE: Record<ComboId, ComboCommand> = {
  // 下 + 攻击：下段扫击，打低位、扫倒小怪
  low_sweep: {
    id: 'low_sweep',
    name: '下段扫击',
    damageMul: 1.2,
    hitbox: { w: 110, h: 50, offsetX: 52, offsetY: -20, delayMs: 70, activeMs: 0 },
    dashSpeed: 0,
    knockbackX: 60,
    hitstopMs: 50,
  },
  // 空中 + 攻击：空中下劈，落地冲击
  air_slam: {
    id: 'air_slam',
    name: '空中下劈',
    damageMul: 1.6,
    hitbox: { w: 120, h: 110, offsetX: 20, offsetY: -10, delayMs: 60, activeMs: 0 },
    dashSpeed: 0,
    knockbackX: 200,
    hitstopMs: 80,
    slamDown: true,
  },
  // 冲刺/移动中 + 攻击：突进斩
  dash_slash: {
    id: 'dash_slash',
    name: '突进斩',
    damageMul: 1.4,
    hitbox: { w: 140, h: 70, offsetX: 62, offsetY: -56, delayMs: 60, activeMs: 0 },
    dashSpeed: 520,
    knockbackX: 240,
    hitstopMs: 70,
  },
};

export interface ComboInput {
  /** 是否按住"下" */
  down: boolean;
  /** 是否在空中 */
  airborne: boolean;
  /** 当前水平速度绝对值（判定是否在冲刺/奔跑） */
  absVx: number;
  /** 判定为"冲刺中"的速度阈值 */
  runThreshold: number;
}

/**
 * 匹配连招指令（纯函数）。优先级：空中 > 下段 > 冲刺。
 * 无匹配返回 null，由调用方回落到普通三连。
 */
export function matchCombo(input: ComboInput): ComboCommand | null {
  if (input.airborne) return COMBO_TABLE.air_slam;
  if (input.down) return COMBO_TABLE.low_sweep;
  if (input.absVx >= input.runThreshold) return COMBO_TABLE.dash_slash;
  return null;
}
