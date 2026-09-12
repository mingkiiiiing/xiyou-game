/**
 * BT-4.2 养成操作层：把「存档 ↔ 系统对象 ↔ 经济操作 ↔ UI 视图」焊在一起。
 *
 * 职责：
 *  - 持有 Equipment/Inventory/GemBag/SkillTree 并与 SaveData 双向同步
 *  - 经济操作（穿/脱/卖/强化/宝石/技能升级/商店交易/药水）全部带校验与消息
 *  - 为 UI 面板构建纯数据视图（ProgressionModel / ShopModel）
 * 设计：不依赖 pixi，可 headless 测试；战斗数值经 item/bridge 聚合。
 */
import type { BattleStats, MonsterDef } from '../shared/types';
import type { EquipmentSlot, GemDef, InventoryItem, Quality, StatKey } from '../item/types';
import { Equipment } from '../item/equipment';
import { Inventory } from '../item/inventory';
import { GemBag, getGem, socketGem, unsocketGem, type GemTable } from '../item/gems';
import { SkillTree, skillUpCost, maxLevelOf } from '../battle/skillTree';
import { itemStats, recalcStats } from '../item/stats';
import { tryStrengthen, strengthenCost, strengthenSuccessRate } from '../item/strengthen';
import { DEFAULT_GEMS, STRENGTHEN_CONFIG, QUALITY_LABEL } from '../item/data';
import type { StrengthenConfig } from '../item/types';
import { buildLoadoutStats } from '../item/bridge';
import { getConfig } from '../data/ConfigLoader';
import { playerBaseStats, type SaveData } from './save';
import { getCharacter, applyCharMult, skillsForChar } from '../game/characterSystem';
import { petBuffStats, getPet } from '../pet/PetSystem';

// ───────────────────────── 经济定价 ─────────────────────────

const SELL_QUALITY_FACTOR: Readonly<Record<Quality, number>> = {
  white: 1, green: 1.2, blue: 1.5, purple: 2, orange: 2.6, red: 3.4,
};

export function sellPriceOf(item: InventoryItem): number {
  const baseSum = Object.values(item.baseStats).reduce((a, b) => a + (b ?? 0), 0);
  const raw = (10 + baseSum * 2) * SELL_QUALITY_FACTOR[item.quality] + item.strengthenLevel * 8;
  return Math.max(1, Math.floor(raw));
}

export const POTION_PRICES = { hp: 30, mp: 25 } as const;
export const STONE_PRICE = 40;
export function gemPriceOf(tier: number): number {
  return tier <= 1 ? 50 : tier === 2 ? 120 : 260;
}
/** 杀怪金币奖励 */
export function goldRewardFor(level: number): number {
  return 6 + level * 3;
}

// ───────────────────────── 视图类型（UI 消费） ─────────────────────────

export interface ItemView {
  uid: string;
  name: string;
  slot: EquipmentSlot;
  quality: Quality;
  qualityLabel: string;
  strengthenLevel: number;
  sockets: (string | null)[];
  affixCount: number;
  /** 单件属性贡献（含强化/词条/宝石） */
  stats: Partial<Record<StatKey, number>>;
  score: number;
  sellPrice: number;
  equipped: boolean;
}

export interface SkillView {
  id: string;
  name: string;
  level: number;
  maxLevel: number;
  upCost: number;
  canUpgrade: boolean;
  damageMul: number;
  mpCost: number;
  cdMs: number;
  nextDamageMul: number | null;
}

export interface GemView {
  id: string;
  name: string;
  tier: number;
  stat: StatKey;
  value: number;
  count: number;
  price: number;
}

export interface ProgressionModel {
  gold: number;
  stones: number;
  playerLevel: number;
  skillPoints: number;
  /** 聚合后战斗属性 */
  stats: BattleStats;
  /** 裸身属性（对照） */
  baseStats: BattleStats;
  /** 按槽位顺序（weapon/head/body/shoes/accessory） */
  equipment: (ItemView | null)[];
  inventory: ItemView[];
  skills: SkillView[];
  gems: GemView[];
  potions: { hp: number; mp: number };
}

export interface ShopModel {
  gold: number;
  stones: number;
  potions: { hp: number; mp: number };
  potionPrices: { hp: number; mp: number };
  stonePrice: number;
  gems: GemView[];
  sellable: ItemView[];
}

export interface OpResultMsg { ok: boolean; msg: string }

// ───────────────────────── 养成核心 ─────────────────────────

const GEM_TABLE: GemTable = DEFAULT_GEMS;

export class Progression {
  readonly equipment = new Equipment();
  readonly inventory = new Inventory(24);
  readonly gemBag = new GemBag();
  readonly skillTree: SkillTree;
  gold = 0;
  stones = 0;
  potions = { hp: 0, mp: 0 };

  constructor(private save: SaveData) {
    this.skillTree = new SkillTree(save.skillPoints, save.skillLevels);
    this.loadFrom(save);
  }

  private loadFrom(save: SaveData): void {
    this.gold = save.gold ?? 0;
    this.stones = save.stones ?? 0;
    this.potions = { hp: save.potions?.hp ?? 0, mp: save.potions?.mp ?? 0 };
    for (const [gemId, n] of Object.entries(save.gems ?? {})) {
      if (n > 0) this.gemBag.add(gemId, n);
    }
    for (const it of save.inventory ?? []) {
      this.inventory.add({ ...it, sockets: [...(it.sockets ?? [])] });
    }
    for (const [slot, it] of Object.entries(save.equipment ?? {})) {
      if (!it) continue;
      this.equipment.equip({ ...it, sockets: [...(it.sockets ?? [])] });
    }
  }

  /** 把内存状态写回存档对象（调用 savePersist() 落盘） */
  persist(): void {
    const s = this.save;
    s.gold = this.gold;
    s.stones = this.stones;
    s.potions = { ...this.potions };
    s.gems = {};
    for (const [id, n] of Object.entries(this.gemBagCountsWithKeys())) s.gems[id] = n;
    s.inventory = this.inventory.list().map(cloneItem);
    s.equipment = {};
    for (const slot of ['weapon', 'head', 'body', 'shoes', 'accessory'] as EquipmentSlot[]) {
      const it = this.equipment.get(slot);
      if (it) s.equipment[slot] = cloneItem(it);
    }
    const snap = this.skillTree.serialize();
    s.skillPoints = snap.skillPoints;
    s.skillLevels = snap.levels;
  }

  private gemBagCountsWithKeys(): Record<string, number> {
    // GemBag 无枚举接口，这里从全表反查数量（表 ≤12 项，开销可忽略）
    const out: Record<string, number> = {};
    for (const g of DEFAULT_GEMS) {
      const n = this.gemBag.count(g.id);
      if (n > 0) out[g.id] = n;
    }
    return out;
  }

  // ───────────── 查询 ─────────────

  /** 聚合战斗属性（角色倍率 → 等级成长 → 装备 → 宠物增益） */
  currentStats(): BattleStats {
    const raw = playerBaseStats(this.save);
    // BT-5.3 角色基础倍率（含移速）
    const char = getCharacter(this.save.charId ?? 'linghou');
    const grown = applyCharMult(raw, char.baseMult);
    const base = { ...raw, ...grown, hp: grown.maxHp, mp: grown.maxMp } as BattleStats;
    const withEquip = buildLoadoutStats(base, this.equipment, { gemTable: GEM_TABLE, strengthen: STRENGTHEN_CONFIG });
    // BT-6.1 宠物增益（仅 buffer 类生效）
    const activePet = this.save.pets?.active ?? null;
    if (activePet) {
      try {
        return petBuffStats(withEquip, getPet(activePet));
      } catch { return withEquip; }
    }
    return withEquip;
  }

  private findItem(uid: string): { item: InventoryItem; equipped: boolean } | null {
    const inInv = this.inventory.get(uid);
    if (inInv) return { item: inInv, equipped: false };
    for (const slot of ['weapon', 'head', 'body', 'shoes', 'accessory'] as EquipmentSlot[]) {
      const it = this.equipment.get(slot);
      if (it && it.uid === uid) return { item: it, equipped: true };
    }
    return null;
  }

  // ───────────── 装备操作 ─────────────

  equip(uid: string): OpResultMsg {
    const it = this.inventory.get(uid);
    if (!it) return { ok: false, msg: '背包中找不到该装备' };
    const res = this.equipment.equip(it);
    if (!res.ok) return { ok: false, msg: res.reason ?? '穿戴失败' };
    this.inventory.remove(uid);
    if (res.replaced) this.inventory.add(res.replaced);
    this.persist();
    return { ok: true, msg: `已装备 ${it.name}` };
  }

  unequip(slot: EquipmentSlot): OpResultMsg {
    const it = this.equipment.unequip(slot);
    if (!it) return { ok: false, msg: '该槽位为空' };
    if (!this.inventory.add(it)) {
      this.equipment.equip(it); // 背包满，放回去
      return { ok: false, msg: '背包已满，无法卸下' };
    }
    this.persist();
    return { ok: true, msg: `已卸下 ${it.name}` };
  }

  sell(uid: string): OpResultMsg {
    const it = this.inventory.get(uid);
    if (!it) return { ok: false, msg: '只能出售背包中的装备' };
    const price = sellPriceOf(it);
    this.inventory.remove(uid);
    this.gold += price;
    this.persist();
    return { ok: true, msg: `出售 ${it.name} +${price} 金币` };
  }

  strengthen(uid: string): OpResultMsg {
    const found = this.findItem(uid);
    if (!found) return { ok: false, msg: '找不到该装备' };
    const rate = strengthenSuccessRate(STRENGTHEN_CONFIG as StrengthenConfig, found.item.strengthenLevel);
    if (rate === null) return { ok: false, msg: '已达最大强化等级' };
    const cost = strengthenCost(found.item.strengthenLevel);
    if (this.stones < cost) return { ok: false, msg: `强化石不足（需要 ${cost}）` };
    const outcome = tryStrengthen(
      found.item,
      STRENGTHEN_CONFIG as StrengthenConfig,
      this.stones,
      Math.random,
    );
    if (!outcome.performed) return { ok: false, msg: outcome.reason ?? '强化失败' };
    this.stones -= outcome.cost;
    this.persist();
    return {
      ok: true,
      msg: outcome.success
        ? `${found.item.name} 强化成功 → +${outcome.toLevel}`
        : `${found.item.name} 强化失败（+${outcome.toLevel}）`,
    };
  }

  socketGem(uid: string, index: number, gemId: string): OpResultMsg {
    const found = this.findItem(uid);
    if (!found) return { ok: false, msg: '找不到该装备' };
    if (this.gemBag.count(gemId) <= 0) return { ok: false, msg: '没有该宝石' };
    const res = socketGem(found.item, index, gemId, GEM_TABLE);
    if (!res.ok) return { ok: false, msg: res.reason ?? '镶嵌失败' };
    this.gemBag.remove(gemId, 1);
    this.persist();
    return { ok: true, msg: '镶嵌成功' };
  }

  unsocketGem(uid: string, index: number): OpResultMsg {
    const found = this.findItem(uid);
    if (!found) return { ok: false, msg: '找不到该装备' };
    const res = unsocketGem(found.item, index);
    if (!res.ok) return { ok: false, msg: res.reason ?? '摘除失败' };
    if (res.gemId) this.gemBag.add(res.gemId, 1);
    this.persist();
    return { ok: true, msg: '摘除成功' };
  }

  // ───────────── 技能 ─────────────

  upgradeSkill(skillId: string): OpResultMsg {
    const raw = getConfig.allSkills().find((s) => s.id === skillId);
    if (!raw) return { ok: false, msg: '未知技能' };
    const before = this.skillTree.levelOf(skillId);
    if (!this.skillTree.upgrade(skillId)) {
      if (before >= maxLevelOf(skillId)) return { ok: false, msg: '已达满级' };
      return { ok: false, msg: `技能点不足（需要 ${skillUpCost(before)}）` };
    }
    this.persist();
    return { ok: true, msg: `${raw.name} → Lv${before + 1}` };
  }

  // ───────────── 商店 ─────────────

  buyPotion(kind: 'hp' | 'mp'): OpResultMsg {
    const price = POTION_PRICES[kind];
    if (this.gold < price) return { ok: false, msg: '金币不足' };
    this.gold -= price;
    this.potions[kind]++;
    this.persist();
    return { ok: true, msg: `购买${kind === 'hp' ? '红' : '蓝'}药 ×1` };
  }

  buyStone(): OpResultMsg {
    if (this.gold < STONE_PRICE) return { ok: false, msg: '金币不足' };
    this.gold -= STONE_PRICE;
    this.stones++;
    this.persist();
    return { ok: true, msg: '购买强化石 ×1' };
  }

  buyGem(gemId: string): OpResultMsg {
    const g = getGem(GEM_TABLE, gemId);
    if (!g) return { ok: false, msg: '未知宝石' };
    const price = gemPriceOf(g.tier);
    if (this.gold < price) return { ok: false, msg: '金币不足' };
    this.gold -= price;
    this.gemBag.add(gemId, 1);
    this.persist();
    return { ok: true, msg: `购买 ${g.name}` };
  }

  /** 使用药水：返回回复量（应用由战斗层执行）；同时扣数量 */
  usePotion(kind: 'hp' | 'mp'): { ok: boolean; msg: string; hpHeal: number; mpHeal: number } {
    if (this.potions[kind] <= 0) return { ok: false, msg: '药水用完', hpHeal: 0, mpHeal: 0 };
    this.potions[kind]--;
    this.persist();
    const stats = this.currentStats();
    const hpHeal = kind === 'hp' ? Math.round(stats.maxHp * 0.4) : 0;
    const mpHeal = kind === 'mp' ? Math.round(stats.maxMp * 0.4) : 0;
    return { ok: true, msg: kind === 'hp' ? `恢复 ${hpHeal} HP` : `恢复 ${mpHeal} MP`, hpHeal, mpHeal };
  }

  /** 杀怪金币奖励入账（BT-6：同步生涯统计 goldEarned） */
  addGold(amount: number): void {
    this.gold += amount;
    this.save.lifeStats.goldEarned = (this.save.lifeStats.goldEarned ?? 0) + amount;
    this.persist();
  }

  // ───────────── UI 视图 ─────────────

  private itemView(it: InventoryItem, equipped: boolean): ItemView {
    const stats = itemStats(it, GEM_TABLE, STRENGTHEN_CONFIG as StrengthenConfig);
    const score = (stats.atk ?? 0) * 10 + (stats.def ?? 0) * 8 + (stats.maxHp ?? 0) + (stats.critRate ?? 0) * 5;
    return {
      uid: it.uid,
      name: it.name,
      slot: it.slot,
      quality: it.quality,
      qualityLabel: QUALITY_LABEL[it.quality],
      strengthenLevel: it.strengthenLevel,
      sockets: [...it.sockets],
      affixCount: it.affixes.length,
      stats,
      score,
      sellPrice: sellPriceOf(it),
      equipped,
    };
  }

  buildProgressionModel(): ProgressionModel {
    const slots: EquipmentSlot[] = ['weapon', 'head', 'body', 'shoes', 'accessory'];
    // BT-5.3 只展示当前角色的技能
    const charId = this.save.charId ?? 'linghou';
    const charSkills = skillsForChar(getConfig.allSkills() as never, charId);
    const skills = charSkills.map((raw) => {
      const level = this.skillTree.levelOf(raw.id);
      const max = maxLevelOf(raw.id);
      const resolved = this.skillTree.resolve([raw as never])[0];
      return {
        id: raw.id,
        name: raw.name,
        level,
        maxLevel: max,
        upCost: skillUpCost(level),
        canUpgrade: level < max && this.skillTree.points >= skillUpCost(level),
        damageMul: resolved.damageMul,
        mpCost: resolved.mpCost,
        cdMs: resolved.cdMs,
        nextDamageMul: level < max ? (raw as unknown as { levels?: { damageMul: number }[] }).levels?.[level]?.damageMul ?? null : null,
      };
    });
    const gems: GemView[] = DEFAULT_GEMS.map((g: GemDef) => ({
      id: g.id, name: g.name, tier: g.tier, stat: g.stat, value: g.value,
      count: this.gemBag.count(g.id), price: gemPriceOf(g.tier),
    }));
    return {
      gold: this.gold,
      stones: this.stones,
      playerLevel: this.save.playerLevel,
      skillPoints: this.skillTree.points,
      stats: this.currentStats(),
      baseStats: playerBaseStats(this.save) as BattleStats,
      equipment: slots.map((s) => {
        const it = this.equipment.get(s);
        return it ? this.itemView(it, true) : null;
      }),
      inventory: this.inventory.list().map((it) => this.itemView(it, false)),
      skills,
      gems,
      potions: { ...this.potions },
    };
  }

  buildShopModel(): ShopModel {
    const gems: GemView[] = DEFAULT_GEMS.map((g: GemDef) => ({
      id: g.id, name: g.name, tier: g.tier, stat: g.stat, value: g.value,
      count: this.gemBag.count(g.id), price: gemPriceOf(g.tier),
    }));
    return {
      gold: this.gold,
      stones: this.stones,
      potions: { ...this.potions },
      potionPrices: { ...POTION_PRICES },
      stonePrice: STONE_PRICE,
      gems,
      sellable: this.inventory.list().map((it) => this.itemView(it, false)),
    };
  }
}

function cloneItem(it: InventoryItem): InventoryItem {
  return { ...it, baseStats: { ...it.baseStats }, affixes: it.affixes.map((a) => ({ ...a })), sockets: [...it.sockets] };
}

/** 便捷：由怪物定义获得其金币掉落 */
export function goldDropOf(def: MonsterDef): number {
  return goldRewardFor(def.level);
}
