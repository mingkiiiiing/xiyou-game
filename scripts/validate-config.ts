/** 全量数据表校验（任务D）。运行：npm run check-data */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateSkills, validateMonsters, validateItems, validateGems,
  validateLevels, validatePlayer, validateFormula, validateStrengthen,
  validateCrossRefs,
} from '../src/data/schemas';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = <T>(p: string): T => JSON.parse(readFileSync(resolve(root, 'src/config', p), 'utf8')) as T;

let failed = false;
const step = (name: string, fn: () => void) => {
  try { fn(); console.log(`✓ ${name}`); }
  catch (e) { failed = true; console.error(`✗ ${name}: ${(e as Error).message}`); }
};

const player = read('player.json');
const formula = read('formula.json');
const strengthen = read('strengthen.json');
const skills = read<unknown>('skills.json');
const monsters = (read<{ monsters: unknown }>('monsters.json')).monsters;
const items = (read<{ items: unknown }>('items.json')).items;
const gems = (read<{ gems: unknown }>('gems.json')).gems;
const levels = (read<{ levels: unknown }>('levels.json')).levels;

step('player.json', () => validatePlayer(player, 'player.json'));
step('formula.json', () => validateFormula(formula, 'formula.json'));
step('strengthen.json', () => validateStrengthen(strengthen, 'strengthen.json'));
step('skills.json', () => validateSkills(skills, 'skills.json'));
step('monsters.json', () => validateMonsters(monsters, 'monsters.json'));
step('items.json', () => validateItems(items, 'items.json'));
step('gems.json', () => validateGems(gems, 'gems.json'));
step('levels.json', () => validateLevels(levels, 'levels.json'));
step('外键引用', () => {
  const errs = validateCrossRefs({ monsters: monsters as never, items: items as never, levels: levels as never });
  if (errs.length) throw new Error('\n  ' + errs.join('\n  '));
});

// BT-5.1 新增校验：技能归属角色白名单 + 关卡世界宽度范围（其余校验逻辑不动）
const SKILL_CHAR_IDS = ['linghou', 'manyan', 'yunxuan'];
step('skills.json charId 白名单', () => {
  const arr = skills as unknown as Array<{ id: string; charId?: string }>;
  for (const s of arr) {
    if (s.charId !== undefined && !SKILL_CHAR_IDS.includes(s.charId)) {
      throw new Error(`${s.id}: 非法 charId "${s.charId}"（允许：${SKILL_CHAR_IDS.join('/')}）`);
    }
  }
});
step('levels.json worldW 范围', () => {
  const arr = levels as unknown as Array<{ id: string; worldW?: number }>;
  for (const l of arr) {
    if (l.worldW !== undefined) {
      if (typeof l.worldW !== 'number' || !Number.isFinite(l.worldW) || l.worldW < 2000 || l.worldW > 6000) {
        throw new Error(`${l.id}: worldW 必须在 2000~6000，得到 ${l.worldW}`);
      }
    }
  }
});

// 数据规模 sanity（任务D验收：≥5 小怪 + Boss、30 件装备）
const monsterArr = monsters as unknown as Array<{ aiType: string }>;
const itemArr = items as unknown as unknown[];
const bossCount = monsterArr.filter((m) => m.aiType === 'boss').length;
const meleeCount = monsterArr.filter((m) => m.aiType === 'melee').length;
const rangedCount = monsterArr.filter((m) => m.aiType === 'ranged').length;
if (meleeCount < 2 || rangedCount < 2 || bossCount < 1) { failed = true; console.error('✗ 怪物规模不足（需要 ≥2 近战 ≥2 远程 ≥1 Boss）'); }
if (itemArr.length < 30) { failed = true; console.error(`✗ 装备数量不足（${itemArr.length}/30）`); }

console.log(failed ? '✗ 数据表存在问题' : `✓ 全部校验通过（怪物 ${monsterArr.length}，装备 ${itemArr.length}）`);
process.exit(failed ? 1 : 0);
