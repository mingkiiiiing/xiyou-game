/**
 * BT-3.6 战斗场景合成器（无浏览器环境下的视觉联调手段）。
 *
 * 把**真实的游戏数据**渲染成一张 PNG：
 *   环境主题（视差层/地面/天空，来自 art/env 的纯形状函数）
 *   + 玩家 + 多个小怪 + Boss（composeCharacter，与屏幕同源）
 *   + 特效粒子示意（来自 vfx 的 VFX_PRESETS 形状语义）
 *   + HUD 条（血/蓝/技能格/Boss 条）
 *
 * 用途：验证**尺度关系、构图、可读性、配色和谐** —— 这些是纯造型联络表看不出来的。
 * 运行：npm run frame  →  docs/preview/battle-frame.png
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, fillShapes, encodePNG, type Canvas } from './lib/raster';
import { composeCharacter } from '../src/art/compose';
import { getCharacterArt } from '../src/art/registry';
import { scaleShapes, shade, mix } from '../src/art/shapes';
import { ENV_THEMES, envLayerShapes, skyShapes, groundShapes } from '../src/art/env';
import { getConfig } from '../src/data/ConfigLoader';
import { THEME } from '../src/art/theme';
import type { Shape } from '../src/art/types';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1280;
const H = 720;
const GROUND_Y = 620;

/** 把形状列表推到画布（世界坐标 → 像素坐标，带相机偏移） */
function push(shapes: Shape[], into: Shape[], camX: number): void {
  for (const s of shapes) {
    switch (s.kind) {
      case 'rect': into.push({ ...s, x: s.x - camX }); break;
      case 'circle': into.push({ ...s, x: s.x - camX }); break;
      case 'ellipse': into.push({ ...s, x: s.x - camX }); break;
      case 'poly': {
        const pts = s.points.map((v, i) => (i % 2 === 0 ? v - camX : v));
        into.push({ ...s, points: pts });
        break;
      }
    }
  }
}

/** 角色放置：origin 在脚底中心；这里合成后需要平移到世界坐标 */
function placeCharacter(artId: string, state: string, phase: number, worldX: number, facing: 1 | -1, flash = false): Shape[] {
  const art = getCharacterArt(artId);
  if (!art) return [];
  const shapes = composeCharacter(art, { state, phase, facing, flash });
  return shapes.map((s) => {
    switch (s.kind) {
      case 'rect': return { ...s, x: s.x + worldX, y: s.y + GROUND_Y };
      case 'circle': return { ...s, x: s.x + worldX, y: s.y + GROUND_Y };
      case 'ellipse': return { ...s, x: s.x + worldX, y: s.y + GROUND_Y };
      case 'poly': return { ...s, points: s.points.map((v, i) => (i % 2 === 0 ? v + worldX : v + GROUND_Y)) };
    }
  });
}

function drawHudInto(c: Canvas, bossRatio: number, hpRatio: number, mpRatio: number, combo: number): void {
  const g: Shape[] = [];
  // 血条
  g.push({ kind: 'rect', x: 16, y: 40, w: 300, h: 20, color: 0x232c38 });
  g.push({ kind: 'rect', x: 16, y: 40, w: 300 * hpRatio, h: 20, color: THEME.hp });
  g.push({ kind: 'rect', x: 16, y: 40, w: 300, h: 20, color: THEME.border, alpha: 0 });
  // 蓝条
  g.push({ kind: 'rect', x: 16, y: 64, w: 240, h: 9, color: 0x232c38 });
  g.push({ kind: 'rect', x: 16, y: 64, w: 240 * mpRatio, h: 9, color: THEME.mp });
  // 经验条
  g.push({ kind: 'rect', x: 16, y: 77, w: 240, h: 4, color: 0x232c38 });
  g.push({ kind: 'rect', x: 16, y: 77, w: 240 * 0.35, h: 4, color: THEME.gold });
  // 技能格（3 技能 + 闪避）
  for (let i = 0; i < 4; i++) {
    const x = 16 + i * 60, y = 92, s = 52;
    g.push({ kind: 'rect', x, y, w: s, h: s, color: 0x141a20 });
    g.push({ kind: 'rect', x, y, w: s, h: s, color: i === 3 ? 0x6fe3c4 : THEME.accent, alpha: 0 });
    // 边框（用四条细矩形近似）
    g.push({ kind: 'rect', x, y, w: s, h: 2, color: i === 3 ? 0x6fe3c4 : THEME.accent });
    g.push({ kind: 'rect', x, y: y + s - 2, w: s, h: 2, color: i === 3 ? 0x6fe3c4 : THEME.accent });
    g.push({ kind: 'rect', x, y, w: 2, h: s, color: i === 3 ? 0x6fe3c4 : THEME.accent });
    g.push({ kind: 'rect', x: x + s - 2, y, w: 2, h: s, color: i === 3 ? 0x6fe3c4 : THEME.accent });
    // 第 2 格画 CD 遮罩示意
    if (i === 1) g.push({ kind: 'rect', x: x + 2, y: y + s * 0.45, w: s - 4, h: s * 0.55, color: 0x000000, alpha: 0.66 });
  }
  // Boss 血条（顶部）
  const bw = 620, bx = (W - bw) / 2, by = 66;
  g.push({ kind: 'rect', x: bx, y: by, w: bw, h: 18, color: 0x1a1216 });
  g.push({ kind: 'rect', x: bx, y: by, w: bw * bossRatio, h: 18, color: 0xf85149 });
  for (const m of [0.3, 0.6]) g.push({ kind: 'rect', x: bx + bw * m - 1, y: by - 2, w: 2, h: 22, color: THEME.gold });
  // 连击圈
  if (combo > 1) {
    g.push({ kind: 'circle', x: W - 92, y: 96, r: 40, color: 0x000000, alpha: 0.35 });
    g.push({ kind: 'circle', x: W - 92, y: 96, r: 40, color: combo >= 10 ? THEME.gold : THEME.border, alpha: 0.9 });
  }
  fillShapes(c, g, 0, 0);
}

/** 简易 5×7 点阵字（避免为了标签引入字体依赖） */
const FONT: Record<string, number[]> = {
  A:[0x0E,0x11,0x11,0x1F,0x11,0x11,0x11], B:[0x1E,0x11,0x11,0x1E,0x11,0x11,0x1E],
  C:[0x0E,0x11,0x10,0x10,0x10,0x11,0x0E], D:[0x1E,0x11,0x11,0x11,0x11,0x11,0x1E],
  E:[0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F], F:[0x1F,0x10,0x10,0x1E,0x10,0x10,0x10],
  G:[0x0E,0x11,0x10,0x17,0x11,0x11,0x0F], H:[0x11,0x11,0x11,0x1F,0x11,0x11,0x11],
  I:[0x0E,0x04,0x04,0x04,0x04,0x04,0x0E], K:[0x11,0x12,0x14,0x18,0x14,0x12,0x11],
  L:[0x10,0x10,0x10,0x10,0x10,0x10,0x1F], M:[0x11,0x1B,0x15,0x11,0x11,0x11,0x11],
  N:[0x11,0x19,0x15,0x13,0x11,0x11,0x11], O:[0x0E,0x11,0x11,0x11,0x11,0x11,0x0E],
  P:[0x1E,0x11,0x11,0x1E,0x10,0x10,0x10], R:[0x1E,0x11,0x11,0x1E,0x14,0x12,0x11],
  S:[0x0F,0x10,0x10,0x0E,0x01,0x01,0x1E], T:[0x1F,0x04,0x04,0x04,0x04,0x04,0x04],
  U:[0x11,0x11,0x11,0x11,0x11,0x11,0x0E], V:[0x11,0x11,0x11,0x11,0x11,0x0A,0x04],
  W:[0x11,0x11,0x11,0x15,0x15,0x1B,0x11], X:[0x11,0x11,0x0A,0x04,0x0A,0x11,0x11],
  Y:[0x11,0x11,0x0A,0x04,0x04,0x04,0x04], Z:[0x1F,0x01,0x02,0x04,0x08,0x10,0x1F],
  '0':[0x0E,0x11,0x13,0x15,0x19,0x11,0x0E], '1':[0x04,0x0C,0x04,0x04,0x04,0x04,0x0E],
  '2':[0x0E,0x11,0x01,0x02,0x04,0x08,0x1F], '3':[0x1F,0x02,0x04,0x02,0x01,0x11,0x0E],
  '-':[0x00,0x00,0x00,0x1F,0x00,0x00,0x00], ' ':[0,0,0,0,0,0,0], '/':[0x01,0x02,0x02,0x04,0x08,0x08,0x10],
};

/** 用点阵字体写一行字（仅 ASCII 大写/数字，够画标题） */
function drawLabel(c: Canvas, text: string, x: number, y: number, px: number, color: number): void {
  let cx = x;
  for (const rawCh of text.toUpperCase()) {
    const rows = FONT[rawCh];
    if (rows) {
      for (let j = 0; j < 7; j++) {
        for (let i = 0; i < 5; i++) {
          if ((rows[j] >> (4 - i)) & 1) {
            fillShapes(c, [{ kind: 'rect', x: cx + i * px, y: y + j * px, w: px, h: px, color }], 0, 0);
          }
        }
      }
    }
    cx += 6 * px;
  }
}

console.log('\n========== BT-3.6 战斗场景合成器 ==========\n');

const theme = ENV_THEMES[0]; // 花果山
const camX = 520;            // 相机偏移，让玩家在画面偏左

const all: Shape[] = [];

// —— 1. 天空 + 地面 ——
push(skyShapes(theme, W + camX, GROUND_Y), all, 0);
push(groundShapes(theme, W + camX, GROUND_Y, H), all, 0);

// —— 2. 视差层（按 parallax 计算偏移）——
for (const layer of theme.layers) {
  const layerShapes = envLayerShapes(layer, -200, W + camX + 400);
  push(layerShapes, all, camX * (1 - layer.parallax));
}

// —— 3. 角色：玩家 + 小怪 + Boss（屏幕 x = worldX - camX，须落在 [80, 1200] 内）——
const at = (screenX: number) => camX + screenX;
// 玩家（灵猴，攻击中）
push(placeCharacter('linghou', 'attack1', 0.5, at(240), 1), all, camX);
// 小怪
push(placeCharacter('monkey_soldier', 'run', 0.3, at(400), -1), all, camX);
push(placeCharacter('monkey_soldier', 'idle', 0.7, at(690), -1), all, camX);
push(placeCharacter('bat_demon', 'idle', 0.4, at(560), -1), all, camX);
push(placeCharacter('stone_guard', 'attack1', 0.6, at(880), -1), all, camX);
// Boss（混世魔王）
push(placeCharacter('demon_king', 'skill', 0.35, at(1090), -1), all, camX);

// —— 4. 特效粒子示意（描边爆发 + 斩击弧）——
const fx: Shape[] = [];
// 玩家棍端斩击弧
const arcSx = 240 + 70, arcSy = GROUND_Y - 56;
for (let i = 0; i < 14; i++) {
  const a = -0.9 + (i / 13) * 1.7;
  const r = 52 + (i % 3) * 12;
  fx.push({ kind: 'circle', x: arcSx + Math.cos(a) * r, y: arcSy + Math.sin(a) * r * 0.7, r: 3.2, color: i % 2 ? 0xffd257 : 0xfff2b8, alpha: 0.85 });
}
// 石甲卫受击火星
for (let i = 0; i < 10; i++) {
  fx.push({ kind: 'circle', x: 880 + (Math.random() - 0.5) * 70, y: GROUND_Y - 50 - Math.random() * 40, r: 2.4 + Math.random() * 2, color: Math.random() > 0.5 ? 0xff8a3d : 0xffd257, alpha: 0.9 });
}
// Boss 蓄力地面预警圈
for (let i = 0; i < 20; i++) {
  const a = (Math.PI * 2 * i) / 20;
  fx.push({ kind: 'circle', x: 1090 + Math.cos(a) * 130, y: GROUND_Y - 6 + Math.sin(a) * 18, r: 3, color: 0xff4d4d, alpha: 0.8 });
}
push(fx, all, 0);

// —— 5. 渲染到画布 ——
const SS = 1;
const canvas = createCanvas(W * SS, H * SS, 0x0b0f14);
fillShapes(canvas, all, 0, 0);

// —— 6. HUD ——
drawHudInto(canvas, 0.72, 0.62, 0.8, 14);
drawLabel(canvas, 'BT-3 BATTLE FRAME', 16, 12, 2, THEME.gold);
drawLabel(canvas, 'LINGHOU VS DEMON KING', W - 300, 12, 2, THEME.textDim);

mkdirSync(resolve(root, 'docs/preview'), { recursive: true });
const out = resolve(root, 'docs/preview/battle-frame.png');
writeFileSync(out, encodePNG(canvas));

// —— 统计 ——
const byKind: Record<string, number> = {};
for (const s of all) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
console.log(`主题           ${theme.name}（${theme.layers.length} 视差层）`);
console.log(`相机偏移       ${camX}`);
console.log(`绘制实体       玩家 1 + 小怪 4 + Boss 1`);
console.log(`形状总数       ${all.length}（rect ${byKind.rect ?? 0} / circle ${byKind.circle ?? 0} / ellipse ${byKind.ellipse ?? 0} / poly ${byKind.poly ?? 0}）`);
console.log(`怪物造型覆盖   ${getConfig.allMonsters().length} 种（库里可用）`);
console.log(`\n输出           ${out}`);
console.log('尺寸           ' + W + ' x ' + H);
