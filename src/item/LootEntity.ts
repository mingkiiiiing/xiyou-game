/**
 * IT-1.2 地面掉落物实体：品质色光柱 + 上下浮动 + 落地物理 + 拾取范围判定。
 * 被拾取时飞向玩家并在到达后消失（由场景驱动状态机）。
 */
import { Graphics } from 'pixi.js';
import { Entity } from '../core/Entity';
import type { Game } from '../core/Game';
import type { Box } from '../shared/types';
import { moveAndCollide } from '../core/Physics';
import type { InventoryItem } from './types';
import { QUALITY_COLOR } from './data';

const GRAVITY = 1500;
const PICKUP_RANGE = 70;   // 走到这个距离内即自动拾取
const MAGNET_MS = 220;     // 飞向玩家的时长
const BOB_AMP = 4;
const BOB_PERIOD = 760;

export type LootState = 'ground' | 'magnet' | 'taken';

export class LootEntity extends Entity {
  readonly item: InventoryItem;
  state: LootState = 'ground';

  private solids: readonly Box[];
  private bornAt = performance.now();
  private magnetAt = 0;
  private magnetFrom = { x: 0, y: 0 };
  private magnetTo = { x: 0, y: 0 };
  private grounded = false;

  constructor(game: Game, item: InventoryItem, x: number, y: number, solids: readonly Box[]) {
    super(game, 24, 24);
    this.item = item;
    this.solids = solids;
    this.body.x = x;
    this.body.y = y;
    this.vx = (Math.random() - 0.5) * 130;
    this.vy = -280 - Math.random() * 120;

    const color = QUALITY_COLOR[item.quality];
    const beam = new Graphics();
    beam.rect(-10, -130, 20, 130).fill({ color, alpha: 0.15 });
    beam.rect(-5, -130, 10, 130).fill({ color, alpha: 0.26 });
    const core = new Graphics();
    core.circle(0, -8, 8).fill(color);
    core.circle(0, -8, 3).fill(0xffffff);
    this.view.addChild(beam, core);
    // 视点锚在脚底，故把图形整体上移，使光柱根部落在脚底
    this.view.pivot.y = 0;
  }

  /** 进入吸附飞行（由场景在拾取范围内调用） */
  beginMagnet(targetX: number, targetY: number): void {
    if (this.state !== 'ground') return;
    this.state = 'magnet';
    this.magnetFrom = { x: this.body.x, y: this.body.y };
    this.magnetTo = { x: targetX, y: targetY };
    this.magnetAt = performance.now();
  }

  update(dtMs: number): void {
    const now = performance.now();
    const dt = dtMs / 1000;

    if (this.state === 'magnet') {
      const k = Math.min(1, (now - this.magnetAt) / MAGNET_MS);
      const ease = k * k;
      this.body.x = this.magnetFrom.x + (this.magnetTo.x - this.magnetFrom.x) * ease;
      this.body.y = this.magnetFrom.y + (this.magnetTo.y - this.magnetFrom.y) * ease;
      this.view.alpha = 1 - ease;
      if (k >= 1) this.state = 'taken';
    } else if (this.state === 'ground') {
      if (!this.grounded) {
        this.vy += GRAVITY * dt;
        this.grounded = moveAndCollide(this.body, this, dt, this.solids);
        this.vx *= Math.max(0, 1 - dt * 2);
        if (this.grounded) this.vx *= 0.4;
      }
    }

    // 接地后视觉浮动（只动 view，不动物理体）
    const bob = this.grounded ? Math.sin((now - this.bornAt) / BOB_PERIOD * Math.PI * 2) * BOB_AMP : 0;
    const f = this.feet;
    this.view.position.set(f.x, f.y + bob);
    this.view.scale.x = 1;
  }

  /** 是否在拾取范围内 */
  inPickupRange(px: number, py: number): boolean {
    if (this.state !== 'ground') return false;
    const f = this.feet;
    return Math.hypot(f.x - px, f.y - 10 - py) <= PICKUP_RANGE;
  }
}
