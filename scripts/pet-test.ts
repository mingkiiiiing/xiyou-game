/**
 * BT-6.1 宠物系统专项测试（headless）：配置表、查询、攻击决策、增益应用。
 * 约束：不 import 任何 pixi / DOM 模块（PetEntity 为 pixi 实体，不在本测试范围）。
 * 运行：npx tsx scripts/pet-test.ts
 * 风格对齐 scripts/content-test.ts：通过输出 ✓，失败输出 ✗ 并 exit 1。
 */
import {
  PET_TABLE,
  getPet,
  petAttackStep,
  petBuffStats,
  petFollowPos,
  PET_ATTACK_CD_MS,
  PET_FOLLOW_DIST,
  PET_HOVER_HEIGHT,
} from '../src/pet/PetSystem';
import type { PetDef } from '../src/pet/PetSystem';
import petsJson from '../src/config/pets.json';
import type { BattleStats } from '../src/shared/types';

let pass = 0, failCount = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log(`  ✓ ${name}`); }
  else { failCount++; console.error(`  ✗ ${name}: 期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}`); }
};
const ok = (name: string, cond: boolean) => eq(name, cond, true);
const section = (s: string) => console.log(`\n■ ${s}`);

// ───────── 1. 配置表 ─────────
section('宠物配置表（config/pets.json → PET_TABLE）');
{
  eq('3 只宠物', PET_TABLE.length, 3);
  eq('宠物 id 顺序', PET_TABLE.map((p) => p.id), ['pet_gugu', 'pet_fox', 'pet_rabbit']);
  eq('宠物名称', PET_TABLE.map((p) => p.name), ['咕咕鸟', '火狐狸', '玉兔']);
  eq('价格（金币）', PET_TABLE.map((p) => p.price), [150, 200, 180]);
  eq('类型（1 攻击 + 2 增益）', PET_TABLE.map((p) => p.kind), ['attacker', 'buffer', 'buffer']);

  const gugu = getPet('pet_gugu');
  ok('咕咕鸟攻击间隔 = 2200ms', gugu.attackCdMs === 2200);
  ok('咕咕鸟伤害倍率 = 0.5', gugu.damageMul === 0.5);
  eq('火狐狸增益 = atk +8%', getPet('pet_fox').buff, { stat: 'atk', pct: 8 });
  eq('玉兔增益 = maxHp +10%', getPet('pet_rabbit').buff, { stat: 'maxHp', pct: 10 });
  ok('所有宠物都有主题色与描述', PET_TABLE.every((p) => typeof p.color === 'number' && p.blurb.length > 0));
}

// ───────── 2. getPet ─────────
section('getPet 查询');
{
  eq('按 id 取咕咕鸟', getPet('pet_gugu').price, 150);
  let threw = false;
  try { getPet('pet_unknown'); } catch { threw = true; }
  ok('未知 id 抛错', threw);
}

// ───────── 3. petBuffStats 增益 ─────────
section('petBuffStats 增益应用');
{
  const base: BattleStats = {
    hp: 100, maxHp: 200, mp: 30, maxMp: 50,
    atk: 100, def: 10, critRate: 8, critDmg: 150, moveSpeed: 320,
  };
  const snapshot = JSON.stringify(base);

  const withFox = petBuffStats(base, getPet('pet_fox'));
  eq('火狐狸：atk 100 → 108', withFox.atk, 108);
  eq('火狐狸：其余属性不变', [withFox.maxHp, withFox.def, withFox.moveSpeed], [200, 10, 320]);

  const withRabbit = petBuffStats(base, getPet('pet_rabbit'));
  eq('玉兔：maxHp 200 → 220', withRabbit.maxHp, 220);
  eq('玉兔：atk 不变', withRabbit.atk, 100);

  const withGugu = petBuffStats(base, getPet('pet_gugu'));
  eq('攻击宠：属性原样', [withGugu.atk, withGugu.maxHp], [100, 200]);

  const withNone = petBuffStats(base, null);
  eq('无宠物：属性原样', [withNone.atk, withNone.maxHp], [100, 200]);

  ok('纯函数：不修改入参 base', JSON.stringify(base) === snapshot);
  ok('返回克隆（非同一引用）', withFox !== base && withNone !== base);

  // 与其它加成叠加的鲁棒性：小数值四舍五入
  eq('非整倍率四舍五入（atk 37 → 40）', petBuffStats({ ...base, atk: 37 }, getPet('pet_fox')).atk, 40);
}

// ───────── 4. petAttackStep 攻击决策 ─────────
section('petAttackStep 攻击决策');
{
  const t1 = { x: 300, y: 520, alive: true };

  // 冷却未到
  let r = petAttackStep(5000, 1000, 100, 620, [t1], 0.5);
  eq('cd 未到：不触发', r.fired, false);
  eq('cd 未到：cdUntil 原样返回', r.cdUntil, 5000);
  ok('cd 未到：无瞄准点', r.x === undefined && r.y === undefined);

  // 冷却到 + 有活目标
  r = petAttackStep(0, 1000, 100, 620, [t1], 0.5);
  eq('到点 + 目标：触发', r.fired, true);
  eq('瞄准点 = 目标坐标', [r.x, r.y], [300, 520]);
  eq(`新 cd = now + ${PET_ATTACK_CD_MS}ms（与 pet_gugu.attackCdMs 一致）`, r.cdUntil, 1000 + PET_ATTACK_CD_MS);
  eq('CD 常量 = 2200', PET_ATTACK_CD_MS, 2200);

  // 取最近者（2D 距离）
  r = petAttackStep(0, 1000, 100, 620, [
    { x: 900, y: 620, alive: true },
    { x: 260, y: 620, alive: true },
    { x: 1500, y: 620, alive: true },
  ], 0.5);
  eq('多个目标取最近', [r.x, r.y], [260, 620]);

  // 死亡目标被跳过
  r = petAttackStep(0, 1000, 100, 620, [
    { x: 120, y: 620, alive: false },
    { x: 800, y: 620, alive: true },
  ], 0.5);
  eq('死亡目标被跳过', [r.x, r.y], [800, 620]);

  // 无活目标：不触发、冷却不重置
  r = petAttackStep(3000, 1000, 100, 620, [
    { x: 300, y: 520, alive: false },
  ], 0.5);
  eq('无活目标：不触发', r.fired, false);
  eq('无活目标：冷却不重置（保持到期，见敌即射）', r.cdUntil, 3000);
  r = petAttackStep(3000, 1000, 100, 620, [], 0.5);
  eq('空目标列表：不触发', r.fired, false);

  // 纯函数：不改入参
  const targets = [{ x: 300, y: 520, alive: true }];
  petAttackStep(0, 1000, 100, 620, targets, 0.5);
  eq('纯函数：不修改 targets 入参', targets, [{ x: 300, y: 520, alive: true }]);
}

// ───────── 5. 跟随位 ─────────
section('跟随位（petFollowPos）');
{
  eq('朝右（facing=1）：主人身后 46px', petFollowPos(500, 620, 1), { x: 500 - PET_FOLLOW_DIST, y: 620 - PET_HOVER_HEIGHT });
  eq('朝左（facing=-1）：身后换边', petFollowPos(500, 620, -1), { x: 500 + 46, y: 590 });
  eq('悬浮高度 30px', PET_HOVER_HEIGHT, 30);
  eq('跟随距离 46px', PET_FOLLOW_DIST, 46);
}

// ───────── 6. 配置文件与 PET_TABLE 一致性 ─────────
section('config/pets.json 与 PET_TABLE 一致');
{
  const raws = (petsJson as unknown as { pets: (Omit<PetDef, 'color'> & { color: string })[] }).pets;
  eq('文件条目数一致', raws.length, PET_TABLE.length);
  eq('id 一致', raws.map((p) => p.id), PET_TABLE.map((p) => p.id));
  eq('价格一致', raws.map((p) => p.price), PET_TABLE.map((p) => p.price));
  eq('类型一致', raws.map((p) => p.kind), PET_TABLE.map((p) => p.kind));
  ok('主题色 hex 合法且转换正确', raws.every((p, i) => {
    const n = parseInt(p.color.replace('#', ''), 16);
    return Number.isFinite(n) && n === PET_TABLE[i].color;
  }));
}

console.log(`\n==========================================`);
if (failCount > 0) {
  console.error(`✗ ${failCount} 项失败 / ${pass} 项通过`);
  process.exit(1);
} else {
  console.log(`✓ 宠物系统测试全部通过（${pass} 项）`);
}
