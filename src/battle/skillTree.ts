/**
 * BT-3.3 技能成长：技能等级 → 实际生效数值。
 *
 * 设计：config/skills.json 每个技能可带 `levels[]`（1~5 级）；
 * 未配置 levels 的技能退回顶层 damageMul/mpCost/cdMs（向后兼容）。
 * 这里只做"等级 → 数值"的纯函数查表，升级消耗与技能点由 save/bridge 负责。
 */
import type { SkillDef } from '../shared/types';
import { getConfig } from '../data/ConfigLoader';

export const SKILL_MAX_LEVEL = 5;

interface SkillLevelRow { damageMul: number; mpCost: number; cdMs: number }
interface RawSkillWithLevels extends SkillDef { levels?: SkillLevelRow[] }

/** 某技能的最大等级（未配 levels 视为 1 级） */
export function maxLevelOf(skillId: string): number {
  const raw = getConfig.skill(skillId) as unknown as RawSkillWithLevels;
  return raw.levels?.length ? Math.min(SKILL_MAX_LEVEL, raw.levels.length) : 1;
}

/**
 * 取技能在某等级下的实际生效数值（纯函数）。
 * @param level 1-based；越界自动夹到 [1, maxLevel]
 */
export function skillAtLevel(skill: SkillDef, level: number): SkillDef {
  const raw = skill as unknown as RawSkillWithLevels;
  const rows = raw.levels;
  if (!rows || rows.length === 0) return skill;
  const lv = Math.max(1, Math.min(rows.length, Math.floor(level)));
  const row = rows[lv - 1];
  return { ...skill, damageMul: row.damageMul, mpCost: row.mpCost, cdMs: row.cdMs };
}

/** 按当前等级解析全部技能 */
export function resolveSkills(
  skills: readonly SkillDef[],
  levelOf: (skillId: string) => number,
): SkillDef[] {
  return skills.map((s) => skillAtLevel(s, levelOf(s.id)));
}

/** 升级消耗的技能点（等级越高越贵） */
export function skillUpCost(currentLevel: number): number {
  return currentLevel; // 1→2 花 1 点，2→3 花 2 点，依此类推
}

/**
 * 技能树状态：管理每个技能的等级与技能点消费（纯数据，便于存档与测试）。
 */
export class SkillTree {
  private levels = new Map<string, number>();

  constructor(private skillPoints: number, levels?: Record<string, number>) {
    if (levels) for (const [id, lv] of Object.entries(levels)) this.levels.set(id, lv);
  }

  get points(): number { return this.skillPoints; }

  levelOf(skillId: string): number { return this.levels.get(skillId) ?? 1; }

  /** 尝试升级；技能点不足或已满级则返回 false */
  upgrade(skillId: string): boolean {
    const cur = this.levelOf(skillId);
    const max = maxLevelOf(skillId);
    if (cur >= max) return false;
    const cost = skillUpCost(cur);
    if (this.skillPoints < cost) return false;
    this.skillPoints -= cost;
    this.levels.set(skillId, cur + 1);
    return true;
  }

  /** 发放技能点（升级奖励） */
  grant(n: number): void { this.skillPoints += n; }

  /** 存档序列化 */
  serialize(): { skillPoints: number; levels: Record<string, number> } {
    const levels: Record<string, number> = {};
    for (const [id, lv] of this.levels) levels[id] = lv;
    return { skillPoints: this.skillPoints, levels };
  }

  /** 按当前等级解析全部技能（供战斗使用） */
  resolve(skills: readonly SkillDef[]): SkillDef[] {
    return resolveSkills(skills, (id) => this.levelOf(id));
  }
}
