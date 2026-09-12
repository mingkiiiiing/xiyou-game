/**
 * 任务F/BT-4：存档（localStorage，带版本号，损坏安全回退，v1→v2 迁移）。
 * key: zaomengji_save_v1 —— 改结构时升 version 并在 load 里写迁移。
 */
import { playerStatsAtLevel } from '../data/ConfigLoader';
import type { InventoryItem } from '../item/types';

/**
 * v2 存档：BT-4 养成闭环 —— 金币/技能点/技能等级/背包/装备/宝石/强化石/药水 全量持久化。
 */
export interface SaveData {
  version: 2;
  playerLevel: number;
  exp: number;
  gold: number;
  skillPoints: number;
  /** 技能 id → 等级（未记录的为 1 级） */
  skillLevels: Record<string, number>;
  /** 药水数量 */
  potions: { hp: number; mp: number };
  /** 强化石数量 */
  stones: number;
  /** 宝石 gemId → 数量 */
  gems: Record<string, number>;
  /** 背包装备实例 */
  inventory: InventoryItem[];
  /** 已穿戴：槽位 → 装备实例 */
  equipment: Partial<Record<string, InventoryItem>>;
  clearedLevels: string[];
  /** BT-5 各关卡已通关的最高难度（normal/elite/nightmare） */
  clearedDiff: Record<string, string>;
  /** BT-5 当前选用角色 id */
  charId: string;
  // ——— BT-6 长线系统（增量字段，旧档归一化补默认）———
  /** 宠物：已拥有 + 当前启用 */
  pets: { owned: string[]; active: string | null };
  /** 已领取的成就 id */
  achClaimed: string[];
  /** 生涯统计（成就进度源）：kills / levelsCleared / goldEarned / strenghtens / gemsSocketed */
  lifeStats: Record<string, number>;
  /** 日常任务：日期 + 进度 + 已领取 */
  daily: { date: string; progress: Record<string, number>; claimed: string[] };
  settings: { sfx: number; bgm: number };
}

const KEY = 'zaomengji_save_v1';

export function defaultSave(): SaveData {
  return {
    version: 2,
    playerLevel: 1,
    exp: 0,
    gold: 0,
    skillPoints: 3,
    skillLevels: {},
    potions: { hp: 3, mp: 3 },
    stones: 5,
    gems: {},
    inventory: [],
    equipment: {},
    clearedLevels: [],
    clearedDiff: {},
    charId: 'linghou',
    pets: { owned: [], active: null },
    achClaimed: [],
    lifeStats: {},
    daily: { date: '', progress: {}, claimed: [] },
    settings: { sfx: 0.8, bgm: 0.5 },
  };
}

/** 旧版（v1）存档的最小形状（只读迁移用） */
interface SaveV1 {
  version?: 1;
  playerLevel?: number;
  exp?: number;
  clearedLevels?: string[];
  settings?: { sfx: number; bgm: number };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw) as SaveData | SaveV1;
    if ((data as SaveData).version === 2) {
      const v2 = data as SaveData;
      if (typeof v2.playerLevel !== 'number' || !Array.isArray(v2.clearedLevels)) return defaultSave();
      // BT-5 增量字段归一化（旧 v2 档补默认值）
      v2.charId = v2.charId ?? 'linghou';
      v2.clearedDiff = v2.clearedDiff ?? {};
      v2.pets = v2.pets ?? { owned: [], active: null };
      v2.achClaimed = v2.achClaimed ?? [];
      v2.lifeStats = v2.lifeStats ?? {};
      v2.daily = v2.daily ?? { date: '', progress: {}, claimed: [] };
      return v2;
    }
    return migrate(data as SaveV1);
  } catch {
    return defaultSave(); // 损坏安全回退
  }
}

/** v1 → v2：保留等级/经验/关卡进度/设置，养成数据用初始值 */
function migrate(old: SaveV1): SaveData {
  const fresh = defaultSave();
  if (typeof old.playerLevel === 'number' && old.playerLevel > 0) fresh.playerLevel = old.playerLevel;
  if (typeof old.exp === 'number' && old.exp >= 0) fresh.exp = old.exp;
  if (Array.isArray(old.clearedLevels)) fresh.clearedLevels = old.clearedLevels;
  if (old.settings && typeof old.settings.sfx === 'number') fresh.settings = old.settings;
  return fresh;
}

export function writeSave(data: SaveData): void {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* 存储满/隐私模式：忽略 */ }
}

export function clearSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** 经验需求：expNeeded(lv) = 20 × lv^1.8（docs/02） */
export function expNeeded(level: number): number {
  return Math.round(20 * Math.pow(level, 1.8));
}

/** 加经验并结算升级，返回升了几级（BT-4：每级奖励 1 技能点，由调用方发放） */
export function gainExp(save: SaveData, amount: number): number {
  save.exp += amount;
  let ups = 0;
  while (save.exp >= expNeeded(save.playerLevel)) {
    save.exp -= expNeeded(save.playerLevel);
    save.playerLevel++;
    ups++;
  }
  return ups;
}

/** 按存档等级重算玩家裸身属性（装备加成经 Progression 聚合） */
export function playerBaseStats(save: SaveData): { maxHp: number; maxMp: number; atk: number; def: number; hp: number; mp: number; critRate: number; critDmg: number; moveSpeed: number } {
  const grown = playerStatsAtLevel(save.playerLevel);
  const base = { critRate: 8, critDmg: 150, moveSpeed: 320 };
  return { ...grown, ...base, hp: grown.maxHp, mp: grown.maxMp };
}

/** 通关奖励（v1：按关卡序号给经验） */
export function clearReward(levelId: string): number {
  return levelId === '1-1' ? 120 : 180;
}
