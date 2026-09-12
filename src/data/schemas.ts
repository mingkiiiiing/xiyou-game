/**
 * 数据表 schema 校验（零依赖手写守卫）。
 * 每张表一个 validateXxx(data, tableName)，发现问题时抛出带表名的 Error。
 */

const QUALITIES = ['white', 'green', 'blue', 'purple', 'orange', 'red'] as const;
const SLOTS = ['weapon', 'head', 'body', 'shoes', 'accessory'] as const;
const AI_TYPES = ['melee', 'ranged', 'boss'] as const;
const GEM_ATTRS = ['atk', 'def', 'maxHp', 'maxMp'] as const;

function assert(cond: unknown, table: string, msg: string): asserts cond {
  if (!cond) throw new Error(`[config:${table}] ${msg}`);
}
function assertPos(table: string, v: number, name: string): void {
  assert(typeof v === 'number' && Number.isFinite(v) && v >= 0, table, `${name} 必须为非负数，得到 ${v}`);
}

export interface RawSkill { id: string; name: string; cdMs: number; mpCost: number; damageMul: number; hitbox: { w: number; h: number; offsetX: number; offsetY: number; delayMs: number; activeMs: number }; dashSpeed?: number; }
export interface RawMonster { id: string; name: string; level: number; stats: { hp: number; atk: number; def: number; moveSpeed: number }; aiType: typeof AI_TYPES[number]; attack: { damageMul: number; range: number; cooldownMs: number }; drops: Array<{ itemId: string; chance: number }>; }
export interface RawItem { id: string; name: string; slot: typeof SLOTS[number]; quality: typeof QUALITIES[number]; baseStats: Partial<Record<typeof GEM_ATTRS[number], number>>; }
export interface RawGem { id: string; name: string; tier: number; attr: typeof GEM_ATTRS[number]; value: number; }
export interface RawLevel { id: string; chapter: number; name: string; recLevel: number; waves: Array<{ monsterId: string; count: number; intervalMs: number }>; bossId: string | null; worldW?: number; }
export interface RawPlayer { hp: number; maxHp: number; mp: number; maxMp: number; atk: number; def: number; critRate: number; critDmg: number; moveSpeed: number; growthPerLevel: { hp: number; mp: number; atk: number; def: number }; }
export interface RawFormula { variance: number; defenseK: number; defenseLevelFactor: number; mpRegenPerSec: number; }
export interface RawStrengthen { maxLevel: number; bonusPerLevel: number; successRate: number[]; failPenalty: string; }

export function validateSkills(data: unknown, table: string): asserts data is RawSkill[] {
  assert(Array.isArray(data) && data.length > 0, table, '技能表为空');
  const ids = new Set<string>();
  for (const s of data as RawSkill[]) {
    assert(s && typeof s.id === 'string', table, '技能缺 id');
    assert(!ids.has(s.id), table, `技能 id 重复: ${s.id}`);
    ids.add(s.id);
    assertPos(table, s.cdMs, 'cdMs'); assertPos(table, s.mpCost, 'mpCost'); assertPos(table, s.damageMul, 'damageMul');
    assert(s.hitbox && s.hitbox.w > 0 && s.hitbox.h > 0, table, `${s.id}: hitbox 尺寸必须为正`);
  }
}

export function validateMonsters(data: unknown, table: string): asserts data is RawMonster[] {
  assert(Array.isArray(data) && data.length > 0, table, '怪物表为空');
  const ids = new Set<string>();
  for (const m of data as RawMonster[]) {
    assert(m && typeof m.id === 'string', table, '怪物缺 id');
    assert(!ids.has(m.id), table, `怪物 id 重复: ${m.id}`);
    ids.add(m.id);
    assert(AI_TYPES.includes(m.aiType), table, `${m.id}: 非法 aiType ${m.aiType}`);
    assertPos(table, m.stats?.hp, 'hp'); assertPos(table, m.stats?.atk, 'atk');
    for (const d of m.drops ?? []) {
      assertPos(table, d.chance, 'chance');
      assert(d.chance <= 1, table, `${m.id}: 掉落概率必须 ≤1`);
    }
  }
}

export function validateItems(data: unknown, table: string): asserts data is RawItem[] {
  assert(Array.isArray(data) && data.length > 0, table, '物品表为空');
  const ids = new Set<string>();
  for (const it of data as RawItem[]) {
    assert(it && typeof it.id === 'string', table, '物品缺 id');
    assert(!ids.has(it.id), table, `物品 id 重复: ${it.id}`);
    ids.add(it.id);
    assert(SLOTS.includes(it.slot), table, `${it.id}: 非法槽位 ${it.slot}`);
    assert(QUALITIES.includes(it.quality), table, `${it.id}: 非法品质 ${it.quality}`);
  }
}

export function validateGems(data: unknown, table: string): asserts data is RawGem[] {
  assert(Array.isArray(data), table, '宝石表为空');
  const ids = new Set<string>();
  for (const g of data as RawGem[]) {
    assert(g && typeof g.id === 'string', table, '宝石缺 id');
    assert(!ids.has(g.id), table, `宝石 id 重复: ${g.id}`);
    ids.add(g.id);
    assert(GEM_ATTRS.includes(g.attr), table, `${g.id}: 非法属性 ${g.attr}`);
    assertPos(table, g.tier, 'tier'); assertPos(table, g.value, 'value');
  }
}

export function validateLevels(data: unknown, table: string): asserts data is RawLevel[] {
  assert(Array.isArray(data) && data.length > 0, table, '关卡表为空');
  const ids = new Set<string>();
  for (const l of data as RawLevel[]) {
    assert(l && typeof l.id === 'string', table, '关卡缺 id');
    assert(!ids.has(l.id), table, `关卡 id 重复: ${l.id}`);
    ids.add(l.id);
    assert(Array.isArray(l.waves), table, `${l.id}: waves 缺失`);
    for (const w of l.waves) { assertPos(table, w.count, 'count'); assertPos(table, w.intervalMs, 'intervalMs'); }
  }
}

export function validatePlayer(data: unknown, table: string): asserts data is RawPlayer {
  const p = data as RawPlayer;
  assertPos(table, p.maxHp, 'maxHp'); assertPos(table, p.maxMp, 'maxMp');
  assertPos(table, p.atk, 'atk'); assertPos(table, p.def, 'def');
  assert(p.growthPerLevel && p.growthPerLevel.hp > 0, table, 'growthPerLevel 缺失或非法');
}

export function validateFormula(data: unknown, table: string): asserts data is RawFormula {
  const f = data as RawFormula;
  assert(f.variance >= 0 && f.variance < 1, table, 'variance 应在 [0,1)');
  assertPos(table, f.defenseK, 'defenseK');
  assertPos(table, f.mpRegenPerSec, 'mpRegenPerSec');
}

export function validateStrengthen(data: unknown, table: string): asserts data is RawStrengthen {
  const s = data as RawStrengthen;
  assert(Array.isArray(s.successRate) && s.successRate.length >= s.maxLevel, table, 'successRate 长度不足');
  for (const r of s.successRate) assert(r > 0 && r <= 100, table, '成功率必须在 (0,100]');
}

/** 外键引用检查（在 ConfigLoader 中所有表就绪后调用） */
export function validateCrossRefs(args: {
  monsters: RawMonster[]; items: RawItem[]; levels: RawLevel[];
}): string[] {
  const errs: string[] = [];
  const itemIds = new Set(args.items.map((i) => i.id));
  const monsterIds = new Set(args.monsters.map((m) => m.id));
  for (const m of args.monsters) {
    for (const d of m.drops ?? []) {
      if (!itemIds.has(d.itemId)) errs.push(`monsters:${m.id} 掉落了不存在的物品 ${d.itemId}`);
    }
  }
  for (const l of args.levels) {
    for (const w of l.waves) {
      if (!monsterIds.has(w.monsterId)) errs.push(`levels:${l.id} 引用了不存在的怪物 ${w.monsterId}`);
    }
    if (l.bossId && !monsterIds.has(l.bossId)) errs.push(`levels:${l.id} 的 Boss 不存在: ${l.bossId}`);
  }
  return errs;
}
