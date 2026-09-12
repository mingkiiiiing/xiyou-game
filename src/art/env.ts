/**
 * AT-2.2 环境视差（多层 parallax + 环境粒子）。
 * 契约见 src/art/types.ts 的 EnvTheme / EnvLayerSpec。
 *
 * 设计要点：
 *  - 每层是独立子容器（EnvLayerView），带 `parallax` 字段；场景按相机 x 调 `applyParallax` 手动偏移。
 *  - 图案/渐变全部由**纯数据**（Shape[]）生成，导出 `envLayerShapes` / `skyShapes` / `groundShapes`，
 *    于是屏幕（Pixi Graphics，经 pixiRender.drawShapes）与 PNG 审查（scripts/lib/raster.ts）
 *    消费同一份几何 —— 与角色造型同一套"美术即数据"架构。
 */
import { Container, Graphics } from 'pixi.js';
import type { EnvLayerSpec, EnvTheme, Shape } from './types';
import { drawShapes } from './pixiRender';
import { mix, rotRect, shade } from './shapes';

/** 屏幕参考宽度：用于把视差层画得比世界更宽，保证任意相机位置都不露边 */
const VIEW_W = 1280;

// ───────────────────────── 主题预置 ─────────────────────────

/**
 * 三个完整主题，每个 3+ 层（由远及近 parallax 递增）。
 * 层顺序：数组先画 = 最下层（远景），后画 = 更近。
 */
export const ENV_THEMES: readonly EnvTheme[] = [
  {
    id: 'huaguoshan',
    name: '花果山',
    sky: [0x1d2b4a, 0xf0a15c],
    layers: [
      { id: 'clouds', parallax: 0.05, y: 40, height: 300, colors: [0x6d5a78, 0xd98f63], motif: 'clouds', count: 7, seed: 11 },
      // 山脊做"空气透视"：颜色向天空靠拢（远山更淡），坡度平缓，避免深色尖峰压迫画面
      { id: 'mountains', parallax: 0.18, y: 340, height: 170, colors: [0x7d6a80, 0x5a4a63], motif: 'mountains', count: 6, seed: 23 },
      // 森林带刻意压矮并贴近地面：树顶不得高于角色头顶（GROUND_Y-70），避免与战斗主体争夺视觉焦点
      { id: 'forest', parallax: 0.42, y: 556, height: 64, colors: [0x2f4a2c, 0x1c2a1a], motif: 'forest', count: 18, seed: 37 },
    ],
    ambient: 'leaves',
    ambientCount: 26,
    groundTop: 0x3a5a32,
    groundBottom: 0x1e2f1a,
  },
  {
    id: 'shuilian',
    name: '水帘洞',
    sky: [0x0e2f42, 0x3f9aa0],
    layers: [
      { id: 'stars', parallax: 0.02, y: 20, height: 220, colors: [0x0b2430, 0x1c4a5c], motif: 'stars', count: 40, seed: 5 },
      { id: 'cave', parallax: 0.16, y: 0, height: 520, colors: [0x2a5a68, 0x102a34], motif: 'cave', count: 9, seed: 61 },
      { id: 'river', parallax: 0.34, y: 470, height: 170, colors: [0x2b8391, 0x14505f], motif: 'river', count: 5, seed: 73 },
      { id: 'river2', parallax: 0.6, y: 540, height: 110, colors: [0x43a9b6, 0x1a5567], motif: 'river', count: 4, seed: 89 },
    ],
    ambient: 'dust',
    ambientCount: 22,
    groundTop: 0x3e6a74,
    groundBottom: 0x18323a,
  },
  {
    id: 'moku',
    name: '魔王洞窟',
    sky: [0x1e0d14, 0x7a2a1c],
    layers: [
      { id: 'cave_far', parallax: 0.1, y: 0, height: 560, colors: [0x5a2620, 0x2a1010], motif: 'cave', count: 7, seed: 101 },
      { id: 'mountains', parallax: 0.28, y: 300, height: 280, colors: [0x40160f, 0x200a08], motif: 'mountains', count: 9, seed: 113 },
      { id: 'cave_near', parallax: 0.52, y: 120, height: 480, colors: [0x2e1210, 0x140707], motif: 'cave', count: 5, seed: 131 },
    ],
    ambient: 'embers',
    ambientCount: 34,
    groundTop: 0x5a2a1c,
    groundBottom: 0x200c0a,
  },
];

export function getEnvTheme(id: string): EnvTheme | undefined {
  return ENV_THEMES.find((t) => t.id === id);
}

// ───────────────────────── 纯形状生成（屏幕 / PNG 共用） ─────────────────────────

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 垂直渐变（用若干色带近似，两边渲染器都可直接画） */
export function gradientBands(
  x: number, y: number, w: number, h: number,
  top: number, bottom: number, bands = 12, alpha = 1,
): Shape[] {
  const out: Shape[] = [];
  const n = Math.max(1, Math.floor(bands));
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    out.push({ kind: 'rect', x, y: y + (h * i) / n, w, h: h / n + 1, color: mix(top, bottom, t), alpha });
  }
  return out;
}

/** 天空背景（铺满相机可见区域） */
export function skyShapes(theme: EnvTheme, w: number, groundY: number): Shape[] {
  return gradientBands(0, 0, w, groundY + 8, theme.sky[0], theme.sky[1], 26, 1);
}

/** 地面（含顶部高光线） */
export function groundShapes(theme: EnvTheme, w: number, groundY: number, bottomY: number): Shape[] {
  const out = gradientBands(0, groundY, w, Math.max(1, bottomY - groundY), theme.groundTop, theme.groundBottom, 10, 1);
  out.push({ kind: 'rect', x: 0, y: groundY, w, h: 3, color: mix(theme.groundTop, 0xffffff, 0.22), alpha: 0.9 });
  return out;
}

/** 单层图案（绝对坐标；x0..x1 是可绘制横向范围） */
export function envLayerShapes(layer: EnvLayerSpec, x0: number, x1: number): Shape[] {
  const out: Shape[] = [];
  const rnd = makeRng(layer.seed ?? 1337);
  const w = x1 - x0;
  const top = layer.y;
  const bot = layer.y + layer.height;
  const base = mix(layer.colors[0], layer.colors[1], 0.5);

  // 层底一抹透明渐变（提供层次与色调）
  out.push(...gradientBands(x0, top, w, layer.height, layer.colors[0], layer.colors[1], 7, 0.26));

  switch (layer.motif) {
    case 'mountains': {
      const color = shade(base, 0.62);
      const peaks = Math.max(3, Math.round(layer.count));
      const pts: number[] = [x0, bot, x1, bot];
      // 从右往左生成山脊：谷 → 峰
      for (let i = peaks; i >= 0; i--) {
        const vx = x0 + (w * i) / peaks;
        const px = x0 + (w * (i + 0.5)) / peaks;
        const valleyY = bot - layer.height * (0.1 + rnd() * 0.12);
        const peakY = top + layer.height * (0.08 + rnd() * 0.38);
        if (i > 0) pts.push(vx, valleyY);
        if (px <= x1) pts.push(px, peakY);
      }
      out.push({ kind: 'poly', points: pts, color });
      break;
    }
    case 'clouds': {
      const cc = mix(layer.colors[0], 0xffffff, 0.4);
      const n = Math.max(2, Math.round(layer.count));
      for (let i = 0; i < n; i++) {
        const cx = x0 + rnd() * w;
        const cy = top + layer.height * (0.15 + rnd() * 0.55);
        const r = 34 + rnd() * 54;
        out.push({ kind: 'ellipse', x: cx, y: cy, rx: r, ry: r * 0.3, color: cc, alpha: 0.72 });
        out.push({ kind: 'ellipse', x: cx - r * 0.55, y: cy + r * 0.1, rx: r * 0.62, ry: r * 0.24, color: cc, alpha: 0.6 });
        out.push({ kind: 'ellipse', x: cx + r * 0.6, y: cy + r * 0.08, rx: r * 0.7, ry: r * 0.26, color: cc, alpha: 0.64 });
      }
      break;
    }
    case 'forest': {
      const leaf = shade(base, 0.72);
      const leafDark = shade(base, 0.5);
      const trunk = shade(base, 0.42);
      const n = Math.max(3, Math.round(layer.count));
      for (let i = 0; i < n; i++) {
        const cx = x0 + (w * (i + 0.5 + (rnd() - 0.5) * 0.6)) / n;
        const h = layer.height * (0.4 + rnd() * 0.55);
        const tw = h * 0.42;
        out.push({ kind: 'rect', x: cx - 2.5, y: bot - h * 0.28, w: 5, h: h * 0.3, color: trunk });
        out.push({ kind: 'poly', points: [cx - tw, bot - h * 0.2, cx + tw, bot - h * 0.2, cx, bot - h], color: i % 2 === 0 ? leaf : leafDark });
        out.push({ kind: 'poly', points: [cx - tw * 0.7, bot - h * 0.52, cx + tw * 0.7, bot - h * 0.52, cx, bot - h * 1.18], color: leafDark, alpha: 0.85 });
      }
      break;
    }
    case 'cave': {
      const wall = shade(base, 0.5);
      const rock = shade(base, 0.34);
      out.push({ kind: 'rect', x: x0, y: top, w, h: layer.height, color: wall, alpha: 0.86 });
      const n = Math.max(3, Math.round(layer.count));
      for (let i = 0; i < n; i++) {
        // 石钟乳（上垂下）
        const cx = x0 + (w * (i + 0.5 + (rnd() - 0.5) * 0.7)) / n;
        const h = layer.height * (0.18 + rnd() * 0.3);
        const hw = h * 0.34;
        out.push({ kind: 'poly', points: [cx - hw, top, cx + hw, top, cx, top + h], color: rock });
      }
      for (let i = 0; i < n; i++) {
        // 石笋（下长出）
        const cx = x0 + (w * (i + 0.25 + (rnd() - 0.5) * 0.7)) / n;
        const h = layer.height * (0.14 + rnd() * 0.26);
        const hw = h * 0.42;
        out.push({ kind: 'poly', points: [cx - hw, bot, cx + hw, bot, cx, bot - h], color: shade(rock, 0.82) });
      }
      // 岩面斑块
      for (let i = 0; i < n * 2; i++) {
        out.push({
          kind: 'circle',
          x: x0 + rnd() * w,
          y: top + layer.height * (0.3 + rnd() * 0.6),
          r: 10 + rnd() * 26,
          color: shade(base, 0.28 + rnd() * 0.18),
          alpha: 0.4,
        });
      }
      break;
    }
    case 'river': {
      out.push(...gradientBands(x0, top, w, layer.height, layer.colors[0], layer.colors[1], 9, 0.8));
      const shimmer = mix(layer.colors[1], 0xdff6ff, 0.55);
      const n = Math.max(2, Math.round(layer.count));
      for (let k = 0; k < n; k++) {
        const y = top + layer.height * ((k + 0.5) / n);
        const amp = 5 + rnd() * 7;
        const seg = 8;
        const pts: number[] = [];
        for (let i = 0; i <= seg; i++) {
          const x = x0 + (w * i) / seg;
          pts.push(x, y + Math.sin((i / seg) * Math.PI * 2 + k * 1.3) * amp);
        }
        for (let i = seg; i >= 0; i--) {
          const x = x0 + (w * i) / seg;
          pts.push(x, y + Math.sin((i / seg) * Math.PI * 2 + k * 1.3) * amp + 3);
        }
        out.push({ kind: 'poly', points: pts, color: shimmer, alpha: 0.38 });
      }
      break;
    }
    case 'stars': {
      const n = Math.max(3, Math.round(layer.count));
      for (let i = 0; i < n; i++) {
        out.push({
          kind: 'circle',
          x: x0 + rnd() * w,
          y: top + rnd() * layer.height,
          r: 0.8 + rnd() * 1.7,
          color: rnd() > 0.85 ? 0xaad4ff : 0xfff4c8,
          alpha: 0.45 + rnd() * 0.5,
        });
      }
      break;
    }
  }
  return out;
}

// ───────────────────────── Pixi 视差容器 ─────────────────────────

/** 一层：独立子容器，携带 parallax 供场景偏移 */
export class EnvLayerView extends Container {
  constructor(
    public readonly layerId: string,
    public readonly parallax: number,
  ) {
    super();
    this.label = `env:${layerId}`;
  }
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  phase: number;
  spin: number;
  color: number;
}

/**
 * 环境视图：多层视差 + 粒子。返回类型仍是 Container（契约签名），
 * 但实际是 EnvView，场景可调用 `applyParallax` / `update` 获得视差与天气动画。
 */
export class EnvView extends Container {
  readonly envLayers: EnvLayerView[] = [];
  private readonly particles: Particle[] = [];
  private ambientG: Graphics | null = null;
  private timers = 0;

  constructor(
    readonly theme: EnvTheme,
    private readonly worldW: number,
    private readonly groundY: number,
    private readonly bottomY = 720,
  ) {
    super();
    this.label = `env:${theme.id}`;
    this.build();
  }

  private build(): void {
    const x0 = -VIEW_W;
    const x1 = this.worldW + VIEW_W;

    const bg = new Graphics();
    drawShapes(bg, skyShapes(this.theme, x1 - 0, this.groundY));
    // 天空用绝对坐标（从 0 起），先加为静态底
    this.addChild(bg);

    for (const spec of this.theme.layers) {
      const layer = new EnvLayerView(spec.id, spec.parallax);
      const g = new Graphics();
      drawShapes(g, envLayerShapes(spec, x0, x1));
      layer.addChild(g);
      this.envLayers.push(layer);
      this.addChild(layer);
    }

    const ground = new Graphics();
    drawShapes(ground, groundShapes(this.theme, x1, this.groundY, this.bottomY));
    this.addChild(ground);

    if (this.theme.ambient !== 'none' && this.theme.ambientCount > 0) {
      const ag = new Graphics();
      this.ambientG = ag;
      this.spawnParticles();
      this.addChild(ag);
      this.drawAmbient();
    }
  }

  private spawnParticles(): void {
    const rnd = makeRng(0x5eed ^ this.worldW);
    const n = this.theme.ambientCount;
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: rnd() * this.worldW,
        y: rnd() * this.groundY,
        vx: 0,
        vy: 0,
        size: 1.4 + rnd() * 2.2,
        phase: rnd() * Math.PI * 2,
        spin: (rnd() - 0.5) * 3,
        color: this.pickColor(rnd),
      });
    }
  }

  private pickColor(rnd: () => number): number {
    switch (this.theme.ambient) {
      case 'leaves': return rnd() > 0.5 ? 0xc9842f : 0x8fbf4f;
      case 'embers': return rnd() > 0.4 ? 0xff8a3d : 0xffd257;
      case 'snow': return 0xffffff;
      default: return 0xd8c9a0;
    }
  }

  /** 场景按相机偏移调用：worldX 为承载环境的世界容器 x（通常为负） */
  applyParallax(worldX: number): void {
    for (const l of this.envLayers) l.x = worldX * (l.parallax - 1);
  }

  update(dtMs: number): void {
    const dt = Math.min(dtMs, 50) / 1000;
    this.timers += dt;
    const kind = this.theme.ambient;
    for (const p of this.particles) {
      switch (kind) {
        case 'leaves':
          p.x += (Math.sin(this.timers * 1.6 + p.phase) * 26) * dt;
          p.y += (34 + p.size * 6) * dt;
          p.spin += dt * 2.4;
          break;
        case 'embers':
          p.x += (Math.sin(this.timers * 2.2 + p.phase) * 20) * dt;
          p.y -= (26 + p.size * 9) * dt;
          break;
        case 'snow':
          p.x += (Math.sin(this.timers * 1.1 + p.phase) * 22) * dt;
          p.y += (24 + p.size * 5) * dt;
          break;
        default: // dust
          p.x += (10 + p.size * 4) * dt;
          p.y += Math.sin(this.timers * 0.8 + p.phase) * 6 * dt;
          break;
      }
      if (p.y > this.groundY + 10) { p.y = -10; p.x = (p.x + 137) % this.worldW; }
      if (p.y < -14) { p.y = this.groundY - 5; p.x = (p.x + 211) % this.worldW; }
      if (p.x < -20) p.x = this.worldW - 1;
      if (p.x > this.worldW + 20) p.x = 1;
    }
    this.drawAmbient();
  }

  private drawAmbient(): void {
    const g = this.ambientG;
    if (!g) return;
    g.clear();
    const shapes: Shape[] = [];
    for (const p of this.particles) {
      const flick = 0.55 + 0.45 * Math.sin(this.timers * 4 + p.phase);
      switch (this.theme.ambient) {
        case 'leaves':
          shapes.push(rotRect(p.x, p.y, p.size * 3.4, p.size * 1.7, p.spin + p.phase, p.color, 0.9));
          break;
        case 'embers':
          shapes.push({ kind: 'circle', x: p.x, y: p.y, r: p.size, color: p.color, alpha: 0.35 + 0.65 * flick });
          break;
        case 'snow':
          shapes.push({ kind: 'circle', x: p.x, y: p.y, r: p.size, color: p.color, alpha: 0.85 });
          break;
        default:
          shapes.push({ kind: 'circle', x: p.x, y: p.y, r: p.size, color: p.color, alpha: 0.28 });
          break;
      }
    }
    drawShapes(g, shapes);
  }
}

/**
 * ⚠ AT-2.2 核心 API：构建多层视差容器 + 环境粒子。
 * 返回的容器各层是独立子容器（EnvLayerView，带 parallax），由场景在切换关卡时销毁重建。
 */
export function buildEnvironment(theme: EnvTheme, worldW: number, groundY: number): Container {
  return new EnvView(theme, worldW, groundY);
}
