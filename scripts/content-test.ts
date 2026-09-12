/**
 * BT-5 内容专项测试（headless）：角色系统、难度系统、长关卡地形、关卡配置结构。
 * 运行：npm run test-content
 */
import { CHARACTERS, getCharacter, skillsForChar, applyCharMult } from '../src/game/characterSystem';
import { DIFFICULTIES, getDifficulty, scaleMonsterDef, qualityWeightsFor, difficultyRank } from '../src/game/difficulty';
import { genSolids, spawnRangeX, bossSpawnX, patrolRangeX } from '../src/game/levelUtils';
import { getConfig } from '../src/data/ConfigLoader';
import { defaultSave } from '../src/meta/save';
import { skillsForChar as _sfc } from '../src/game/characterSystem';
import type { SkillDef } from '../src/shared/types';

void _sfc;
let pass = 0, failCount = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log(`  ✓ ${name}`); }
  else { failCount++; console.error(`  ✗ ${name}: 期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}`); }
};
const ok = (name: string, cond: boolean) => eq(name, cond, true);
const section = (s: string) => console.log(`\n■ ${s}`);

// ───────── 1. 角色系统 ─────────
section('角色系统（BT-5.3）');
{
  eq('3 个可玩角色', CHARACTERS.length, 3);
  eq('角色 id', CHARACTERS.map((c) => c.id), ['linghou', 'manyan', 'yunxuan']);
  ok('蛮岩血量倍率 > 灵猴', getCharacter('manyan').baseMult.hp > getCharacter('linghou').baseMult.hp);
  ok('蛮岩速度 < 灵猴', getCharacter('manyan').baseMult.speed < 1);
  ok('云璿是远程普攻', getCharacter('yunxuan').rangedBasic === true);
  ok('近战角色非远程', getCharacter('manyan').rangedBasic === false);

  const all = getConfig.allSkills() as unknown as SkillDef[];
  const linghouSkills = skillsForChar(all, 'linghou');
  const manyanSkills = skillsForChar(all, 'manyan');
  const yunxuanSkills = skillsForChar(all, 'yunxuan');
  eq('灵猴 3 技能', linghouSkills.length, 3);
  eq('蛮岩 3 技能', manyanSkills.length, 3);
  eq('云璿 3 技能', yunxuanSkills.length, 3);
  ok('角色技能互不重叠', new Set([...linghouSkills, ...manyanSkills, ...yunxuanSkills].map((s) => s.id)).size === 9);
  ok('回归锁：resolvedSkills 必须按角色过滤（e2e 曾发现返回全表）', skillsForChar(all, 'yunxuan').every((s) => (s.charId ?? 'linghou') === 'yunxuan'));

  // 倍率数学
  const grown = applyCharMult({ maxHp: 100, maxMp: 50, atk: 10, def: 5, moveSpeed: 320 }, { hp: 1.6, mp: 1, atk: 1.35, def: 1.3, speed: 0.78 });
  eq('蛮岩 hp = 160', grown.maxHp, 160);
  eq('蛮岩 atk = 13.5 → 14(四舍五入)', grown.atk, 14);
  eq('蛮岩移速 = 320×0.78 = 250', grown.moveSpeed, 250); // 回归锁：e2e 曾发现 moveSpeed 未吃到倍率

  // 云璿远程技能命中框更远
  const fireBolt = yunxuanSkills.find((s) => s.id === 'fire_bolt');
  ok('云璿炎弹判定框偏移向远处', (fireBolt?.hitbox.offsetX ?? 0) >= 30);
}

// ───────── 2. 难度系统 ─────────
section('难度系统（BT-5.4）');
{
  eq('3 档难度', DIFFICULTIES.length, 3);
  eq('难度顺序', DIFFICULTIES.map((d) => d.id), ['normal', 'elite', 'nightmare']);
  const elite = getDifficulty('elite');
  const nightmare = getDifficulty('nightmare');
  const mk = { id: 'x', name: 'x', level: 9, stats: { hp: 100, atk: 20, def: 10, moveSpeed: 120 }, aiType: 'melee' as const, attack: { damageMul: 1, range: 60, cooldownMs: 1000 }, drops: [] };
  const scaled = scaleMonsterDef(mk as never, elite);
  eq('精英 hp ×1.6 = 160', scaled.stats.hp, 160);
  eq('精英 atk ×1.4 = 28', scaled.stats.atk, 28);
  eq('普通难度不缩放（引用原对象）', scaleMonsterDef(mk as never, getDifficulty('normal')), mk);
  eq('移速不受难度影响', scaled.stats.moveSpeed, 120);

  // 品质权重：难度越高高阶品质越重
  const w0 = qualityWeightsFor(0), w2 = qualityWeightsFor(2);
  ok('噩梦紫装权重更高', (w2.purple ?? 0) > (w0.purple ?? 0));
  ok('噩梦白装权重更低', (w2.white ?? 0) < (w0.white ?? 0));
  eq('权重和 = 100（噩梦）', Object.values(w2).reduce<number>((a, b) => a + (b ?? 0), 0), 100);

  // 解锁链
  eq('难度排序', [difficultyRank('normal'), difficultyRank('elite'), difficultyRank('nightmare')], [0, 1, 2]);
  eq('精英解锁要求 = normal', getDifficulty('elite').unlock, 'normal');
  eq('噩梦解锁要求 = elite', getDifficulty('nightmare').unlock, 'elite');

  // 存档默认
  const s = defaultSave();
  eq('存档默认角色 = linghou', s.charId, 'linghou');
  eq('存档 clearedDiff 默认空', s.clearedDiff, {});
}

// ───────── 3. 长关卡地形 ─────────
section('长关卡地形（BT-5.5）');
{
  const a = genSolids('1-3', 3600);
  const b = genSolids('1-3', 3600);
  eq('相同输入 → 相同地形（确定性）', JSON.stringify(a), JSON.stringify(b));

  const ground = a[0];
  ok('主地面贯穿全宽', ground.w >= 3600);
  eq('地面 y = 620', ground.y, 620);

  const platforms = a.slice(1);
  ok('长关卡有平台（3600 宽 ≥ 2 段）', platforms.length >= 2);
  for (const p of platforms) {
    ok(`平台在界内 x=${p.x}`, p.x > 400 && p.x + p.w < 3600);
    ok(`平台高度可跳达 y=${p.y}`, p.y >= 340 && p.y <= 500);
    ok(`平台宽度合理 w=${p.w}`, p.w >= 180 && p.w <= 360);
  }

  // 出生与巡逻区
  const sp = spawnRangeX(4800);
  ok('刷怪区在玩家前方', sp.min >= 1200 && sp.max <= 4800);
  ok('Boss 出生靠末端', bossSpawnX(4800) > 4300);
  const patrol = patrolRangeX(4800);
  ok('巡逻覆盖全图', patrol.min === 400 && patrol.max === 4700);
}

// ───────── 4. 关卡配置结构 ─────────
section('关卡配置结构（BT-5.1）');
{
  const levels = getConfig.allLevels();
  eq('7 个关卡', levels.length, 7);
  eq('第一章 5 关', levels.filter((l) => l.chapter === 1).length, 5);
  eq('第二章 2 关', levels.filter((l) => l.chapter === 2).length, 2);
  const recs = levels.map((l) => l.recLevel);
  const sorted = [...recs].sort((a, b) => a - b);
  ok('推荐等级单调递增', JSON.stringify(recs) === JSON.stringify(sorted));
  ok('worldW 单调不减', levels.every((l, i) => i === 0 || (l.worldW ?? 2400) >= (levels[i - 1].worldW ?? 2400)));  ok('第二章有龙王 Boss', levels.some((l) => l.chapter === 2 && l.bossId === 'dragon_king'));
  const monsters = getConfig.allMonsters();
  ok('怪物 ≥ 16 种', monsters.length >= 16);
  ok('龙王存在且为 Boss', monsters.some((m) => m.id === 'dragon_king' && m.aiType === 'boss'));
  ok('龙王数值全场最高', (() => {
    const boss = monsters.find((m) => m.id === 'dragon_king')!;
    return monsters.every((m) => m.id === 'dragon_king' || m.stats.hp < boss.stats.hp);
  })());
  // 所有波次引用的怪物都存在（check-data 也查，这里二次防线）
  const ids = new Set(monsters.map((m) => m.id));
  ok('波次引用完整', levels.every((l) => l.waves.every((w) => ids.has(w.monsterId))));
}

console.log(`\n==========================================`);
if (failCount > 0) {
  console.error(`✗ ${failCount} 项失败 / ${pass} 项通过`);
  process.exit(1);
} else {
  console.log(`✓ 内容专项测试全部通过（${pass} 项）`);
}
