/**
 * TASK-E 装备与成长 —— 模块内部类型契约。
 * 规则：不修改 src/shared/types.ts；集成时由主会话把这里的公共类型合并过去。
 */

/** 装备槽位 */
export type EquipmentSlot = 'weapon' | 'head' | 'body' | 'shoes' | 'accessory';

export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ['weapon', 'head', 'body', 'shoes', 'accessory'];

/** 品质（白绿蓝紫橙红） */
export type Quality = 'white' | 'green' | 'blue' | 'purple' | 'orange' | 'red';

/** 品质从低到高（排序 / 展示顺序用） */
export const QUALITY_ORDER: readonly Quality[] = ['white', 'green', 'blue', 'purple', 'orange', 'red'];

/** 装备 / 词条 / 宝石共同加成的属性键（BattleStats 字段子集） */
export type StatKey = 'atk' | 'def' | 'maxHp' | 'maxMp' | 'critRate' | 'critDmg' | 'moveSpeed';

export const STAT_KEYS: readonly StatKey[] = ['atk', 'def', 'maxHp', 'maxMp', 'critRate', 'critDmg', 'moveSpeed'];

/** 随机词条定义（词条池可配置） */
export interface AffixDef {
  id: string;
  stat: StatKey;
  /** roll 值下界（含） */
  min: number;
  /** roll 值上界（含） */
  max: number;
}

/** roll 出来的词条实例 */
export interface Affix {
  id: string;
  stat: StatKey;
  value: number;
}

/** 每件装备固定 3 个宝石孔 */
export const SOCKET_COUNT = 3;

/**
 * 装备运行时实例：ItemDef 的 roll 结果 + 养成状态。
 * baseStats 是 ItemDef.baseStats 的快照（创建时拷贝，属性聚合无需查表，保证 recalcStats 纯净）。
 */
export interface InventoryItem {
  uid: string;
  /** 引用 ItemDef.id */
  defId: string;
  name: string;
  slot: EquipmentSlot;
  quality: Quality;
  baseStats: Partial<Record<StatKey, number>>;
  /**
   * 品质基础属性倍率（docs/02 品质体系：白1.0/绿1.15/蓝1.3/紫1.5/橙1.8/红2.2）。
   * 仅掉落生成的装备带此值；手工构造的实例省略时按 1.0 处理（向后兼容）。
   */
  qualityMult?: number;
  affixes: Affix[];
  strengthenLevel: number;
  /** 长度固定 SOCKET_COUNT，元素为 GemDef.id，空孔为 null */
  sockets: (string | null)[];
}

/** 宝石定义：3 级体系（tier 1/2/3） */
export interface GemDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  stat: StatKey;
  value: number;
}

/** 强化配置（结构对应 src/config/strengthen.json） */
export interface StrengthenConfig {
  maxLevel: number;
  /** 每级强化对装备自身 baseStats 的加成比例（0.08 = 每级 +8%） */
  bonusPerLevel: number;
  /** successRate[当前等级] = 升到下一级的成功率（百分数） */
  successRate: number[];
  /** v1 仅支持 none（失败不掉级） */
  failPenalty: 'none' | 'dropLevel';
}

/** 装备栏快照：槽位 → 实例 | 空 */
export type EquipmentSlots = Readonly<Record<EquipmentSlot, InventoryItem | null>>;

/** 通用操作结果（镶嵌等校验用） */
export interface OpResult {
  ok: boolean;
  reason?: string;
}
