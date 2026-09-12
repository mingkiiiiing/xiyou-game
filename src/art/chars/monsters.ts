/**
 * 怪物造型集合（AT-2.1）。
 * 契约见 src/art/types.ts 的 CharacterArtDef；范式见 chars/linghou.ts。
 *
 * 设计原则：
 *  - 纯函数：(state, phase) → ShapeList，不读写外部可变状态、不用 Math.random
 *  - 原点在脚底中心，y 向上为负
 *  - 朝向翻转 / 闪白由 art/compose.ts 统一处理，本文件不处理
 *  - 只使用 4 种图元（rect/circle/ellipse/poly），辅助函数见 art/shapes.ts
 *  - 剪影优先：体型 / 角 / 翼 / 尾 / 武器 差异化
 *  - 配色分组：近战赤棕、远程紫青、重装灰铁、Boss 暗金深红
 *
 * 本文件同时导出通用骨架（drawBiped / poseFor / 图元构造），供 bosses.ts 复用。
 */
import type { AnimationClip, CharacterArtDef, Palette, Shape, ShapeList } from '../types';
import { rotRect, quad, shade } from '../shapes';

export const TAU = Math.PI * 2;
const BLACK = 0x000000;

// ───────────────────────── 基础图元（只产出 4 种 kind） ─────────────────────────

export function circle(x: number, y: number, r: number, color: number, alpha?: number): Shape {
  return { kind: 'circle', x, y, r, color, alpha };
}
export function ell(x: number, y: number, rx: number, ry: number, color: number, alpha?: number): Shape {
  return { kind: 'ellipse', x, y, rx, ry, color, alpha };
}
export function box(x: number, y: number, w: number, h: number, color: number, alpha?: number): Shape {
  return { kind: 'rect', x, y, w, h, color, alpha };
}
/** 从 (x1,y1) 到 (x2,y2) 的胶囊（用旋转矩形实现），用于肢体 / 棍棒 / 骨刺 */
export function rod(x1: number, y1: number, x2: number, y2: number, w: number, color: number, alpha?: number): Shape {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.max(0.01, Math.hypot(dx, dy));
  const ang = Math.atan2(-dx, dy);
  return rotRect((x1 + x2) / 2, (y1 + y2) / 2, w, len, ang, color, alpha);
}
/** 从关节 (jx,jy) 沿摆角 ang（0=垂直向下，+ 向 +x 摆）伸出肢体 */
export function limb(jx: number, jy: number, len: number, w: number, ang: number, color: number, alpha?: number): Shape {
  return rod(jx, jy, jx + Math.sin(ang) * len, jy + Math.cos(ang) * len, w, color, alpha);
}
/** 脚掌 */
export function foot(x: number, y: number, w: number, h: number, color: number, alpha?: number): Shape {
  return ell(x, y, w * 0.5, h * 0.5, color, alpha);
}
/** 影子（贴地） */
export function shadow(rx: number, ry = 5, alpha = 0.3): Shape {
  return ell(0, -1, rx, ry, BLACK, alpha);
}
/** 三角楔形：底边中心 (bx,by)，宽 w，向 ang 方向伸出 len */
export function wedge(bx: number, by: number, w: number, len: number, ang: number, color: number, alpha?: number): Shape {
  const dx = Math.sin(ang), dy = Math.cos(ang);
  const px = Math.cos(ang), py = -Math.sin(ang);
  const hw = w / 2;
  return {
    kind: 'poly',
    points: [bx - px * hw, by - py * hw, bx + px * hw, by + py * hw, bx + dx * len, by + dy * len],
    color, alpha,
  };
}
/** 尾巴 / 藤须 / 触须：从 (bx,by) 沿 ang 伸出的锥形圆珠链，带正弦摆动 */
export function tendril(
  bx: number, by: number, ang: number, len: number, segs: number, w0: number,
  color: number, wave: number, amp = 5, bend = 0,
): ShapeList {
  const out: ShapeList = [];
  const dx = Math.sin(ang), dy = Math.cos(ang);
  const px = Math.cos(ang), py = -Math.sin(ang);
  for (let i = 0; i < segs; i++) {
    const t = segs === 1 ? 0 : i / (segs - 1);
    const off = Math.sin(wave + t * 2.6) * amp * t + bend * t * t;
    out.push(circle(bx + dx * t * len + px * off, by + dy * t * len + py * off, Math.max(0.9, w0 * (1 - t * 0.72)), color));
  }
  return out;
}
export function pal(primary: number, secondary: number, accent: number, detail: number, flash = 0xffffff): Palette {
  return { primary, secondary, accent, detail, flash };
}

// ───────────────────────── 通用姿态 ─────────────────────────

export interface Pose {
  bob: number;          // 整体上下浮动
  lean: number;         // 躯干前倾
  legA: number;         // 前腿摆角（四足：前肢 A）
  legB: number;         // 后腿摆角（四足：前肢 B）
  kneeA: number;        // 屈膝（缩短腿长）
  kneeB: number;
  armA: number;         // 前臂摆角（四足：后肢 A）
  armB: number;         // 后臂摆角（四足：后肢 B）
  wpn: number;          // 武器 / 施法倾角
  headTilt: number;
  tailSway: number;
  wing: number;         // 翼摆角
  k: number;            // 当前动作进度 0~1（攻击 / 技能）
  prone: boolean;       // 倒地
}

export function poseFor(state: string, t: number): Pose {
  const p: Pose = {
    bob: 0, lean: 0, legA: 0, legB: 0, kneeA: 1, kneeB: 1,
    armA: 0.12, armB: -0.12, wpn: 0.18, headTilt: 0, tailSway: 0, wing: 0, k: 0, prone: false,
  };
  switch (state) {
    case 'run': {
      const s = Math.sin(t * TAU), c = Math.cos(t * TAU);
      p.lean = 0.16;
      p.legA = s * 0.75;
      p.legB = -s * 0.75;
      p.kneeA = 0.84 + Math.max(0, -c) * 0.16;
      p.kneeB = 0.84 + Math.max(0, c) * 0.16;
      p.armA = -s * 0.7;
      p.armB = s * 0.7;
      p.bob = Math.abs(s) * 3;
      p.wpn = 0.5 + s * 0.25;
      p.tailSway = t * TAU;
      p.wing = Math.sin(t * TAU * 2) * 0.75;
      break;
    }
    case 'jump':
      p.legA = 0.5; p.legB = -0.25; p.kneeA = 0.55; p.kneeB = 0.7;
      p.armA = -1.5; p.armB = -1.1; p.wpn = -0.9; p.lean = -0.1; p.tailSway = 1.2; p.wing = -0.95;
      break;
    case 'fall':
      p.legA = -0.2; p.legB = 0.25; p.kneeA = 0.95; p.kneeB = 0.95;
      p.armA = -1.9; p.armB = -1.7; p.wpn = -0.4; p.lean = 0.05; p.tailSway = -1.0; p.wing = 0.7;
      break;
    case 'attack1': {
      const k = t < 0.35 ? t / 0.35 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      p.k = k;
      p.armA = -2.0 + k * 3.4;
      p.armB = -0.4 + k * 0.9;
      p.wpn = -1.5 + k * 2.9;
      p.lean = 0.06 + k * 0.16;
      p.legA = 0.3; p.legB = -0.3;
      break;
    }
    case 'attack2': {
      const k = t < 0.3 ? t / 0.3 : t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
      p.k = k;
      p.armA = 1.4 - k * 3.0;
      p.armB = 0.6 - k * 0.7;
      p.wpn = 1.4 - k * 3.2;
      p.lean = -0.08 - k * 0.1;
      p.legA = -0.35; p.legB = 0.35;
      break;
    }
    case 'attack3': {
      const k = t < 0.4 ? t / 0.4 : 1;
      p.k = k;
      p.armA = -0.5 - k * 2.3;
      p.armB = -0.5 - k * 2.1;
      p.wpn = -0.2 - k * 2.6;
      p.lean = -0.05 + k * 0.42;
      p.legA = 0.45 - k * 0.3; p.legB = -0.45 + k * 0.25;
      p.bob = -k * 2;
      break;
    }
    case 'skill': {
      const k = t < 0.5 ? t / 0.5 : 1;
      p.k = k;
      p.armA = -1.8 - k * 0.9; p.armB = -1.5 - k * 0.7;
      p.wpn = -1.2 - k * 0.7;
      p.lean = 0.28 * (1 - k);
      p.legA = 0.55 * (1 - k * 0.5); p.legB = -0.5 * (1 - k * 0.5);
      p.kneeA = 0.6 + k * 0.4; p.kneeB = 0.6 + k * 0.4;
      p.bob = -3 * (1 - k);
      break;
    }
    case 'hurt': {
      const k = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
      p.k = k;
      p.lean = -0.4 * k;
      p.headTilt = -0.5 * k;
      p.armA = 1.1 * k; p.armB = -1.3 * k;
      p.wpn = 1.0 * k;
      p.legA = -0.3 * k; p.legB = 0.35 * k;
      p.bob = 1.5 * k;
      break;
    }
    case 'dead':
      p.prone = true;
      break;
    default: {
      const s = Math.sin(t * TAU);
      p.bob = s * 1.4;
      p.lean = s * 0.03;
      p.armA = 0.12 + s * 0.07;
      p.armB = -0.12 - s * 0.07;
      p.wpn = 0.18 + s * 0.05;
      p.headTilt = s * 0.05;
      p.tailSway = s * 1.6;
      p.wing = s * 0.25;
      break;
    }
  }
  return p;
}

export function stdClips(): Record<string, AnimationClip> {
  return {
    idle: { name: 'idle', frameMs: 90, loop: true, durationMs: 2000 },
    run: { name: 'run', frameMs: 60, loop: true, durationMs: 700 },
    jump: { name: 'jump', frameMs: 80, loop: false, durationMs: 300 },
    fall: { name: 'fall', frameMs: 80, loop: true, durationMs: 400 },
    attack1: { name: 'attack1', frameMs: 45, loop: false, durationMs: 280 },
    attack2: { name: 'attack2', frameMs: 45, loop: false, durationMs: 280 },
    attack3: { name: 'attack3', frameMs: 55, loop: false, durationMs: 360 },
    skill: { name: 'skill', frameMs: 60, loop: false, durationMs: 420 },
    hurt: { name: 'hurt', frameMs: 60, loop: false, durationMs: 300 },
    dead: { name: 'dead', frameMs: 120, loop: false, durationMs: 600 },
  };
}

// ───────────────────────── 双足通用骨架 ─────────────────────────

export interface Cols {
  body: number;      // 主肤色 / 皮毛
  back: number;      // 背侧阴影色
  cloth: number;     // 服装 / 甲
  clothDark: number; // 服装暗部
  accent: number;    // 点缀（金 / 光）
  eye: number;
  white: number;
  skin: number;      // 口吻 / 面部亮色
}

export interface BipedCfg {
  hipY: number; shoulderY: number; headY: number; headR: number;
  legLen: number; legW: number; armLen: number; armW: number;
  torsoW: number; torsoH: number;
  hipX?: number; shoulderX?: number; leanShift?: number; shadowRx?: number;
  noLegs?: boolean;
  cols: Cols;
  head: (hx: number, hy: number, p: Pose, c: Cols) => ShapeList;
  back?: (p: Pose, c: Cols) => ShapeList;
  torso?: (p: Pose, c: Cols) => ShapeList;
  leg?: (side: number, jx: number, jy: number, p: Pose, c: Cols) => ShapeList;
  arm?: (side: number, jx: number, jy: number, p: Pose, c: Cols) => ShapeList;
  weapon?: (p: Pose, hx: number, hy: number, c: Cols) => ShapeList;
  prone?: (p: Pose, c: Cols) => ShapeList;
}

function defaultProne(cfg: BipedCfg, c: Cols): ShapeList {
  const R = cfg.headR;
  const out: ShapeList = [shadow(Math.max(20, R * 2.6), 5, 0.32)];
  out.push(rod(-R * 1.7, -R * 0.9, R * 1.1, -R * 0.9, R * 1.75, c.cloth));
  out.push(circle(R * 1.1, -R * 1.0, R, c.body));
  out.push(circle(R * 1.5, -R * 1.45, R * 0.26, c.eye));
  out.push(...tendril(-R * 1.7, -R * 0.9, -Math.PI / 2 - 0.25, R * 2.4, 6, Math.max(2, R * 0.32), c.back, 0.5, 3));
  return out;
}

export function drawBiped(cfg: BipedCfg, p: Pose): ShapeList {
  const c = cfg.cols;
  const out: ShapeList = [];
  const y = p.bob;
  const hipX = cfg.hipX ?? 6;
  const shX = cfg.shoulderX ?? 5;
  if (p.prone) {
    if (cfg.prone) return [shadow(cfg.shadowRx ?? 22, 5, 0.32), ...cfg.prone(p, c)];
    return defaultProne(cfg, c);
  }
  out.push(shadow(cfg.shadowRx ?? 17, Math.max(4, (cfg.shadowRx ?? 17) * 0.3), 0.3));
  if (cfg.back) out.push(...cfg.back(p, c));

  const backTint = shade(c.body, 0.8);
  const backArmTint = shade(c.body, 0.74);
  // 后腿
  if (!cfg.noLegs) {
    if (cfg.leg) out.push(...cfg.leg(-1, hipX, cfg.hipY + y, p, c));
    else {
      const a = p.legB - p.lean * 0.5, L = cfg.legLen * p.kneeB;
      out.push(limb(hipX, cfg.hipY + y, L, cfg.legW, a, backTint));
      out.push(foot(hipX + Math.sin(a) * L, cfg.hipY + y + Math.cos(a) * L, cfg.legW * 1.5, cfg.legW * 0.8, shade(c.body, 0.62)));
    }
  }
  // 后臂
  if (cfg.arm) out.push(...cfg.arm(-1, shX, cfg.shoulderY + y, p, c));
  else out.push(limb(shX, cfg.shoulderY + y, cfg.armLen, cfg.armW, p.armB - p.lean, backArmTint));

  // 躯干
  if (cfg.torso) out.push(...cfg.torso(p, c));
  else out.push(rotRect(0, (cfg.hipY + cfg.shoulderY) / 2 + y, cfg.torsoW, cfg.torsoH, p.lean, c.cloth));

  // 前腿
  if (!cfg.noLegs) {
    if (cfg.leg) out.push(...cfg.leg(1, hipX, cfg.hipY + y, p, c));
    else {
      const a = p.legA - p.lean * 0.5, L = cfg.legLen * p.kneeA;
      out.push(limb(hipX, cfg.hipY + y, L, cfg.legW, a, c.body));
      out.push(foot(hipX + Math.sin(a) * L, cfg.hipY + y + Math.cos(a) * L, cfg.legW * 1.5, cfg.legW * 0.8, shade(c.body, 0.68)));
    }
  }

  // 头
  const leanShift = Math.sin(p.lean) * (cfg.leanShift ?? 4);
  const hx = leanShift * 0.55 + p.headTilt * 2;
  const hy = cfg.headY + y + p.headTilt * 1.5;
  out.push(...cfg.head(hx, hy, p, c));

  // 前臂
  if (cfg.arm) out.push(...cfg.arm(1, shX, cfg.shoulderY + y, p, c));
  else out.push(limb(shX, cfg.shoulderY + y, cfg.armLen, cfg.armW, p.armA - p.lean, c.body));

  // 武器 / 法器（挂在主手末端）
  if (cfg.weapon) {
    const aa = p.armA - p.lean;
    out.push(...cfg.weapon(p, shX + Math.sin(aa) * cfg.armLen * 0.92, cfg.shoulderY + y + Math.cos(aa) * cfg.armLen * 0.92, c));
  }
  return out;
}

// ───────────────────────── 共用素材片段 ─────────────────────────

/** 猴族头部（灵猴系 / 猴兵） */
function monkeyHead(hx: number, hy: number, r: number, c: Cols, band: number, plume: boolean): ShapeList {
  const o: ShapeList = [];
  o.push(circle(hx - r * 0.95, hy + 1, r * 0.4, c.body));
  o.push(circle(hx + r * 0.95, hy + 1, r * 0.4, c.body));
  o.push(circle(hx, hy, r, c.body));
  o.push(ell(hx + 1, hy + r * 0.42, r * 0.56, r * 0.44, c.skin));
  o.push(circle(hx - r * 0.36, hy - r * 0.16, r * 0.18, c.eye));
  o.push(circle(hx + r * 0.36, hy - r * 0.16, r * 0.18, c.eye));
  o.push(circle(hx + 1, hy + r * 0.5, r * 0.11, 0xc98b6a));
  o.push(rod(hx - r, hy - r * 0.88, hx + r, hy - r * 0.88, r * 0.4, band));
  if (plume) {
    o.push(wedge(hx, hy - r * 1.05, r * 0.5, r * 1.5, Math.PI, 0xe23b2b));
    o.push(circle(hx, hy - r * 2.05, r * 0.24, c.accent));
  }
  return o;
}

/** 咆哮弧（能量冲击环），Boss / 精英用 */
export function roarRings(x: number, y: number, phase: number, color: number, r0 = 8): ShapeList {
  const o: ShapeList = [];
  for (let i = 0; i < 3; i++) {
    const t = (phase + i * 0.33) % 1;
    o.push(ell(x, y + 4, r0 + t * 26, (r0 + t * 26) * 0.35, color, Math.max(0, 0.55 * (1 - t))));
  }
  return o;
}

// ═════════════════════════ 1. 猴兵（近战 Lv1 · 赤棕·细瘦·持矛·尾） ═════════════════════════

const MS_S = -36, MS_HEAD = -45, MS_HR = 7.6;
/**
 * 猴兵配色：刻意与玩家灵猴拉开距离 —— 玩家是「亮红+金箍+明亮毛色」，
 * 敌兵改为「暗褐/土绿布衣 + 灰褐毛色 + 无金饰」，战斗中一眼可辨敌我。
 */
const MS_COLS: Cols = {
  body: 0x9c7b57, back: 0x6d543a, cloth: 0x5f6b3a, clothDark: 0x3a4222,
  accent: 0x8a8f5a, eye: 0x1a1a1a, white: 0xffffff, skin: 0xb59a78,
};

const monkeySoldier: CharacterArtDef = {
  id: 'monkey_soldier',
  displayName: '猴兵',
  width: 46,
  height: 62,
  palette: pal(MS_COLS.cloth, MS_COLS.body, MS_COLS.accent, MS_COLS.clothDark),
  clips: stdClips(),
  draw(state, phase) {
    const p = poseFor(state, phase);
    return drawBiped({
      hipY: -21, shoulderY: MS_S, headY: MS_HEAD, headR: MS_HR,
      legLen: 20, legW: 6.6, armLen: 18, armW: 5.4, torsoW: 17, torsoH: 22,
      hipX: 5.5, shoulderX: 5, shadowRx: 15,
      cols: MS_COLS,
      back: (q, c) => tendril(-8, -26, -Math.PI / 2 - 0.55, 20, 6, 2.8, c.back, q.tailSway, 4),
      torso: (q, c) => [
        circle(0, MS_S + q.bob + 6, 9.5, c.cloth),
        rod(-7, -24 + q.bob, 7, -24 + q.bob, 5.2, c.accent),
        box(-5.6, MS_S + q.bob + 2, 11, 5, c.clothDark),
      ],
      head: (hx, hy, _q, c) => monkeyHead(hx, hy, MS_HR, c, c.accent, true),
      weapon: (q, hx, hy, c) => {
        const ang = q.wpn - 0.1;
        const o: ShapeList = [limb(hx, hy, 40, 2.6, ang, 0x8b5a2b)];
        const tx = hx + Math.sin(ang) * 40, ty = hy + Math.cos(ang) * 40;
        o.push(wedge(tx, ty, 5, 8, ang, c.accent));
        o.push(circle(hx - Math.sin(ang) * 4, hy - Math.cos(ang) * 4, 2.6, c.accent));
        return o;
      },
    }, p);
  },
};

// ═════════════════════════ 2. 巫祝（远程 Lv2 · 紫青·尖兜帽·长袍无腿·法球） ═════════════════════════

const SH_S = -40, SH_HEAD = -49, SH_HR = 7.2;
const SH_COLS: Cols = {
  body: 0x6b4fa8, back: 0x3d2b6b, cloth: 0x6b4fa8, clothDark: 0x3a276b,
  accent: 0x59e0d8, eye: 0x59e0d8, white: 0xd8c8ff, skin: 0xb7a0d6,
};

const shaman: CharacterArtDef = {
  id: 'shaman',
  displayName: '巫祝',
  width: 44,
  height: 68,
  palette: pal(SH_COLS.cloth, SH_COLS.back, SH_COLS.accent, 0xb98cf0),
  clips: stdClips(),
  draw(state, phase) {
    const p = poseFor(state, phase);
    return drawBiped({
      hipY: -20, shoulderY: SH_S, headY: SH_HEAD, headR: SH_HR,
      legLen: 18, legW: 6, armLen: 19, armW: 5, torsoW: 20, torsoH: 24,
      hipX: 6, shoulderX: 5.5, shadowRx: 15, noLegs: true,
      cols: SH_COLS,
      back: (q, c) => {
        const o: ShapeList = [];
        // 背后三颗悬浮符文
        for (let i = 0; i < 3; i++) {
          const a = q.tailSway * 0.5 + (i / 3) * TAU;
          o.push(regularPolyM(0 + Math.cos(a) * 15, -44 + q.bob + Math.sin(a) * 7, 2.4, 3, a, c.accent, 0.8));
        }
        return o;
      },
      torso: (q, c) => {
        const sway = Math.sin(q.lean) * 3 + q.legA * 4;
        const top = SH_S + q.bob, bot = -13 + q.bob;
        const o: ShapeList = [
          quad(-5, top, 5, top, 12 + sway, bot, -12 + sway, bot, c.cloth),
          quad(-12 + sway, bot, 12 + sway, bot, 11 + sway, bot - 3.5, -11 + sway, bot - 3.5, c.clothDark),
          box(-6.4, top + 1, 12.8, 7, c.clothDark),
          circle(1, (top + bot) / 2, 2.6, c.accent),
          circle(1, (top + bot) / 2 - 7, 1.7, c.accent, 0.85),
        ];
        return o;
      },
      head: (hx, hy, _q, c) => {
        const o: ShapeList = [
          circle(hx, hy + 1, SH_HR * 0.82, c.skin),
          circle(hx - 2.6, hy, 1.7, c.accent),
          circle(hx + 2.6, hy, 1.7, c.accent),
        ];
        // 高尖兜帽（最显著的剪影特征）
        o.push(quad(hx - SH_HR, hy + 1, hx + SH_HR, hy + 1, hx + 3, hy - 22, hx - 3, hy - 22, c.cloth));
        o.push(wedge(hx, hy - 21, 7.5, 9, Math.PI, c.clothDark));
        o.push(circle(hx, hy - 30, 2.4, c.accent));
        o.push(circle(hx, hy - 30, 4.4, c.accent, 0.28));
        return o;
      },
      weapon: (q, hx, hy, c) => {
        const ang = -0.35 + q.wpn * 0.35;
        const o: ShapeList = [limb(hx, hy, 36, 2.4, ang, 0x5a3f2a)];
        const tx = hx + Math.sin(ang) * 36, ty = hy + Math.cos(ang) * 36;
        o.push(regularPolyM(tx, ty, 5.2, 4, 0.4, c.accent));
        o.push(circle(tx, ty, 2.0, 0xffffff, 0.9));
        o.push(circle(tx - 9, ty - 5, 1.8, c.accent, 0.9));
        o.push(circle(tx + 8, ty - 9, 1.4, c.accent, 0.9));
        return o;
      },
    }, p);
  },
};

/** 正多边形（本地包装，避免与 art/shapes 的同名导入冲突） */
function regularPolyM(cx: number, cy: number, r: number, sides: number, rot: number, color: number, alpha?: number): Shape {
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (Math.PI * 2 * i) / sides;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return { kind: 'poly', points: pts, color, alpha };
}

// ═════════════════════════ 3. 野猪精（近战 Lv3 · 四足低矮·背刺·獠牙） ═════════════════════════

const BO_S = -26;
const BO_COLS: Cols = {
  body: 0x8a4a2b, back: 0x4a2415, cloth: 0x6e3a22, clothDark: 0x3d1d10,
  accent: 0xc23b2b, eye: 0xff4a3a, white: 0xf5ead0, skin: 0xa55c36,
};

function drawBoar(p: Pose): ShapeList {
  const c = BO_COLS;
  const y = p.bob;
  const out: ShapeList = [];
  if (p.prone) {
    out.push(shadow(30, 5, 0.32));
    out.push(ell(-2, -9, 26, 9, c.cloth));
    out.push(ell(20, -10, 11, 8, c.body));
    out.push(wedge(26, -6, 5, 9, Math.PI * 0.92, c.white));
    out.push(limb(8, -4, 14, 5, Math.PI / 2, c.back));
    out.push(circle(21, -11, 2.2, c.eye));
    return out;
  }
  out.push(shadow(30, 6.5, 0.3));
  // 尾
  out.push(...tendril(-24, -30, -Math.PI / 2 - 0.35, 13, 5, 2.6, c.back, p.tailSway, 3));
  // 背刺（两排）
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const bx = -18 + t * 34;
    const by = -35 - Math.sin(t * Math.PI) * 4.5 + y;
    out.push(wedge(bx, by, 8, 10 + Math.sin(t * Math.PI) * 7, Math.PI + (t - 0.5) * 0.5, c.back));
  }
  // 远侧腿
  const legsX = [17, -15];
  const chans: Array<[number, number]> = [[p.legB, p.kneeB], [p.armB, p.kneeB]];
  for (let i = 0; i < 2; i++) {
    const a = chans[i][0] - p.lean * 0.4, L = 17 * chans[i][1];
    out.push(limb(legsX[i], -21 + y, L, 7, a, shade(c.cloth, 0.72)));
  }
  // 躯干
  out.push(ell(0, BO_S + y, 27, 13, c.cloth));
  out.push(ell(-2, BO_S + 4 + y, 20, 8, shade(c.body, 0.95)));
  out.push(rod(-20, BO_S - 9 + y, 18, BO_S - 10 + y, 6, c.back));
  // 近侧腿
  const chans2: Array<[number, number]> = [[p.legA, p.kneeA], [p.armA, p.kneeA]];
  for (let i = 0; i < 2; i++) {
    const a = chans2[i][0] - p.lean * 0.4, L = 17 * chans2[i][1];
    out.push(limb(legsX[i], -21 + y, L, 7, a, c.body));
    out.push(foot(legsX[i] + Math.sin(a) * L, -21 + y + Math.cos(a) * L, 8, 4.5, shade(c.back, 1.1)));
  }
  // 头（攻击时前刺）
  const lunge = p.k * (p.prone ? 0 : 12);
  const hx = 24 + lunge, hy = -25 + y + p.lean * 10;
  out.push(circle(hx + 2, hy - 9, 4, c.body));
  out.push(wedge(hx + 3, hy - 8, 6, 8, Math.PI - 0.4, c.clothDark));  // 耳
  out.push(circle(hx, hy, 11, c.body));
  out.push(ell(hx + 8, hy + 4, 8, 6, c.skin));
  out.push(ell(hx + 13, hy + 5, 3.5, 3, 0x3a1c10));
  out.push(circle(hx + 3, hy - 3, 2.2, c.eye));
  // 獠牙
  out.push(wedge(hx + 10, hy + 5, 4, 9, Math.PI * 1.15, c.white));
  out.push(wedge(hx + 13, hy + 4, 3.5, 7, Math.PI * 1.3, c.white));
  return out;
}

const boarDemon: CharacterArtDef = {
  id: 'boar_demon',
  displayName: '野猪精',
  width: 70,
  height: 56,
  palette: pal(BO_COLS.cloth, BO_COLS.body, BO_COLS.accent, BO_COLS.back),
  clips: stdClips(),
  draw(state, phase) { return drawBoar(poseFor(state, phase)); },
};

// ═════════════════════════ 4. 蝙蝠妖（远程 Lv3 · 宽膜翼·尖耳·獠牙） ═════════════════════════

const BA_COLS: Cols = {
  body: 0x7b3fa0, back: 0x4a2166, cloth: 0xb06ad6, clothDark: 0x3a1a52,
  accent: 0xff5fa2, eye: 0xffd257, white: 0xf5eaff, skin: 0x8a4fb0,
};

function batWing(side: 1 | -1, ax: number, ay: number, ang: number, span: number, fill: number, bone: number): ShapeList {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const T = (x: number, y: number): number[] => [ax + side * (x * ca - y * sa), ay + (x * sa + y * ca)];
  const raw: number[][] = [
    [0, 0], [span * 0.42, -8], [span * 0.78, -6], [span, -1],
    [span * 0.74, 8], [span * 0.58, 4], [span * 0.44, 12], [span * 0.28, 7], [span * 0.14, 14], [0, 10],
  ];
  const pts: number[] = [];
  for (const r of raw) { const q = T(r[0], r[1]); pts.push(q[0], q[1]); }
  const o: ShapeList = [{ kind: 'poly', points: pts, color: fill }];
  const tip = T(span, -1), mid = T(span * 0.78, -5);
  o.push(rod(ax, ay, tip[0], tip[1], 2.4, bone));
  o.push(rod(ax, ay, mid[0], mid[1], 1.8, bone));
  return o;
}

function drawBat(p: Pose): ShapeList {
  const c = BA_COLS;
  const y = p.bob + (p.prone ? 0 : 0) - 12; // 悬空基线
  const out: ShapeList = [];
  if (p.prone) {
    // 倒地侧躺：保留膜翼与尖耳，避免退化成椭圆而不可辨识
    out.push(shadow(26, 5, 0.32));
    out.push(ell(-4, -7, 14, 6.5, c.body));
    out.push(...batWing(-1, -6, -9, 0.35, 20, shade(c.cloth, 0.85), c.clothDark));
    out.push(...batWing(1, -2, -4, -0.55, 15, shade(c.cloth, 0.7), c.clothDark));
    out.push(circle(12, -8, 6.5, c.body));
    for (const dx of [-2, 2]) out.push(wedge(12 + dx, -13, 2.6, 6, Math.PI, shade(c.cloth, 0.9)));
    out.push(wedge(17, -7, 4, 6, Math.PI * 0.85, c.white));
    out.push(circle(11, -8, 1.5, c.eye));
    return out;
  }
  out.push(shadow(15, 4, 0.26));
  const ang = p.wing * 0.9 - 0.15;
  // 翼（先画，位于身后）
  out.push(...batWing(-1, -4, -40 + y, ang + 0.15, 30, shade(c.cloth, 0.82), c.clothDark));
  // 腿爪（悬垂）
  out.push(limb(-3, -24 + y, 9, 2.4, 0.25 + p.legA * 0.3, c.back));
  out.push(limb(3, -24 + y, 9, 2.4, -0.25 + p.legB * 0.3, c.back));
  // 身体
  out.push(ell(0, -34 + y, 9, 13, c.body));
  out.push(ell(0, -31 + y, 6, 8, shade(c.body, 1.18)));
  out.push(...batWing(1, 4, -40 + y, -ang - 0.15, 30, c.cloth, c.clothDark));
  // 头
  const hx = 0, hy = -50 + y + p.headTilt * 2;
  out.push(wedge(hx - 5, hy + 1, 5, 12, Math.PI + 0.32, c.body));  // 耳
  out.push(wedge(hx + 5, hy + 1, 5, 12, Math.PI - 0.32, c.body));
  out.push(wedge(hx - 5, hy, 2.6, 8, Math.PI + 0.32, c.accent, 0.85));
  out.push(wedge(hx + 5, hy, 2.6, 8, Math.PI - 0.32, c.accent, 0.85));
  out.push(circle(hx, hy, 8, c.body));
  out.push(circle(hx - 2.8, hy - 1, 1.8, c.eye));
  out.push(circle(hx + 2.8, hy - 1, 1.8, c.eye));
  out.push(wedge(hx - 2.4, hy + 4, 2, 4, Math.PI, c.white));   // 獠牙
  out.push(wedge(hx + 2.4, hy + 4, 2, 4, Math.PI, c.white));
  // 攻击：蓄/放魔法弹
  if (p.k > 0.2) {
    const r = 2 + p.k * 6;
    out.push(circle(hx, hy + 15, r, c.accent, 0.9));
    out.push(circle(hx, hy + 15, r * 1.7, c.accent, 0.28));
  }
  return out;
}

const batDemon: CharacterArtDef = {
  id: 'bat_demon',
  displayName: '蝙蝠妖',
  width: 66,
  height: 64,
  palette: pal(BA_COLS.cloth, BA_COLS.body, BA_COLS.accent, BA_COLS.back),
  clips: stdClips(),
  draw(state, phase) { return drawBat(poseFor(state, phase)); },
};

// ═════════════════════════ 5. 石甲卫（近战 Lv4 · 壮硕方块·头盔护肩·巨锤石盾） ═════════════════════════

const SG_HIP = -28, SG_S = -54, SG_HEAD = -64, SG_HR = 9;
const SG_COLS: Cols = {
  body: 0x8a8f96, back: 0x565b62, cloth: 0x9aa0a7, clothDark: 0x4d525a,
  accent: 0x6fd4c8, eye: 0x9ff2e8, white: 0xffffff, skin: 0xb9bec4,
};

const stoneGuard: CharacterArtDef = {
  id: 'stone_guard',
  displayName: '石甲卫',
  width: 52,
  height: 84,
  palette: pal(SG_COLS.cloth, SG_COLS.back, SG_COLS.accent, SG_COLS.clothDark),
  clips: stdClips(),
  draw(state, phase) {
    const p = poseFor(state, phase);
    return drawBiped({
      hipY: SG_HIP, shoulderY: SG_S, headY: SG_HEAD, headR: SG_HR,
      legLen: 26, legW: 11, armLen: 24, armW: 9, torsoW: 31, torsoH: 28,
      hipX: 8, shoulderX: 10, leanShift: 2.5, shadowRx: 24,
      cols: SG_COLS,
      torso: (q, c) => {
        const yo = q.bob;
        const o: ShapeList = [
          rotRect(0, -41 + yo, 31, 28, q.lean, c.cloth),
          box(-11, -47 + yo, 22, 5, c.clothDark),
        ];
        // 胸口符文
        o.push(regularPolyM(0, -41 + yo, 4.2, 6, 0, c.accent, 0.95));
        o.push(regularPolyM(0, -41 + yo, 2.0, 6, Math.PI / 6, 0xffffff, 0.8));
        o.push(rod(-13, -30 + yo, 13, -30 + yo, 4, c.back));
        return o;
      },
      head: (hx, hy, _q, c) => [
        box(hx - 9, hy - 8, 18, 16, c.clothDark),
        quad(hx - 9, hy - 8, hx + 9, hy - 8, hx + 7, hy - 14, hx - 7, hy - 14, c.cloth),
        box(hx - 8, hy - 3, 16, 4, 0x23262b),
        box(hx - 6, hy - 2.6, 5, 3.2, c.accent),
        box(hx + 1, hy - 2.6, 5, 3.2, c.accent),
        rod(hx - 11, hy - 7, hx + 11, hy - 7, 3, c.back),
        wedge(hx, hy - 14, 6, 6, Math.PI, c.clothDark),
      ],
      arm: (side, jx, jy, q, c) => {
        const angA = side > 0 ? q.armA - q.lean : q.armB - q.lean;
        const o: ShapeList = [
          // 巨型护肩（剪影关键）
          rotRect(jx + side * 4, jy + 2, 17, 14, side * 0.18 + q.lean * side, side > 0 ? c.cloth : shade(c.cloth, 0.85)),
          wedge(jx + side * 6, jy - 3, 8, 9, Math.PI + side * 0.35, c.back),
        ];
        o.push(limb(jx, jy + 4, 24, 9, angA, side > 0 ? c.body : shade(c.body, 0.8)));
        const hx2 = jx + Math.sin(angA) * 24, hy2 = jy + 4 + Math.cos(angA) * 24;
        if (side < 0) {
          // 背手：塔盾
          o.push(rotRect(hx2 - 3, hy2 + 2, 15, 26, 0.05, c.clothDark));
          o.push(rotRect(hx2 - 3, hy2 + 2, 9, 18, 0.05, c.cloth));
          o.push(regularPolyM(hx2 - 3, hy2 + 2, 3.4, 6, 0, c.accent, 0.9));
        } else {
          o.push(circle(hx2, hy2, 5, c.back));
        }
        return o;
      },
      weapon: (q, hx, hy, c) => {
        const ang = q.wpn + 0.15;
        const o: ShapeList = [limb(hx, hy, 26, 3.6, ang, 0x4a4038)];
        const bx = hx + Math.sin(ang) * 26, by = hy + Math.cos(ang) * 26;
        o.push(rotRect(bx + Math.sin(ang) * 6, by + Math.cos(ang) * 6, 20, 13, -ang, c.cloth));
        o.push(rotRect(bx + Math.sin(ang) * 6, by + Math.cos(ang) * 6, 13, 20, -ang, c.clothDark));
        o.push(rod(bx, by, bx + Math.sin(ang) * 14, by + Math.cos(ang) * 14, 3, c.back));
        return o;
      },
    }, p);
  },
};

// ═════════════════════════ 6. 木魅狼（近战 Lv4 · 四足长身·尖耳·蓬尾·青光眼） ═════════════════════════

const WW_COLS: Cols = {
  body: 0x7a5a34, back: 0x4d3820, cloth: 0x8a6a40, clothDark: 0x3a2a16,
  accent: 0x9cff6a, eye: 0x9cff6a, white: 0xf0e2b8, skin: 0x5f8f3e,
};

function drawWolf(p: Pose): ShapeList {
  const c = WW_COLS;
  const y = p.bob;
  const out: ShapeList = [];
  if (p.prone) {
    out.push(shadow(30, 5, 0.32));
    out.push(ell(-2, -9, 24, 8, c.cloth));
    out.push(ell(19, -11, 9, 7, c.body));
    out.push(wedge(24, -7, 4, 8, Math.PI * 0.9, c.white));
    out.push(...tendril(-24, -9, Math.PI, 16, 6, 3.4, c.back, 1, 3));
    return out;
  }
  out.push(shadow(28, 5.5, 0.3));
  // 蓬尾（高举、摆动 → 剪影）
  out.push(...tendril(-22, -30, -Math.PI / 2 - 0.7, 20, 7, 4.6, c.back, p.tailSway, 5));
  out.push(circle(-22 - 4, -49, 4.8, shade(c.back, 1.15)));
  // 远侧腿
  for (const [lx, a] of [[15, p.legB], [-13, p.armB]] as Array<[number, number]>) {
    const al = a - p.lean * 0.4, L = 17 * p.kneeB;
    out.push(limb(lx, -20 + y, L, 5.4, al, shade(c.cloth, 0.72)));
  }
  // 躯干 + 木质背脊
  out.push(ell(0, -26 + y, 24, 11, c.cloth));
  out.push(ell(-1, -22 + y, 18, 6, shade(c.body, 0.9)));
  out.push(rod(-18, -35 + y, 16, -36 + y, 5, c.back));
  out.push(...tendril(-6, -35 + y, Math.PI / 2 + 0.35, 10, 4, 2.2, c.skin, p.tailSway * 0.5, 2));
  // 近侧腿
  for (const [lx, a] of [[15, p.legA], [-13, p.armA]] as Array<[number, number]>) {
    const al = a - p.lean * 0.4, L = 17 * p.kneeA;
    out.push(limb(lx, -20 + y, L, 5.4, al, c.body));
    out.push(foot(lx + Math.sin(al) * L, -20 + y + Math.cos(al) * L, 7, 4, c.back));
  }
  // 颈 + 头
  const lunge = p.k * 9;
  const hx = 21 + lunge, hy = -30 + y + p.lean * 8;
  out.push(rod(14, -30 + y, hx - 4, hy, 9, c.cloth));
  out.push(circle(hx, hy, 8.5, c.body));
  out.push(ell(hx + 7, hy + 2.5, 7.5, 4.6, c.cloth));
  out.push(circle(hx + 12, hy + 2, 2.6, c.clothDark));   // 鼻
  out.push(circle(hx + 2.4, hy - 2.4, 2.0, c.eye));
  out.push(circle(hx - 1.5, hy - 2.4, 2.0, c.eye));
  // 尖耳
  out.push(wedge(hx - 4, hy - 5, 5, 11, Math.PI + 0.22, c.body));
  out.push(wedge(hx + 2, hy - 5, 5, 11, Math.PI - 0.22, c.body));
  // 张口獠牙（攻击时）
  if (p.k > 0.35) {
    out.push(wedge(hx + 8, hy + 3.4, 3, 6, Math.PI * 1.05, c.white));
    out.push(wedge(hx + 10, hy + 3.4, 3, 6, Math.PI * 0.95, c.white));
  }
  return out;
}

const woodWolf: CharacterArtDef = {
  id: 'wood_wolf',
  displayName: '木魅狼',
  width: 64,
  height: 54,
  palette: pal(WW_COLS.cloth, WW_COLS.body, WW_COLS.accent, WW_COLS.back),
  clips: stdClips(),
  draw(state, phase) { return drawWolf(poseFor(state, phase)); },
};

// ═════════════════════════ 7. 火鸦（远程 Lv5 · 鸟形·尖喙·火冠火尾·紫羽） ═════════════════════════

const FC_COLS: Cols = {
  body: 0x5a2d7a, back: 0x35194d, cloth: 0x7d3fa8, clothDark: 0x2a1240,
  accent: 0xff8a2b, eye: 0xffe08a, white: 0xfff2c8, skin: 0xffd257,
};

function crowWing(side: 1 | -1, ax: number, ay: number, ang: number, span: number, fill: number, feather: number): ShapeList {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const T = (x: number, y: number): number[] => [ax + side * (x * ca - y * sa), ay + (x * sa + y * ca)];
  const o: ShapeList = [];
  // 主翼面
  const raw: number[][] = [[0, 0], [span * 0.5, -9], [span, -4], [span * 0.82, 9], [span * 0.5, 6], [span * 0.2, 12], [0, 7]];
  const pts: number[] = [];
  for (const r of raw) { const q = T(r[0], r[1]); pts.push(q[0], q[1]); }
  o.push({ kind: 'poly', points: pts, color: fill });
  // 飞羽（3 根，向外展开）
  for (let i = 0; i < 3; i++) {
    const x = span * (0.55 + i * 0.18), y = 2 + i * 5;
    const q = T(x, y), t2 = T(x + span * 0.12, y + 9);
    o.push(rod(q[0], q[1], t2[0], t2[1], 3.4 - i * 0.6, feather));
  }
  const tip = T(span, -4);
  o.push(rod(ax, ay, tip[0], tip[1], 2.6, feather));
  return o;
}

function drawCrow(p: Pose): ShapeList {
  const c = FC_COLS;
  const y = p.bob - 10;
  const out: ShapeList = [];
  if (p.prone) {
    // 倒地侧躺：保留火尾扇与尖喙，避免退化成椭圆而不可辨识
    out.push(shadow(26, 5, 0.32));
    out.push(ell(-6, -8, 13, 6.5, c.body));
    for (let i = -1; i <= 1; i++) {
      out.push(wedge(-16, -9 + i * 3, 5, 17 + (i === 0 ? 5 : 0), Math.PI + i * 0.22, i === 0 ? c.skin : c.accent));
    }
    out.push(...crowWing(1, 0, -6, 0.5, 19, shade(c.cloth, 0.85), shade(c.accent, 0.8)));
    out.push(circle(11, -9, 6.5, c.body));
    out.push(wedge(15, -9, 4.5, 10, Math.PI / 2 + 0.05, c.skin));   // 尖喙
    out.push(circle(10, -10, 1.7, c.eye));
    out.push(wedge(8, -15, 3, 4.5, Math.PI, c.white));
    return out;
  }
  out.push(shadow(14, 4, 0.24));
  const ang = p.wing * 0.85;
  // 尾羽（火焰扇 → 独特剪影）
  for (let i = -1; i <= 1; i++) {
    const a = Math.PI - 0.45 + i * 0.28;
    out.push(wedge(-8, -30 + y, 6, 22 + Math.abs(i) * -4, a, i === 0 ? c.skin : c.accent));
  }
  out.push(...crowWing(-1, -4, -40 + y, ang + 0.2, 30, shade(c.cloth, 0.8), shade(c.accent, 0.85)));
  // 鸟腿（收起）
  out.push(limb(-3, -22 + y, 10, 2.4, 0.2, c.skin));
  out.push(limb(3, -22 + y, 10, 2.4, -0.2, c.skin));
  out.push(wedge(-4, -13 + y, 4, 4, Math.PI / 2, c.accent));
  out.push(wedge(2, -13 + y, 4, 4, Math.PI / 2, c.accent));
  // 身体
  out.push(ell(0, -34 + y, 9.5, 13, c.body));
  out.push(ell(0, -31 + y, 6, 8, shade(c.body, 1.2)));
  out.push(...crowWing(1, 4, -40 + y, -ang - 0.2, 30, c.cloth, c.accent));
  // 头 + 尖喙 + 火冠
  const hx = 0, hy = -50 + y + p.headTilt * 2;
  out.push(circle(hx, hy, 8, c.body));
  out.push(wedge(hx + 4, hy, 5, 12, Math.PI / 2 + 0.05, c.skin));       // 喙
  out.push(wedge(hx + 4, hy - 1.5, 4, 9, Math.PI / 2 + 0.05, shade(c.skin, 0.75)));
  out.push(circle(hx + 2, hy - 1.5, 1.9, c.eye));
  out.push(wedge(hx - 2, hy - 6, 3.5, 4, Math.PI, c.white));
  // 火冠
  for (let i = -1; i <= 1; i++) {
    out.push(wedge(hx + i * 4.5, hy - 6, 4, 9 + (i === 0 ? 6 : 0), Math.PI + i * 0.25, i === 0 ? c.skin : c.accent));
  }
  // 施法蓄火
  if (p.k > 0.2) {
    out.push(circle(hx + 12, hy, 2 + p.k * 5, c.accent, 0.9));
    out.push(circle(hx + 12, hy, (2 + p.k * 5) * 1.8, c.skin, 0.3));
  }
  return out;
}

const fireCrow: CharacterArtDef = {
  id: 'fire_crow',
  displayName: '火鸦',
  width: 68,
  height: 62,
  palette: pal(FC_COLS.cloth, FC_COLS.body, FC_COLS.accent, FC_COLS.back),
  clips: stdClips(),
  draw(state, phase) { return drawCrow(poseFor(state, phase)); },
};

// ═════════════════════════ 8. 藤蔓精（远程 Lv6 · 球茎头·放射藤须·花冠·根足） ═════════════════════════

const VS_COLS: Cols = {
  body: 0x3f8f5a, back: 0x255a38, cloth: 0x5fb06a, clothDark: 0x1e4a2e,
  accent: 0x59e0d8, eye: 0x2a1a0a, white: 0xd8f0c0, skin: 0xc06ad6,
};

const vineSpirit: CharacterArtDef = {
  id: 'vine_spirit',
  displayName: '藤蔓精',
  width: 58,
  height: 66,
  palette: pal(VS_COLS.cloth, VS_COLS.body, VS_COLS.skin, VS_COLS.back),
  clips: stdClips(),
  draw(state, phase) {
    const p = poseFor(state, phase);
    const c = VS_COLS;
    const y = p.bob;
    const out: ShapeList = [];
    if (p.prone) {
      // 倒地侧躺：保留放射藤须与花冠，避免退化成椭圆而不可辨识
      out.push(shadow(26, 5, 0.32));
      out.push(ell(-3, -9, 12, 7.5, c.cloth));
      for (let i = 0; i < 4; i++) {
        const a = (i - 1.5) * 0.5;
        out.push(...tendril(6, -12, a, 15, 5, 3.2, i % 2 ? c.body : c.back, i, 3));
      }
      out.push(circle(12, -10, 8, c.body));
      out.push(circle(9, -13, 3.4, c.skin));
      out.push(circle(7, -14, 1.6, c.skin));
      out.push(circle(15, -12, 2.2, c.eye));
      out.push(...tendril(-14, -8, Math.PI * 0.95, 12, 4, 2.4, c.back, 2, 2));
      return out;
    }
    out.push(shadow(20, 5, 0.3));
    // 放射藤须（头部鬃毛 → 剪影）：粗、带叶，向外炸开
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.42;
      const seg = tendril(0, -50 + y, a, 24 - Math.abs(i - 2) * 4, 6, 3.4, i % 2 ? c.body : c.back, p.tailSway + i, 4);
      out.push(...seg);
      // 叶
      const tip = seg[seg.length - 1];
      if (tip.kind === 'circle') out.push(ell(tip.x, tip.y, 4.2, 2.2, c.cloth, 0.95));
    }
    // 根足（细）
    for (const [lx, a] of [[5, p.legB], [-5, p.armB]] as Array<[number, number]>) {
      const al = a - p.lean * 0.5;
      out.push(limb(lx, -22 + y, 15 * p.kneeB, 3.6, al, shade(c.body, 0.76)));
    }
    // 球茎躯干（分节藤环 → 不像软泥怪）
    out.push(ell(0, -33 + y, 13, 15, c.body));
    for (let i = 0; i < 3; i++) {
      out.push(rod(-12, -41 + i * 8 + y, 12, -40 + i * 8 + y, 2.4, c.back, 0.9));
    }
    out.push(ell(0, -31 + y, 9, 10, shade(c.cloth, 1.02)));
    out.push(regularPolyM(0, -33 + y, 5, 6, 0.5, c.accent, 0.55));
    // 藤臂（粗、带叶）
    const arm = (side: number, jx: number, jy: number, angA: number) => {
      const o: ShapeList = [];
      const ex = jx + Math.sin(angA) * 20, ey = jy + Math.cos(angA) * 20;
      o.push(rod(jx, jy, ex, ey, 4.2, side > 0 ? c.cloth : shade(c.cloth, 0.8)));
      o.push(ell(ex, ey, 5.5, 3.4, c.cloth, 0.95));
      o.push(ell(ex + side * 5, ey - 4, 4, 2.4, c.body));            // 叶
      o.push(rod(ex, ey, ex + side * 6, ey - 6, 1.8, c.accent));
      return o;
    };
    out.push(...arm(-1, -6, -39 + y, p.armB - p.lean));
    // 近侧根足
    for (const [lx, a] of [[5, p.legA], [-5, p.armA]] as Array<[number, number]>) {
      const al = a - p.lean * 0.5;
      out.push(limb(lx, -22 + y, 15 * p.kneeA, 3.6, al, c.cloth));
    }
    out.push(...arm(1, 6, -39 + y, p.armA - p.lean));
    // 头（球茎 + 花冠）
    const hx = p.headTilt * 2, hy = -50 + y + p.headTilt * 1.5;
    out.push(circle(hx, hy, 12, c.body));
    out.push(ell(hx, hy + 2, 9, 8.5, shade(c.cloth, 1.06)));
    out.push(circle(hx - 3, hy, 2.6, c.eye));
    out.push(circle(hx + 3, hy, 2.6, c.eye));
    out.push(circle(hx - 3.6, hy - 0.8, 0.9, c.white, 0.9));
    out.push(circle(hx + 2.4, hy - 0.8, 0.9, c.white, 0.9));
    out.push(ell(hx, hy + 6, 3.4, 1.8, 0x1e3a24));   // 嘴（去掉"萌系"观感）
    // 花冠（紫花 + 青光核心）
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + p.tailSway * 0.3;
      out.push(ell(hx + Math.cos(a) * 5, hy - 11 + Math.sin(a) * 4, 4.2, 2.8, c.skin));
    }
    out.push(circle(hx, hy - 11, 3, c.accent));
    // 攻击：藤须前刺（从体侧伸出，避免盖住头部）
    if (p.k > 0.3) {
      const e = (p.k - 0.3) / 0.7;
      out.push(...tendril(hx + 11, hy + 3, Math.PI / 2 - 0.15, 10 + e * 16, 6, 2.4, c.body, p.k * 3, 2.5));
      out.push(circle(hx + 14 + e * 16, hy + 4, 1.5 + e * 2.5, c.accent, 0.85));
    }
    return out;
  },
};

// ═════════════════════════ 9. 岩臂猿（精英近战 Lv6 · 巨臂驼背·岩板·橙眼） ═════════════════════════

const RA_HIP = -30, RA_S = -58, RA_HEAD = -66, RA_HR = 10;
const RA_COLS: Cols = {
  body: 0x8a7256, back: 0x4c3d2a, cloth: 0x6b6f5a, clothDark: 0x3f4438,
  accent: 0xff8a3a, eye: 0xffb347, white: 0xf0e6d2, skin: 0x9c8460,
};

const rockApe: CharacterArtDef = {
  id: 'rock_ape',
  displayName: '岩臂猿',
  width: 68,
  height: 94,
  palette: pal(RA_COLS.cloth, RA_COLS.body, RA_COLS.accent, RA_COLS.back),
  clips: stdClips(),
  draw(state, phase) {
    const p = poseFor(state, phase);
    return drawBiped({
      hipY: RA_HIP, shoulderY: RA_S, headY: RA_HEAD, headR: RA_HR,
      legLen: 23, legW: 13, armLen: 46, armW: 16, torsoW: 35, torsoH: 31,
      hipX: 9, shoulderX: 13, leanShift: 3, shadowRx: 28,
      cols: RA_COLS,
      back: (q, c) => {
        const yo = q.bob;
        const o: ShapeList = [];
        // 背部岩峰
        o.push(wedge(-6, -78 + yo, 16, 15, Math.PI, c.cloth));
        o.push(wedge(9, -76 + yo, 13, 11, Math.PI - 0.15, c.clothDark));
        o.push(wedge(-18, -74 + yo, 11, 9, Math.PI + 0.2, c.clothDark));
        return o;
      },
      torso: (q, c) => {
        const yo = q.bob;
        return [
          rotRect(0, -43 + yo, 35, 31, q.lean, c.body),
          rotRect(0, -56 + yo, 33, 12, q.lean, c.cloth),   // 岩质胸甲
          rotRect(0, -31 + yo, 30, 7, q.lean, c.back),
          regularPolyM(0, -45 + yo, 3.6, 6, 0.4, c.accent, 0.85),
        ];
      },
      head: (hx, hy, _q, c) => [
        ell(hx, hy + 1, 11, 9, c.body),
        ell(hx, hy - 1, 8.5, 5, shade(c.skin, 1.05)),
        rod(hx - 9, hy - 4, hx + 9, hy - 4, 4.5, c.back),  // 眉骨
        circle(hx - 3.4, hy - 2, 2.2, c.eye),
        circle(hx + 3.4, hy - 2, 2.2, c.eye),
        box(hx - 5, hy + 4, 10, 3.5, c.clothDark),
        wedge(hx - 8, hy - 6, 6, 8, Math.PI + 0.3, c.clothDark),
        wedge(hx + 8, hy - 6, 6, 8, Math.PI - 0.3, c.clothDark),
      ],
      arm: (side, jx, jy, q, c) => {
        const angA = side > 0 ? q.armA - q.lean : q.armB - q.lean;
        const o: ShapeList = [
          rotRect(jx + side * 2, jy, 16, 13, side * 0.1, c.cloth),      // 肩岩板
          wedge(jx + side * 5, jy - 5, 8, 8, Math.PI + side * 0.2, c.clothDark),
        ];
        const ex = jx + Math.sin(angA) * 30, ey = jy + Math.cos(angA) * 30;
        o.push(rod(jx, jy + 3, ex, ey, 15, side > 0 ? c.body : shade(c.body, 0.82)));   // 粗臂
        o.push(rod(ex, ey - 4, ex, ey + 6, 13, c.back));                                 // 前臂岩甲
        o.push(circle(ex, ey + 9, 7.5, side > 0 ? c.cloth : shade(c.cloth, 0.82)));      // 拳
        o.push(...tendril(ex - side * 3, ey + 10, Math.PI * 0.5 + side * 0.4, 9, 4, 2, c.back, q.tailSway * 0.4, 2));
        return o;
      },
      weapon: (q, hx, hy, c) => {
        // 巨大双拳的冲击波（攻击时）
        if (q.k > 0.4) {
          return [
            circle(hx, hy + 10, 4 + q.k * 7, c.accent, 0.7),
            ell(hx, -4, 14 + q.k * 16, 5 * q.k, c.accent, 0.35),
          ];
        }
        return [];
      },
    }, p);
  },
};

// ═════════════════════════ 10. 虾兵（BT-5 龙宫·近战 · 红虾弓身·长须·蜷尾·三叉戟） ═════════════════════════

const SS_COLS: Cols = {
  body: 0xc4522e, back: 0x8a3220, cloth: 0xa84426, clothDark: 0x6e2818,
  accent: 0xb9bec4, eye: 0x141414, white: 0xf0e8d8, skin: 0xe07a4a,
};

function drawShrimp(p: Pose): ShapeList {
  const c = SS_COLS;
  const y = p.bob;
  const out: ShapeList = [];
  if (p.prone) {
    // 侧躺蜷曲：保留额剑 / 尾扇 / 长须特征
    out.push(shadow(26, 5, 0.32));
    out.push(ell(-2, -8, 18, 8, c.cloth));
    out.push(circle(12, -11, 8, c.body));
    out.push(wedge(19, -13, 4, 8, Math.PI / 2 + 0.35, c.skin));
    for (let i = -1; i <= 1; i++) out.push(wedge(-16, -7 + i * 2.5, 4.5, 9, -Math.PI / 2 + 0.35 + i * 0.35, c.body));
    out.push(...tendril(14, -14, Math.PI * 0.78, 18, 5, 1.8, c.skin, 1, 3));
    out.push(circle(13, -12, 1.6, c.eye));
    return out;
  }
  out.push(shadow(19, 5, 0.28));
  // 长须（两根，向后上方飘 → 最强剪影）
  out.push(...tendril(12, -34 + y, -Math.PI / 2 - 0.5, 26, 7, 1.8, c.skin, p.tailSway, 5));
  out.push(...tendril(10, -32 + y, -Math.PI / 2 - 0.85, 22, 6, 1.6, c.back, p.tailSway + 1.4, 4));
  // 蜷曲分节腹部（从头胸向后下卷 → 虾身曲线）
  const segs: Array<[number, number, number]> = [
    [4, -28, 8.6], [-4, -27, 8.2], [-11, -25, 7.6], [-16, -20, 7], [-19, -14, 6.2], [-18, -9, 5.4],
  ];
  for (let i = 0; i < segs.length; i++) {
    const [sx, sy, sr] = segs[i];
    out.push(circle(sx, sy + y, sr, i % 2 ? shade(c.body, 0.92) : c.body));
    if (i >= 3) out.push(limb(sx, sy + 3 + y, 5, 1.8, Math.PI / 2 + 0.3, c.back));
  }
  // 尾扇（蜷曲末端）
  for (let i = -1; i <= 1; i++) {
    out.push(wedge(-17, -6 + y + i * 0.5, 4.6, 9 + (i === 0 ? 3 : 0), -Math.PI / 2 + 0.35 + i * 0.32, i === 0 ? c.skin : c.body));
  }
  // 步足（细，胸下）
  for (const [lx, la] of [[6, p.legB * 0.5], [1, p.legA * 0.5], [-4, p.legB * 0.5]] as Array<[number, number]>) {
    out.push(limb(lx, -24 + y, 13, 2.2, Math.PI / 2 - 0.42 + la, shade(c.body, 0.7)));
  }
  // 头胸甲 + 额剑（上前方刺出）
  out.push(ell(8, -30 + y, 11, 9.5, c.cloth));
  out.push(ell(8, -27 + y, 8, 6, shade(c.body, 1.08)));
  out.push(wedge(14, -35 + y, 5, 11, Math.PI / 2 + 0.4, c.skin));
  // 眼柄 + 眼
  out.push(rod(13, -36 + y, 15, -40 + y, 1.6, c.back));
  out.push(rod(16, -35 + y, 19, -38 + y, 1.6, c.back));
  out.push(circle(15, -41 + y, 2.2, c.white));
  out.push(circle(19.5, -39 + y, 2.2, c.white));
  out.push(circle(15, -41 + y, 1.1, c.eye));
  out.push(circle(19.5, -39 + y, 1.1, c.eye));
  // 持叉小螯臂 + 三叉戟
  const armA2 = p.armA - p.lean;
  const hx2 = 14 + Math.sin(armA2) * 10, hy2 = -28 + y + Math.cos(armA2) * 10;
  out.push(limb(13, -28 + y, 10, 3, armA2, c.body));
  out.push(circle(hx2, hy2, 2.8, c.skin));
  const wang = p.wpn + 0.25;
  out.push(limb(hx2, hy2, 22, 2, wang, c.accent));
  const tx2 = hx2 + Math.sin(wang) * 22, ty2 = hy2 + Math.cos(wang) * 22;
  for (let i = -1; i <= 1; i++) {
    out.push(wedge(tx2, ty2, 2.2, 6 - Math.abs(i) * 1.5, wang + i * 0.42, c.accent));
  }
  return out;
}

const shrimpSoldier: CharacterArtDef = {
  id: 'shrimp_soldier',
  displayName: '虾兵',
  width: 56,
  height: 54,
  palette: pal(SS_COLS.cloth, SS_COLS.body, SS_COLS.accent, SS_COLS.back),
  clips: stdClips(),
  draw(state, phase) { return drawShrimp(poseFor(state, phase)); },
};

// ═════════════════════════ 11. 蟹将（BT-5 龙宫·近战 · 宽扁蟹壳·双螯一大一小·横行步态） ═════════════════════════

const CG_COLS: Cols = {
  body: 0xb0402a, back: 0x74271a, cloth: 0xb0402a, clothDark: 0x5e1e12,
  accent: 0xd89058, eye: 0x181818, white: 0xf2e2d0, skin: 0xd86038,
};

function crabClaw(hx: number, hy: number, size: number, open: number, color: number, dark: number): ShapeList {
  // 螯：掌 + 固定颚 + 活动颚（open=张口幅度）
  const o: ShapeList = [circle(hx, hy, size * 0.55, color)];
  o.push(wedge(hx, hy, size * 0.62, size * 1.5, Math.PI / 2 + 0.55, color));
  o.push(wedge(hx, hy, size * 0.5, size * 1.3, Math.PI / 2 - 0.15 - open * 0.7, dark));
  return o;
}

function drawCrab(p: Pose): ShapeList {
  const c = CG_COLS;
  const y = p.bob;
  const out: ShapeList = [];
  const snap = p.k < 0.5 ? Math.min(1, p.k * 2.4) : Math.max(0, 1 - (p.k - 0.5) * 3); // 螯开合
  if (p.prone) {
    // 翻壳朝天（蟹的标志性倒地）
    out.push(shadow(30, 6, 0.32));
    out.push(ell(0, -13, 24, 9, shade(c.cloth, 0.85)));
    out.push(ell(0, -16, 19, 6, c.accent));
    for (const [lx, s] of [[-15, -1], [-6, -1], [6, 1], [15, 1]] as Array<[number, number]>) {
      out.push(limb(lx, -14, 12, 3, -Math.PI / 2 + s * 0.55 + Math.sin(p.tailSway + lx) * 0.25, c.body));
    }
    out.push(rod(-6, -21, -8, -26, 2, c.body));
    out.push(rod(6, -21, 8, -26, 2, c.body));
    out.push(circle(-8, -27, 2.6, c.white));
    out.push(circle(8, -27, 2.6, c.white));
    out.push(circle(-8, -27, 1.3, c.eye));
    out.push(circle(8, -27, 1.3, c.eye));
    out.push(limb(20, -18, 10, 4, -Math.PI / 2 - 0.35, c.skin));
    out.push(...crabClaw(28, -25, 9, 0.5, c.skin, shade(c.skin, 0.8)));
    return out;
  }
  out.push(shadow(28, 6, 0.3));
  // 远侧腿（三根，横行外撇）
  for (const [lx, la] of [[-12, -0.5], [-19, -0.85], [-24, -1.25]] as Array<[number, number]>) {
    const a = la + p.legB * 0.18;
    out.push(limb(lx, -17 + y, 17 * p.kneeB, 3.2, a, shade(c.body, 0.72)));
  }
  // 远侧小螯（后列，暗色）
  {
    const a = p.armB - p.lean;
    const jx = 8, jy = -22 + y;
    const ex = jx + Math.sin(a) * 9, ey = jy + Math.cos(a) * 9;
    out.push(limb(jx, jy, 9, 3.4, a, shade(c.body, 0.75)));
    out.push(...crabClaw(ex, ey, 7, snap * 0.6, shade(c.skin, 0.82), shade(c.body, 0.7)));
  }
  // 蟹壳（宽扁 → 剪影关键）
  out.push(ell(0, -22 + y, 25, 13, c.cloth));
  out.push(ell(-3, -26 + y, 19, 7, shade(c.cloth, 1.15)));
  out.push(rod(-20, -14 + y, 20, -14 + y, 3, c.clothDark));
  // 壳刺（沿背缘一排）
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    out.push(wedge(-16 + t * 32, -31 + Math.sin(t * Math.PI) * -4 + y, 6, 6 + Math.sin(t * Math.PI) * 3, Math.PI + (t - 0.5) * 0.5, c.clothDark));
  }
  // 眼柄 + 眼（顶上前方的两根小杆）
  out.push(rod(-6, -30 + y, -8, -40 + y, 2, c.body));
  out.push(rod(6, -30 + y, 8, -40 + y, 2, c.body));
  out.push(circle(-8, -41 + y, 3, c.white));
  out.push(circle(8, -41 + y, 3, c.white));
  out.push(circle(-8.6, -41 + y, 1.5, c.eye));
  out.push(circle(7.4, -41 + y, 1.5, c.eye));
  // 口器
  out.push(wedge(20, -18 + y, 7, 5, Math.PI / 2 + 0.3, c.clothDark));
  // 近侧腿
  for (const [lx, la] of [[12, 0.5], [19, 0.85], [24, 1.25]] as Array<[number, number]>) {
    const a = la + p.legA * 0.18;
    out.push(limb(lx, -17 + y, 18 * p.kneeA, 3.6, a, c.body));
  }
  // 近侧大螯（前列，一大 → 攻击时开合横夹）
  {
    const a = p.armA - p.lean;
    const jx = 14, jy = -20 + y;
    const ex = jx + Math.sin(a) * 11, ey = jy + Math.cos(a) * 11;
    out.push(limb(jx, jy, 11, 5, a, c.skin));
    out.push(...crabClaw(ex, ey, 12, snap, c.skin, shade(c.skin, 0.82)));
  }
  return out;
}

const crabGuard: CharacterArtDef = {
  id: 'crab_guard',
  displayName: '蟹将',
  width: 66,
  height: 48,
  palette: pal(CG_COLS.cloth, CG_COLS.body, CG_COLS.accent, CG_COLS.clothDark),
  clips: stdClips(),
  draw(state, phase) { return drawCrab(poseFor(state, phase)); },
};

// ═════════════════════════ 12. 鲨卫（BT-5 龙宫·近战 · 流线鲨身站立化·背鳍·尖吻巨口） ═════════════════════════

const SHK_COLS: Cols = {
  body: 0x5a7a96, back: 0x39536a, cloth: 0x4a6a86, clothDark: 0x2c4258,
  accent: 0x9c4a4a, eye: 0x0e1620, white: 0xf0f4f8, skin: 0x6a8aa6,
};

function drawShark(p: Pose): ShapeList {
  const c = SHK_COLS;
  const y = p.bob;
  const out: ShapeList = [];
  const lunge = p.k * 7;
  const jaw = 0.35 + p.k * 0.75;
  if (p.prone) {
    out.push(shadow(30, 6, 0.32));
    out.push(ell(-2, -9, 21, 9, c.body));
    out.push(ell(0, -7, 15, 5.5, c.white));
    out.push(wedge(-8, -16, 12, 15, Math.PI + 0.3, c.back));      // 背鳍仍立
    out.push(circle(17, -10, 8, c.body));
    out.push(wedge(24, -9, 7, 8, Math.PI / 2 + 0.3, c.skin));     // 尖吻
    out.push(wedge(22, -5, 5, 5, Math.PI / 2 + 0.9, c.white));    // 牙
    out.push(circle(17, -13, 1.8, c.eye));
    out.push(wedge(-20, -8, 6, 9, -Math.PI / 2 + 0.3, c.back));   // 尾鳍
    out.push(wedge(-20, -12, 6, 8, -Math.PI / 2 - 0.5, c.back));
    out.push(limb(6, -4, 12, 5, Math.PI / 2 + 0.2, shade(c.body, 0.75)));
    return out;
  }
  out.push(shadow(22, 6, 0.3));
  // 尾鳍（后下，随摆）
  const ta = -Math.PI / 2 - 0.5 + p.tailSway * 0.12;
  out.push(wedge(-15, -26 + y, 8, 15, ta - 0.35, c.back));
  out.push(wedge(-15, -26 + y, 7, 11, ta + 0.45, shade(c.back, 0.85)));
  // 远侧腿
  out.push(limb(-5, -22 + y, 21 * p.kneeB, 8, p.legB - p.lean * 0.5, shade(c.body, 0.78)));
  out.push(foot(-5 + Math.sin(p.legB - p.lean * 0.5) * 21 * p.kneeB, -22 + y + Math.cos(p.legB - p.lean * 0.5) * 21 * p.kneeB, 12, 5, shade(c.body, 0.62)));
  // 远侧臂鳍
  out.push(limb(-6, -42 + y, 15, 5, p.armB - p.lean - 0.35, shade(c.body, 0.75)));
  // 躯干（流线立身） + 白腹
  out.push(ell(0, -36 + y, 13, 18, c.body));
  out.push(ell(3, -32 + y, 9, 13, c.white));
  // 背鳍（大 → 剪影关键）
  out.push(wedge(-3, -50 + y, 13, 21, Math.PI + 0.35, c.back));
  // 鳃裂（三道短纹）
  for (let i = 0; i < 3; i++) {
    out.push(rod(6 + i * 3, -46 + i * 1.5 + y, 5 + i * 3, -38 + i * 1.5 + y, 1.7, c.accent, 0.85));
  }
  // 头 / 尖吻 / 巨口
  const hx = lunge;
  out.push(ell(4 + hx, -48 + y, 11, 8.5, c.body));
  out.push(wedge(10 + hx, -48 + y, 10, 13, Math.PI / 2 + 0.12, c.skin));       // 上吻
  out.push(wedge(7 + hx, -44 + y, 8, 10 + jaw * 4, Math.PI / 2 + 0.55 + jaw * 0.35, shade(c.skin, 0.85))); // 下颌（攻击张大）
  for (let i = 0; i < 3; i++) {
    out.push(wedge(11 + hx + i * 3.4, -44.5 + y + i * 1.2, 2.4, 4.5, Math.PI / 2 + 0.9 + i * 0.12, c.white));
  }
  out.push(circle(6 + hx, -53 + y, 2.2, c.eye));
  out.push(circle(5.4 + hx, -53.5 + y, 0.8, c.white, 0.9));
  // 近侧腿
  out.push(limb(5, -22 + y, 22 * p.kneeA, 8.5, p.legA - p.lean * 0.5, c.body));
  out.push(foot(5 + Math.sin(p.legA - p.lean * 0.5) * 22 * p.kneeA, -22 + y + Math.cos(p.legA - p.lean * 0.5) * 22 * p.kneeA, 13, 5.5, shade(c.body, 0.68)));
  // 近侧臂鳍
  out.push(limb(6, -42 + y, 16, 5.5, p.armA - p.lean - 0.3, c.body));
  out.push(wedge(6 + Math.sin(p.armA - p.lean - 0.3) * 16, -42 + y + Math.cos(p.armA - p.lean - 0.3) * 16, 6, 8, p.armA - p.lean + 0.9, c.back));
  return out;
}

const sharkGuard: CharacterArtDef = {
  id: 'shark_guard',
  displayName: '鲨卫',
  width: 60,
  height: 72,
  palette: pal(SHK_COLS.cloth, SHK_COLS.body, SHK_COLS.white, SHK_COLS.back),
  clips: stdClips(),
  draw(state, phase) { return drawShark(poseFor(state, phase)); },
};

// ═════════════════════════ 13. 龟丞相（BT-5 龙宫·远程 · 方圆龟壳·皱纹老者·拐杖龟头杖） ═════════════════════════

const TP_COLS: Cols = {
  body: 0xc0a488, back: 0x8a7460, cloth: 0x4e5e56, clothDark: 0x34423c,
  accent: 0x6fd4a0, eye: 0x20180f, white: 0xe8e4d8, skin: 0xc0a488,
};

function drawTurtle(p: Pose): ShapeList {
  const c = TP_COLS;
  const y = p.bob;
  const baked = 0.22;   // 老者驼背（烘焙前倾）
  const out: ShapeList = [];
  if (p.prone) {
    out.push(shadow(28, 6, 0.32));
    out.push(ell(-4, -13, 20, 12, 0x5f7a4a));                      // 龟壳朝天
    out.push(ell(-4, -13, 12, 7, shade(0x5f7a4a, 1.2)));
    out.push(ell(-2, -5, 16, 4, c.cloth));                          // 袍
    out.push(circle(16, -8, 7.5, c.skin));                          // 头
    out.push(...tendril(14, -4, Math.PI * 0.8, 11, 5, 2.6, c.white, 1, 2));  // 白须
    out.push(rod(22, -4, 30, -2, 2.4, 0x6a4a2a));                   // 掉落的杖
    out.push(circle(31, -3, 3, 0x5f7a4a));
    out.push(circle(17, -9, 1.4, c.eye));
    return out;
  }
  out.push(shadow(21, 5.5, 0.3));
  const lean = p.lean + baked;
  // 龟壳（背后，方圆 → 剪影关键）
  const shellY = -34 + y;
  out.push(rotRect(-8, shellY, 28, 26, -0.1, 0x5f7a4a));
  out.push(rotRect(-8, shellY - 2, 21, 18, -0.1, shade(0x5f7a4a, 1.18)));
  for (let i = 0; i < 3; i++) {
    const px2 = i === 2 ? -8 : (i === 0 ? -13 : -3);
    const py2 = i === 2 ? shellY + 3 : shellY - 6;
    out.push(regularPolyM(px2, py2, 3.6, 6, 0.3, shade(0x5f7a4a, 0.75), 0.9));
  }
  out.push(rod(-21, shellY + 11, 4, shellY + 13, 3.4, 0x3d5230));
  // 远侧腿 / 臂
  out.push(limb(0, -20 + y, 14 * p.kneeB, 4.4, p.legB - lean * 0.5, shade(c.cloth, 0.75)));
  out.push(limb(-3, -36 + y, 15, 4.2, p.armB - lean, shade(c.cloth, 0.78)));
  // 袍身（驼背弧线）
  out.push(rotRect(3, -28 + y, 21, 27, lean, c.cloth));
  out.push(rod(-5, -22 + y, 12, -20 + y, 2.6, c.accent, 0.9));   // 束带
  // 近侧腿
  out.push(limb(6, -20 + y, 15 * p.kneeA, 4.8, p.legA - lean * 0.5, c.clothDark));
  out.push(foot(6 + Math.sin(p.legA - lean * 0.5) * 15 * p.kneeA, -20 + y + Math.cos(p.legA - lean * 0.5) * 15 * p.kneeA, 8, 4, shade(c.cloth, 0.6)));
  // 头（皱纹老者）
  const hx = Math.sin(lean) * 6 + p.headTilt * 2 + 2;
  const hy = -46 + y + p.headTilt * 1.5;
  out.push(circle(hx, hy, 8.2, c.skin));
  out.push(ell(hx + 2, hy + 2.5, 6.5, 5, shade(c.skin, 1.08)));
  // 皱纹（两道弧纹）
  out.push(rod(hx - 4, hy - 5.5, hx + 4, hy - 6.5, 1.2, shade(c.skin, 0.72)));
  out.push(rod(hx - 3, hy - 8, hx + 3, hy - 8.8, 1.2, shade(c.skin, 0.72)));
  // 白眉 + 眯眼
  out.push(rod(hx - 1, hy - 2.5, hx + 7, hy - 3, 2, c.white));
  out.push(rod(hx + 1.2, hy - 1, hx + 3.4, hy - 1, 1.4, c.eye));
  // 长白须（垂到胸前）
  out.push(...tendril(hx + 4, hy + 5, 0.35, 13, 6, 2.8, c.white, p.tailSway, 2.5));
  // 拐杖龟头杖（前手拄地 → 施法时举起）
  const ang = 0.15 + Math.min(1, p.k * 2) * (Math.PI / 2 + 0.35);
  const shx = 12 + Math.sin(p.armA - lean) * 14;
  const shy = -36 + y + Math.cos(p.armA - lean) * 14;
  out.push(limb(10, -36 + y, 14, 4.4, p.armA - lean, c.cloth));
  const cdx = Math.sin(ang), cdy = Math.cos(ang);
  const topX = shx + cdx * 14, topY = shy + cdy * 14;
  const L2 = Math.min(26, Math.max(8, -shy));   // 杖身向下探到地面
  out.push(rod(shx - cdx * L2, shy - cdy * L2, topX, topY, 3.2, 0x6a4a2a));
  // 杖头小龟首
  out.push(circle(topX, topY, 3.4, 0x5f7a4a));
  out.push(wedge(topX + 2, topY, 3.4, 5, Math.PI / 2, shade(0x5f7a4a, 1.15)));
  out.push(circle(topX + 0.5, topY - 1, 0.9, c.eye));
  out.push(wedge(topX - 1, topY - 2.5, 2, 3.4, Math.PI + 0.4, 0x3d5230));
  // 施法：杖头灵光（远程攻击的可视来源）
  if (p.k > 0.2) {
    const r = 2 + p.k * 4.5;
    out.push(circle(topX + 4, topY - 4, r, c.accent, 0.9));
    out.push(circle(topX + 4, topY - 4, r * 1.9, c.accent, 0.3));
  }
  return out;
}

const turtlePrince: CharacterArtDef = {
  id: 'turtle_prince',
  displayName: '龟丞相',
  width: 58,
  height: 62,
  palette: pal(TP_COLS.cloth, TP_COLS.body, TP_COLS.accent, 0x3d5230),
  clips: stdClips(),
  draw(state, phase) { return drawTurtle(poseFor(state, phase)); },
};

// ═════════════════════════ 14. 水母妖（BT-5 龙宫·远程 · 半透明伞盖·飘带触须·alpha 透明感） ═════════════════════════

const JF_COLS: Cols = {
  body: 0xb48ae0, back: 0x8a5fc0, cloth: 0xb48ae0, clothDark: 0x5a3a8a,
  accent: 0x7fe8e0, eye: 0x2a1a4a, white: 0xe8dcff, skin: 0xc0a0ec,
};

function drawJelly(p: Pose): ShapeList {
  const c = JF_COLS;
  const y = p.bob - 12;   // 悬空基线
  const out: ShapeList = [];
  if (p.prone) {
    // 摊成一滩（半透明）
    out.push(shadow(20, 4, 0.2));
    out.push(ell(-2, -6, 17, 4.5, c.body, 0.5));
    out.push(ell(-2, -8, 11, 3.5, c.skin, 0.45));
    out.push(...tendril(-12, -5, Math.PI + 0.3, 12, 5, 2.2, c.back, 1, 3));
    out.push(...tendril(8, -5, Math.PI / 2 + 0.5, 10, 5, 2, c.back, 2, 3));
    out.push(circle(2, -7, 1.4, c.eye, 0.8));
    out.push(circle(6, -7, 1.4, c.eye, 0.8));
    return out;
  }
  out.push(shadow(12, 3.5, 0.18));
  // 长触须（下层，alpha 透明 → 半透明感的关键）
  for (let i = 0; i < 4; i++) {
    const bx = -9 + i * 6;
    out.push(...tendril(bx, -26 + y, Math.PI / 2 + (i - 1.5) * 0.18, 15 + (i % 2) * 4, 6, 2.2, c.back, p.tailSway + i * 1.3, 4.5, 0).map(
      (s) => ({ ...s, alpha: 0.65 }),
    ));
  }
  // 两条飘带口腕（更宽、更长）
  for (const [bx, w] of [[-5, 3.4], [5, 3.4]] as Array<[number, number]>) {
    out.push(...tendril(bx, -26 + y, Math.PI / 2 + bx * 0.03, 23, 7, w, c.skin, p.tailSway + bx, 5, 0).map(
      (s) => ({ ...s, alpha: 0.5 }),
    ));
  }
  // 伞盖（半透明圆顶 + 亮斑）
  out.push(ell(0, -34 + y, 15, 11, c.body, 0.58));
  out.push(ell(-2, -38 + y, 9, 6, c.white, 0.35));
  out.push(ell(0, -27.5 + y, 14.5, 3.6, c.clothDark, 0.5));   // 伞缘
  for (let i = 0; i < 4; i++) {
    out.push(circle(-10.5 + i * 7, -25.5 + y + Math.sin(i * 1.7) * 0.8, 2.4, c.body, 0.55));
  }
  // 内核发光
  out.push(circle(0, -34 + y, 4.6, c.accent, 0.75));
  out.push(circle(0, -34 + y, 2.2, c.white, 0.85));
  // 脸（伞盖内的暗色眼 → 可辨识生物感）
  out.push(circle(-3.4, -32 + y, 1.5, c.eye, 0.9));
  out.push(circle(3.4, -32 + y, 1.5, c.eye, 0.9));
  out.push(ell(0, -29.5 + y, 1.6, 1, c.eye, 0.75));
  // 攻击：触须末端放电
  if (p.k > 0.2) {
    const r = 1.6 + p.k * 3;
    out.push(circle(-10.5, -17 + y, r, c.accent, 0.85));
    out.push(circle(10.5, -15 + y, r * 0.9, c.accent, 0.85));
    out.push(circle(-10.5, -17 + y, r * 2, c.accent, 0.28));
    out.push(circle(10.5, -15 + y, r * 1.8, c.accent, 0.28));
  }
  return out;
}

const jellyFish: CharacterArtDef = {
  id: 'jelly_fish',
  displayName: '水母妖',
  width: 52,
  height: 58,
  palette: pal(JF_COLS.cloth, JF_COLS.back, JF_COLS.accent, JF_COLS.clothDark),
  clips: stdClips(),
  draw(state, phase) { return drawJelly(poseFor(state, phase)); },
};

// ═════════════════════════ 导出集合 ═════════════════════════

export const MONSTER_ART: CharacterArtDef[] = [
  monkeySoldier, shaman, boarDemon, batDemon, stoneGuard, woodWolf, fireCrow, vineSpirit, rockApe,
  shrimpSoldier, crabGuard, sharkGuard, turtlePrince, jellyFish,
];
