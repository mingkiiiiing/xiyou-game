/**
 * 宝石系统：镶嵌 / 摘除 / 宝石背包。
 * 每件装备固定 SOCKET_COUNT(3) 个孔，孔内存 GemDef.id。
 */
import type { GemDef, InventoryItem, OpResult } from './types';
import { SOCKET_COUNT } from './types';

/** 宝石表：数组或 id 索引的 Map 均可 */
export type GemTable = readonly GemDef[] | ReadonlyMap<string, GemDef>;

export function gemMapOf(table: readonly GemDef[]): Map<string, GemDef> {
  return new Map(table.map((g) => [g.id, g]));
}

function isGemArray(table: GemTable): table is readonly GemDef[] {
  return Array.isArray(table);
}

export function getGem(table: GemTable, id: string): GemDef | undefined {
  if (isGemArray(table)) return table.find((g) => g.id === id);
  return table.get(id);
}

export function emptySocketCount(item: InventoryItem): number {
  return item.sockets.reduce((n, s) => (s === null ? n + 1 : n), 0);
}

/** 镶嵌：把宝石镶入第 index 个孔（孔必须为空，宝石必须在表中） */
export function socketGem(item: InventoryItem, index: number, gemId: string, table: GemTable): OpResult {
  if (!Number.isInteger(index) || index < 0 || index >= item.sockets.length) {
    return { ok: false, reason: `无效的孔位 ${index}` };
  }
  if (item.sockets[index] !== null) {
    return { ok: false, reason: '该孔位已有宝石，请先摘除' };
  }
  if (!getGem(table, gemId)) {
    return { ok: false, reason: `未知宝石 ${gemId}` };
  }
  item.sockets[index] = gemId;
  return { ok: true };
}

export interface UnsocketResult extends OpResult {
  /** 摘下的宝石 id（失败时为 null） */
  gemId: string | null;
}

/** 摘除：取下第 index 个孔内的宝石 */
export function unsocketGem(item: InventoryItem, index: number): UnsocketResult {
  if (!Number.isInteger(index) || index < 0 || index >= item.sockets.length) {
    return { ok: false, gemId: null, reason: `无效的孔位 ${index}` };
  }
  const gemId = item.sockets[index];
  if (gemId === null) {
    return { ok: false, gemId: null, reason: '该孔位为空' };
  }
  item.sockets[index] = null;
  return { ok: true, gemId };
}

/** 宝石背包：gemId → 数量 */
export class GemBag {
  private counts = new Map<string, number>();

  add(gemId: string, n = 1): void {
    this.counts.set(gemId, (this.counts.get(gemId) ?? 0) + n);
  }

  /** 移除 n 颗；数量不足返回 false（不扣） */
  remove(gemId: string, n = 1): boolean {
    const c = this.counts.get(gemId) ?? 0;
    if (c < n) return false;
    const left = c - n;
    if (left === 0) this.counts.delete(gemId);
    else this.counts.set(gemId, left);
    return true;
  }

  count(gemId: string): number {
    return this.counts.get(gemId) ?? 0;
  }

  total(): number {
    let t = 0;
    for (const c of this.counts.values()) t += c;
    return t;
  }

  clear(): void {
    this.counts.clear();
  }
}
