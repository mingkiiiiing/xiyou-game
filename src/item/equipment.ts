/**
 * Equipment：5 槽位（weapon/head/body/shoes/accessory）穿戴校验与换装。
 */
import { EQUIPMENT_SLOTS } from './types';
import type { EquipmentSlot, EquipmentSlots, InventoryItem, OpResult } from './types';

export interface EquipResult extends OpResult {
  /** 换装时被替换下来的旧装备 */
  replaced: InventoryItem | null;
}

export class Equipment {
  private slots: Record<EquipmentSlot, InventoryItem | null> = {
    weapon: null,
    head: null,
    body: null,
    shoes: null,
    accessory: null,
  };

  get(slot: EquipmentSlot): InventoryItem | null {
    return this.slots[slot];
  }

  /** 全槽位快照（可直接传给 recalcStats） */
  all(): EquipmentSlots {
    return this.slots;
  }

  /** 当前已穿戴的实例列表（顺序按槽位） */
  equippedItems(): InventoryItem[] {
    return EQUIPMENT_SLOTS.map((s) => this.slots[s]).filter((it): it is InventoryItem => it !== null);
  }

  /** 穿戴：校验槽位合法性，自动替换同槽旧装 */
  equip(item: InventoryItem): EquipResult {
    if (!EQUIPMENT_SLOTS.includes(item.slot)) {
      return { ok: false, replaced: null, reason: `未知槽位 ${item.slot}` };
    }
    const replaced = this.slots[item.slot];
    this.slots[item.slot] = item;
    return { ok: true, replaced };
  }

  /** 卸下：返回被卸下的装备（空槽返回 null） */
  unequip(slot: EquipmentSlot): InventoryItem | null {
    const it = this.slots[slot];
    this.slots[slot] = null;
    return it;
  }

  clear(): void {
    for (const s of EQUIPMENT_SLOTS) this.slots[s] = null;
  }
}
