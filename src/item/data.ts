/**
 * TASK-E 模块内默认数据 + config 表装载（只读 import，禁止修改 src/config/）。
 */
import type { ItemDef } from '../shared/types';
import itemsJson from '../config/items.json';
import strengthenJson from '../config/strengthen.json';
import gemsJson from '../config/gems.json';
import type { AffixDef, EquipmentSlot, GemDef, Quality, StatKey, StrengthenConfig } from './types';

/** config/items.json → ItemDef 表（只读） */
export const ITEM_TABLE: readonly ItemDef[] = (itemsJson as unknown as { items: ItemDef[] }).items;

export function findItemDef(id: string): ItemDef | undefined {
  return ITEM_TABLE.find((d) => d.id === id);
}

/** config/strengthen.json → StrengthenConfig */
export const STRENGTHEN_CONFIG: StrengthenConfig = strengthenJson as unknown as StrengthenConfig;

/** 掉落品质默认权重（品质 roll 用，DropResolver 可覆盖） */
export const QUALITY_WEIGHTS: Readonly<Record<Quality, number>> = {
  white: 40, green: 26, blue: 16, purple: 10, orange: 5, red: 3,
};

/** 词条数量随品质提升（对齐 docs/02-数值与数据表设计.md 的品质体系表） */
export const QUALITY_AFFIX_COUNT: Readonly<Record<Quality, number>> = {
  white: 0, green: 1, blue: 2, purple: 3, orange: 4, red: 5,
};

/** 品质基础属性倍率（docs/02 品质体系表） */
export const QUALITY_STAT_MULT: Readonly<Record<Quality, number>> = {
  white: 1.0, green: 1.15, blue: 1.3, purple: 1.5, orange: 1.8, red: 2.2,
};

/** 品质颜色 */
export const QUALITY_COLOR: Readonly<Record<Quality, number>> = {
  white: 0xd0d7de, green: 0x3fb950, blue: 0x4493f8, purple: 0xab7df8, orange: 0xf0883e, red: 0xf85149,
};

/** 品质中文短标签 */
export const QUALITY_LABEL: Readonly<Record<Quality, string>> = {
  white: '白', green: '绿', blue: '蓝', purple: '紫', orange: '橙', red: '红',
};

/** 槽位中文标签 */
export const SLOT_LABEL: Readonly<Record<EquipmentSlot, string>> = {
  weapon: '武器', head: '头盔', body: '护甲', shoes: '鞋子', accessory: '饰品',
};

/** 属性中文标签 */
export const STAT_LABEL: Readonly<Record<StatKey, string>> = {
  atk: '攻击', def: '防御', maxHp: '生命上限', maxMp: '法力上限',
  critRate: '暴击率%', critDmg: '暴伤%', moveSpeed: '移速',
};

/** 默认随机词条池（DropResolver 可注入自定义池） */
export const DEFAULT_AFFIX_POOL: readonly AffixDef[] = [
  { id: 'affix_atk', stat: 'atk', min: 1, max: 5 },
  { id: 'affix_def', stat: 'def', min: 1, max: 3 },
  { id: 'affix_maxHp', stat: 'maxHp', min: 5, max: 25 },
  { id: 'affix_maxMp', stat: 'maxMp', min: 3, max: 12 },
  { id: 'affix_critRate', stat: 'critRate', min: 1, max: 4 },
  { id: 'affix_critDmg', stat: 'critDmg', min: 5, max: 20 },
  { id: 'affix_moveSpeed', stat: 'moveSpeed', min: 3, max: 15 },
];

/**
 * 宝石表：唯一数据源 = src/config/gems.json（任务D维护），字段 attr → stat 适配。
 * 集成（IT-1.2）已消除早期内置双份定义，配置改动即刻生效。
 */
interface RawGem { id: string; name: string; tier: 1 | 2 | 3; attr: StatKey; value: number; }
export const DEFAULT_GEMS: readonly GemDef[] = (gemsJson as unknown as { gems: RawGem[] }).gems
  .map((g) => ({ id: g.id, name: g.name, tier: g.tier, stat: g.attr, value: g.value }));
