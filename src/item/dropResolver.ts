/**
 * DropResolver：输入掉落表（drops + 品质权重）→ 产出装备实例。
 * 品质 roll（白绿蓝紫橙红加权）+ 词条 roll（词条池可配置，数量随品质）。
 * 所有随机通过注入的 Rng 完成，保证可测试 / 可复现。
 */
import type { ItemDef } from '../shared/types';
import type { Affix, AffixDef, InventoryItem, Quality } from './types';
import { QUALITY_ORDER } from './types';
import { SOCKET_COUNT } from './types';
import type { Rng } from './rng';
import { pickWeighted, randInt } from './rng';
import { DEFAULT_AFFIX_POOL, QUALITY_AFFIX_COUNT, QUALITY_WEIGHTS, QUALITY_STAT_MULT } from './data';

/** 与 shared MonsterDef.drops 同构的掉落规则（可由任务D的 monsters 表直接映射） */
export interface DropRule {
  itemId: string;
  /** 0~1，命中概率 */
  chance: number;
}

export interface DropResolverOptions {
  /** ItemDef 表（装备基础定义） */
  items: readonly ItemDef[];
  /** 随机源，默认 Math.random */
  rng?: Rng;
  /** uid 生成器，默认递增 item_1/item_2... */
  uidFactory?: () => string;
  /** 品质权重，默认内置权重 */
  qualityWeights?: Partial<Record<Quality, number>>;
  /** 词条池，默认内置池 */
  affixPool?: readonly AffixDef[];
  /** 各品质词条数量，默认内置表 */
  affixCountByQuality?: Readonly<Record<Quality, number>>;
}

export class DropResolver {
  private readonly defs = new Map<string, ItemDef>();
  private readonly rng: Rng;
  private readonly uidFactory: () => string;
  private readonly qualityWeights: [Quality, number][];
  private readonly affixPool: readonly AffixDef[];
  private readonly affixCount: Readonly<Record<Quality, number>>;

  constructor(opts: DropResolverOptions) {
    for (const d of opts.items) this.defs.set(d.id, d);
    this.rng = opts.rng ?? Math.random;
    let n = 0;
    this.uidFactory = opts.uidFactory ?? (() => `item_${++n}`);
    const qw = opts.qualityWeights ?? QUALITY_WEIGHTS;
    this.qualityWeights = QUALITY_ORDER.filter((q) => (qw[q] ?? 0) > 0).map(
      (q) => [q, qw[q] ?? 0] as [Quality, number],
    );
    if (this.qualityWeights.length === 0) this.qualityWeights = [['white', 1]];
    this.affixPool = opts.affixPool ?? DEFAULT_AFFIX_POOL;
    this.affixCount = opts.affixCountByQuality ?? QUALITY_AFFIX_COUNT;
  }

  getDef(id: string): ItemDef | undefined {
    return this.defs.get(id);
  }

  /** 掉落主入口：逐条 roll chance，命中的生成装备实例（表里不存在的 itemId 跳过） */
  resolve(drops: readonly DropRule[]): InventoryItem[] {
    const out: InventoryItem[] = [];
    for (const rule of drops) {
      if (!(this.rng() < rule.chance)) continue;
      const def = this.defs.get(rule.itemId);
      if (!def) continue; // 数据问题由任务D的 schema 校验兜底
      out.push(this.rollItem(def));
    }
    return out;
  }

  /** 品质 roll：按权重从白绿蓝紫橙红中抽一个 */
  rollQuality(): Quality {
    return pickWeighted(this.rng, this.qualityWeights);
  }

  /** 词条 roll：从词条池不重复抽取 N 条，值在 [min, max] 闭区间内 */
  rollAffixes(quality: Quality): Affix[] {
    const count = Math.min(this.affixCount[quality] ?? 0, this.affixPool.length);
    const pool = [...this.affixPool];
    const out: Affix[] = [];
    for (let i = 0; i < count; i++) {
      const idx = randInt(this.rng, 0, pool.length - 1);
      const def = pool.splice(idx, 1)[0];
      out.push({ id: def.id, stat: def.stat, value: randInt(this.rng, def.min, def.max) });
    }
    return out;
  }

  /** 单件 roll：品质 + 词条 + 品质属性倍率 + 3 个空宝石孔 + 0 级强化 */
  rollItem(def: ItemDef): InventoryItem {
    const quality = this.rollQuality();
    return {
      uid: this.uidFactory(),
      defId: def.id,
      name: def.name,
      slot: def.slot,
      quality,
      // baseStats 保留 ItemDef 原值快照；品质加成由 qualityMult 在属性聚合时应用（docs/02）
      baseStats: { ...def.baseStats },
      qualityMult: QUALITY_STAT_MULT[quality],
      affixes: this.rollAffixes(quality),
      strengthenLevel: 0,
      sockets: new Array<string | null>(SOCKET_COUNT).fill(null),
    };
  }
}
