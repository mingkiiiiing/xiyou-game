/**
 * 可注入的随机源：掉落 / 词条 / 强化都依赖 Rng，
 * 测试时用 mulberry32(种子) 复现确定性序列。
 */

export type Rng = () => number;

/** mulberry32：确定性伪随机（同种子同序列，供测试/回放），返回 [0,1) */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 闭区间 [min, max] 内取整 */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** 按权重挑选：entries 为 [值, 权重] 元组数组，权重 ≤ 0 的项不会被选中 */
export function pickWeighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of entries) total += Math.max(0, w);
  if (total <= 0 || entries.length === 0) throw new Error('pickWeighted: 总权重必须 > 0');
  let roll = rng() * total;
  for (const [v, w] of entries) {
    roll -= Math.max(0, w);
    if (roll < 0) return v;
  }
  return entries[entries.length - 1][0];
}
