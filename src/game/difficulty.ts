/**
 * BT-5.4 难度系统：普通/精英/噩梦 系数表与怪物数值缩放。
 * 纯数据 + 纯函数，可 headless 测试。
 */
import difficultyJson from '../config/difficulty.json';
import type { MonsterDef } from '../shared/types';

export interface DifficultyDef {
  id: 'normal' | 'elite' | 'nightmare';
  name: string;
  hp: number;
  atk: number;
  def: number;
  gold: number;
  qualityBonus: number;
  /** 解锁所需：该关已通这个难度（normal 无要求） */
  unlock: 'none' | 'normal' | 'elite';
}

export const DIFFICULTIES: readonly DifficultyDef[] =
  (difficultyJson as unknown as { difficulties: DifficultyDef[] }).difficulties;

export function getDifficulty(id: string): DifficultyDef {
  const d = DIFFICULTIES.find((x) => x.id === id);
  if (!d) throw new Error(`[difficulty] 未知难度 ${id}`);
  return d;
}

/** 难度顺序（用于解锁判断与存档比较） */
export function difficultyRank(id: string): number {
  return DIFFICULTIES.findIndex((x) => x.id === id);
}

/**
 * 按难度缩放怪物数值（纯函数，返回克隆）。
 * hp/atk/def 缩放；等级不变（用于金币公式与减伤系数）。
 */
export function scaleMonsterDef(def: MonsterDef, diff: DifficultyDef): MonsterDef {
  if (diff.id === 'normal') return def;
  return {
    ...def,
    stats: {
      hp: Math.round(def.stats.hp * diff.hp),
      atk: Math.round(def.stats.atk * diff.atk),
      def: Math.round(def.stats.def * diff.def),
      moveSpeed: def.stats.moveSpeed,
    },
  };
}

/**
 * 掉落品质权重随难度上移（qualityBonus 0/1/2）。
 * 返回 DropResolver 可消费的权重表。
 */
export function qualityWeightsFor(bonus: number): Partial<Record<string, number>> {
  if (bonus <= 0) return { white: 40, green: 26, blue: 16, purple: 10, orange: 5, red: 3 };
  if (bonus === 1) return { white: 18, green: 30, blue: 26, purple: 16, orange: 7, red: 3 };
  return { white: 6, green: 22, blue: 30, purple: 24, orange: 12, red: 6 };
}
