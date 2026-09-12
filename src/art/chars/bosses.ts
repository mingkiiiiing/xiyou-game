/**
 * Boss 造型集合（AT-2.1）。
 * 契约见 src/art/types.ts；复用 monsters.ts 的通用双足骨架（drawBiped / poseFor）。
 *
 * 设计目标：明显比小怪"巨型威胁"——更大体型、多部件（角 / 披风 / 山脊岩板 / 鬃毛）、
 * 暗金深红配色，且两者剪影互相可辨：
 *   - demon_king(混世魔王)：直立魔将，双巨角 + 垂地披风 + 巨型斩马刀
 *   - mountain_spirit(山魈)：驼背巨猿，山峦岩背 + 金色鬃毛 + 蓝纹花面 + 骨冠
 */
import type { CharacterArtDef, Shape, ShapeList } from '../types';
import { rotRect, quad, shade } from '../shapes';
import {
  circle, ell, rod, wedge, tendril,
  shadow, pal, stdClips, poseFor, drawBiped, roarRings,
  type Cols, type Pose,
} from './monsters';

// ═════════════════════════ 混世魔王（Boss Lv5 · 暗金深红） ═════════════════════════

const DK_HIP = -34, DK_S = -66, DK_HEAD = -78, DK_HR = 13;
const DK_COLS: Cols = {
  body: 0x8f2b22, back: 0x521410, cloth: 0x2b2b32, clothDark: 0x17171c,
  accent: 0xd9a13a, eye: 0xff7a3a, white: 0xffe9b0, skin: 0xb03a2a,
};

function demonHead(hx: number, hy: number, p: Pose, c: Cols): ShapeList {
  const o: ShapeList = [];
  // 双巨角（向后上方弯 → 最强剪影特征）
  for (const side of [-1, 1] as const) {
    const bx = hx + side * 8, by = hy - 7;
    o.push(rod(bx, by, bx + side * 7, by - 13, 8, c.white));
    o.push(rod(bx + side * 7, by - 13, bx + side * 15, by - 21, 6, c.accent));
    o.push(wedge(bx + side * 15, by - 21, 5, 9, side > 0 ? Math.PI - 0.55 : Math.PI + 0.55, c.accent));
  }
  o.push(circle(hx, hy, DK_HR, c.skin));
  o.push(ell(hx + 1, hy + 4, 9, 7, shade(c.skin, 0.82)));
  // 眉骨 + 发光眼
  o.push(rod(hx - 10, hy - 4, hx + 10, hy - 4, 5, c.back));
  o.push(circle(hx - 4, hy - 2, 2.6, c.eye));
  o.push(circle(hx + 4, hy - 2, 2.6, c.eye));
  o.push(circle(hx - 4, hy - 2, 1.2, c.white, 0.9));
  o.push(circle(hx + 4, hy - 2, 1.2, c.white, 0.9));
  // 獠牙
  o.push(wedge(hx - 3, hy + 7, 3, 6, Math.PI * 0.96, c.white));
  o.push(wedge(hx + 3, hy + 7, 3, 6, Math.PI * 1.04, c.white));
  // 额饰
  o.push(diamond(hx, hy - 11, 3.2, c.accent));
  return o;
}

/** 菱形（本地）；避免额外 import */
function diamond(cx: number, cy: number, r: number, color: number, alpha?: number): Shape {
  return { kind: 'poly', points: [cx, cy - r, cx + r * 0.8, cy, cx, cy + r, cx - r * 0.8, cy], color, alpha };
}

const demonKing: CharacterArtDef = {
  id: 'demon_king',
  displayName: '混世魔王',
  width: 78,
  height: 106,
  palette: pal(DK_COLS.cloth, DK_COLS.body, DK_COLS.accent, DK_COLS.back),
  clips: stdClips(),
  draw(state, phase) {
    const p = poseFor(state, phase);
    if (p.prone) {
      // 巨型倒地
      const c = DK_COLS;
      const out: ShapeList = [shadow(40, 7, 0.34)];
      out.push(ell(-6, -11, 34, 13, c.cloth));
      out.push(ell(-30, -9, 12, 9, c.body));
      out.push(circle(20, -13, 13, c.skin));
      out.push(rod(12, -18, 30, -30, 5, c.accent));
      out.push(rod(-44, -9, -30, -11, 4, c.back));
      out.push(...roarRings(0, -6, 0.15, c.accent, 12));
      return out;
    }
    return drawBiped({
      hipY: DK_HIP, shoulderY: DK_S, headY: DK_HEAD, headR: DK_HR,
      legLen: 30, legW: 14, armLen: 29, armW: 11, torsoW: 37, torsoH: 36,
      hipX: 11, shoulderX: 12, leanShift: 3, shadowRx: 30,
      cols: DK_COLS,
      back: (q, c) => {
        const sway = Math.sin(q.lean) * 5 + q.legA * 4;
        const yo = q.bob;
        return [
          // 垂地披风（深红 → 剪影块面）
          quad(-13, -72 + yo, 13, -72 + yo, 23 + sway, -4 + yo, -23 + sway, -4 + yo, 0x5a1418),
          quad(-15, -68 + yo, 15, -68 + yo, 25 + sway, -12 + yo, -25 + sway, -12 + yo, 0x7a1e1e, 0.85),
          rod(-13, -70 + yo, 13, -70 + yo, 6, c.accent),
        ];
      },
      torso: (q, c) => {
        const yo = q.bob;
        return [
          rotRect(0, -50 + yo, 37, 36, q.lean, c.body),
          rotRect(0, -60 + yo, 34, 14, q.lean, c.cloth),        // 黑铁胸甲
          rotRect(0, -36 + yo, 32, 7, q.lean, c.clothDark),     // 腰甲
          rotRect(0, -44 + yo, 8, 22, q.lean, c.clothDark),
          diamond(0, -52 + yo, 4, c.accent),
        ];
      },
      arm: (side, jx, jy, q, c) => {
        const angA = side > 0 ? q.armA - q.lean : q.armB - q.lean;
        const o: ShapeList = [
          rotRect(jx + side * 3, jy + 1, 19, 16, side * 0.12, side > 0 ? c.cloth : shade(c.cloth, 0.86)),
          wedge(jx + side * 7, jy - 4, 9, 12, Math.PI + side * 0.35, 0x7a1e1e),
          wedge(jx + side * 9, jy - 2, 7, 9, Math.PI + side * 0.62, c.accent),
        ];
        const ex = jx + Math.sin(angA) * 29, ey = jy + 4 + Math.cos(angA) * 29;
        o.push(rod(jx, jy + 4, ex, ey, 11, side > 0 ? c.body : shade(c.body, 0.82)));
        o.push(rod(ex, ey - 3, ex, ey + 5, 9, side > 0 ? c.cloth : c.clothDark));  // 护手
        o.push(circle(ex, ey + 8, 5.5, shade(c.cloth, 1.1)));
        return o;
      },
      head: demonHead,
      weapon: (q, hx, hy, c) => {
        const ang = q.wpn + 0.25;
        const dx = Math.sin(ang), dy = Math.cos(ang), px = Math.cos(ang), py = -Math.sin(ang);
        const P = (u: number, v: number): number[] => [hx + dx * u + px * v, hy + dy * u + py * v];
        const o: ShapeList = [rod(hx, hy, hx + dx * 22, hy + dy * 22, 4.2, 0x3a2a20)];
        const gx = hx + dx * 22, gy = hy + dy * 22;
        o.push(rotRect(gx, gy, 13, 5, -ang, c.accent));      // 护手
        const W = 13, L = 52;
        const raw: number[][] = [
          [0, -W * 0.5], [L * 0.5, -W * 0.5], [L * 0.72, -W * 1.15],
          [L, -W * 0.1], [L * 0.8, W * 0.72], [L * 0.38, W * 0.58], [0, W * 0.5],
        ];
        const pts: number[] = [];
        for (const r of raw) { const q2 = P(r[0], r[1]); pts.push(q2[0], q2[1]); }
        o.push({ kind: 'poly', points: pts, color: 0xb9bec4 });
        // 血槽
        o.push(rod(P(3, 0)[0], P(3, 0)[1], P(L * 0.86, 0)[0], P(L * 0.86, 0)[1], 3, shade(0xb9bec4, 0.7)));
        return o;
      },
    }, p);
  },
};

// ═════════════════════════ 山魈（Boss Lv6 · 驼背巨猿 · 暗金鬃毛） ═════════════════════════

const MSP_HIP = -34, MSP_S = -64, MSP_HEAD = -76, MSP_HR = 12;
const MSP_COLS: Cols = {
  body: 0x5a3a1e, back: 0x33210f, cloth: 0x6b6f5a, clothDark: 0x3f4438,
  accent: 0xd9a13a, eye: 0xffd257, white: 0xf5ead0, skin: 0x9c4a3a,
};

function mandrillHead(hx: number, hy: number, p: Pose, c: Cols): ShapeList {
  const o: ShapeList = [];
  // 金色鬃毛环（画在脸后）
  for (let i = 0; i < 11; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    o.push(circle(hx + Math.cos(a) * 16, hy + Math.sin(a) * 16, 5.2, i % 2 ? c.accent : shade(c.accent, 0.8)));
  }
  o.push(circle(hx, hy, MSP_HR, c.body));
  // 花面：蓝脊 + 红鼻
  o.push(ell(hx + 3, hy + 4, 9.5, 7.5, c.skin));
  o.push(ell(hx + 3, hy + 2.5, 7.5, 3.4, 0x4ab8d6));
  o.push(ell(hx + 3, hy + 1.5, 7.5, 1.8, 0x7fe0ee));
  o.push(circle(hx + 3, hy + 6, 2.6, 0xc23b2b));
  o.push(circle(hx - 3.5, hy - 4, 2.4, c.eye));
  o.push(circle(hx + 3.5, hy - 4, 2.4, c.eye));
  o.push(circle(hx - 3.5, hy - 4.6, 1.0, c.white, 0.9));
  o.push(circle(hx + 2.7, hy - 4.6, 1.0, c.white, 0.9));
  // 獠牙
  o.push(wedge(hx - 2.5, hy + 9, 3, 6, Math.PI * 0.97, c.white));
  o.push(wedge(hx + 2.5, hy + 9, 3, 6, Math.PI * 1.03, c.white));
  // 骨冠（两根短角）
  for (const side of [-1, 1] as const) {
    o.push(wedge(hx + side * 6, hy - 9, 6, 11, Math.PI + side * 0.4, c.white));
    o.push(wedge(hx + side * 8, hy - 8, 3.5, 7, Math.PI + side * 0.7, shade(c.white, 0.82)));
  }
  return o;
}

const mountainSpirit: CharacterArtDef = {
  id: 'mountain_spirit',
  displayName: '山魈',
  width: 88,
  height: 112,
  palette: pal(MSP_COLS.cloth, MSP_COLS.body, MSP_COLS.accent, MSP_COLS.back),
  clips: stdClips(),
  draw(state, phase) {
    const p = poseFor(state, phase);
    const c = MSP_COLS;
    if (p.prone) {
      const out: ShapeList = [shadow(44, 7, 0.34)];
      out.push(ell(-6, -12, 36, 14, c.body));
      out.push(ell(-30, -10, 11, 9, c.cloth));
      out.push(circle(22, -14, 12, c.body));
      out.push(...tendril(-46, -12, Math.PI, 18, 6, 4, c.accent, 1, 3));
      out.push(...roarRings(-44, -6, 0.1, c.accent, 10));
      return out;
    }
    const draw = drawBiped({
      hipY: MSP_HIP, shoulderY: MSP_S, headY: MSP_HEAD, headR: MSP_HR,
      legLen: 28, legW: 15, armLen: 52, armW: 19, torsoW: 41, torsoH: 35,
      hipX: 11, shoulderX: 15, leanShift: 3, shadowRx: 34,
      cols: c,
      back: (q, cc) => {
        const yo = q.bob;
        const o: ShapeList = [];
        // 山峦岩背（三个峰）
        o.push(wedge(-4, -90 + yo, 24, 22, Math.PI, cc.cloth));
        o.push(wedge(13, -86 + yo, 17, 16, Math.PI - 0.18, cc.clothDark));
        o.push(wedge(-20, -83 + yo, 15, 13, Math.PI + 0.22, cc.clothDark));
        o.push(ell(-3, -86 + yo, 16, 5, cc.accent, 0.25));
        // 短尾
        o.push(...tendril(-17, -42 + yo, -Math.PI / 2 - 0.4, 13, 5, 3.2, cc.back, q.tailSway, 3));
        return o;
      },
      torso: (q, cc) => {
        const yo = q.bob;
        return [
          rotRect(0, -48 + yo, 41, 35, q.lean, cc.body),
          rotRect(0, -60 + yo, 38, 14, q.lean, cc.cloth),    // 岩质胸背板
          rotRect(0, -36 + yo, 36, 7, q.lean, cc.back),
          circle(0, -49 + yo, 3.6, cc.eye, 0.9),
        ];
      },
      head: mandrillHead,
      arm: (side, jx, jy, q, cc) => {
        const angA = side > 0 ? q.armA - q.lean : q.armB - q.lean;
        const o: ShapeList = [
          rotRect(jx + side * 2, jy, 20, 15, side * 0.1, cc.cloth),
          wedge(jx + side * 6, jy - 6, 9, 10, Math.PI + side * 0.25, cc.clothDark),
        ];
        const ex = jx + Math.sin(angA) * 36, ey = jy + Math.cos(angA) * 36;
        o.push(rod(jx, jy + 4, ex, ey, 18, side > 0 ? cc.body : shade(cc.body, 0.82)));
        o.push(rod(ex, ey - 5, ex, ey + 7, 15, cc.back));                       // 前臂岩甲
        o.push(rod(ex - 5, ey, ex + 5, ey, 4, cc.accent));                      // 金环
        o.push(circle(ex, ey + 10, 8.5, side > 0 ? cc.cloth : shade(cc.cloth, 0.82)));
        return o;
      },
      weapon: (q, hx, hy, cc) => {
        if (q.k > 0.35) {
          const o: ShapeList = [
            circle(hx, hy + 8, 4 + q.k * 8, cc.eye, 0.75),
            ell(hx, -4, 16 + q.k * 20, 6 * q.k, cc.eye, 0.35),
          ];
          // 溅起的碎岩
          for (let i = 0; i < 4; i++) {
            const a = -Math.PI * 0.5 + (i - 1.5) * 0.5;
            o.push(wedge(hx + Math.cos(a) * (12 + q.k * 14), hy + Math.sin(a) * 8, 6, 7, a, cc.clothDark));
          }
          return o;
        }
        return [];
      },
      prone: (q, cc) => [
        ell(-4, -12, 32, 13, cc.body),
        ell(-28, -10, 11, 9, cc.cloth),
        circle(20, -14, 11, cc.body),
        ...tendril(16, -18, -Math.PI / 2 + 0.4, 16, 6, 4, cc.accent, 1, 3),
        ...roarRings(-40, -6, 0.1, cc.accent, 10),
      ],
    }, p);
    // 技能：地面冲击环（叠加在体前）
    if (state === 'skill' && p.k > 0.5) {
      draw.push(...roarRings(0, -4, (p.k - 0.5) * 2, MSP_COLS.eye, 14));
    }
    return draw;
  },
};

// ═════════════════════════ 东海龙王（BT-5 Boss · 全游戏最大体型 · 暗金 + 深海蓝） ═════════════════════════
//
// 与既有两 Boss 的剪影区隔：
//   - demon_king：双巨角 + 垂地披风 + 斩马刀（直立体格）
//   - mountain_spirit：驼背巨猿 + 山峦岩背 + 金鬃
//   - dragon_king：鹿角 + 虾须 + 鳞甲披风 + 蛇形长尾 + 龙首权杖（更高更宽，华丽度最高）

const DK2_HIP = -40, DK2_S = -80, DK2_HEAD = -94, DK2_HR = 14;
const DK2_COLS: Cols = {
  body: 0x2e5a80,      // 深海蓝鳞
  back: 0x1a3a58,
  cloth: 0x24506e,     // 鳞甲
  clothDark: 0x142a44,
  accent: 0xc9a13a,    // 暗金
  eye: 0xffd257,       // 金瞳
  white: 0xf0ead8,     // 鹿角
  skin: 0x3a6a94,      // 吻部亮鳞
};

/** 龙王头：鹿角 + 虾须 + 金瞳 + 尖吻獠牙 */
function dragonKingHead(hx: number, hy: number, p: Pose, c: Cols): ShapeList {
  const o: ShapeList = [];
  // 脑后鬃毛（深色 → 衬托亮色脸部与鹿角）
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * 0.66 + (i / 4) * Math.PI * 0.68;
    o.push(circle(hx + Math.cos(a) * 16, hy + Math.sin(a) * 14, 4.4, i % 2 ? c.back : c.clothDark));
  }
  // 鹿角（双叉 → 最强剪影；主枝后上，前后各一分叉）
  for (const side of [-1, 1] as const) {
    const bx = hx + side * 6, by = hy - 10;
    o.push(rod(bx, by, bx + side * 4, by - 19, 4.6, c.white));
    o.push(rod(bx + side * 2, by - 9, bx + side * 12, by - 15, 3, c.white));
    o.push(rod(bx + side * 3, by - 15, bx + side * 11, by - 22, 2.8, c.white));
    o.push(circle(bx + side * 4, by - 19, 2.4, c.accent));
  }
  // 头骨 + 亮鳞面部
  o.push(circle(hx, hy, DK2_HR, c.body));
  o.push(ell(hx + 3, hy - 1, 11.5, 9.5, c.skin));
  // 眉骨（深色 → 金瞳醒目）
  o.push(rod(hx - 8, hy - 5, hx + 10, hy - 6, 3.6, c.clothDark));
  o.push(circle(hx - 4, hy - 2, 3, c.eye));
  o.push(circle(hx + 4, hy - 2, 3, c.eye));
  // 尖吻 + 鼻
  o.push(wedge(hx + 8, hy + 2, 13, 16, Math.PI / 2 - 0.05, c.skin));
  // 下颌 + 獠牙
  o.push(wedge(hx + 7, hy + 9, 9, 12, Math.PI / 2 + 0.3, shade(c.skin, 0.85)));
  o.push(wedge(hx + 10, hy + 9, 3, 6, Math.PI / 2 + 0.75, c.white));
  // 虾须（两根长须从吻侧向后流 → 龙王标志性特征）
  o.push(...tendril(hx + 16, hy + 4, Math.PI * 0.82, 30, 5, 2.4, c.accent, p.tailSway, 5));
  o.push(...tendril(hx + 14, hy + 7, Math.PI * 0.95, 26, 5, 2.2, shade(c.accent, 0.8), p.tailSway + 1.2, 4));
  // 额珠
  o.push(diamond(hx, hy - 13, 3.6, c.accent));
  return o;
}

const dragonKing: CharacterArtDef = {
  id: 'dragon_king',
  displayName: '东海龙王',
  width: 102,
  height: 128,
  palette: pal(DK2_COLS.cloth, DK2_COLS.body, DK2_COLS.accent, DK2_COLS.back),
  clips: stdClips(),
  draw(state, phase) {
    const p = poseFor(state, phase);
    const c = DK2_COLS;
    if (p.prone) {
      // 巨龙陨落：鳞甲躯干 + 仍竖立的鹿角 + 流散的虾须 + 权杖
      const out: ShapeList = [shadow(48, 8, 0.34)];
      out.push(ell(-6, -14, 38, 15, c.body));
      out.push(ell(-10, -10, 28, 9, shade(c.body, 1.15)));
      out.push(ell(-36, -10, 13, 10, c.cloth));
      out.push(circle(24, -17, 14, c.body));
      out.push(wedge(34, -15, 9, 11, Math.PI / 2 + 0.15, c.skin));
      out.push(rod(16, -27, 10, -40, 4, c.white));
      out.push(rod(28, -27, 36, -38, 4, c.white));
      out.push(...tendril(36, -12, Math.PI * 0.78, 22, 7, 2.6, c.accent, 1, 4));
      out.push(rod(-52, -5, -34, -12, 4.5, c.accent));
      out.push(circle(-53, -4, 5.5, c.body));
      out.push(...roarRings(-50, -6, 0.12, c.accent, 12));
      return out;
    }
    const draw = drawBiped({
      hipY: DK2_HIP, shoulderY: DK2_S, headY: DK2_HEAD, headR: DK2_HR,
      legLen: 34, legW: 15, armLen: 33, armW: 12, torsoW: 43, torsoH: 40,
      hipX: 12, shoulderX: 14, leanShift: 3.5, shadowRx: 36,
      cols: c,
      back: (q, cc) => {
        const yo = q.bob;
        const sway = Math.sin(q.lean) * 5 + q.legA * 4;
        const o: ShapeList = [];
        // 鳞甲披风（两层深海蓝 + 暗金缘）
        o.push(quad(-17, -88 + yo, 15, -88 + yo, 31 + sway, -6 + yo, -29 + sway, -6 + yo, 0x16324e));
        o.push(quad(-19, -80 + yo, 17, -80 + yo, 33 + sway, -20 + yo, -31 + sway, -20 + yo, 0x24506e, 0.92));
        o.push(rod(-17, -85 + yo, 15, -85 + yo, 5, cc.accent));
        // 鳞纹
        for (let i = 0; i < 2; i++) o.push(rod(-11 + (i % 2) * 3, -70 + i * 14 + yo, 9 + (i % 2) * 3, -68 + i * 14 + yo, 2, 0x3a6a94, 0.8));
        // 蛇形长尾（末端尾鳍 → 龙类剪影）
        const tail = tendril(-18, -48 + yo, -Math.PI / 2 - 0.4, 36, 6, 5.5, cc.body, q.tailSway, 6, 7);
        o.push(...tail);
        const tip = tail[tail.length - 1];
        if (tip.kind === 'circle') {
          o.push(wedge(tip.x, tip.y, 7, 12, -Math.PI / 2 - 0.25, cc.back));
          o.push(wedge(tip.x, tip.y, 6, 9, -Math.PI / 2 + 0.7, cc.clothDark));
        }
        return o;
      },
      torso: (q, cc) => {
        const yo = q.bob;
        return [
          rotRect(0, -60 + yo, 43, 40, q.lean, cc.body),
          rotRect(0, -73 + yo, 39, 16, q.lean, cc.cloth),        // 鳞胸甲
          rotRect(0, -44 + yo, 40, 8, q.lean, cc.clothDark),     // 腰甲
          rod(-13, -62 + yo, 13, -61 + yo, 2.6, shade(cc.body, 1.3)),   // 腹鳞两道
          rod(-13, -52 + yo, 13, -51 + yo, 2.6, shade(cc.body, 1.3)),
          diamond(0, -66 + yo, 4.5, cc.accent),
        ];
      },
      arm: (side, jx, jy, q, cc) => {
        const angA = side > 0 ? q.armA - q.lean : q.armB - q.lean;
        const o: ShapeList = [
          rotRect(jx + side * 4, jy + 1, 22, 17, side * 0.12, side > 0 ? cc.cloth : shade(cc.cloth, 0.86)),
          wedge(jx + side * 7, jy - 5, 10, 14, Math.PI + side * 0.28, cc.accent),   // 金鳍肩刺
          wedge(jx + side * 9, jy - 1, 7, 9, Math.PI + side * 0.58, cc.back),
        ];
        const ex = jx + Math.sin(angA) * 33, ey = jy + 4 + Math.cos(angA) * 33;
        o.push(rod(jx, jy + 4, ex, ey, 12, side > 0 ? cc.body : shade(cc.body, 0.82)));
        o.push(rod(ex, ey - 4, ex, ey + 6, 10, cc.cloth));   // 臂甲
        // 龙爪（两枚小楔）
        for (let i = -1; i <= 0; i++) {
          o.push(wedge(ex + i * 3.6 + 1.8, ey + 9, 2.6, 7, Math.PI / 2 + (i - 0.5) * 0.35, cc.accent));
        }
        return o;
      },
      head: dragonKingHead,
      weapon: (q, hx, hy, cc) => {
        // 龙首权杖：暗金粗杖 + 顶端大龙首 + 含珠
        const ang = q.wpn + 0.3;
        const dx = Math.sin(ang), dy = Math.cos(ang);
        const tx = hx + dx * 34, ty = hy + dy * 34;
        const o: ShapeList = [rod(hx - dx * 7, hy - dy * 7, tx, ty, 5.5, cc.accent)];
        o.push(circle(hx - dx * 7, hy - dy * 7, 3.4, 0x3a6a94));           // 杖尾宝珠
        // 杖首龙首（放大 + 亮色）
        o.push(circle(tx, ty, 8, cc.body));
        o.push(wedge(tx + 5, ty + 1, 8, 13, Math.PI / 2 - 0.05, cc.skin));  // 吻部朝前
        o.push(circle(tx + 4, ty - 3.5, 2, cc.eye));
        o.push(wedge(tx - 2, ty - 6, 3.4, 8, Math.PI + 0.35, cc.white));    // 龙角
        o.push(wedge(tx + 4, ty - 6, 3.4, 8, Math.PI - 0.35, cc.white));
        // 龙珠（含在吻前） + 蓄力光
        o.push(circle(tx + 12, ty + 1, 3.6, 0x7fe8e0));
        o.push(circle(tx + 12, ty + 1, 5.4, 0x7fe8e0, 0.3));
        if (q.k > 0.35) {
          o.push(circle(tx + 12, ty + 1, 3.6 + q.k * 7, 0x7fe8e0, 0.3));
        }
        return o;
      },
      prone: (q, cc) => [
        ell(-4, -14, 38, 15, cc.body),
        ell(-36, -10, 13, 10, cc.cloth),
        circle(24, -17, 14, cc.body),
        wedge(34, -15, 9, 11, Math.PI / 2 + 0.15, cc.skin),
        rod(16, -27, 10, -40, 4, cc.white),
        rod(28, -27, 36, -38, 4, cc.white),
        ...tendril(36, -12, Math.PI * 0.78, 22, 7, 2.6, cc.accent, 1, 4),
        ...roarRings(-50, -6, 0.12, cc.accent, 12),
      ],
    }, p);
    // 技能：潮汐冲击（地面扩散环 + 水楔）
    if (state === 'skill' && p.k > 0.5) {
      const e = (p.k - 0.5) * 2;
      draw.push(...roarRings(4, -4, e, c.eye, 16));
      for (let i = 0; i < 3; i++) {
        draw.push(wedge(10 + i * 8, -8 - i * 6, 7, 10 + e * 8, Math.PI / 2 - 0.2 + i * 0.3, 0x3a6a94, 0.7 * (1 - e * 0.5)));
      }
    }
    return draw;
  },
};

export const BOSS_ART: CharacterArtDef[] = [demonKing, mountainSpirit, dragonKing];
