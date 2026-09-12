/**
 * BT-2 美术覆盖率检查（headless）。
 * 作用：把"所有可玩视觉体都有造型"变成机器可验证的指标，避免新增怪物悄悄回退成灰盒色块。
 * 运行：npm run art-coverage
 */
import { getConfig } from '../src/data/ConfigLoader';
import { getCharacterArt } from '../src/art/registry';
import { composeCharacter } from '../src/art/compose';
import type { CharacterArtDef } from '../src/art/types';

let failed = false;
const fail = (m: string) => { console.error('  ✗ ' + m); failed = true; };
const ok = (m: string) => console.log('  ✓ ' + m);

/** 每个造型至少要实现的状态 */
const REQUIRED_STATES = ['idle', 'run', 'attack1', 'hurt', 'dead'];

console.log('\n========== 美术覆盖率检查（BT-2） ==========\n');

const monsters = getConfig.allMonsters();

// —— 1. 覆盖率：每个怪物 id 都要有造型 ——
console.log('■ 造型覆盖率');
const missing: string[] = [];
for (const m of monsters) {
  const art = getCharacterArt(m.id);
  if (!art) missing.push(`${m.id}(${m.name})`);
}
if (missing.length) {
  fail(`以下怪物缺少造型（会回退为色块）：${missing.join('、')}`);
} else {
  ok(`全部 ${monsters.length} 种怪物都有造型`);
}

// 玩家造型
if (!getCharacterArt('linghou')) fail('玩家造型 linghou 缺失');
else ok('玩家造型 linghou 存在');

// —— 2. 契约合规：状态齐全 + 纯函数 + 非空 ——
console.log('\n■ 契约合规性');
const allIds = [...monsters.map((m) => m.id), 'linghou'];
let checked = 0;
const problems: string[] = [];

for (const id of allIds) {
  const art = getCharacterArt(id);
  if (!art) continue;
  checked++;

  // 必要状态有 clip 定义
  for (const st of REQUIRED_STATES) {
    if (!art.clips[st]) problems.push(`${id}: 缺少状态 ${st} 的 clip 定义`);
  }

  // draw 是纯函数：同输入同输出
  let samplesEmpty = 0;
  for (const st of [...REQUIRED_STATES, 'jump', 'fall']) {
    for (const ph of [0, 0.5, 1]) {
      let a: string, b: string;
      try {
        a = JSON.stringify(composeCharacter(art, { state: st, phase: ph, facing: 1, flash: false }));
        b = JSON.stringify(composeCharacter(art, { state: st, phase: ph, facing: 1, flash: false }));
      } catch (e) {
        problems.push(`${id} 在 ${st}/${ph} 抛错: ${(e as Error).message}`);
        continue;
      }
      if (a !== b) problems.push(`${id} 的 draw 不是纯函数（${st}/${ph} 两次结果不同）`);
      if (a === '[]') samplesEmpty++;
    }
  }
  if (samplesEmpty > 0) problems.push(`${id}: 有 ${samplesEmpty} 个状态/相位输出为空形状列表`);

  // 形状数量合理（太少说明过于敷衍，太多可能性能问题）
  const sample = art.draw('idle', 0.5);
  if (sample.length < 6) problems.push(`${id}: idle 仅 ${sample.length} 个形状，过于简单`);
  if (sample.length > 80) problems.push(`${id}: idle 有 ${sample.length} 个形状，可能影响性能`);
}

if (problems.length) {
  for (const p of problems.slice(0, 20)) fail(p);
  if (problems.length > 20) fail(`...还有 ${problems.length - 20} 个问题`);
} else {
  ok(`${checked} 个造型全部通过：状态齐全、draw 为纯函数、输出非空、形状数量合理`);
}

// —— 3. 剪影独特性：不同角色不应长得一样 ——
console.log('\n■ 剪影独特性');
const signatures = new Map<string, string>();
const dupes: string[] = [];
for (const id of allIds) {
  const art = getCharacterArt(id);
  if (!art) continue;
  // 用 idle 状态的形状总数 + 各图元计数作为粗略签名
  const shapes = art.draw('idle', 0.5);
  const counts = { rect: 0, circle: 0, ellipse: 0, poly: 0 };
  let area = 0;
  for (const s of shapes) {
    counts[s.kind]++;
    if (s.kind === 'rect') area += s.w * s.h;
    else if (s.kind === 'circle') area += Math.PI * s.r * s.r;
    else if (s.kind === 'ellipse') area += Math.PI * s.rx * s.ry;
    else if (s.kind === 'poly') area += s.points.length;
  }
  const sig = `${counts.rect}-${counts.circle}-${counts.ellipse}-${counts.poly}-${Math.round(area / 100)}`;
  const prev = signatures.get(sig);
  if (prev) dupes.push(`${id} 与 ${prev} 剪影特征相同(${sig})`);
  else signatures.set(sig, id);
}
if (dupes.length) fail(`剪影重复：${dupes.join('；')}`);
else ok(`${signatures.size} 个造型剪影各不相同`);

console.log('\n==========================================');
if (failed) {
  console.log('✗ 美术覆盖率检查未通过');
  process.exit(1);
} else {
  console.log('✓ 美术覆盖率检查全部通过');
}
