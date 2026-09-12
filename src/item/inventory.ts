/**
 * Inventory：背包数据 + 容量上限 + add/remove/sort。
 */
import { EQUIPMENT_SLOTS, QUALITY_ORDER } from './types';
import type { InventoryItem } from './types';

/** 默认排序：槽位顺序 → 品质高在前 → 强化等级高在前 → 名称 */
export function defaultCompare(a: InventoryItem, b: InventoryItem): number {
  const slotDiff = EQUIPMENT_SLOTS.indexOf(a.slot) - EQUIPMENT_SLOTS.indexOf(b.slot);
  if (slotDiff !== 0) return slotDiff;
  const qDiff = QUALITY_ORDER.indexOf(b.quality) - QUALITY_ORDER.indexOf(a.quality);
  if (qDiff !== 0) return qDiff;
  if (b.strengthenLevel !== a.strengthenLevel) return b.strengthenLevel - a.strengthenLevel;
  return a.defId.localeCompare(b.defId) || a.uid.localeCompare(b.uid);
}

export interface AddAllResult {
  added: InventoryItem[];
  /** 背包已满未能装入的 */
  overflow: InventoryItem[];
}

export class Inventory {
  private items: InventoryItem[] = [];

  constructor(readonly capacity = 24) {}

  get size(): number {
    return this.items.length;
  }

  get isFull(): boolean {
    return this.items.length >= this.capacity;
  }

  list(): readonly InventoryItem[] {
    return this.items;
  }

  has(uid: string): boolean {
    return this.items.some((i) => i.uid === uid);
  }

  get(uid: string): InventoryItem | null {
    return this.items.find((i) => i.uid === uid) ?? null;
  }

  /** 加入一件；满了返回 false（不丢失调用方数据） */
  add(item: InventoryItem): boolean {
    if (this.isFull) return false;
    this.items.push(item);
    return true;
  }

  /** 批量加入，返回成功/溢出列表 */
  addAll(items: readonly InventoryItem[]): AddAllResult {
    const added: InventoryItem[] = [];
    const overflow: InventoryItem[] = [];
    for (const it of items) {
      if (this.add(it)) added.push(it);
      else overflow.push(it);
    }
    return { added, overflow };
  }

  /** 按 uid 移除，返回被移除的实例（不存在返回 null） */
  remove(uid: string): InventoryItem | null {
    const idx = this.items.findIndex((i) => i.uid === uid);
    if (idx < 0) return null;
    return this.items.splice(idx, 1)[0];
  }

  /** 排序；缺省用默认比较器 */
  sort(compare: (a: InventoryItem, b: InventoryItem) => number = defaultCompare): void {
    this.items.sort(compare);
  }

  clear(): void {
    this.items.length = 0;
  }
}
