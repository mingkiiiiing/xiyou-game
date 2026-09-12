/**
 * BT-5.2 云璿（玩家可选角色 · 龙族少女法师）。
 *
 * 范式与 linghou.ts 一致：纯函数 (state, phase) → Shape[]，
 * 原点在脚底中心、y 向上为负；朝向翻转与闪白由 art/compose.ts 统一处理。
 *
 * 造型：纤细飘逸的龙族少女——青蓝长袍无腿（悬浮裙摆，比巫祝更华丽的多层裙）、
 * 银白长发双飘带 + 珍珠金小龙角、白玉法杖（杖首龙珠）。
 * 她是远程普攻角色：attack 系列做成"抬手向前施法"，skill 蓄力明显（杖首龙珠胀光）。
 * 发丝 / 裙摆全程随相位摆动。
 */
import type { CharacterArtDef, ShapeList } from '../types';
import { rotRect, quad, shade } from '../shapes';
import { circle, rod, tendril, shadow, pal, TAU } from './monsters';

// —— 骨架关键高度（负数向上；纤细体型） ——
const SHOULDER_Y = -45;
const HEAD_Y = -56;
const HEAD_R = 8.2;
const HEM_Y = -6;      // 裙摆底（悬浮，不着地）

const C = {
  robe: 0x3a7ca8,      // 青蓝主袍
  robeDark: 0x235274,  // 袍暗层
  robeLight: 0x7fc4e0, // 袍亮层 / 法光
  sleeve: 0x2e6a92,    // 水袖
  hair: 0xdfe8f0,      // 银白长发
  hairDark: 0xaebfcc,
  gold: 0xe8c884,      // 珍珠金
  pearl: 0xf6eed8,     // 龙珠
  skin: 0xf6dcc6,
  eye: 0x2a5f8a,
  wood: 0x9a7a58,      // 杖身
  white: 0xffffff,
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * 法杖：握点 (hx,hy)，杖头方向 ang（PI≈竖直向上）；杖首 = 龙珠 + 金龙咬珠饰。
 */
function staff(hx: number, hy: number, ang: number, len: number, orb: number): ShapeList {
  const o: ShapeList = [];
  const dx = Math.sin(ang), dy = Math.cos(ang);
  const tx = hx + dx * len, ty = hy + dy * len;
  o.push(rod(hx - dx * 8, hy - dy * 8, tx, ty, 2.4, C.wood));
  o.push(rod(hx - dx * 8, hy - dy * 8, hx - dx * 4, hy - dy * 4, 3.2, C.gold));
  // 杖首：金龙托珠（两侧小角 + 珠）
  o.push(rod(tx, ty, tx - 4.5, ty - 1.5, 1.8, C.gold));
  o.push(rod(tx, ty, tx + 4.5, ty - 1.5, 1.8, C.gold));
  const r = 3.1 + orb * 3.2;
  o.push({ kind: 'circle', x: tx, y: ty - 2.5, r, color: C.pearl });
  o.push({ kind: 'circle', x: tx, y: ty - 2.5, r: r + 2.4 + orb * 4, color: C.robeLight, alpha: 0.3 + orb * 0.3 });
  o.push({ kind: 'circle', x: tx - r * 0.3, y: ty - 2.5 - r * 0.3, r: r * 0.32, color: C.white, alpha: 0.9 });
  return o;
}

interface Pose {
  bob: number;        // 悬浮上下浮动
  lean: number;
  armA: number;       // 前臂（施法手）
  armB: number;       // 后臂（持杖手）
  staffAng: number;
  headTilt: number;
  hairSway: number;   // 发丝相位
  hemSway: number;    // 裙摆摆动幅度基准
  flare: number;      // 裙摆张开（jump/fall 向上翻飞）
  orb: number;        // 施法光球强度 0~1
  shock: number;      // 技能释放环 0~1（0 = 无）
  prone: boolean;
}

function poseFor(state: string, t: number): Pose {
  const p: Pose = {
    bob: 0, lean: 0, armA: 0.35, armB: -0.32, staffAng: Math.PI + 0.35,
    headTilt: 0, hairSway: 0, hemSway: 0, flare: 0, orb: 0, shock: 0, prone: false,
  };
  switch (state) {
    case 'run': {
      // 裙摆不离地地"滑行"，衣袂向后飘
      const s = Math.sin(t * TAU);
      p.lean = 0.18;
      p.bob = -2 + Math.abs(s) * 2;
      p.armA = 0.3 - s * 0.55;
      p.armB = -0.3 + s * 0.4;
      p.staffAng = Math.PI + 0.5 + s * 0.15;
      p.hairSway = t * TAU;
      p.hemSway = s * 1.6;
      p.flare = 0.35 + Math.max(0, s) * 0.2;
      break;
    }
    case 'jump':
      p.flare = 1;
      p.armA = -1.35; p.armB = -1.05; p.staffAng = Math.PI - 0.2;
      p.bob = -3; p.lean = -0.08; p.hairSway = 1.4; p.hemSway = 0.6;
      break;
    case 'fall':
      p.flare = 0.75;
      p.armA = -1.85; p.armB = -1.6; p.staffAng = 0.6;
      p.lean = 0.05; p.hairSway = -1.2; p.hemSway = -0.5;
      break;
    case 'attack1': {
      // 弹指：抬手向前推出法球（远程普攻）
      const k = t < 0.35 ? t / 0.35 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      p.armA = lerp(0.35, 1.62, k);
      p.armB = lerp(-0.32, -0.55, k);
      p.lean = 0.1 * k;
      p.orb = k < 0.75 ? k : 1 - (k - 0.75) / 0.25;
      p.hairSway = k * 0.8;
      break;
    }
    case 'attack2': {
      // 划弧：横扫聚气 → 掷出
      const k = t < 0.3 ? t / 0.3 : t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
      p.armA = lerp(-0.6, 1.85, k);
      p.armB = lerp(-0.4, -0.7, k);
      p.lean = -0.08 + k * 0.24;
      p.orb = k < 0.7 ? k * 0.8 : 1 - (k - 0.7) / 0.3;
      p.hairSway = 1 + k;
      break;
    }
    case 'attack3': {
      // 指天引雷：杖指上方蓄 → 向前下方轰出
      if (t < 0.4) {
        const u = t / 0.4;
        p.armA = lerp(0.35, -2.5, u);
        p.armB = lerp(-0.32, -2.6, u);
        p.staffAng = lerp(Math.PI + 0.35, Math.PI - 0.15, u);
        p.lean = -0.1 * u;
        p.orb = u * 0.5;
        p.hairSway = -u;
      } else {
        const u = Math.min(1, (t - 0.4) / 0.25);
        p.armA = lerp(-2.5, 1.5, u);
        p.armB = lerp(-2.6, -0.5, u);
        p.staffAng = lerp(Math.PI - 0.15, 1.25, u);
        p.lean = lerp(-0.1, 0.3, u);
        p.orb = 1 - Math.max(0, (t - 0.65) / 0.35);
        p.hairSway = 1.5 + u;
      }
      break;
    }
    case 'skill': {
      // 沧龙吟：拄杖蓄力（龙珠胀光、裙摆上扬）→ 释放扩散环
      if (t < 0.5) {
        const u = t / 0.5;
        p.bob = u * 3;
        p.armA = lerp(0.35, 0.9, u);
        p.armB = lerp(-0.32, -0.9, u);
        p.staffAng = lerp(Math.PI + 0.35, Math.PI + 0.06, u);   // 杖竖举蓄力
        p.lean = 0.06 + u * 0.1;
        p.orb = u;
        p.hairSway = Math.sin(t * TAU * 3) * u;
        p.flare = u * 0.8;
      } else {
        const u = (t - 0.5) / 0.5;
        p.bob = lerp(3, -1, u);
        p.armA = lerp(0.9, 1.6, u);
        p.armB = lerp(-0.9, -1.4, u);
        p.staffAng = lerp(Math.PI + 0.06, 1.35, u);
        p.lean = lerp(0.16, 0.32, u);
        p.orb = 1 - u * 0.6;
        p.shock = Math.max(0, (t - 0.55) / 0.45);
        p.flare = lerp(0.8, 0.3, u);
        p.hairSway = 2 * u;
      }
      break;
    }
    case 'hurt': {
      const k = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
      p.lean = -0.42 * k;
      p.headTilt = -0.45 * k;
      p.armA = 0.35 + 1.0 * k;
      p.armB = -0.32 - 1.1 * k;
      p.staffAng = Math.PI + 0.35 + 0.8 * k;
      p.hairSway = -1.8 * k;
      p.hemSway = -1.2 * k;
      p.bob = 1.5 * k;
      break;
    }
    case 'dodge': {
      // 瞬身：裙摆横抽、发丝甩尾
      const k = t < 0.5 ? t / 0.5 : 1 - (t - 0.5) / 0.5;
      p.bob = k * 6;
      p.lean = 0.38 * k;
      p.armA = 1.1 * k; p.armB = -1.2 * k;
      p.staffAng = Math.PI + 0.35 + 0.7 * k;
      p.hemSway = 2.2 * k;
      p.hairSway = -2.4 * k;
      p.flare = 0.5 * k;
      break;
    }
    case 'dead':
      p.prone = true;
      break;
    default: {
      // idle：悬浮呼吸，发丝与裙摆轻摆，杖负于肩后
      const s = Math.sin(t * TAU);
      p.bob = s * 1.7;
      p.lean = s * 0.03;
      p.armA = 0.35 + s * 0.06;
      p.armB = -0.32 - s * 0.05;
      p.staffAng = Math.PI + 0.35 + s * 0.04;
      p.headTilt = s * 0.05;
      p.hairSway = s * 1.6;
      p.hemSway = s * 0.8;
      break;
    }
  }
  return p;
}

export const yunxuan: CharacterArtDef = {
  id: 'yunxuan',
  displayName: '云璿',
  width: 46,
  height: 72,
  palette: pal(C.robe, C.hair, C.robeLight, C.robeDark),
  clips: {
    idle: { name: 'idle', frameMs: 85, loop: true, durationMs: 2000 },
    run: { name: 'run', frameMs: 55, loop: true, durationMs: 660 },
    jump: { name: 'jump', frameMs: 75, loop: false, durationMs: 300 },
    fall: { name: 'fall', frameMs: 75, loop: true, durationMs: 400 },
    attack1: { name: 'attack1', frameMs: 45, loop: false, durationMs: 280 },
    attack2: { name: 'attack2', frameMs: 45, loop: false, durationMs: 300 },
    attack3: { name: 'attack3', frameMs: 55, loop: false, durationMs: 380 },
    skill: { name: 'skill', frameMs: 60, loop: false, durationMs: 520 },
    dodge: { name: 'dodge', frameMs: 40, loop: false, durationMs: 300 },
    hurt: { name: 'hurt', frameMs: 60, loop: false, durationMs: 300 },
    dead: { name: 'dead', frameMs: 120, loop: false, durationMs: 600 },
  },

  draw(state: string, phase: number): ShapeList {
    const p = poseFor(state, phase);
    const out: ShapeList = [];
    const y = p.bob;

    // —— 倒地：侧躺 + 裙摆铺开 + 长发散地，保留龙角 / 杖特征 ——
    if (p.prone) {
      out.push({ kind: 'ellipse', x: -4, y: -1, rx: 24, ry: 5, color: 0x000000, alpha: 0.3 });
      // 铺开的裙摆
      out.push(quad(-8, -6, 8, -10, -14, -3, -26, -5, C.robe));
      out.push(quad(-26, -5, -14, -3, -30, -1, -24, -1, C.robeDark, 0.9));
      // 躯干
      out.push(rotRect(-10, -8, 26, 13, Math.PI / 2 + 0.1, C.robe));
      // 散开的长发
      out.push(...tendril(-14, -9, Math.PI + 0.35, 16, 6, 3, C.hair, 1.2, 3));
      // 头 + 龙角
      out.push(circle(8, -10, HEAD_R, C.skin));
      out.push({ kind: 'circle', x: 4, y: -12, r: 4.6, color: C.hair });
      out.push(rod(9, -17, 11, -22, 2, C.gold));
      out.push(rod(5, -18, 5.5, -23, 2, C.gold));
      out.push(circle(12, -9, 1.5, C.eye));
      // 落地的法杖
      out.push(rod(-6, -3, 16, -6, 2.2, C.wood));
      out.push(circle(17, -6, 2.8, C.pearl));
      return out;
    }

    // —— 影子（悬浮，淡而小） ——
    out.push(shadow(13, 4, 0.22));

    // —— 技能释放环 ——
    if (p.shock > 0) {
      const e = p.shock;
      out.push({ kind: 'ellipse', x: 4, y: -3, rx: 10 + e * 30, ry: 3 + e * 3.5, color: C.robeLight, alpha: 0.6 * (1 - e) });
      out.push({ kind: 'ellipse', x: 4, y: -3, rx: 6 + e * 18, ry: 2 + e * 2, color: C.pearl, alpha: 0.5 * (1 - e) });
    }

    // —— 背后长发双飘带（最底层，随相位大幅摆动；向后下流） ——
    out.push(...tendril(-5, HEAD_Y + 2 + y, -0.62, 20, 7, 3.4, C.hairDark, p.hairSway, 4.5, 2));
    out.push(...tendril(3, HEAD_Y + 1 + y, -0.85, 24, 7, 3.6, C.hair, p.hairSway + 1.1, 5, 3));

    // —— 后臂（持杖手，压暗） ——
    const armB = p.armB - p.lean;
    const sbx = -4, sby = SHOULDER_Y + y;
    out.push(rod(sbx, sby, sbx + Math.sin(armB) * 17, sby + Math.cos(armB) * 17, 4.6, shade(C.sleeve, 0.82)));
    const bx2 = sbx + Math.sin(armB) * 17, by2 = sby + Math.cos(armB) * 17;
    out.push({ kind: 'circle', x: bx2, y: by2, r: 2.4, color: shade(C.skin, 0.9) });
    // —— 法杖（持在后手，负于肩后） ——
    out.push(...staff(bx2, by2, p.staffAng, 32, p.orb * 0.5));

    // —— 长袍躯干（无腿，多层裙摆 + 上扬翻飞） ——
    const sway = p.hemSway * 2.4 + Math.sin(p.lean) * 2;
    const flare = p.flare;
    const hemY = HEM_Y + y - flare * 4;
    const hemW = 12 + flare * 6;
    out.push(quad(-5.5, SHOULDER_Y + 8 + y, 5.5, SHOULDER_Y + 8 + y, hemW + sway, hemY, -hemW + sway, hemY, C.robeDark));       // 暗层（更长）
    out.push(quad(-5.5, SHOULDER_Y + 8 + y, 5.5, SHOULDER_Y + 8 + y, (hemW - 2.5) + sway * 0.8, hemY + 3, -(hemW - 2.5) + sway * 0.8, hemY + 3, C.robe));
    // 裙摆金边 + 波浪垂饰
    out.push(rod(-(hemW - 2.5) + sway * 0.8, hemY + 3, (hemW - 2.5) + sway * 0.8, hemY + 3, 1.8, C.gold));
    for (let i = -1; i <= 1; i++) {
      out.push({ kind: 'circle', x: i * (hemW * 0.55) + sway * 0.8, y: hemY + 5, r: 1.7, color: C.gold, alpha: 0.95 });
    }
    // 束腰玉带 + 玉佩
    out.push(rotRect(0, SHOULDER_Y + 10 + y, 12.5, 3.4, p.lean, C.gold));
    out.push({ kind: 'circle', x: 2, y: SHOULDER_Y + 14.5 + y, r: 2.2, color: 0x6fd4a0 });
    out.push({ kind: 'circle', x: 2, y: SHOULDER_Y + 14.5 + y, r: 3.6, color: 0x6fd4a0, alpha: 0.3 });
    // 领口 V 字银边
    out.push(quad(-4.5, SHOULDER_Y + y + 1.5, 4.5, SHOULDER_Y + y + 1.5, 0, SHOULDER_Y + y + 9, -1, SHOULDER_Y + y + 7, C.robeLight));

    // —— 头：少女脸 + 银发 + 珍珠金小龙角 ——
    const leanShift = Math.sin(p.lean) * 4;
    const hx = leanShift * 0.55 + p.headTilt * 2;
    const hy = HEAD_Y + y + p.headTilt * 1.5;
    // 后侧发量
    out.push({ kind: 'circle', x: hx - 3, y: hy + 2, r: HEAD_R * 0.98, color: C.hairDark });
    out.push({ kind: 'circle', x: hx + 3.5, y: hy + 1, r: HEAD_R * 0.95, color: C.hair });
    // 脸
    out.push({ kind: 'circle', x: hx + 1, y: hy + 1.5, r: HEAD_R * 0.72, color: C.skin });
    // 刘海
    out.push({ kind: 'circle', x: hx - 1, y: hy - 3.5, r: HEAD_R * 0.72, color: C.hair });
    out.push({ kind: 'circle', x: hx + 4.5, y: hy - 2.5, r: HEAD_R * 0.5, color: C.hair });
    // 眼（青蓝） + 腮红
    out.push({ kind: 'circle', x: hx + 3.2, y: hy + 1.2, r: 1.5, color: C.eye });
    out.push({ kind: 'circle', x: hx - 1.6, y: hy + 1.2, r: 1.5, color: C.eye });
    out.push({ kind: 'circle', x: hx + 3.4, y: hy + 3.6, r: 1.1, color: 0xf0b090, alpha: 0.7 });
    out.push({ kind: 'circle', x: hx - 1.8, y: hy + 3.6, r: 1.1, color: 0xf0b090, alpha: 0.7 });
    // 小龙角（珍珠金，向后弯的小分叉）
    for (const s of [-1, 1]) {
      const bx3 = hx + s * 3, by3 = hy - HEAD_R + 1;
      out.push(rod(bx3, by3, bx3 + s * 2.6, by3 - 5, 1.8, C.gold));
      out.push(rod(bx3 + s * 1.4, by3 - 3, bx3 + s * 4.4, by3 - 4.6, 1.3, C.gold));
    }
    // 发饰珠
    out.push({ kind: 'circle', x: hx - 4, y: hy - 5.5, r: 1.3, color: C.pearl });

    // —— 前臂（施法手） + 水袖 + 法球 ——
    const armA = p.armA - p.lean;
    const sfx = 4, sfy = SHOULDER_Y + y;
    const ex = sfx + Math.sin(armA) * 17, ey = sfy + Math.cos(armA) * 17;
    out.push(rod(sfx, sfy, ex, ey, 4.6, C.sleeve));
    // 水袖（腕口放宽 → 飘逸感）
    const wx = sfx + Math.sin(armA) * 12, wy = sfy + Math.cos(armA) * 12;
    out.push({ kind: 'ellipse', x: wx, y: wy, rx: 4.6, ry: 3.4, color: C.robeLight });
    out.push({ kind: 'circle', x: ex, y: ey, r: 2.5, color: C.skin });
    // 施法光球（远程普攻弹丸的可视来源）
    if (p.orb > 0.05) {
      const r = 1.6 + p.orb * 3.4;
      const fx = ex + Math.sin(armA) * 5, fy = ey + Math.cos(armA) * 5;
      out.push({ kind: 'circle', x: fx, y: fy, r, color: C.robeLight, alpha: 0.95 });
      out.push({ kind: 'circle', x: fx, y: fy, r: r * 1.9, color: C.robeLight, alpha: 0.3 });
      out.push({ kind: 'circle', x: fx - r * 0.3, y: fy - r * 0.3, r: r * 0.3, color: C.white });
    }

    return out;
  },
};
