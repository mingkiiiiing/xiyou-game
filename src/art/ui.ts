/**
 * AT-2.2 统一 UI 绘制组件（国风皮肤）。
 *
 * 目标：替换散落在各场景里的裸 Graphics 写法，统一视觉语言。
 * 设计：与角色/环境一致走"美术即数据"——每个组件先由纯函数产出 Shape[]，
 * 再由 drawShapes（Pixi）或 raster（PNG 审查）消费，屏幕与截图完全同源。
 *
 * 国风要素：渐变底 + 双线描边 + 四角装饰（金色回纹角），装备格用品质色描边。
 */
import { Graphics, Text } from 'pixi.js';
import type { Shape, ThemeTokens } from './types';
import { THEME } from './theme';
import { drawShapes } from './pixiRender';
import { hex, mix, shade } from './shapes';

// ───────────────────────── 基础几何 ─────────────────────────

/** 圆角矩形 → 多边形（契约只有 4 种图元，圆角用折线近似） */
export function roundRectPoints(x: number, y: number, w: number, h: number, r: number): number[] {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  const pts: number[] = [];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    const seg = 5;
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((a1 - a0) * i) / seg;
      pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
  };
  arc(x + w - rr, y + rr, -Math.PI / 2, 0);
  arc(x + w - rr, y + h - rr, 0, Math.PI / 2);
  arc(x + rr, y + h - rr, Math.PI / 2, Math.PI);
  arc(x + rr, y + rr, Math.PI, Math.PI * 1.5);
  return pts;
}

function roundRect(x: number, y: number, w: number, h: number, r: number, color: number, alpha = 1): Shape {
  return { kind: 'poly', points: roundRectPoints(x, y, w, h, r), color, alpha };
}

/** 垂直渐变填充（色带近似） */
function vGradient(x: number, y: number, w: number, h: number, top: number, bottom: number, alpha = 1, bands = 10): Shape[] {
  const out: Shape[] = [];
  for (let i = 0; i < bands; i++) {
    const t = bands === 1 ? 0 : i / (bands - 1);
    out.push({ kind: 'rect', x, y: y + (h * i) / bands, w, h: h / bands + 1, color: mix(top, bottom, t), alpha });
  }
  return out;
}

/** 面板四角的金色回纹角饰 */
function cornerOrnaments(x: number, y: number, w: number, h: number, inset: number, len: number, color: number, alpha: number): Shape[] {
  const out: Shape[] = [];
  const t = 2;
  const corners: [number, number, number, number][] = [
    [x + inset, y + inset, 1, 1],
    [x + w - inset, y + inset, -1, 1],
    [x + inset, y + h - inset, 1, -1],
    [x + w - inset, y + h - inset, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    out.push({ kind: 'rect', x: sx > 0 ? cx : cx - len, y: sy > 0 ? cy : cy - t, w: len, h: t, color, alpha });
    out.push({ kind: 'rect', x: sx > 0 ? cx : cx - t, y: sy > 0 ? cy : cy - len, w: t, h: len, color, alpha });
    // 内勾
    out.push({ kind: 'rect', x: sx > 0 ? cx + len * 0.5 : cx - len * 0.5, y: sy > 0 ? cy + t * 2 : cy - t * 3, w: t, h: len * 0.4, color, alpha: alpha * 0.8 });
  }
  return out;
}

// ───────────────────────── 面板 ─────────────────────────

export interface PanelOpts {
  x: number; y: number; w: number; h: number;
  theme?: ThemeTokens;
  alpha?: number;
  /** 圆角半径 */
  radius?: number;
  /** 是否绘制四角回纹（默认 true） */
  ornate?: boolean;
  /** 使用更亮的第二面板色 */
  raised?: boolean;
}

export function panelShapes(opts: PanelOpts): Shape[] {
  const t = opts.theme ?? THEME;
  const { x, y, w, h } = opts;
  const r = opts.radius ?? 8;
  const a = opts.alpha ?? 0.94;
  const top = opts.raised ? mix(t.panelAlt, 0xffffff, 0.04) : t.panel;
  const bot = opts.raised ? shade(t.panelAlt, 0.86) : shade(t.panel, 0.78);
  const out: Shape[] = [];

  // 投影
  out.push(roundRect(x + 4, y + 5, w, h, r, 0x000000, 0.32));
  // 底：渐变
  out.push(...vGradient(x, y, w, h, top, bot, a, 12).map((s) => (s.kind === 'rect' ? { ...s, x: x, w } : s)));
  // 外描边（厚 2）
  out.push(roundRect(x, y, w, h, r, t.gold, 0.55));
  out.push(roundRect(x + 2, y + 2, w - 4, h - 4, Math.max(0, r - 1), top, a));
  // 内细线
  const g = 6;
  out.push(roundRect(x + g, y + g, w - g * 2, h - g * 2, Math.max(0, r - 2), shade(t.border, 1.25), 0.7));
  out.push(roundRect(x + g + 1, y + g + 1, w - (g + 1) * 2, h - (g + 1) * 2, Math.max(0, r - 2), top, a));
  // 顶部高光
  out.push(roundRect(x + 3, y + 3, w - 6, 2, 1, mix(t.panelAlt, 0xffffff, 0.3), 0.5));
  if (opts.ornate !== false) {
    out.push(...cornerOrnaments(x, y, w, h, 9, 16, t.gold, 0.9));
  }
  return out;
}

export function drawPanel(g: Graphics, opts: PanelOpts): void {
  drawShapes(g, panelShapes(opts));
}

// ───────────────────────── 按钮 ─────────────────────────

export interface ButtonOpts {
  x: number; y: number; w: number; h: number;
  theme?: ThemeTokens;
  enabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  radius?: number;
}

export function buttonShapes(opts: ButtonOpts): Shape[] {
  const t = opts.theme ?? THEME;
  const { x, y, w, h } = opts;
  const r = opts.radius ?? 6;
  const on = opts.enabled !== false;
  const variant = opts.variant ?? 'primary';
  const base = variant === 'danger' ? t.danger : variant === 'secondary' ? t.border : t.accent;
  const top = on ? mix(base, 0xffffff, 0.18) : shade(t.panelAlt, 1.02);
  const bot = on ? shade(base, 0.62) : shade(t.panel, 0.9);
  const edge = on ? mix(base, 0xffffff, 0.45) : shade(t.border, 0.9);
  const out: Shape[] = [];

  out.push(roundRect(x + 2, y + 3, w, h, r, 0x000000, 0.32));
  out.push(...vGradient(x, y, w, h, top, bot, 1, 10));
  // 双线边框
  out.push(roundRect(x, y, w, h, r, edge, 0.95));
  out.push(roundRect(x + 2, y + 2, w - 4, h - 4, Math.max(0, r - 1), top, 1));
  out.push(roundRect(x + 4, y + 4, w - 8, h - 8, Math.max(0, r - 2), mix(t.panel, base, on ? 0.22 : 0.06), 0.5));
  // 顶部高光 + 四角小饰
  out.push(roundRect(x + 5, y + 4, w - 10, 2, 1, 0xffffff, on ? 0.28 : 0.1));
  out.push(...cornerOrnaments(x, y, w, h, 5, 9, on ? t.gold : t.textDim, 0.7));
  return out;
}

export function drawButton(g: Graphics, opts: ButtonOpts, label?: string): void {
  drawShapes(g, buttonShapes(opts));
  if (label) {
    const t = opts.theme ?? THEME;
    const on = opts.enabled !== false;
    const txt = new Text({
      text: label,
      style: {
        fill: on ? t.text : t.textDim,
        fontSize: Math.max(11, Math.min(20, opts.h * 0.42)),
        fontFamily: t.fontFamily,
        fontWeight: 'bold',
      },
    });
    txt.anchor.set(0.5);
    txt.position.set(opts.x + opts.w / 2, opts.y + opts.h / 2);
    g.addChild(txt);
  }
}

// ───────────────────────── 进度条 ─────────────────────────

export interface BarOpts {
  x: number; y: number; w: number; h: number;
  ratio: number;
  bg: number;
  fg: number;
  theme?: ThemeTokens;
  radius?: number;
  /** 刻度数量（0 = 不画） */
  ticks?: number;
}

export function barShapes(opts: BarOpts): Shape[] {
  const t = opts.theme ?? THEME;
  const { x, y, w, h } = opts;
  const r = opts.radius ?? Math.min(h / 2, 4);
  const ratio = Math.max(0, Math.min(1, opts.ratio));
  const out: Shape[] = [];

  out.push(roundRect(x + 1, y + 2, w, h, r, 0x000000, 0.3));
  // 外框（金色，作为边框填充，随后用内层盖住中部）
  out.push(roundRect(x, y, w, h, r, mix(t.gold, 0x000000, 0.25), 0.9));
  // 内层：凹槽底
  out.push(roundRect(x + 2, y + 2, w - 4, h - 4, Math.max(0, r - 1), shade(opts.bg, 0.78), 1));
  // 填充
  if (ratio > 0.001) {
    const fw = Math.max(2, (w - 4) * ratio);
    out.push(...vGradient(x + 2, y + 2, fw, h - 4, mix(opts.fg, 0xffffff, 0.28), shade(opts.fg, 0.66), 1, 8));
    out.push(roundRect(x + 3, y + 3, Math.max(0, fw - 2), Math.max(1, h * 0.2), 1, 0xffffff, 0.3));
  }
  // 内描边细线
  out.push(roundRect(x + 2, y + 2, w - 4, h - 4, Math.max(0, r - 1), mix(t.panelAlt, 0xffffff, 0.25), 0.28));
  if (opts.ticks && opts.ticks > 0) {
    for (let i = 1; i < opts.ticks; i++) {
      const tx = x + 2 + ((w - 4) * i) / opts.ticks;
      out.push({ kind: 'rect', x: tx - 1, y: y + 3, w: 2, h: Math.max(2, h - 6), color: 0x0d1117, alpha: 0.55 });
    }
  }
  return out;
}

export function drawBar(g: Graphics, opts: BarOpts): void {
  drawShapes(g, barShapes(opts));
}

// ───────────────────────── 装备格 ─────────────────────────

export interface SlotOpts {
  x: number; y: number; size: number;
  theme?: ThemeTokens;
  /** 外框色；默认主题边框 */
  border?: number;
  /** 品质色（优先于 border） */
  qualityColor?: number;
  radius?: number;
}

export function slotShapes(opts: SlotOpts): Shape[] {
  const t = opts.theme ?? THEME;
  const { x, y, size } = opts;
  const r = opts.radius ?? 6;
  const edge = opts.qualityColor ?? opts.border ?? t.border;
  const out: Shape[] = [];

  out.push(roundRect(x + 2, y + 3, size, size, r, 0x000000, 0.35));
  // 底：内凹渐变
  out.push(...vGradient(x, y, size, size, shade(t.panel, 0.7), shade(t.panelAlt, 0.75), 1, 8));
  // 品质色外框（厚 2）
  out.push(roundRect(x, y, size, size, r, edge, 1));
  out.push(roundRect(x + 2, y + 2, size - 4, size - 4, Math.max(0, r - 1), shade(t.panel, 0.72), 1));
  // 内细线
  out.push(roundRect(x + 5, y + 5, size - 10, size - 10, Math.max(0, r - 2), shade(edge, 0.75), 0.7));
  out.push(roundRect(x + 6, y + 6, size - 12, size - 12, Math.max(0, r - 2), shade(t.panelAlt, 0.85), 1));
  // 四角饰
  out.push(...cornerOrnaments(x, y, size, size, 7, 11, edge, 0.85));
  return out;
}

export function drawSlot(g: Graphics, opts: SlotOpts): void {
  drawShapes(g, slotShapes(opts));
}

export const uiTheme = THEME;
export { Text };

/** 调试辅助：列出主题令牌的颜色字符串（审查页用） */
export function themeSwatches(t: ThemeTokens = THEME): { name: string; color: number; css: string }[] {
  return [
    { name: 'panel', color: t.panel, css: hex(t.panel) },
    { name: 'panelAlt', color: t.panelAlt, css: hex(t.panelAlt) },
    { name: 'border', color: t.border, css: hex(t.border) },
    { name: 'accent', color: t.accent, css: hex(t.accent) },
    { name: 'gold', color: t.gold, css: hex(t.gold) },
    { name: 'hp', color: t.hp, css: hex(t.hp) },
    { name: 'mp', color: t.mp, css: hex(t.mp) },
  ];
}
