/**
 * AT-2.0 灵猴（玩家）角色美术 —— 参考实现。
 *
 * 这是 AT-2.1 怪物造型的范式：一个纯函数 (state, phase) → Shape[]，
 * 原点在脚底中心、y 向上为负；朝向翻转与闪白由 art/compose.ts 统一处理。
 *
 * 造型：赤衣持棍的猴族武者（原创设计，非任何现有作品素材）。
 */
import type { CharacterArtDef, Shape, ShapeList } from '../types';
import { rotRect, regularPoly } from '../shapes';

// —— 骨架关键高度（负数向上）——
const HIP_Y = -24;
const SHOULDER_Y = -46;
const HEAD_Y = -56;
const HEAD_R = 9.5;

const C = {
  fur: 0xe0a878,
  furDark: 0x9c6b45,
  furBack: 0xb8834f,
  tunic: 0xd9482f,
  tunicDark: 0x9c2f1e,
  gold: 0xffd257,
  staff: 0x8b5a2b,
  eye: 0x1a1a1a,
  white: 0xffffff,
};

/** 肢体：从关节 (jx,jy) 沿摆角 ang（0=垂直向下，+ 向 +x 摆）伸出 */
function limb(jx: number, jy: number, len: number, w: number, ang: number, color: number): Shape {
  const cx = jx + Math.sin(ang) * len * 0.5;
  const cy = jy + Math.cos(ang) * len * 0.5;
  return rotRect(cx, cy, w, len, -ang, color);
}

/** 尾巴：从臀后向外甩出的曲线（刻意伸出身体轮廓外，保证剪影可辨） */
function tail(baseX: number, baseY: number, sway: number, color: number): ShapeList {
  const out: ShapeList = [];
  const N = 7;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const x = baseX - t * 20 + Math.sin(sway + t * 2.6) * 5 * t;
    const y = baseY - t * 14 + Math.cos(sway + t * 3.1) * 5 * t;
    out.push({ kind: 'circle', x, y, r: 3.6 - t * 1.9, color });
  }
  out.push({ kind: 'circle', x: baseX - 20 - Math.sin(sway) * 1.5, y: baseY - 17, r: 2.0, color: C.gold });
  return out;
}

/** 棍：握点 (hx,hy)，倾角 ang */
function staff(hx: number, hy: number, ang: number, len: number): ShapeList {
  const out: ShapeList = [];
  out.push(limb(hx, hy, len * 0.5, 3.4, ang, C.staff));
  const cx = hx + Math.sin(ang) * len * 0.5;
  const cy = hy + Math.cos(ang) * len * 0.5;
  out.push(limb(hx - Math.sin(ang) * 5, hy - Math.cos(ang) * 5, 8, 4.2, ang - Math.PI, C.gold));
  out.push({ kind: 'circle', x: cx, y: cy, r: 2.6, color: C.gold });
  return out;
}

interface Pose {
  bob: number;        // 整体上下浮动
  lean: number;       // 躯干前倾
  legA: number;       // 前腿摆角
  legB: number;       // 后腿摆角
  kneeA: number;      // 屈膝（缩短腿长）
  kneeB: number;
  armA: number;       // 前臂摆角
  armB: number;
  staffAng: number;   // 棍倾角
  staffLen: number;
  headTilt: number;
  tailSway: number;
  prone: boolean;     // 倒地
}

function poseFor(state: string, t: number): Pose {
  const TAU = Math.PI * 2;
  const p: Pose = {
    bob: 0, lean: 0, legA: 0, legB: 0, kneeA: 1, kneeB: 1,
    armA: 0.12, armB: -0.12, staffAng: 0.18, staffLen: 44, headTilt: 0, tailSway: 0, prone: false,
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
      p.staffAng = 0.5 + s * 0.25;
      p.tailSway = t * TAU;
      break;
    }
    case 'jump':
      p.legA = 0.5; p.legB = -0.25; p.kneeA = 0.55; p.kneeB = 0.7;
      p.armA = -1.5; p.armB = -1.1; p.staffAng = -0.9; p.lean = -0.1; p.tailSway = 1.2;
      break;
    case 'fall':
      p.legA = -0.2; p.legB = 0.25; p.kneeA = 0.95; p.kneeB = 0.95;
      p.armA = -1.9; p.armB = -1.7; p.staffAng = -0.4; p.lean = 0.05; p.tailSway = -1.0;
      break;
    case 'attack1': {
      // 横扫：抬手 → 挥出 → 收招
      const k = t < 0.35 ? t / 0.35 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      p.armA = -2.0 + k * 3.4;
      p.armB = -0.4 + k * 0.9;
      p.staffAng = -1.5 + k * 2.9;
      p.lean = 0.06 + k * 0.16;
      p.legA = 0.3; p.legB = -0.3;
      break;
    }
    case 'attack2': {
      const k = t < 0.3 ? t / 0.3 : t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
      p.armA = 1.4 - k * 3.0;
      p.armB = 0.6 - k * 0.7;
      p.staffAng = 1.4 - k * 3.2;
      p.lean = -0.08 - k * 0.1;
      p.legA = -0.35; p.legB = 0.35;
      break;
    }
    case 'attack3': {
      // 跳劈：举高 → 下砸
      const k = t < 0.4 ? t / 0.4 : 1;
      p.armA = -0.5 - k * 2.3;
      p.armB = -0.5 - k * 2.1;
      p.staffAng = -0.2 - k * 2.6;
      p.lean = -0.05 + k * 0.42;
      p.legA = 0.45 - k * 0.3; p.legB = -0.45 + k * 0.25;
      p.bob = -k * 2;
      break;
    }
    case 'skill': {
      const k = t < 0.5 ? t / 0.5 : 1;
      p.armA = -1.8 - k * 0.9; p.armB = -1.5 - k * 0.7;
      p.staffAng = -1.2 - k * 0.7;
      p.lean = 0.28 * (1 - k);
      p.legA = 0.55 * (1 - k * 0.5); p.legB = -0.5 * (1 - k * 0.5);
      p.kneeA = 0.6 + k * 0.4; p.kneeB = 0.6 + k * 0.4;
      p.bob = -3 * (1 - k);
      break;
    }
    case 'hurt': {
      const k = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
      p.lean = -0.4 * k;
      p.headTilt = -0.5 * k;
      p.armA = 1.1 * k; p.armB = -1.3 * k;
      p.staffAng = 1.0 * k;
      p.legA = -0.3 * k; p.legB = 0.35 * k;
      p.bob = 1.5 * k;
      break;
    }
    case 'dodge': {
      // 翻滚：整体下蹲缩成一团并前倾（0→0.5 团起，0.5→1 起身）
      const k = t < 0.5 ? t / 0.5 : 1 - (t - 0.5) / 0.5;
      p.bob = k * 12;
      p.lean = 0.5 + k * 0.75;
      p.legA = -1.1 * k; p.legB = -0.85 * k;
      p.kneeA = 1 - 0.55 * k; p.kneeB = 1 - 0.5 * k;
      p.armA = -0.2 + k * 0.9; p.armB = -0.5 + k * 0.6;
      p.staffAng = 1.5 * k + 0.3;
      p.headTilt = 0.6 * k;
      p.tailSway = 2.4 * k;
      break;
    }
    case 'dead':
      p.prone = true;
      break;
    default: {
      // idle：呼吸 + 轻微摆动
      const s = Math.sin(t * TAU);
      p.bob = s * 1.4;
      p.lean = s * 0.03;
      p.armA = 0.12 + s * 0.07;
      p.armB = -0.12 - s * 0.07;
      p.staffAng = 0.18 + s * 0.05;
      p.headTilt = s * 0.05;
      p.tailSway = s * 1.6;
      break;
    }
  }
  return p;
}

export const linghou: CharacterArtDef = {
  id: 'linghou',
  displayName: '灵猴',
  width: 48,
  height: 68,
  palette: { primary: C.tunic, secondary: C.fur, accent: C.gold, detail: C.tunicDark, flash: C.white },
  clips: {
    idle: { name: 'idle', frameMs: 90, loop: true, durationMs: 2000 },
    run: { name: 'run', frameMs: 60, loop: true, durationMs: 700 },
    jump: { name: 'jump', frameMs: 80, loop: false, durationMs: 300 },
    fall: { name: 'fall', frameMs: 80, loop: true, durationMs: 400 },
    attack1: { name: 'attack1', frameMs: 45, loop: false, durationMs: 280 },
    attack2: { name: 'attack2', frameMs: 45, loop: false, durationMs: 280 },
    attack3: { name: 'attack3', frameMs: 55, loop: false, durationMs: 360 },
    skill: { name: 'skill', frameMs: 60, loop: false, durationMs: 420 },
    dodge: { name: 'dodge', frameMs: 40, loop: false, durationMs: 320 },
    hurt: { name: 'hurt', frameMs: 60, loop: false, durationMs: 300 },
    dead: { name: 'dead', frameMs: 120, loop: false, durationMs: 600 },
  },

  draw(state: string, phase: number): ShapeList {
    const p = poseFor(state, phase);
    const out: ShapeList = [];
    const y = p.bob;

    // —— 倒地：整体横置 ——
    if (p.prone) {
      out.push({ kind: 'ellipse', x: -6, y: -1, rx: 26, ry: 5, color: 0x000000, alpha: 0.32 });
      out.push(rotRect(-14, -8, 30, 17, Math.PI / 2 + 0.08, C.tunic, 1));
      out.push({ kind: 'circle', x: 8, y: -9, r: HEAD_R, color: C.fur });
      out.push({ kind: 'circle', x: -30, y: -6, r: 3, color: C.furDark });
      out.push({ kind: 'circle', x: -24, y: -5, r: 2.6, color: C.furDark });
      out.push(limb(6, -8, 20, 4, Math.PI / 2 - 0.2, C.staff));
      return out;
    }

    // —— 影子 ——
    out.push({ kind: 'ellipse', x: 0, y: -1, rx: 17, ry: 5, color: 0x000000, alpha: 0.3 });

    // —— 尾巴（在身后，伸出轮廓外）——
    out.push(...tail(-11, HIP_Y - 5, p.tailSway, C.furDark));

    // —— 后腿 / 后臂（先画，压在下层；用更暗的色区分前后肢）——
    out.push(limb(-6, HIP_Y + y, 24 * p.kneeB, 8, p.legB - p.lean * 0.5, C.furBack));
    out.push(limb(-5, SHOULDER_Y + y, 20, 6.5, p.armB - p.lean, C.furBack));

    // —— 躯干 ——
    const leanShift = Math.sin(p.lean) * 4;
    out.push(rotRect(0, (HIP_Y + SHOULDER_Y) / 2 + y, 21, 25, p.lean, C.tunic));
    out.push(rotRect(0, HIP_Y + y - 1, 23, 6, p.lean, C.gold));            // 腰带
    out.push(rotRect(leanShift * 0.4, SHOULDER_Y + y + 4, 20, 7, p.lean, C.tunicDark)); // 肩甲/领

    // —— 前腿 ——
    out.push(limb(6, HIP_Y + y, 24 * p.kneeA, 8, p.legA - p.lean * 0.5, C.fur));

    // —— 头 ——
    const hx = leanShift * 0.55 + p.headTilt * 2;
    const hy = HEAD_Y + y + p.headTilt * 1.5;
    out.push({ kind: 'circle', x: hx - 9, y: hy + 1, r: 3.6, color: C.fur });   // 耳
    out.push({ kind: 'circle', x: hx + 9, y: hy + 1, r: 3.6, color: C.fur });
    out.push({ kind: 'circle', x: hx, y: hy, r: HEAD_R, color: C.fur });        // 脸
    out.push({ kind: 'ellipse', x: hx + 1, y: hy + 3.5, rx: 5.4, ry: 4.2, color: 0xf7d9b6 }); // 口吻
    out.push({ kind: 'circle', x: hx - 3.4, y: hy - 1.6, r: 1.7, color: C.eye, alpha: p.prone ? 0.5 : 1 });
    out.push({ kind: 'circle', x: hx + 3.4, y: hy - 1.6, r: 1.7, color: C.eye });
    out.push({ kind: 'circle', x: hx + 1, y: hy + 4.2, r: 1.1, color: 0xc98b6a }); // 鼻
    // 金箍
    out.push(rotRect(hx, hy - HEAD_R + 1.5, HEAD_R * 2.1, 3.2, p.headTilt * 0.4, C.gold));
    out.push(regularPoly(hx, hy - HEAD_R - 1.4, 3.0, 6, Math.PI / 6, C.gold));

    // —— 前臂 + 棍 ——
    out.push(limb(5, SHOULDER_Y + y, 20, 6.5, p.armA - p.lean, C.fur));
    const hxHand = 5 + Math.sin(p.armA - p.lean) * 19;
    const hyHand = SHOULDER_Y + y + Math.cos(p.armA - p.lean) * 19;
    out.push(...staff(hxHand, hyHand, p.staffAng, p.staffLen));

    return out;
  },
};
