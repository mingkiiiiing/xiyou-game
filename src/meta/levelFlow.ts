/**
 * 任务F：关卡流程状态机（纯逻辑，不含渲染）。
 * city → select → battle(enter → wave… → boss) → settle / fail
 */
import type { RawLevel } from '../data/schemas';
import { getConfig } from '../data/ConfigLoader';
import { gainExp, clearReward } from './save';
import type { SaveData } from './save';

export type FlowState = 'city' | 'select' | 'battle' | 'settle' | 'fail';

export interface LevelRunResult {
  levelId: string;
  elapsedMs: number;
  rating: 'S' | 'A' | 'B' | 'C';
  expGain: number;
  levelUps: number;
  drops: string[]; // 物品名（结算展示用；实体掉落物在集成阶段接任务E的 DropResolver）
}

/** 关卡解锁规则：第一章第 1 关默认解锁；其余需通关同一章节前一关 */
export function isLevelUnlocked(save: SaveData, level: RawLevel, all: RawLevel[]): boolean {
  if (level.id === '1-1') return true;
  const prev = all
    .filter((l) => l.chapter === level.chapter)
    .sort((a, b) => a.recLevel - b.recLevel)
    .find((l) => l.id !== level.id && l.recLevel <= level.recLevel);
  return prev ? save.clearedLevels.includes(prev.id) : false;
}

export class LevelFlow {
  state: FlowState = 'city';
  currentLevel: RawLevel | null = null;
  enteredAt = 0;

  toCity(): void { this.state = 'city'; this.currentLevel = null; }
  toSelect(): void { this.state = 'select'; }

  enter(level: RawLevel): void {
    this.currentLevel = level;
    this.state = 'battle';
    this.enteredAt = performance.now();
  }

  /** 通关结算：评级按用时（<90s S / <150s A / <240s B / 其余 C），写进度与经验 */
  settle(save: SaveData): LevelRunResult {
    const level = this.currentLevel!;
    const elapsedMs = performance.now() - this.enteredAt;
    const sec = elapsedMs / 1000;
    const rating = sec < 90 ? 'S' : sec < 150 ? 'A' : sec < 240 ? 'B' : 'C';
    if (!save.clearedLevels.includes(level.id)) save.clearedLevels.push(level.id);
    const expGain = clearReward(level.id) * (rating === 'S' ? 1.5 : rating === 'A' ? 1.2 : 1);
    const levelUps = gainExp(save, Math.round(expGain));
    // 结算掉落（v1 展示层：从关卡波次怪物的掉落表 roll 名字）
    const drops: string[] = [];
    for (const w of level.waves) {
      const m = getConfig.monster(w.monsterId);
      for (const d of m.drops) if (Math.random() < d.chance * w.count) drops.push(getConfig.item(d.itemId).name);
    }
    if (level.bossId) {
      const b = getConfig.monster(level.bossId);
      for (const d of b.drops) if (Math.random() < d.chance) drops.push(getConfig.item(d.itemId).name);
    }
    this.state = 'settle';
    return { levelId: level.id, elapsedMs, rating, expGain: Math.round(expGain), levelUps, drops: [...new Set(drops)] };
  }

  fail(): void { this.state = 'fail'; }
}
