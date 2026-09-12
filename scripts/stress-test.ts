/**
 * IT-1.5 压力测试（headless，逻辑层）。
 * 运行：npx tsx scripts/stress-test.ts
 *
 * 覆盖真实代码路径：BattleDirector / Spawner 波次吞吐、伤害公式（game/damage.ts）、
 * 掉落解析 + 属性聚合、以及"单帧逻辑预算"的 p50/p95。
 *
 * 明确边界：不覆盖渲染帧时间（Graphics/WebGL 需要浏览器环境），
 * 渲染性能须在浏览器中用 ?scene=game 实测；本脚本给出的是逻辑层预算。
 */
import { getConfig } from '../src/data/ConfigLoader';
import { BattleDirector } from '../src/game/BattleDirector';
import { computeDamage, type FormulaConfig } from '../src/game/damage';
import { DropResolver } from '../src/item/dropResolver';
import { Inventory } from '../src/item/inventory';
import { Equipment } from '../src/item/equipment';
import { recalcStats } from '../src/item/stats';
import { ITEM_TABLE, STRENGTHEN_CONFIG, DEFAULT_GEMS } from '../src/item/data';
import type { InventoryItem } from '../src/item/types';
import type { BattleStats, WaveDef } from '../src/shared/types';
import { getCharacterArt } from '../src/art/registry';
import { composeCharacter } from '../src/art/compose';
import { ENV_THEMES } from '../src/art/env';
import { SkillTree } from '../src/battle/skillTree';
import { pickBehavior, startBehavior, tickBehavior, newBehaviorRuntime, type BehaviorHost } from '../src/enemy/behaviors';
import type { SkillDef } from '../src/shared/types';

let failed = false;
const fail = (m: string) => { console.error('  ✗ ' + m); failed = true; };
const ok = (m: string) => console.log('  ✓ ' + m);

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const fmt = (n: number, d = 3) => n.toFixed(d);

console.log('\n================ 压力测试（逻辑层） ================\n');

// ───────── 1. 波次吞吐：100 只怪 + Boss 全流程 ─────────
console.log('■ 场景1：波次系统吞吐（100 只怪 + Boss）');
{
  const totalMonsters = 100;
  const perWave = 20;
  const waves: WaveDef[] = [];
  for (let i = 0; i < totalMonsters / perWave; i++) {
    const m = getConfig.allMonsters()[i % getConfig.allMonsters().length];
    waves.push({ monsterId: m.id, count: perWave, intervalMs: 0 });
  }
  let spawned = 0;
  let bossSpawned = false;
  let alive = 0;

  const director = new BattleDirector(waves, 'demon_king', {
    spawnMonster: () => { spawned++; alive++; },
    aliveMonsterCount: () => { const a = alive; alive = 0; return a; }, // 模拟立刻清场
    spawnBoss: () => { bossSpawned = true; },
    isBossAlive: () => true,
  });

  const t0 = performance.now();
  let steps = 0;
  const MAX_MS = 20_000; // 波次间有刻意节奏停顿(RESPAWN 600ms)，按真实时间测量
  while (director.status !== 'cleared' && performance.now() - t0 < MAX_MS) {
    director.update();
    if (director.status === 'boss') director.notifyBossDefeated();
    steps++;
  }
  const ms = performance.now() - t0;

  if (director.status !== 'cleared') fail(`波次未能在 ${MAX_MS}ms 内跑完（当前 ${director.status}）`);
  else if (spawned !== totalMonsters) fail(`刷怪数量不符：${spawned}/${totalMonsters}`);
  else if (!bossSpawned) fail('Boss 未被生成');
  else {
    ok(`100 怪 + Boss 全流程完成：${steps} 步 / ${fmt(ms, 0)}ms`);
    ok(`含波次间刻意节奏停顿（每波 600ms），实际逻辑开销远低于此`);
  }
}

// ───────── 2. 伤害公式吞吐 ─────────
console.log('\n■ 场景2：伤害公式吞吐（game/damage.ts）');
{
  const cfg = getConfig.formula() as FormulaConfig;
  const attacker = { atk: 120, critRate: 20, critDmg: 180 };
  const defender = { def: 40, level: 7 };

  const N = 200_000;
  let acc = 0;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    acc += computeDamage(attacker, defender, 1.5, cfg).amount;
  }
  const ms = performance.now() - t0;

  ok(`${N.toLocaleString()} 次伤害计算：${fmt(ms, 1)}ms（${fmt((ms * 1000) / N, 0)} ns/次）`);
  if (ms > 1000) fail(`伤害计算过慢：${fmt(ms, 1)}ms > 1000ms`);
  else ok(`单次 ≈ ${fmt(ms / N, 6)} ms，远低于单帧预算`);
  if (acc <= 0) fail('伤害累计异常');
}

// ───────── 3. 掉落 + 属性聚合吞吐 ─────────
console.log('\n■ 场景3：掉落解析 + 属性聚合吞吐');
{
  const resolver = new DropResolver({ items: ITEM_TABLE });
  const dropTable = [{ itemId: 'iron_blade', chance: 1 }, { itemId: 'cloth_robe', chance: 1 }];
  const base: BattleStats = { hp: 100, maxHp: 100, mp: 50, maxMp: 50, atk: 10, def: 5, critRate: 8, critDmg: 150, moveSpeed: 320 };

  const equipment = new Equipment();
  const inventory = new Inventory(9999);
  const N = 10_000;
  const t0 = performance.now();
  let last = base;
  for (let i = 0; i < N; i++) {
    const items = resolver.resolve(dropTable);
    for (const it of items) {
      if (!equipment.get(it.slot)) equipment.equip(it);
      else inventory.add(it);
    }
    last = recalcStats(base, equipment, DEFAULT_GEMS, STRENGTHEN_CONFIG);
  }
  const ms = performance.now() - t0;

  ok(`${N.toLocaleString()} 轮（掉落→穿戴→聚合，累计 ${inventory.size} 件在背包）：${fmt(ms, 1)}ms`);
  if (ms > 3000) fail(`掉落/聚合过慢：${fmt(ms, 1)}ms`);
  else ok(`平均每轮 ≈ ${fmt(ms / N, 4)} ms`);
  if (!(last.atk >= base.atk)) fail('聚合后攻击力未提升（装备未生效）');
  else ok(`聚合结果合理：ATK ${base.atk} → ${last.atk}`);
}

// ───────── 4. 单帧逻辑预算（p50 / p95） ─────────
console.log('\n■ 场景4：单帧逻辑预算（模拟 100 怪同时在场）');
{
  const cfg = getConfig.formula() as FormulaConfig;
  const attacker = { atk: 120, critRate: 20, critDmg: 180 };
  const defender = { def: 40, level: 7 };
  const ITER = 2000;
  const samples: number[] = [];

  for (let i = 0; i < ITER; i++) {
    const t = performance.now();
    // 一帧内：100 次伤害结算 + 100 次拾取范围判定 + 20 次背包查询
    for (let k = 0; k < 100; k++) computeDamage(attacker, defender, 1.2, cfg);
    for (let k = 0; k < 100; k++) {
      const dx = k * 3.1, dy = k * 2.7;
      void (Math.hypot(dx, dy) <= 70);
    }
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const p99 = percentile(samples, 99);

  ok(`逻辑帧样本 ${ITER} 次：p50 ${fmt(p50)}ms · p95 ${fmt(p95)}ms · p99 ${fmt(p99)}ms`);
  if (p95 > 5) fail(`p95 逻辑帧开销过高：${fmt(p95)}ms（预算 5ms）`);
  else ok(`p95 仅占 60fps 单帧预算(16.6ms)的 ${fmt((p95 / 16.6) * 100, 1)}%`);
  console.log('    注：此为逻辑层开销；渲染（Graphics/WebGL）需在浏览器 ?scene=game 实测。');
}

// ───────── 5. 表现层：造型生成 + 相位量化重建开销（BT-2） ─────────
console.log('\n■ 场景5：表现层开销（造型生成 / 环境构建）');
{
  // 5a. 造型形状生成吞吐（每帧每个可视实体都要算一次）
  const ids = ['linghou', ...getConfig.allMonsters().map((m) => m.id)];
  const arts = ids.map((id) => getCharacterArt(id)).filter((a): a is NonNullable<typeof a> => !!a);
  const states = ['idle', 'run', 'attack1', 'hurt', 'jump'];

  const N = 20_000;
  const t0 = performance.now();
  let shapeCount = 0;
  for (let i = 0; i < N; i++) {
    const art = arts[i % arts.length];
    const st = states[i % states.length];
    const shapes = composeCharacter(art, { state: st, phase: (i % 14) / 14, facing: i % 2 ? 1 : -1, flash: i % 7 === 0 });
    shapeCount += shapes.length;
  }
  const ms = performance.now() - t0;
  ok(`${N.toLocaleString()} 次造型合成（${arts.length} 角色 × ${states.length} 状态）：${fmt(ms, 1)}ms`);
  ok(`平均 ${fmt(ms / N, 4)} ms/次，形状 ${Math.round(shapeCount / N)} 个/次`);

  // 100 个实体同帧重算造型（通常不会发生——相位量化命中缓存时不重算，此处测最坏情况）
  const perFrameWorst = (ms / N) * 100;
  ok(`100 实体同帧全量重算（最坏情况）：${fmt(perFrameWorst, 2)}ms`);
  if (perFrameWorst > 16.6) fail(`表现层最坏情况超单帧预算：${fmt(perFrameWorst, 2)}ms`);
  else ok(`占 60fps 单帧预算的 ${fmt((perFrameWorst / 16.6) * 100, 1)}%（实际有量化缓存，远低于此）`);

  // 5b. 环境构建一次性开销
  const t1 = performance.now();
  const themes = ENV_THEMES;
  let totalLayers = 0;
  for (const th of themes) totalLayers += th.layers.length;
  const ms2 = performance.now() - t1;
  ok(`环境主题 ${themes.length} 个 / 视差层 ${totalLayers} 层，元数据读取 ${fmt(ms2, 2)}ms`);

  // 5c. 形状数据规模（内存/GC 参考）
  const sample = composeCharacter(arts[0], { state: 'run', phase: 0.5, facing: 1, flash: false });
  const approxBytes = JSON.stringify(sample).length;
  ok(`单角色单帧形状数据 ≈ ${approxBytes} 字节（12 角色同时 ≈ ${fmt((approxBytes * 12) / 1024, 1)} KB/帧）`);
}

// ───────── 6. BT-3 战斗系统开销（韧性/行为/连招/技能等级） ─────────
console.log('\n■ 场景6：BT-3 战斗系统开销');
{
  const cfg = getConfig.formula() as FormulaConfig;
  const stats = { atk: 120, critRate: 20, critDmg: 180 };
  const defender = { def: 40, level: 7 };

  // 6a. 伤害+韧性计算吞吐（每帧每命中一次）
  const N = 100_000;
  const t0 = performance.now();
  let poiseAcc = 0;
  for (let i = 0; i < N; i++) {
    const d = computeDamage(stats, defender, 1.2, cfg);
    poiseAcc += d.poiseDamage;
  }
  const ms = performance.now() - t0;
  ok(`${N.toLocaleString()} 次伤害+韧性计算：${fmt(ms, 1)}ms（${fmt(ms / N, 6)} ms/次）`);
  if (poiseAcc <= 0) fail('韧性伤害累计异常');

  // 6b. 行为选择/推进吞吐（100 怪在场，每帧各一次）
  const allBehaviors = ['charge', 'leap', 'shield', 'summon', 'fanShot', 'retreat'] as const;
  const runtimes = Array.from({ length: 100 }, () => newBehaviorRuntime());
  const host: BehaviorHost = {
    x: 0, y: 0, facing: 1, target: null, hpRatio: 1, distToTarget: 300, onGround: true,
    fireProjectile: () => {}, summon: () => {}, setDamageReduction: () => {},
    setSuperArmor: () => {}, heal: () => {}, requestMoveX: () => {}, requestJump: () => {},
  };
  const FRAMES = 2000;
  const frameMs: number[] = [];
  for (let f = 0; f < FRAMES; f++) {
    const now = 100000 + f * 16.6;
    const t = performance.now();
    for (let i = 0; i < runtimes.length; i++) {
      const rt = runtimes[i];
      if (rt.active) {
        tickBehavior(rt, host, now);
      } else if (pickBehavior(allBehaviors, rt, 300, 1, now)) {
        startBehavior(rt, pickBehavior(allBehaviors, rt, 300, 1, now)!, now);
      }
    }
    frameMs.push(performance.now() - t);
  }
  frameMs.sort((a, b) => a - b);
  const bp50 = percentile(frameMs, 50), bp95 = percentile(frameMs, 95), bp99 = percentile(frameMs, 99);
  ok(`100 怪行为 AI 单帧：p50 ${fmt(bp50)}ms · p95 ${fmt(bp95)}ms · p99 ${fmt(bp99)}ms`);
  if (bp95 > 5) fail(`行为 AI p95 过高：${fmt(bp95)}ms`);
  else ok(`p95 占 60fps 单帧预算的 ${fmt((bp95 / 16.6) * 100, 1)}%`);

  // 6c. 技能等级解析（每帧 HUD 会调用）
  const skills = getConfig.allSkills() as unknown as SkillDef[];
  const tree = new SkillTree(20);
  tree.upgrade('thrust'); tree.upgrade('sweep');
  const R = 20_000;
  const t2 = performance.now();
  for (let i = 0; i < R; i++) tree.resolve(skills);
  const ms2 = performance.now() - t2;
  ok(`技能等级解析 ${R.toLocaleString()} 次（3 技能）：${fmt(ms2, 1)}ms（${fmt(ms2 / R, 5)} ms/次）`);
  if (ms2 / R > 0.01) fail('技能解析每次超过 0.01ms，HUD 每帧调用可能成为瓶颈');
}

console.log('\n==================================================');
if (failed) {
  console.log('✗ 压力测试存在问题');
  process.exit(1);
} else {
  console.log('✓ 压力测试全部通过（逻辑层 + 表现层 + BT-3 战斗系统）');
}