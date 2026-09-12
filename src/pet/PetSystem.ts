/**
 * BT-6.1 宠物系统 —— 纯逻辑层（headless 可测：禁止 import pixi / DOM 模块）。
 *
 * 接口冻结见 docs/tasks/BIGTASK-6-长线系统与发布.md「接口冻结」：
 *   PET_TABLE / getPet / petAttackStep / petBuffStats 四个导出，签名逐字一致。
 *
 * 设计：
 *  - 数据唯一来源 = src/config/pets.json（本模块只做只读装载与 hex 色转换）；
 *  - petAttackStep / petBuffStats 均为**纯函数**：不改入参、不持有状态，
 *    冷却推进由调用方拿返回的 cdUntil 回写；
 *  - 攻击结算（弹幕生成/伤害计算）由战斗场景完成，本层只做「是否开火 + 打谁」的决策。
 */
import petsJson from '../config/pets.json';
import type { BattleStats } from '../shared/types';

/** 宠物定义（冻结接口） */
export interface PetDef {
  id: string;
  name: string;
  kind: 'attacker' | 'buffer';
  price: number;
  /** attacker：攻击间隔毫秒 */
  attackCdMs?: number;
  /** attacker：弹丸伤害倍率（相对主人面板 atk） */
  damageMul?: number;
  /** buffer：被动增益 */
  buff?: { stat: 'atk' | 'maxHp'; pct: number };
  blurb: string;
  /** 主题色（UI 卡片/弹丸着色用） */
  color: number;
}

/** pets.json 的原始形状（color 用 #rrggbb 字符串，便于策划阅读） */
interface RawPetDef {
  id: string;
  name: string;
  kind: 'attacker' | 'buffer';
  price: number;
  attackCdMs?: number;
  damageMul?: number;
  buff?: { stat: 'atk' | 'maxHp'; pct: number };
  blurb: string;
  color: string;
}

function hexToNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

/** 宠物表（来自 config/pets.json，只读） */
export const PET_TABLE: readonly PetDef[] = (petsJson as unknown as { pets: RawPetDef[] }).pets.map(
  (p) => ({ ...p, color: hexToNum(p.color) }),
);

/** 按 id 查宠物，未知 id 抛错（防止静默配错） */
export function getPet(id: string): PetDef {
  const def = PET_TABLE.find((p) => p.id === id);
  if (!def) throw new Error(`未知宠物 id: ${id}`);
  return def;
}

// ───────── 跟随位（PetEntity 与场景共用同一套常量） ─────────

/** 跟随位：主人身后水平距离（px） */
export const PET_FOLLOW_DIST = 46;
/** 跟随位：主人脚底上方的悬浮高度（px） */
export const PET_HOVER_HEIGHT = 30;
/** attacker 开火间隔（与 pet_gugu.attackCdMs 保持一致） */
export const PET_ATTACK_CD_MS = 2200;

/** 跟随位 = 主人身后偏移（facing=1 朝右时宠物在左侧） */
export function petFollowPos(ownerX: number, ownerY: number, facing: 1 | -1): { x: number; y: number } {
  return { x: ownerX - facing * PET_FOLLOW_DIST, y: ownerY - PET_HOVER_HEIGHT };
}

/**
 * 宠物攻击决策（纯函数）。
 * - 冷却未到（now < cdUntil）→ 不开火，cdUntil 原样返回；
 * - 冷却到且存在活目标 → 取距主人最近者，返回 { fired:true, x, y, cdUntil: now + cd }；
 *   x/y 为**弹道瞄准点**（最近活目标坐标），场景用它计算弹丸飞行方向，
 *   伤害按入参 damageMul × 主人 atk 结算；
 * - 冷却到但无活目标 → 不开火，冷却不重置（保持到期状态，目标一出现即可开火）。
 */
export function petAttackStep(
  cdUntil: number,
  now: number,
  ownerX: number,
  ownerY: number,
  targets: { x: number; y: number; alive: boolean }[],
  damageMul: number,
): { fired: boolean; x?: number; y?: number; cdUntil: number } {
  void damageMul; // 伤害结算在场景层；本函数只决策目标
  if (now < cdUntil) return { fired: false, cdUntil };
  let best: { x: number; y: number; d2: number } | null = null;
  for (const t of targets) {
    if (!t.alive) continue;
    const dx = t.x - ownerX, dy = t.y - ownerY;
    const d2 = dx * dx + dy * dy;
    if (!best || d2 < best.d2) best = { x: t.x, y: t.y, d2 };
  }
  if (!best) return { fired: false, cdUntil };
  return { fired: true, x: best.x, y: best.y, cdUntil: now + PET_ATTACK_CD_MS };
}

/**
 * 宠物增益应用（纯函数，克隆返回、不修改入参 base）。
 * - buffer 宠物：对 buff.stat 应用 (1 + pct/100) 倍率（四舍五入保整）；
 * - attacker / 无宠物（null）：原属性克隆返回。
 */
export function petBuffStats(base: BattleStats, pet: PetDef | null): BattleStats {
  const out: BattleStats = { ...base };
  if (pet && pet.kind === 'buffer' && pet.buff) {
    if (pet.buff.stat === 'atk') out.atk = Math.round(base.atk * (1 + pet.buff.pct / 100));
    else out.maxHp = Math.round(base.maxHp * (1 + pet.buff.pct / 100));
  }
  return out;
}
