/**
 * BT-6.2 日常任务（headless 纯逻辑，不依赖 pixi/DOM）。
 * 按本地日期重置：存档 daily{date,progress,claimed}，主城加载时若 isExpired 则清空进度重建。
 * 设计：claim 只返回奖励数额并在内存中标记已领，入账与落盘（save.daily）由外部（主会话接线层）负责。
 */

export interface DailyQuestDef {
  id: string;
  name: string;
  goal: number;
  rewardGold: number;
}

export const DAILY_QUESTS: readonly DailyQuestDef[] = [
  { id: 'today_kills', name: '今日除妖', goal: 30, rewardGold: 80 },
  { id: 'today_levels', name: '今日闯关', goal: 2, rewardGold: 120 },
  { id: 'today_gold', name: '今日财源', goal: 300, rewardGold: 60 },
];

/** 本地时区 'YYYY-MM-DD'（跨天判定与存档 daily.date 用同一口径） */
export function todayKey(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export class DailyBoard {
  private date: string;
  private progress: Record<string, number>;
  private claimed: Set<string>;

  constructor(date: string, progress: Record<string, number>, claimed: string[]) {
    this.date = date ?? '';
    this.progress = progress ?? {};
    this.claimed = new Set(claimed ?? []);
  }

  private defOf(id: string): DailyQuestDef {
    const def = DAILY_QUESTS.find((q) => q.id === id);
    if (!def) throw new Error(`未知日常任务 id: ${id}`);
    return def;
  }

  /** 当前进度（0..goal，超出钳制到 goal） */
  progressOf(id: string): number {
    const def = this.defOf(id);
    return Math.min(this.progress[def.id] ?? 0, def.goal);
  }

  isComplete(id: string): boolean {
    const def = this.defOf(id);
    return (this.progress[def.id] ?? 0) >= def.goal;
  }

  /** 领取奖励（外部负责把 gold 入账并持久化 save.daily.claimed） */
  claim(id: string): { ok: boolean; msg: string; gold: number } {
    const def = this.defOf(id);
    if (this.claimed.has(id)) return { ok: false, msg: `${def.name} 今日奖励已领取`, gold: 0 };
    if (!this.isComplete(id)) return { ok: false, msg: `${def.name} 尚未完成（${this.progressOf(id)}/${def.goal}）`, gold: 0 };
    this.claimed.add(id);
    return { ok: true, msg: `领取成功：${def.name}`, gold: def.rewardGold };
  }

  /** 跨天判定：date（通常传 todayKey() 或存档里的 daily.date）与面板日期不一致即过期，由存档层重置 */
  isExpired(date: string): boolean {
    return date !== this.date;
  }
}
