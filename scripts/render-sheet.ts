/**
 * AT-2.3 美术联络表（`npm run sheet`）→ docs/preview/art-sheet.png
 *
 * 纯 Node + scripts/lib/raster.ts 软件光栅化，**不使用 Pixi / 浏览器**。
 * 但几何仍与屏幕同源：角色取 art/registry + art/compose，环境取 art/env 的纯形状生成，
 * UI 取 art/ui 的纯形状生成（这些模块只导出 Shape[] 数据；本脚本不构造任何 Graphics/Container）。
 *
 * 分区：
 *   a) 角色 × 状态矩阵（每角色一行，列 = idle/run/jump/fall/attack1/hurt/dead，3 倍放大）
 *   b) 环境主题分区（每主题一条带视差的近似示意）
 *   c) UI 组件分区（面板 / 按钮 / 血条 / 装备格）
 *
 * 运行：npx tsx scripts/render-sheet.ts（或 npm run sheet）
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, fillShapes, encodePNG, type Canvas } from './lib/raster';
import type { Shape } from '../src/art/types';
import { ALL_CHARACTER_ART } from '../src/art/registry';
import { composeCharacter } from '../src/art/compose';
import { scaleShapes } from '../src/art/shapes';
import { ENV_THEMES, envLayerShapes, skyShapes, groundShapes } from '../src/art/env';
import { panelShapes, buttonShapes, barShapes, slotShapes } from '../src/art/ui';
import { THEME } from '../src/art/theme';
import { QUALITY_COLOR } from '../src/item/data';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'docs', 'preview', 'art-sheet.png');

// ───────────────────────── 5x7 像素字 ─────────────────────────

const G: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '..##.', '..##.'],
  ',': ['.....', '.....', '.....', '.....', '..##.', '..##.', '.#...'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  ':': ['.....', '..##.', '..##.', '.....', '..##.', '..##.', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '(': ['..#..', '.#...', '#....', '#....', '#....', '.#...', '..#..'],
  ')': ['..#..', '...#.', '....#', '....#', '....#', '...#.', '..#..'],
  '[': ['..##.', '..#..', '..#..', '..#..', '..#..', '..#..', '..##.'],
  ']': ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.##..'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '%': ['##..#', '##.#.', '..#..', '.#...', '#....', '.#.##', '#..##'],
};

function textWidth(s: string, scale: number): number {
  return Math.max(0, s.length * 6 * scale - scale);
}

function textShapes(s: string, x: number, y: number, scale: number, color: number, alpha = 1): Shape[] {
  const out: Shape[] = [];
  let cx = x;
  for (const raw of s.toUpperCase()) {
    const ch = G[raw] ? raw : (raw === ' ' ? ' ' : '?');
    const glyph = G[ch] ?? G['?'];
    for (let r = 0; r < 7; r++) {
      const row = glyph[r];
      for (let c = 0; c < 5; c++) {
        if (row[c] === '#') out.push({ kind: 'rect', x: cx + c * scale, y: y + r * scale, w: scale, h: scale, color, alpha });
      }
    }
    cx += 6 * scale;
  }
  return out;
}

// ───────────────────────── 形状工具 ─────────────────────────

function rect(x: number, y: number, w: number, h: number, color: number, alpha = 1): Shape {
  return { kind: 'rect', x, y, w, h, color, alpha };
}

/** 单个形状便捷绘制（raster.fillShapes 接受 Shape[]，此处包一层） */
function fillShape(c: Canvas, s: Shape, ox: number, oy: number): void {
  fillShapes(c, [s], ox, oy);
}

/** 仅缩放 y（把 720 高的环境示意压进条带高度） */
function scaleYOnly(shapes: readonly Shape[], ky: number): Shape[] {
  return shapes.map((s) => {
    switch (s.kind) {
      case 'rect': return { ...s, y: s.y * ky, h: s.h * ky };
      case 'circle': return { ...s, y: s.y * ky, r: s.r * ky };
      case 'ellipse': return { ...s, y: s.y * ky, ry: s.ry * ky };
      case 'poly': {
        const p = s.points.slice();
        for (let i = 1; i < p.length; i += 2) p[i] *= ky;
        return { ...s, points: p };
      }
    }
  });
}

// ───────────────────────── 版式常量 ─────────────────────────

const STATES = ['idle', 'run', 'jump', 'fall', 'attack1', 'hurt', 'dead'] as const;
const M = 28;
const W = 1560;
const CONTENT_W = W - M * 2;
const LABEL_W = 150;
const CELL_W = 190;
const CELL_H = 240;
const HEADER_H = 32;
const CHAR_SCALE = 3;
const STRIP_H = 210;
const STRIP_GAP = 16;
const PANEL_H = 300;

function main(): void {
  const chars = ALL_CHARACTER_ART;
  const charRows = Math.max(1, chars.length);
  const gridW = LABEL_W + STATES.length * CELL_W;
  const gridX = M + Math.max(0, (CONTENT_W - gridW) / 2);

  // —— 纵向排版 ——
  const titleY = 18;
  const gridTop = titleY + 78;
  const gridBottom = gridTop + HEADER_H + charRows * CELL_H;
  const envTitleY = gridBottom + 26;
  const envTop = envTitleY + 28;
  const envBottom = envTop + ENV_THEMES.length * (STRIP_H + STRIP_GAP);
  const uiTitleY = envBottom + 20;
  const uiTop = uiTitleY + 28;
  const H = uiTop + PANEL_H + M + 22;

  const c = createCanvas(W, H, 0x0d1117);

  // 背景微网格（避免大片死黑，也让空白格不显突兀）
  const gridLines: Shape[] = [];
  for (let x = 0; x < W; x += 32) gridLines.push(rect(x, 0, 1, H, 0x161c24, 0.55));
  for (let y = 0; y < H; y += 32) gridLines.push(rect(0, y, W, 1, 0x161c24, 0.55));
  fillShapes(c, gridLines, 0, 0);

  // —— 标题 ——
  fillShapes(c, textShapes('XIYOU  ART  SHEET  -  BT-2  VISUAL  REVIEW', M, titleY, 3, THEME.gold), 0, 0);
  fillShapes(c, textShapes(
    `CHARS ${chars.length}   STATES ${STATES.length}   THEMES ${ENV_THEMES.length}   UI ${12}`,
    M, titleY + 30, 2, THEME.textDim), 0, 0);
  fillShape(c, rect(M, titleY + 44, CONTENT_W, 2, THEME.border, 0.8), 0, 0);

  // —— a) 角色 × 状态矩阵 ——
  let implemented = 0;
  const totalCells = charRows * STATES.length;

  fillShapes(c, textShapes('A.  CHARACTER  X  STATE  MATRIX  (3X)', M, gridTop - 22, 2, THEME.gold), 0, 0);

  // 列头
  STATES.forEach((st, col) => {
    const cx = gridX + LABEL_W + col * CELL_W + CELL_W / 2;
    const tw = textWidth(st, 2);
    fillShapes(c, textShapes(st, cx - tw / 2, gridTop + 8, 2, THEME.textDim), 0, 0);
  });

  if (chars.length === 0) {
    // 优雅降级：不留空白栏
    const ph = 'NO CHARACTER ART IN REGISTRY - WAITING FOR AT-2.1';
    fillShape(c, rect(gridX, gridTop + HEADER_H, gridW, CELL_H, THEME.panel, 0.5), 0, 0);
    fillShape(c, rect(gridX, gridTop + HEADER_H, gridW, CELL_H, THEME.border, 0.06), 0, 0);
    fillShapes(c, textShapes(ph, gridX + (gridW - textWidth(ph, 3)) / 2, gridTop + HEADER_H + CELL_H / 2 - 10, 3, THEME.textDim), 0, 0);
  }

  chars.forEach((def, row) => {
    const rowTop = gridTop + HEADER_H + row * CELL_H;
    // 行标签
    fillShapes(c, textShapes(def.id.slice(0, 12), gridX + 8, rowTop + CELL_H / 2 - 14, 2, THEME.text), 0, 0);
    fillShapes(c, textShapes(`${def.width}X${def.height}`, gridX + 8, rowTop + CELL_H / 2 + 4, 1.6, THEME.textDim), 0, 0);

    STATES.forEach((st, col) => {
      const cx0 = gridX + LABEL_W + col * CELL_W;
      // 格底 + 细边框（即便该状态未实现也不是纯空白）
      fillShape(c, rect(cx0 + 3, rowTop + 3, CELL_W - 6, CELL_H - 6, THEME.panelAlt, 0.28), 0, 0);
      fillShapes(c, [
        rect(cx0 + 3, rowTop + 3, CELL_W - 6, 1, THEME.border, 0.7),
        rect(cx0 + 3, rowTop + CELL_H - 4, CELL_W - 6, 1, THEME.border, 0.7),
        rect(cx0 + 3, rowTop + 3, 1, CELL_H - 6, THEME.border, 0.7),
        rect(cx0 + CELL_W - 4, rowTop + 3, 1, CELL_H - 6, THEME.border, 0.7),
      ], 0, 0);

      if (!def.clips[st]) {
        fillShapes(c, textShapes('N/A', cx0 + CELL_W / 2 - textWidth('N/A', 2) / 2, rowTop + CELL_H / 2 - 7, 2, THEME.textDim, 0.7), 0, 0);
        return;
      }
      implemented++;
      const shapes = composeCharacter(def, { state: st, phase: 0.5, facing: 1, flash: false });
      const scaled = scaleShapes(shapes, CHAR_SCALE);
      const ox = cx0 + CELL_W / 2;
      const oy = rowTop + CELL_H - 30;
      fillShapes(c, scaled, ox, oy);
    });
  });

  // —— b) 环境主题分区 ——
  fillShapes(c, textShapes('B.  ENVIRONMENT  THEMES  (PARALLAX  PREVIEW)', M, envTitleY, 2, THEME.gold), 0, 0);
  ENV_THEMES.forEach((theme, i) => {
    const sy = envTop + i * (STRIP_H + STRIP_GAP);
    const sx = M;
    const sw = CONTENT_W;
    const ky = STRIP_H / 720;
    // 天空
    fillShapes(c, skyShapes(theme, sw, 620), sx, sy);
    // 各层（与屏幕同源的纯形状生成，仅 y 压缩到条带）
    for (const layer of theme.layers) {
      const shapes = envLayerShapes(layer, 0, sw);
      fillShapes(c, scaleYOnly(shapes, ky), sx, sy);
    }
    // 地面
    fillShapes(c, scaleYOnly(groundShapes(theme, sw, 620, 720), ky), sx, sy);
    // 边框
    fillShapes(c, [
      rect(sx, sy, sw, 1, THEME.border, 0.9),
      rect(sx, sy + STRIP_H - 1, sw, 1, THEME.border, 0.9),
      rect(sx, sy, 1, STRIP_H, THEME.border, 0.9),
      rect(sx + sw - 1, sy, 1, STRIP_H, THEME.border, 0.9),
    ], 0, 0);
    // 主题信息条
    const info = `${theme.id.toUpperCase()}  LAYERS ${theme.layers.length}  PARALLAX ${theme.layers.map((l) => l.parallax.toFixed(2)).join('/')}  AMBIENT ${theme.ambient.toUpperCase()}`;
    fillShape(c, rect(sx + 6, sy + 6, textWidth(info, 1.6) + 12, 20, 0x000000, 0.62), 0, 0);
    fillShapes(c, textShapes(info, sx + 12, sy + 12, 1.6, THEME.gold), 0, 0);
  });

  // —— c) UI 组件分区 ——
  fillShapes(c, textShapes('C.  UI  COMPONENTS  (GUOFENG  SKIN)', M, uiTitleY, 2, THEME.gold), 0, 0);

  // 面板
  fillShapes(c, panelShapes({ x: M, y: uiTop, w: 420, h: PANEL_H - 20, raised: true }), 0, 0);
  fillShapes(c, textShapes('PANEL', M + 20, uiTop + 16, 2, THEME.gold), 0, 0);
  fillShapes(c, textShapes('GRADIENT + DOUBLE BORDER', M + 20, uiTop + 38, 1.6, THEME.textDim), 0, 0);
  fillShapes(c, textShapes('+ GOLD CORNERS', M + 20, uiTop + 54, 1.6, THEME.textDim), 0, 0);
  fillShape(c, rect(M + 20, uiTop + 74, 380, 1, THEME.border, 0.7), 0, 0);

  // 按钮（三种变体）
  const btns: { label: string; variant: 'primary' | 'secondary' | 'danger' }[] = [
    { label: 'PRIMARY', variant: 'primary' },
    { label: 'SECONDARY', variant: 'secondary' },
    { label: 'DANGER', variant: 'danger' },
  ];
  btns.forEach((b, i) => {
    const bx = M + 20;
    const by = uiTop + 90 + i * 54;
    fillShapes(c, buttonShapes({ x: bx, y: by, w: 180, h: 42, variant: b.variant }), 0, 0);
    fillShapes(c, textShapes(b.label, bx + 16, by + 14, 2, THEME.text), 0, 0);
  });
  fillShapes(c, textShapes('BUTTONS', M + 220, uiTop + 100, 1.6, THEME.textDim), 0, 0);
  fillShapes(c, textShapes('3 VARIANTS', M + 220, uiTop + 118, 1.6, THEME.textDim), 0, 0);
  fillShapes(c, textShapes('+ 2-PX FRAME', M + 220, uiTop + 136, 1.6, THEME.textDim), 0, 0);

  // 血条 / 蓝条 / 蓄力
  const bx2 = M + 500;
  fillShapes(c, textShapes('BARS', bx2, uiTop + 8, 2, THEME.gold), 0, 0);
  const bars: { ratio: number; fg: number; label: string }[] = [
    { ratio: 0.72, fg: THEME.hp, label: 'HP 72%' },
    { ratio: 0.45, fg: THEME.mp, label: 'MP 45%' },
    { ratio: 0.9, fg: THEME.gold, label: 'CHARGE 90%' },
  ];
  bars.forEach((b, i) => {
    const by = uiTop + 34 + i * 40;
    fillShapes(c, barShapes({ x: bx2, y: by, w: 300, h: 20, ratio: b.ratio, bg: 0x30363d, fg: b.fg, ticks: 5 }), 0, 0);
    fillShapes(c, textShapes(b.label, bx2 + 312, by + 6, 1.6, THEME.text), 0, 0);
  });

  // 装备格（品质色描边）
  const qualities: { q: keyof typeof QUALITY_COLOR; name: string }[] = [
    { q: 'white', name: 'WHT' }, { q: 'green', name: 'GRN' }, { q: 'blue', name: 'BLU' },
    { q: 'purple', name: 'PUR' }, { q: 'orange', name: 'ORG' }, { q: 'red', name: 'RED' },
  ];
  fillShapes(c, textShapes('SLOTS / QUALITY BORDER', bx2, uiTop + 170, 2, THEME.gold), 0, 0);
  qualities.forEach((it, i) => {
    const sx = bx2 + i * 68;
    const sy = uiTop + 196;
    fillShapes(c, slotShapes({ x: sx, y: sy, size: 56, qualityColor: QUALITY_COLOR[it.q] }), 0, 0);
    fillShapes(c, textShapes(it.name, sx + 8, sy + 66, 1.4, THEME.textDim), 0, 0);
  });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, encodePNG(c));

  // —— stdout 统计 ——
  console.log('art-sheet 生成成功 → %s', OUT);
  console.log('  尺寸            %d x %d', W, H);
  console.log('  角色数          %d', chars.length);
  console.log('  状态数          %d  (%s)', STATES.length, STATES.join(', '));
  console.log('  角色×状态格      %d 格，已实现 %d，缺省 %d', totalCells, implemented, totalCells - implemented);
  console.log('  环境主题数      %d  (%s)', ENV_THEMES.length, ENV_THEMES.map((t) => `${t.id}/${t.layers.length}L`).join(', '));
  console.log('  UI 组件数       13  (面板1 按钮3 血条3 装备格6)');
  if (chars.length === 0) console.log('  [降级] registry 无角色，已输出占位与其它分区。');
}

main();
