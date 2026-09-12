import { Container, Graphics } from 'pixi.js';
import type { Game } from '../core/Game';
import type { Damageable, Box } from '../shared/types';

interface Bolt {
  active: boolean;
  x: number; y: number;
  vx: number; vy: number;
  born: number;
  lifeMs: number;
  dmgMul: number;
  owner: { dealTo(t: Damageable, mul: number, k: number, hs: number): void } | null;
  target: Damageable | null;
  /** BT-5 通用弹幕：命中查询 + 命中回调（玩家/任意单位发射用，与 owner/target 通道互斥） */
  hitQuery?: (box: Box) => Damageable[];
  onHit?: (t: Damageable) => void;
  view: Graphics;
}

/** 任务C：直线弹幕（对象池，远程小怪与 Boss 弹环共用） */
export class ProjectilePool {
  view = new Container();
  private pool: Bolt[] = [];

  constructor(private game: Game, private solids: readonly Box[]) {}

  fire(x: number, y: number, vx: number, vy: number, dmgMul: number, owner: Bolt['owner'], target: Damageable | null, lifeMs = 2500): void {
    let b = this.pool.find((p) => !p.active);
    if (!b) {
      const g = new Graphics();
      g.circle(0, 0, 8).fill(0xff9f43);
      this.view.addChild(g);
      b = { active: false, x: 0, y: 0, vx: 0, vy: 0, born: 0, lifeMs: 0, dmgMul: 1, owner: null, target: null, view: g };
      this.pool.push(b);
    }
    b.active = true;
    b.x = x; b.y = y; b.vx = vx; b.vy = vy;
    b.born = performance.now(); b.lifeMs = lifeMs;
    b.dmgMul = dmgMul; b.owner = owner; b.target = target;
    b.hitQuery = undefined; b.onHit = undefined;
    b.view.visible = true;
  }

  /**
   * BT-5 通用弹幕：不带固定目标，按 hitQuery 查询命中，命中后由 onHit 结算。
   * 玩家远程普攻与未来任意"方向弹"共用此通道。
   */
  fireFree(
    x: number, y: number, vx: number, vy: number,
    onHit: (t: Damageable) => void,
    hitQuery: (box: Box) => Damageable[],
    lifeMs = 2600,
  ): void {
    let b = this.pool.find((p) => !p.active);
    if (!b) {
      const g = new Graphics();
      g.circle(0, 0, 8).fill(0xff9f43);
      this.view.addChild(g);
      b = { active: false, x: 0, y: 0, vx: 0, vy: 0, born: 0, lifeMs: 0, dmgMul: 1, owner: null, target: null, view: g };
      this.pool.push(b);
    }
    b.active = true;
    b.x = x; b.y = y; b.vx = vx; b.vy = vy;
    b.born = performance.now(); b.lifeMs = lifeMs;
    b.dmgMul = 0; b.owner = null; b.target = null;
    b.hitQuery = hitQuery; b.onHit = onHit;
    b.view.visible = true;
  }

  update(dtMs: number): void {
    const now = performance.now();
    const dt = dtMs / 1000;
    for (const b of this.pool) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.view.position.set(b.x, b.y);
      const expired = now - b.born > b.lifeMs;
      const hitWall = this.solids.some((s) => b.x > s.x && b.x < s.x + s.w && b.y > s.y && b.y < s.y + s.h);
      let hit: Damageable | null = null;
      if (b.hitQuery && b.onHit) {
        const box: Box = { x: b.x - 7, y: b.y - 7, w: 14, h: 14 };
        hit = b.hitQuery(box).find((t) => t.alive) ?? null;
      } else {
        const t = b.target;
        if (t && t.alive) {
          const hb = t.hitbox;
          hit = b.x > hb.x && b.x < hb.x + hb.w && b.y > hb.y && b.y < hb.y + hb.h ? t : null;
        }
      }
      if (expired || hitWall || hit) {
        if (hit) {
          if (b.onHit) b.onHit(hit);
          else if (b.owner) b.owner.dealTo(hit, b.dmgMul, 60, 20);
        }
        b.active = false;
        b.view.visible = false;
      }
    }
  }

  get activeCount(): number { return this.pool.filter((b) => b.active).length; }
}
