/**
 * BT-5.5 长关卡支持：由关卡 id 与世界宽度确定性生成地形（平台段）。
 * 可 headless 测试；相同输入永远得到相同输出（同关卡地形稳定）。
 */
import type { Box } from '../shared/types';

const GROUND_Y = 620;

/** 简单确定性随机（mulberry32） */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 关卡地面 y（当前所有关卡同一地面高度） */
export function groundY(): number {
  return GROUND_Y;
}

/**
 * 生成关卡地形：
 *  - 贯穿全宽的主地面（两端外扩，防穿出）
 *  - 沿途若干悬浮平台（跳上去打游击/躲弹幕），间距随世界宽度自适应
 * 玩家出生点左侧 240px 内保证无平台压迫（起手区）。
 */
export function genSolids(levelId: string, worldW: number): Box[] {
  const solids: Box[] = [
    { x: -200, y: GROUND_Y, w: worldW + 400, h: 120 },
  ];
  const rnd = makeRng(hashSeed(levelId));
  // 平台段：每 ~900px 一段（最少 1 段），高度 3 档
  const step = 900;
  const count = Math.max(1, Math.floor((worldW - 900) / step));
  for (let i = 0; i < count; i++) {
    const x = 620 + i * step + (rnd() - 0.5) * 160;
    if (x < 500 || x > worldW - 360) continue;
    const w = 200 + rnd() * 140;
    const h = 22;
    const tier = rnd();
    const y = tier < 0.5 ? 470 : tier < 0.85 ? 420 : 360; // 高度三档（越高越稀有）
    solids.push({ x: Math.round(x), y, w: Math.round(w), h });
  }
  return solids;
}

/** 玩家出生点 */
export function playerSpawnX(): number {
  return 240;
}

/** 小怪刷新区：世界右半段（长关卡越靠后怪越多） */
export function spawnRangeX(worldW: number): { min: number; max: number } {
  return { min: Math.min(1300, worldW * 0.55), max: worldW - 100 };
}

/** Boss 出生点：靠近关卡末端 */
export function bossSpawnX(worldW: number): number {
  return worldW - 350;
}

/** 巡逻边界（全关卡活动范围，出生区留空） */
export function patrolRangeX(worldW: number): { min: number; max: number } {
  return { min: 400, max: worldW - 100 };
}
