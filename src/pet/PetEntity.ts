/**
 * BT-6.1 宠物实体 —— pixi 表现层（造型内联 Graphics，程序化）。
 *
 * 照 src/art/chars/linghou.ts 范式：纯函数 (时间) → ShapeList，
 * 用 src/art/shapes 辅助构造形状，经 art/pixiRender.drawShapes 画进自身 Graphics。
 * 坐标约定：宠物本体中心为原点，y 向上为负；朝向翻转由 view.scale.x 统一处理。
 *
 * 职责边界：只负责**跟随移动与造型表现**，不负责攻击结算
 * （场景用 PetSystem.petAttackStep 决策后自行注入弹幕）。
 */
import { Container, Graphics } from 'pixi.js';
import type { ShapeList } from '../art/types';
import { drawShapes } from '../art/pixiRender';
import { rotRect } from '../art/shapes';
import { petFollowPos } from './PetSystem';
import type { PetDef } from './PetSystem';

const TAU = Math.PI * 2;

// ───────── 造型：咕咕鸟（attacker，青羽小鸟） ─────────

const GUGU = {
  body: 0x6fbef0,
  bodyDark: 0x4d97cc,
  belly: 0xdcf0ff,
  beak: 0xf5a623,
  eye: 0x20242c,
  white: 0xffffff,
};

/** 咕咕鸟：圆身 + 翅膀扑扇相位 + 悬浮浮动。t 单位秒 */
export function drawGuguShapes(t: number): ShapeList {
  const out: ShapeList = [];
  const bob = Math.sin(t * TAU * 1.4) * 2.2;
  const flap = Math.sin(t * TAU * 5.2); // 扑翅相位

  out.push({ kind: 'ellipse', x: 0, y: 19, rx: 11, ry: 3.2, color: 0x000000, alpha: 0.24 });

  // 尾羽（身后，压在下层）
  out.push(rotRect(-9, 3 + bob * 0.5, 10, 4, 0.55, GUGU.bodyDark));
  out.push(rotRect(-9, 0.5 + bob * 0.5, 9, 3.4, 0.15, GUGU.body));

  // 身体
  out.push({ kind: 'circle', x: 0, y: bob, r: 10.5, color: GUGU.body });
  out.push({ kind: 'ellipse', x: 2, y: bob + 4, rx: 6.2, ry: 4.8, color: GUGU.belly });

  // 翅膀：绕肩点上下扑扇（+ 扑翅时略前伸）
  const wingAng = 0.55 + flap * 0.75;
  const wx = -2 + flap * 1.2, wy = -2.5 + bob;
  out.push(rotRect(
    wx - Math.sin(wingAng) * 5.5,
    wy + Math.cos(wingAng) * 5.5,
    12.5, 6.5, wingAng + Math.PI / 2, GUGU.bodyDark,
  ));

  // 头
  out.push({ kind: 'circle', x: 4.5, y: bob - 8, r: 7.5, color: GUGU.body });
  out.push({ kind: 'circle', x: 2.5, y: bob - 14.5, r: 2.1, color: GUGU.bodyDark }); // 头顶翎
  // 喙（前方小三角）
  out.push({ kind: 'poly', points: [11, bob - 9.8, 17, bob - 8, 11, bob - 6.2], color: GUGU.beak });
  // 眼
  out.push({ kind: 'circle', x: 6.8, y: bob - 9.4, r: 2.6, color: GUGU.white });
  out.push({ kind: 'circle', x: 7.7, y: bob - 9.4, r: 1.35, color: GUGU.eye });

  return out;
}

// ───────── 造型：火狐狸（buffer，尾焰灵狐） ─────────

const FOX = {
  fur: 0xf2803a,
  furDark: 0xd95f22,
  cream: 0xffe8c9,
  tip: 0xffd257,
  tipCore: 0xfff3c2,
  eye: 0x2a1c12,
};

/** 火狐狸：尖耳 + 尾巴摆动相位。t 单位秒 */
export function drawFoxShapes(t: number): ShapeList {
  const out: ShapeList = [];
  const bob = Math.sin(t * TAU * 1.1) * 1.6;
  const sway = t * TAU * 1.25; // 尾巴摆动相位

  out.push({ kind: 'ellipse', x: 0, y: 17, rx: 12.5, ry: 3.4, color: 0x000000, alpha: 0.24 });

  // 后耳（压在下层，更暗）
  out.push({ kind: 'poly', points: [0, bob - 11, 3.5, bob - 22, 8, bob - 10.5], color: FOX.furDark });

  // 尾巴：从臀后甩出的弧线链（伸出轮廓外），末端火焰
  let tipX = 0, tipY = 0;
  const N = 7;
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    const x = -9 - k * 15;
    const y = bob + 1 - k * 13 + Math.sin(sway + k * 2.4) * 3.2 * k;
    const r = 3.2 + Math.sin(k * Math.PI) * 2.4;
    out.push({ kind: 'circle', x, y, r, color: i < 2 ? FOX.fur : FOX.furDark });
    tipX = x; tipY = y;
  }
  out.push({ kind: 'circle', x: tipX - 0.5, y: tipY - 1, r: 3.1, color: FOX.tip });
  out.push({ kind: 'circle', x: tipX - 0.5, y: tipY - 1, r: 1.6, color: FOX.tipCore });

  // 四只小脚
  out.push({ kind: 'ellipse', x: -6, y: bob + 12.5, rx: 2.6, ry: 2, color: FOX.furDark });
  out.push({ kind: 'ellipse', x: 6, y: bob + 12.5, rx: 2.6, ry: 2, color: FOX.furDark });

  // 躯干 + 胸腹
  out.push({ kind: 'ellipse', x: 0, y: bob + 3, rx: 11.5, ry: 8.5, color: FOX.fur });
  out.push({ kind: 'ellipse', x: 3.5, y: bob + 5, rx: 5.5, ry: 4.6, color: FOX.cream });

  // 头 + 口吻
  out.push({ kind: 'circle', x: 7, y: bob - 7.5, r: 8, color: FOX.fur });
  out.push({ kind: 'ellipse', x: 12.5, y: bob - 5.5, rx: 4.4, ry: 3.4, color: FOX.cream });
  out.push({ kind: 'circle', x: 15.8, y: bob - 6.5, r: 1.5, color: FOX.eye });

  // 前耳（尖）+ 内耳
  out.push({ kind: 'poly', points: [4.5, bob - 12, 8.5, bob - 23, 11.5, bob - 11], color: FOX.fur });
  out.push({ kind: 'poly', points: [6.6, bob - 13.5, 8.5, bob - 20, 10.2, bob - 13], color: FOX.furDark });

  // 眼
  out.push({ kind: 'circle', x: 8.6, y: bob - 9.2, r: 1.3, color: FOX.eye });
  out.push({ kind: 'circle', x: 12.8, y: bob - 8.4, r: 1.3, color: FOX.eye });

  return out;
}

// ───────── 造型：玉兔（buffer，长耳跳跃） ─────────

const RABBIT = {
  fur: 0xf2f5f9,
  furShade: 0xd4dde6,
  ear: 0xf7b8c4,
  eye: 0xd8434e,
  jade: 0x59d6b2,
  jadeDark: 0x35a986,
};

/** 玉兔：长耳 + 跳跃相位（落地压扁/起跳恢复）。t 单位秒 */
export function drawRabbitShapes(t: number): ShapeList {
  const out: ShapeList = [];
  const hop = Math.abs(Math.sin(t * TAU * 1.1)); // 跳跃相位 0(落地)~1(最高点)
  const y = -hop * 5.5;
  const squash = 1 - (1 - hop) * 0.18;            // 落地压扁
  const earWig = Math.sin(t * TAU * 1.1 + 1.1) * 0.1;

  // 影子随高度收缩变淡
  out.push({ kind: 'ellipse', x: 0, y: 17, rx: 11 - hop * 2.5, ry: 3.2 - hop * 0.7, color: 0x000000, alpha: 0.26 - hop * 0.07 });

  // 长耳（先画压在下层）：白色长条 + 粉内耳
  out.push(rotRect(-2, y - 15, 4.6, 17, 0.22 + earWig, RABBIT.furShade));
  out.push(rotRect(-2, y - 15, 2.1, 12, 0.22 + earWig, RABBIT.ear));
  out.push(rotRect(5, y - 14.5, 4.6, 17, -0.16 + earWig * 0.8, RABBIT.fur));
  out.push(rotRect(5, y - 14.5, 2.1, 12, -0.16 + earWig * 0.8, RABBIT.ear));

  // 后脚
  out.push({ kind: 'ellipse', x: -5, y: y + 11.5, rx: 3, ry: 2.1, color: RABBIT.furShade });

  // 身体（落地压扁）
  out.push({ kind: 'ellipse', x: -0.5, y: y + 3.5, rx: 10.5, ry: 9 * squash, color: RABBIT.fur });

  // 玉饰项圈 + 坠（月宫玉色）
  out.push({ kind: 'ellipse', x: 1.5, y: y + 6.5, rx: 5.6, ry: 2, color: RABBIT.jadeDark });
  out.push({ kind: 'circle', x: 1.5, y: y + 9.6, r: 2.3, color: RABBIT.jade });

  // 头
  out.push({ kind: 'circle', x: 3, y: y - 6.5, r: 7.8, color: RABBIT.fur });
  // 红瞳 + 粉鼻
  out.push({ kind: 'circle', x: 4.8, y: y - 7.7, r: 1.5, color: RABBIT.eye });
  out.push({ kind: 'circle', x: 8.8, y: y - 7.4, r: 1.5, color: RABBIT.eye });
  out.push({ kind: 'circle', x: 9.8, y: y - 4.7, r: 1.05, color: RABBIT.ear });

  // 前脚
  out.push({ kind: 'ellipse', x: 5, y: y + 11 * squash + 0.5, rx: 2.8, ry: 2, color: RABBIT.fur });

  return out;
}

/** 按宠物 id 取造型函数（未知 id 回退为咕咕鸟，保证任何配置都能显示） */
export function petShapes(id: string, t: number): ShapeList {
  switch (id) {
    case 'pet_gugu': return drawGuguShapes(t);
    case 'pet_fox': return drawFoxShapes(t);
    case 'pet_rabbit': return drawRabbitShapes(t);
    default: return drawGuguShapes(t);
  }
}

// ───────── 实体 ─────────

/** 跟随平滑系数的时间常数（越小跟得越紧）；≈0.17s 收敛到 63% */
const FOLLOW_LAG_MS = 170;

/**
 * 宠物 pixi 实体（冻结接口）。
 * update(dtMs, ownerX, ownerY, facing)：平滑跟随主人身后 46px / 悬浮 -30px 处，
 * 像被牵引一样滞后收敛；自身带 idle 相位动画（扑翅/摆尾/跳跃）。
 */
export class PetEntity {
  readonly view: Container;

  private def: PetDef;
  private g: Graphics;
  private phaseMs: number;
  private x = 0;
  private y = 0;
  private started = false;

  constructor(def: PetDef) {
    this.def = def;
    this.view = new Container();
    this.g = new Graphics();
    this.view.addChild(this.g);
    this.phaseMs = Math.random() * 2000; // 错开多只宠物的动画相位
    this.redraw();
  }

  update(dtMs: number, ownerX: number, ownerY: number, facing: 1 | -1): void {
    this.phaseMs += dtMs;
    const target = petFollowPos(ownerX, ownerY, facing);
    if (!this.started) {
      this.started = true;
      this.x = target.x;
      this.y = target.y;
    } else if (dtMs > 0) {
      const k = 1 - Math.exp(-dtMs / FOLLOW_LAG_MS);
      this.x += (target.x - this.x) * k;
      this.y += (target.y - this.y) * k;
    }
    this.view.position.set(this.x, this.y);
    this.view.scale.x = facing; // 朝向镜像（造型默认朝 +x）
    this.redraw();
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  /** 重画造型（形状数据 → 自身 Graphics，与软件光栅化器共用同一套数据） */
  private redraw(): void {
    this.g.clear();
    drawShapes(this.g, petShapes(this.def.id, this.phaseMs / 1000));
  }
}
