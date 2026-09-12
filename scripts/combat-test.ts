/**
 * BT-3 战斗系统专项测试（headless，纯逻辑）。
 * 覆盖：伤害/韧性公式、技能升级、连招指令、行为库选择。
 * 运行：npm run test-combat
 */
import { computeDamage, type FormulaConfig } from '../src/game/damage';
import { getConfig } from '../src/data/ConfigLoader';
import { skillAtLevel, maxLevelOf, skillUpCost, SkillTree, resolveSkills } from '../src/battle/skillTree';
import { matchCombo, COMBO_TABLE } from '../src/battle/comboCommands';
import { pickBehavior, behaviorReady, newBehaviorRuntime, startBehavior, tickBehavior, behaviorDuration, BEHAVIOR_PARAMS, type BehaviorId, type BehaviorHost } from '../src/enemy/behaviors';
import type { SkillDef } from '../src/shared/types';

let pass = 0, failCount = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log(`  ✓ ${name}`); }
  else { failCount++; console.error(`  ✗ ${name}: 期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}`); }
};
const ok = (name: string, cond: boolean) => eq(name, cond, true);
const section = (s: string) => console.log(`\n■ ${s}`);

const cfg = getConfig.formula() as FormulaConfig;

// ───────────── 1. 伤害与韧性 ─────────────
section('伤害公式与韧性伤害');
{
  const rng = () => 0.5;
  const atk = { atk: 100, critRate: 0, critDmg: 150 };
  const def = { def: 0, level: 1 };
  const d = computeDamage(atk, def, 1.0, { variance: 0, defenseK: 100, defenseLevelFactor: 0 }, rng);
  eq('无浮动无防御：100 × 1.0 = 100', d.amount, 100);
  ok('韧性伤害随倍率增长', computeDamage(atk, def, 2.0, cfg, rng).poiseDamage > computeDamage(atk, def, 1.0, cfg, rng).poiseDamage);
  eq('倍率 1.0 的韧性伤害 = 12', computeDamage(atk, def, 1.0, cfg, rng).poiseDamage, 12);
  // 防御减伤：def=100, K=100, lv系数=0 → 减伤 50%
  const d2 = computeDamage(atk, { def: 100, level: 1 }, 1.0, { variance: 0, defenseK: 100, defenseLevelFactor: 0 }, rng);
  eq('防御 100 减伤 50%：100 → 50', d2.amount, 50);
  // 暴击
  const d3 = computeDamage({ atk: 100, critRate: 100, critDmg: 200 }, def, 1.0, { variance: 0, defenseK: 100, defenseLevelFactor: 0 }, rng);
  ok('必暴击且倍率 200%', d3.isCrit && d3.amount === 200);
}

// ───────────── 2. 技能升级 ─────────────
section('技能升级（BT-3.3）');
{
  const raw = getConfig.allSkills() as unknown as SkillDef[];
  const thrust = raw.find((s) => s.id === 'thrust')!;
  eq('thrust 最大等级 = 5', maxLevelOf('thrust'), 5);
  eq('1 级倍率 = 1.5', skillAtLevel(thrust, 1).damageMul, 1.5);
  eq('5 级倍率 = 2.7', skillAtLevel(thrust, 5).damageMul, 2.7);
  eq('等级越界夹到 1 级', skillAtLevel(thrust, 0).damageMul, 1.5);
  eq('等级越界夹到 5 级', skillAtLevel(thrust, 99).damageMul, 2.7);
  ok('高等级 CD 更短', skillAtLevel(thrust, 5).cdMs < skillAtLevel(thrust, 1).cdMs);

  // 技能树
  const tree = new SkillTree(10);
  eq('初始 1 级', tree.levelOf('thrust'), 1);
  eq('升级消耗 1 点', (tree.upgrade('thrust'), tree.points), 9);
  eq('升到 2 级', tree.levelOf('thrust'), 2);
  eq('再升消耗 2 点', (tree.upgrade('thrust'), tree.points), 7);
  // 花光点数后应失败
  const poor = new SkillTree(0);
  ok('技能点不足升级失败', poor.upgrade('thrust') === false);
  // 满级后失败
  const maxed = new SkillTree(999);
  for (let i = 0; i < 10; i++) maxed.upgrade('sweep');
  eq('满级后停在 5', maxed.levelOf('sweep'), 5);
  ok('满级后升级失败', maxed.upgrade('sweep') === false);

  // 序列化往返
  const rt = new SkillTree(5);
  rt.upgrade('leap_slash');
  const snap = rt.serialize();
  const back = new SkillTree(snap.skillPoints, snap.levels);
  eq('存档往返后技能点一致', back.points, snap.skillPoints);
  eq('存档往返后等级一致', back.levelOf('leap_slash'), 2);

  // 解析整套技能
  const resolved = resolveSkills(raw, () => 3);
  eq('整套解析：thrust 3 级倍率 = 2.0', resolved.find((s) => s.id === 'thrust')!.damageMul, 2.0);
  eq('升级消耗曲线', [1, 2, 3].map(skillUpCost), [1, 2, 3]);
}

// ───────────── 3. 连招指令 ─────────────
section('连招指令（BT-3.3）');
{
  const base = { down: false, airborne: false, absVx: 0, runThreshold: 200 };
  eq('平地静止 → 无指令（走普攻三连）', matchCombo(base), null);
  eq('空中 → 空中下劈', matchCombo({ ...base, airborne: true })!.id, 'air_slam');
  eq('按住下 → 下段扫击', matchCombo({ ...base, down: true })!.id, 'low_sweep');
  eq('高速移动 → 突进斩', matchCombo({ ...base, absVx: 300 })!.id, 'dash_slash');
  eq('优先级：空中 > 下段', matchCombo({ ...base, airborne: true, down: true })!.id, 'air_slam');
  eq('优先级：下段 > 冲刺', matchCombo({ ...base, down: true, absVx: 300 })!.id, 'low_sweep');
  ok('三个指令均有判定框', Object.values(COMBO_TABLE).every((c) => c.hitbox.w > 0 && c.hitbox.h > 0));
  ok('下劈带砸地标记', COMBO_TABLE.air_slam.slamDown === true);
}

// ───────────── 4. 行为库 ─────────────
section('怪物行为库（BT-3.4）');
{
  const now = 100000;
  const rt = newBehaviorRuntime();
  const all: BehaviorId[] = ['charge', 'leap', 'shield', 'summon', 'fanShot', 'retreat'];

  // 无冷却时：距离 300、满血 → 优先 charge（冲锋优先）
  eq('空冷却 + 距离 300 → 冲锋优先', pickBehavior(all, rt, 300, 1.0, now), 'charge');
  // 距离 250 且低血：retreat 可用但 charge 优先级更高
  eq('低血时冲锋仍优先（压迫感）', pickBehavior(all, rt, 250, 0.2, now), 'charge');
  // 只有 retreat 可用（其他都在冷却）
  const rt2 = newBehaviorRuntime();
  for (const b of all) rt2.cooldownUntil[b] = now + 99999;
  rt2.cooldownUntil.retreat = 0;
  eq('仅后撤可用 + 低血 → 后撤', pickBehavior(all, rt2, 300, 0.2, now), 'retreat');
  eq('仅后撤可用 + 满血 → 无行为', pickBehavior(all, rt2, 300, 1.0, now), null);

  // 距离门槛
  const rt3 = newBehaviorRuntime();
  ok('近距离不适合散射', behaviorReady('fanShot', rt3, 50, 1, now) === false);
  ok('远距离适合散射', behaviorReady('fanShot', rt3, 300, 1, now) === true);
  ok('极远不适合冲锋', behaviorReady('charge', rt3, 1200, 1, now) === false);
  ok('护盾仅近距离', behaviorReady('shield', rt3, 120, 1, now) === true && behaviorReady('shield', rt3, 500, 1, now) === false);

  // 冷却生效
  const rt4 = newBehaviorRuntime();
  startBehavior(rt4, 'charge', now);
  ok('行为进行中标记 active', rt4.active === 'charge');
  eq('冲锋时长 = 蓄力+冲刺', behaviorDuration('charge'), BEHAVIOR_PARAMS.charge.windupMs + BEHAVIOR_PARAMS.charge.durationMs);

  // 行为执行：冲锋期间给予霸体与位移
  const calls: string[] = [];
  let superArmor = false;
  const host: BehaviorHost = {
    x: 0, y: 0, facing: 1, target: null, hpRatio: 1, distToTarget: 300, onGround: true,
    fireProjectile: () => calls.push('projectile'),
    summon: () => calls.push('summon'),
    setDamageReduction: (v) => calls.push(`dr:${v}`),
    setSuperArmor: (on) => { superArmor = on; },
    heal: () => calls.push('heal'),
    requestMoveX: (vx) => { if (vx !== 0) calls.push('move'); },
    requestJump: () => calls.push('jump'),
  };
  const rt5 = newBehaviorRuntime();
  startBehavior(rt5, 'charge', now);
  tickBehavior(rt5, host, now + 100);           // 蓄力中
  ok('冲锋蓄力期间霸体', superArmor);
  tickBehavior(rt5, host, now + behaviorDuration('charge') + 10); // 结束
  ok('冲锋结束解除霸体', !superArmor);
  ok('冲锋结束进入冷却', (rt5.cooldownUntil.charge ?? 0) > now);

  // 散射行为发射多枚
  calls.length = 0;
  const rt6 = newBehaviorRuntime();
  startBehavior(rt6, 'fanShot', now);
  tickBehavior(rt6, host, now + 50);
  eq('散射发射 5 枚', calls.filter((c) => c === 'projectile').length, 5);

  // 召唤行为
  calls.length = 0;
  const rt7 = newBehaviorRuntime();
  startBehavior(rt7, 'summon', now);
  tickBehavior(rt7, host, now + 50);
  eq('召唤 2 只', calls.filter((c) => c === 'summon').length, 2);

  // 护盾减免
  calls.length = 0;
  const rt8 = newBehaviorRuntime();
  startBehavior(rt8, 'shield', now);
  tickBehavior(rt8, host, now + 50);
  ok('护盾施加减伤', calls.some((c) => c.startsWith('dr:0.7')));
  tickBehavior(rt8, host, now + behaviorDuration('shield') + 10);
  ok('护盾结束移除减伤', calls.some((c) => c === 'dr:0'));

  // 怪物配置是否接入
  const monsters = getConfig.allMonsters() as unknown as Array<{ id: string; behaviors?: string[] }>;
  const configured = monsters.filter((m) => (m.behaviors ?? []).length > 0);
  ok(`配置了行为的怪物 ≥ 8 种（实际 ${configured.length}/${monsters.length}）`, configured.length >= 8);
  const hasCharge = monsters.some((m) => (m.behaviors ?? []).includes('charge'));
  const hasShield = monsters.some((m) => (m.behaviors ?? []).includes('shield'));
  const hasSummon = monsters.some((m) => (m.behaviors ?? []).includes('summon'));
  const hasFan = monsters.some((m) => (m.behaviors ?? []).includes('fanShot'));
  const hasLeap = monsters.some((m) => (m.behaviors ?? []).includes('leap'));
  const hasRetreat = monsters.some((m) => (m.behaviors ?? []).includes('retreat'));
  ok('六种行为都有怪物使用', hasCharge && hasShield && hasSummon && hasFan && hasLeap && hasRetreat);
}

console.log(`\n==========================================`);
if (failCount > 0) {
  console.error(`✗ ${failCount} 项失败 / ${pass} 项通过`);
  process.exit(1);
} else {
  console.log(`✓ 战斗专项测试全部通过（${pass} 项）`);
}
