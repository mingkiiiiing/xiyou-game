/**
 * 统一配置加载入口：import 全部 JSON 表 → schema 校验 → 外键校验 → getter 暴露。
 * 任何表损坏时抛出带表名的 Error（fail-fast，避免带病数值进入战斗）。
 */
import playerJson from '../config/player.json';
import formulaJson from '../config/formula.json';
import strengthenJson from '../config/strengthen.json';
import skillsJson from '../config/skills.json';
import monstersJson from '../config/monsters.json';
import itemsJson from '../config/items.json';
import gemsJson from '../config/gems.json';
import levelsJson from '../config/levels.json';
import {
  validateSkills, validateMonsters, validateItems, validateGems,
  validateLevels, validatePlayer, validateFormula, validateStrengthen,
  validateCrossRefs,
  type RawSkill, type RawMonster, type RawItem, type RawGem,
  type RawLevel, type RawPlayer, type RawFormula, type RawStrengthen,
} from './schemas';

export const config = {
  player: playerJson as unknown as RawPlayer,
  formula: formulaJson as unknown as RawFormula,
  strengthen: strengthenJson as unknown as RawStrengthen,
  skills: skillsJson as unknown as RawSkill[],
  monsters: (monstersJson as { monsters: RawMonster[] }).monsters,
  items: (itemsJson as { items: RawItem[] }).items,
  gems: (gemsJson as { gems: RawGem[] }).gems,
  levels: (levelsJson as { levels: RawLevel[] }).levels,
};

// —— 启动即校验（fail-fast）——
validatePlayer(config.player, 'player.json');
validateFormula(config.formula, 'formula.json');
validateStrengthen(config.strengthen, 'strengthen.json');
validateSkills(config.skills, 'skills.json');
validateMonsters(config.monsters, 'monsters.json');
validateItems(config.items, 'items.json');
validateGems(config.gems, 'gems.json');
validateLevels(config.levels, 'levels.json');
{
  const errs = validateCrossRefs({ monsters: config.monsters, items: config.items, levels: config.levels });
  if (errs.length) throw new Error(`[config] 外键校验失败:\n  ${errs.join('\n  ')}`);
}

// —— 索引 ——
const skillById = new Map(config.skills.map((s) => [s.id, s]));
const monsterById = new Map(config.monsters.map((m) => [m.id, m]));
const itemById = new Map(config.items.map((i) => [i.id, i]));
const gemById = new Map(config.gems.map((g) => [g.id, g]));
const levelById = new Map(config.levels.map((l) => [l.id, l]));

export const getConfig = {
  skill: (id: string): RawSkill => {
    const s = skillById.get(id);
    if (!s) throw new Error(`[config] 未找到技能 ${id}`);
    return s;
  },
  monster: (id: string): RawMonster => {
    const m = monsterById.get(id);
    if (!m) throw new Error(`[config] 未找到怪物 ${id}`);
    return m;
  },
  item: (id: string): RawItem => {
    const i = itemById.get(id);
    if (!i) throw new Error(`[config] 未找到物品 ${id}`);
    return i;
  },
  gem: (id: string): RawGem => {
    const g = gemById.get(id);
    if (!g) throw new Error(`[config] 未找到宝石 ${id}`);
    return g;
  },
  level: (id: string): RawLevel => {
    const l = levelById.get(id);
    if (!l) throw new Error(`[config] 未找到关卡 ${id}`);
    return l;
  },
  allSkills: (): RawSkill[] => config.skills,
  allMonsters: (): RawMonster[] => config.monsters,
  allItems: (): RawItem[] => config.items,
  allGems: (): RawGem[] => config.gems,
  allLevels: (): RawLevel[] => config.levels,
  player: (): RawPlayer => config.player,
  formula: (): RawFormula => config.formula,
  strengthen: (): RawStrengthen => config.strengthen,
};

/** 玩家按等级成长后的属性（docs/02 公式：base × (1+growth)^(lv-1)） */
export function playerStatsAtLevel(level: number): { maxHp: number; maxMp: number; atk: number; def: number } {
  const p = config.player;
  const g = p.growthPerLevel;
  const k = Math.max(1, Math.floor(level)) - 1;
  return {
    maxHp: Math.round(p.maxHp * Math.pow(1 + g.hp, k)),
    maxMp: Math.round(p.maxMp * Math.pow(1 + g.mp, k)),
    atk: Math.round(p.atk * Math.pow(1 + g.atk, k)),
    def: Math.round(p.def * Math.pow(1 + g.def, k)),
  };
}

/** 战力口径（docs/02 附录用）：atk×10 + def×8 + maxHp + critRate×5 */
export function powerOf(maxHp: number, atk: number, def: number, critRate: number): number {
  return Math.round(atk * 10 + def * 8 + maxHp + critRate * 5);
}
