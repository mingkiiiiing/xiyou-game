/**
 * BT-5.2 蛮岩（玩家可选角色 · 牛魔族重装战士）。
 *
 * 范式与 linghou.ts 一致：纯函数 (state, phase) → Shape[]，
 * 原点在脚底中心、y 向上为负；朝向翻转与闪白由 art/compose.ts 统一处理。
 *
 * 造型：宽厚牛魔——粗壮躯干 + 双弯牛角 + 铁灰重甲护肩 + 焦红披风 + 巨型双刃斧。
 * 动作感：慢而重——attack 幅度大、前倾明显、hurt 后仰沉重（clip 时长整体比灵猴长）。
 */
import type { CharacterArtDef, ShapeList } from '../types';
import { rotRect, quad, shade } from '../shapes';
import { circle, limb, rod, tendril, shadow, pal, TAU } from './monsters';

// —— 骨架关键高度（负数向上；比灵猴整体大一号） ——
const HIP_Y = -27;
const SHOULDER_Y = -52;
const HEAD_Y = -62;
const HEAD_R = 10;

const C = {
  fur: 0x74513c,       // 牛毛主色（深褐）
  furBack: 0x52372a,   // 牛毛背光
  snout: 0x9c7050,     // 牛鼻口吻
  iron: 0x565b64,      // 铁灰甲
  ironDark: 0x343941,  // 甲暗部
  copper: 0xc07a3e,    // 暗铜点缀
  copperDark: 0x8a5426,
  cape: 0x9c2f22,      // 焦红披风
  capeDark: 0x6e1e15,
  horn: 0xe8ddc8,      // 牛角
  wood: 0x3a2a20,      // 斧柄
  steel: 0xb9bec4,     // 斧刃
  eye: 0x1a1a1a,
  white: 0xffffff,
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 肢体：从关节 (jx,jy) 沿摆角 ang（0=垂直向下，+ 向 +x 摆）伸出 */
function limbL(jx: number, jy: number, len: number, w: number, ang: number, color: number): ShapeList {
  return [limb(jx, jy, len, w, ang, color)];
}

/**
 * 巨斧：握点 (hx,hy)；ang 为"斧头方向"（PI≈竖直向上），len 为握点到斧头的柄长，
 * butt 为握点向柄尾延伸的长度（idle 拄地时用 ~ 手离地高度）。
 */
function greataxe(hx: number, hy: number, ang: number, len: number, butt = 10): ShapeList {
  const o: ShapeList = [];
  const dx = Math.sin(ang), dy = Math.cos(ang);
  const px = Math.cos(ang), py = -Math.sin(ang);
  const P = (u: number, v: number): number[] => [hx + dx * u + px * v, hy + dy * u + py * v];
  // 柄 + 柄尾铜箍
  o.push(rod(hx - dx * butt, hy - dy * butt, hx + dx * len, hy + dy * len, 4, C.wood));
  o.push(rod(hx - dx * butt, hy - dy * butt, hx - dx * (butt - 5), hy - dy * (butt - 5), 4.8, C.copperDark));
  // 斧绑带（紧贴斧刃下方）
  o.push(rotRect(P(len - 25, 0)[0], P(len - 25, 0)[1], 13, 5.5, -ang, C.ironDark));
  // 双月牙刃（位于柄顶端 → 拄地时斧刃高过头顶）
  for (const s of [-1, 1]) {
    const u0 = len - 22;
    const raw: number[][] = [
      [u0 - 1, s * 1.5], [u0 + 6, s * 12], [u0 + 13, s * 17.5], [u0 + 21, s * 15], [u0 + 24, s * 7], [u0 + 22, s * 1],
    ];
    const pts: number[] = [];
    for (const r of raw) { const q = P(r[0], r[1]); pts.push(q[0], q[1]); }
    o.push({ kind: 'poly', points: pts, color: C.steel });
    // 刃口高光
    o.push({
      kind: 'poly',
      points: [
        P(u0 + 5, s * 9)[0], P(u0 + 5, s * 9)[1],
        P(u0 + 13, s * 16)[0], P(u0 + 13, s * 16)[1],
        P(u0 + 21, s * 13.5)[0], P(u0 + 21, s * 13.5)[1],
      ],
      color: shade(C.steel, 1.16),
    });
  }
  return o;
}

interface Pose {
  bob: number;
  lean: number;
  legA: number;
  legB: number;
  kneeA: number;
  kneeB: number;
  armA: number;      // 前臂（握斧手）
  armB: number;
  axeAng: number;    // 斧头方向角
  axeLen: number;
  butt: number;      // 柄尾长度
  headTilt: number;
  tailSway: number;
  shock: number;     // 技能震地冲击波 0~1（0 = 无）
  prone: boolean;
}

function poseFor(state: string, t: number): Pose {
  const p: Pose = {
    bob: 0, lean: 0, legA: 0, legB: 0, kneeA: 1, kneeB: 1,
    armA: 0.55, armB: -0.15, axeAng: Math.PI + 0.08, axeLen: 46, butt: 10,
    headTilt: 0, tailSway: 0, shock: 0, prone: false,
  };
  switch (state) {
    case 'run': {
      // 重步态：幅度小、沉肩、斧随身侧拖行
      const s = Math.sin(t * TAU), c = Math.cos(t * TAU);
      p.lean = 0.2;
      p.legA = s * 0.62;
      p.legB = -s * 0.62;
      p.kneeA = 0.8 + Math.max(0, -c) * 0.2;
      p.kneeB = 0.8 + Math.max(0, c) * 0.2;
      p.armA = 0.5 + s * 0.18;
      p.armB = -s * 0.42;
      p.bob = Math.abs(s) * 3.2;
      p.axeAng = 0.62 + s * 0.18;
      p.butt = 12;
      p.tailSway = t * TAU * 0.9;
      break;
    }
    case 'jump':
      // 沉重起跳：抱斧收腿
      p.legA = 0.55; p.legB = -0.3; p.kneeA = 0.5; p.kneeB = 0.68;
      p.armA = -1.9; p.armB = -1.2; p.axeAng = -2.35; p.butt = 10; p.lean = -0.08; p.tailSway = 1.1;
      break;
    case 'fall':
      p.legA = -0.22; p.legB = 0.3; p.kneeA = 0.92; p.kneeB = 0.92;
      p.armA = -1.7; p.armB = -1.9; p.axeAng = -1.1; p.butt = 10; p.lean = 0.08; p.tailSway = -0.9;
      break;
    case 'attack1': {
      // 劈山：高举过头 → 全力下劈（大幅、前倾明显）
      if (t < 0.35) {
        const u = t / 0.35;
        p.axeAng = lerp(0.55, Math.PI - 0.55, u);
        p.armA = lerp(0.55, -2.25, u);
        p.armB = lerp(-0.15, -1.4, u);
        p.lean = 0.06 - u * 0.12;
        p.bob = -u * 2;
      } else if (t < 0.68) {
        const u = (t - 0.35) / 0.33;
        p.axeAng = lerp(Math.PI - 0.55, 0.6, u);
        p.armA = lerp(-2.25, 1.1, u);
        p.armB = lerp(-1.4, 0.5, u);
        p.lean = -0.06 + u * 0.42;
        p.legA = 0.42 * u; p.legB = -0.48 * u;
        p.kneeA = 1 - u * 0.18; p.kneeB = 1 - u * 0.12;
        p.bob = u * 2.5;
      } else {
        const u = (t - 0.68) / 0.32;
        p.axeAng = lerp(0.6, 0.55, u);
        p.armA = lerp(1.1, 0.6, u);
        p.armB = lerp(0.5, -0.1, u);
        p.lean = lerp(0.36, 0.16, u);
        p.legA = lerp(0.42, 0.1, u); p.legB = lerp(-0.48, -0.1, u);
      }
      p.butt = 10;
      break;
    }
    case 'attack2': {
      // 横扫：斧从身后抡到前上
      if (t < 0.3) {
        const u = t / 0.3;
        p.axeAng = lerp(0.6, -0.75, u);
        p.armA = lerp(0.55, -1.35, u);
        p.lean = lerp(0.05, -0.14, u);
      } else if (t < 0.62) {
        const u = (t - 0.3) / 0.32;
        p.axeAng = lerp(-0.75, 2.35, u);
        p.armA = lerp(-1.35, 1.75, u);
        p.armB = lerp(-0.2, 0.8, u);
        p.lean = lerp(-0.14, 0.3, u);
        p.legA = -0.4 * u; p.legB = 0.42 * u;
      } else {
        const u = (t - 0.62) / 0.38;
        p.axeAng = lerp(2.35, 1.4, u);
        p.armA = lerp(1.75, 0.7, u);
        p.armB = lerp(0.8, -0.1, u);
        p.lean = lerp(0.3, 0.1, u);
      }
      p.butt = 10;
      break;
    }
    case 'attack3': {
      // 跃劈：拔身举起 → 砸地
      if (t < 0.38) {
        const u = t / 0.38;
        p.bob = lerp(1, -5.5, u);
        p.axeAng = lerp(0.6, Math.PI + 0.4, u);
        p.armA = lerp(0.55, -2.5, u);
        p.armB = lerp(-0.15, -2.2, u);
        p.kneeA = lerp(1, 0.55, u); p.kneeB = lerp(1, 0.6, u);
        p.lean = -0.06;
      } else {
        const u = Math.min(1, (t - 0.38) / 0.24);
        p.bob = lerp(-5.5, 2.5, u);
        p.axeAng = lerp(Math.PI + 0.4, 0.5, u);
        p.armA = lerp(-2.5, 1.2, u);
        p.armB = lerp(-2.2, 0.9, u);
        p.lean = lerp(-0.06, 0.46, u);
        p.kneeA = lerp(0.55, 0.82, u); p.kneeB = lerp(0.6, 0.85, u);
        p.legA = 0.3 * u; p.legB = -0.34 * u;
      }
      p.butt = 10;
      break;
    }
    case 'skill': {
      // 开山式：双手举斧蓄力（带颤抖）→ 砸地震波
      if (t < 0.5) {
        const u = t / 0.5;
        p.axeAng = lerp(0.6, Math.PI + 0.12, u);
        p.armA = lerp(0.55, -2.55, u);
        p.armB = lerp(-0.15, -2.3, u);
        p.lean = -0.02 - u * 0.06;
        p.legA = 0.5 * u; p.legB = -0.5 * u;
        p.kneeA = lerp(1, 0.72, u); p.kneeB = lerp(1, 0.72, u);
        p.bob = -1 * u + Math.sin(t * TAU * 4) * 0.6 * u;
      } else if (t < 0.64) {
        const u = (t - 0.5) / 0.14;
        p.axeAng = lerp(Math.PI + 0.12, 0.22, u);
        p.armA = lerp(-2.55, 0.95, u);
        p.armB = lerp(-2.3, 0.75, u);
        p.lean = lerp(-0.08, 0.4, u);
        p.bob = lerp(-1, 3, u);
      } else {
        const u = (t - 0.64) / 0.36;
        p.axeAng = 0.22; p.armA = 0.95; p.armB = 0.75;
        p.lean = lerp(0.4, 0.3, u);
        p.bob = lerp(3, 2, u);
        p.shock = u;
      }
      p.butt = 10;
      break;
    }
    case 'hurt': {
      // 沉重后仰
      const k = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
      p.lean = -0.5 * k;
      p.headTilt = -0.55 * k;
      p.armA = 0.55 + 0.85 * k;
      p.armB = -0.15 - 1.2 * k;
      p.axeAng = 0.55 + 1.15 * k;
      p.butt = 14;
      p.legA = -0.35 * k; p.legB = 0.42 * k;
      p.bob = 2.2 * k;
      break;
    }
    case 'dodge': {
      // 重踏冲锋：压低重心、斧拖身后
      const k = t < 0.5 ? t / 0.5 : 1 - (t - 0.5) / 0.5;
      p.bob = k * 10;
      p.lean = 0.3 + k * 0.3;
      p.legA = -0.9 * k; p.legB = -0.6 * k;
      p.kneeA = 1 - 0.45 * k; p.kneeB = 1 - 0.4 * k;
      p.armA = 1.3 * k; p.armB = -0.6 * k;
      p.axeAng = lerp(0.55, -1.15, k);
      p.headTilt = 0.35 * k;
      p.butt = 14;
      break;
    }
    case 'dead':
      p.prone = true;
      break;
    default: {
      // idle：缓慢呼吸，巨斧拄地立在手边（斧刃高过头顶 → 重装压迫感）
      const s = Math.sin(t * TAU);
      p.bob = s * 1.2;
      p.lean = 0.04 + s * 0.025;
      p.armA = 0.58 + s * 0.04;
      p.armB = -0.15 - s * 0.06;
      p.axeAng = Math.PI + 0.08 + s * 0.02;
      p.butt = 34;
      p.headTilt = s * 0.04;
      p.tailSway = s * 1.2;
      break;
    }
  }
  return p;
}

export const manyan: CharacterArtDef = {
  id: 'manyan',
  displayName: '蛮岩',
  width: 58,
  height: 80,
  palette: pal(C.iron, C.fur, C.copper, C.capeDark),
  clips: {
    idle: { name: 'idle', frameMs: 100, loop: true, durationMs: 2400 },
    run: { name: 'run', frameMs: 70, loop: true, durationMs: 840 },
    jump: { name: 'jump', frameMs: 90, loop: false, durationMs: 340 },
    fall: { name: 'fall', frameMs: 90, loop: true, durationMs: 440 },
    attack1: { name: 'attack1', frameMs: 55, loop: false, durationMs: 400 },
    attack2: { name: 'attack2', frameMs: 55, loop: false, durationMs: 400 },
    attack3: { name: 'attack3', frameMs: 60, loop: false, durationMs: 480 },
    skill: { name: 'skill', frameMs: 65, loop: false, durationMs: 560 },
    dodge: { name: 'dodge', frameMs: 45, loop: false, durationMs: 400 },
    hurt: { name: 'hurt', frameMs: 65, loop: false, durationMs: 340 },
    dead: { name: 'dead', frameMs: 130, loop: false, durationMs: 660 },
  },

  draw(state: string, phase: number): ShapeList {
    const p = poseFor(state, phase);
    const out: ShapeList = [];
    const y = p.bob;

    // —— 倒地：巨躯横陈 + 斧落在一旁，保留牛角 / 披风特征 ——
    if (p.prone) {
      out.push({ kind: 'ellipse', x: -4, y: -1, rx: 34, ry: 6, color: 0x000000, alpha: 0.34 });
      // 展开的披风
      out.push(quad(-34, -8, -10, -15, 8, -6, -12, -3, C.cape, 0.92));
      // 躯干横置
      out.push(rotRect(-12, -10, 38, 20, Math.PI / 2 + 0.05, C.iron));
      out.push(rotRect(-12, -8, 30, 8, Math.PI / 2 + 0.05, shade(C.iron, 1.15)));
      // 后腿
      out.push(limb(-28, -6, 18, 9, Math.PI / 2 + 0.35, C.furBack));
      // 牛头（角朝天）
      out.push(circle(13, -11, HEAD_R, C.fur));
      out.push({ kind: 'ellipse', x: 19, y: -8, rx: 7, ry: 5, color: C.snout });
      out.push(circle(17, -8, 1.3, C.eye));
      out.push(circle(21, -8, 1.3, C.eye));
      out.push(rod(9, -17, 4, -24, 4, C.horn));
      out.push(rod(4, -24, 2, -29, 3, C.horn));
      out.push(rod(17, -17, 23, -23, 4, C.horn));
      out.push(rod(23, -23, 26, -28, 3, C.horn));
      // 落地的巨斧
      out.push(rod(-38, -3, -16, -10, 3.6, C.wood));
      out.push(rotRect(-16, -10, 12, 14, 1.15, C.steel));
      // 尾
      out.push(...tendril(-32, -10, Math.PI + 0.3, 12, 4, 2.4, C.furBack, 0.8, 3));
      return out;
    }

    // —— 影子 ——
    out.push(shadow(23, 6, 0.32));

    // —— 技能震地冲击波 ——
    if (p.shock > 0) {
      const e = p.shock;
      out.push({ kind: 'ellipse', x: 6, y: -3, rx: 14 + e * 30, ry: 4 + e * 4, color: C.copper, alpha: 0.55 * (1 - e) });
      out.push({ kind: 'ellipse', x: 6, y: -3, rx: 8 + e * 18, ry: 3 + e * 2, color: C.cape, alpha: 0.5 * (1 - e) });
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI * 0.25 - i * 0.42;
        out.push({
          kind: 'poly',
          points: [8 + Math.cos(a) * (10 + e * 26), -4, 8 + Math.cos(a) * (15 + e * 30), -9 - e * 4, 12 + Math.cos(a) * (10 + e * 26), -3],
          color: C.copperDark, alpha: 0.7 * (1 - e),
        });
      }
    }

    // —— 牛尾（身后细尾 + 毛簇） ——
    out.push(...tendril(-13, HIP_Y - 3 + y, -Math.PI / 2 - 0.5, 15, 5, 2.6, C.furBack, p.tailSway, 3.5));
    out.push(circle(-19, -35 + y, 2.8, C.furBack));

    // —— 焦红披风（躯干后的大块面，下摆明显宽出重甲 → 两侧可见） ——
    const capeSway = Math.sin(p.lean) * 4 + p.legB * 3;
    out.push(quad(-14, SHOULDER_Y + 2 + y, 12, SHOULDER_Y + 2 + y, 25 + capeSway, -6 + y, -24 + capeSway, -6 + y, C.cape, 0.96));
    out.push(quad(-15, SHOULDER_Y + 14 + y, 12, SHOULDER_Y + 14 + y, 26 + capeSway, -16 + y, -23 + capeSway, -16 + y, C.capeDark, 0.6));

    // —— 后肢 / 后臂（暗色区分前后） ——
    out.push(...limbL(-7, HIP_Y + y, 26 * p.kneeB, 9.5, p.legB - p.lean * 0.5, shade(C.fur, 0.78)));
    out.push(limb(-6, SHOULDER_Y + y, 22, 8, p.armB - p.lean, shade(C.fur, 0.74)));

    // —— 躯干：铁灰重甲 + 暗铜饰 + 巨型护肩 ——
    const leanShift = Math.sin(p.lean) * 5;
    out.push(rotRect(0, (HIP_Y + SHOULDER_Y) / 2 + y, 31, 29, p.lean, C.iron));
    out.push(rotRect(0, SHOULDER_Y + 4 + y, 27, 10, p.lean, shade(C.iron, 1.18)));   // 胸甲亮面
    out.push(rotRect(0, HIP_Y + 1 + y, 29, 6.5, p.lean, C.ironDark));                // 腰甲
    out.push(rotRect(0, HIP_Y + 1 + y, 31, 2.6, p.lean, C.copper));                  // 腰带铜边
    out.push(rotRect(leanShift * 0.3, SHOULDER_Y + y + 3, 24, 8, p.lean, C.fur));    // 毛领
    out.push(circle(2, (HIP_Y + SHOULDER_Y) / 2 + 2 + y, 3, C.copper));              // 铜扣

    // —— 前肢 ——
    out.push(...limbL(7, HIP_Y + y, 26 * p.kneeA, 9.5, p.legA - p.lean * 0.5, C.fur));
    out.push({ kind: 'ellipse', x: 7 + Math.sin(p.legA - p.lean * 0.5) * 26 * p.kneeA, y: HIP_Y + y + Math.cos(p.legA - p.lean * 0.5) * 26 * p.kneeA, rx: 7, ry: 3.8, color: shade(C.fur, 0.66) });
    out.push({ kind: 'ellipse', x: -7 + Math.sin(p.legB - p.lean * 0.5) * 26 * p.kneeB, y: HIP_Y + y + Math.cos(p.legB - p.lean * 0.5) * 26 * p.kneeB, rx: 7, ry: 3.8, color: shade(C.fur, 0.6) });

    // —— 牛头：双弯角 + 宽鼻 + 鼻环 ——
    const hx = leanShift * 0.55 + p.headTilt * 2;
    const hy = HEAD_Y + y + p.headTilt * 1.5;
    out.push(circle(hx - HEAD_R - 1, hy + 2, 3.4, C.furBack));   // 耳
    out.push(circle(hx + HEAD_R + 1, hy + 2, 3.4, C.furBack));
    out.push(circle(hx, hy, HEAD_R, C.fur));
    // 双角（向侧后上方弯）
    for (const s of [-1, 1]) {
      const bx = hx + s * 7, by = hy - 6;
      out.push(rod(bx, by, bx + s * 8, by - 8, 4.6, C.horn));
      out.push(rod(bx + s * 8, by - 8, bx + s * 13, by - 15, 3.4, C.horn));
      out.push(circle(bx + s * 13, by - 15, 2.2, shade(C.horn, 0.85)));
    }
    // 宽鼻口吻 + 鼻孔 + 铜鼻环
    out.push({ kind: 'ellipse', x: hx + 2, y: hy + 5.5, rx: 7.6, ry: 5.4, color: C.snout });
    out.push(circle(hx - 0.5, hy + 5.5, 1.3, C.eye));
    out.push(circle(hx + 4.5, hy + 5.5, 1.3, C.eye));
    out.push(rod(hx - 1, hy + 10, hx + 5, hy + 10, 2, C.copper));
    // 眼 + 铁眉
    out.push(rod(hx - HEAD_R + 2, hy - 3.5, hx + HEAD_R - 2, hy - 3.5, 3.2, C.ironDark));
    out.push(circle(hx - 4, hy - 0.5, 1.8, C.eye));
    out.push(circle(hx + 4, hy - 0.5, 1.8, C.eye));

    // —— 前臂（握斧） + 巨斧 ——
    const armAng = p.armA - p.lean;
    out.push(limb(6, SHOULDER_Y + y, 22, 8.5, armAng, C.fur));
    // 护肩（前臂侧的巨型甲片 → 剪影关键）
    out.push(rotRect(6 + Math.sin(armAng) * 3, SHOULDER_Y + y + 2, 18, 14, armAng * 0.25 + 0.15, C.iron));
    out.push(...wedgeP(6 + Math.sin(armAng) * 6, SHOULDER_Y + y - 4, 8, 9, Math.PI + 0.35, C.copperDark));
    const hxHand = 6 + Math.sin(armAng) * 21;
    const hyHand = SHOULDER_Y + y + Math.cos(armAng) * 21;
    out.push(circle(hxHand, hyHand, 4.6, shade(C.fur, 0.9)));    // 握拳
    out.push(...greataxe(hxHand, hyHand, p.axeAng, p.axeLen, p.butt));

    return out;
  },
};

/** 三角楔形（本地包装，签名与 monsters.wedge 一致） */
function wedgeP(bx: number, by: number, w: number, len: number, ang: number, color: number): ShapeList {
  const dx = Math.sin(ang), dy = Math.cos(ang);
  const px = Math.cos(ang), py = -Math.sin(ang);
  const hw = w / 2;
  return [{
    kind: 'poly',
    points: [bx - px * hw, by - py * hw, bx + px * hw, by + py * hw, bx + dx * len, by + dy * len],
    color,
  }];
}
