/**
 * BT-6.2 成就系统（headless 纯逻辑，不依赖 pixi/DOM）。
 * 数据源：config/achievements.json；进度源：存档 lifeStats 累计计数（kills/levelsCleared/goldEarned/strenghtens/gemsSocketed）。
 * 设计：claim 只返回奖励数额并在内存中标记已领，入账与落盘（save.achClaimed）由外部（主会话接线层）负责。
 */
import achJson from '../config/achievements.json';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  stat: 'kills' | 'levelsCleared' | 'goldEarned' | 'strenghtens' | 'gemsSocketed';
  goal: number;
  rewardGold: number;
  rewardSkillPoints: number;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = (achJson as { achievements: AchievementDef[] }).achievements;

export class AchievementTracker {
  private stats: Record<string, number>;
  private claimed: Set<string>;

  constructor(stats: Record<string, number>, claimed: string[]) {
    this.stats = stats ?? {};
    this.claimed = new Set(claimed ?? []);
  }

  private defOf(id: string): AchievementDef {
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) throw new Error(`未知成就 id: ${id}`);
    return def;
  }

  /** 当前进度（0..goal，超出钳制到 goal） */
  progressOf(id: string): number {
    const def = this.defOf(id);
    return Math.min(this.stats[def.stat] ?? 0, def.goal);
  }

  isComplete(id: string): boolean {
    const def = this.defOf(id);
    return (this.stats[def.stat] ?? 0) >= def.goal;
  }

  /** 已完成且未领取的成就 id 列表 */
  claimableIds(): string[] {
    return ACHIEVEMENTS.filter((a) => this.isComplete(a.id) && !this.claimed.has(a.id)).map((a) => a.id);
  }

  /** 领取奖励（外部负责把 gold/skillPoints 入账并持久化 achClaimed） */
  claim(id: string): { ok: boolean; msg: string; gold: number; skillPoints: number } {
    const def = this.defOf(id);
    if (this.claimed.has(id)) return { ok: false, msg: `${def.name} 奖励已领取过`, gold: 0, skillPoints: 0 };
    if (!this.isComplete(id)) return { ok: false, msg: `${def.name} 尚未完成（${this.progressOf(id)}/${def.goal}）`, gold: 0, skillPoints: 0 };
    this.claimed.add(id);
    return { ok: true, msg: `领取成功：${def.name}`, gold: def.rewardGold, skillPoints: def.rewardSkillPoints };
  }
}
