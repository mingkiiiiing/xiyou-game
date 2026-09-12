import { Graphics } from 'pixi.js';
import { Entity } from '../../core/Entity';
import type { Game } from '../../core/Game';
import type { DamageInfo, Damageable, Box } from '../../shared/types';

const GROUND_Y = 620;
const RESPAWN_MS = 1500;

/** 木桩：测试打击的目标，死亡后 1.5 秒在随机位置复活（冻结，只读参考） */
export class Dummy extends Entity implements Damageable {
  armor: { def: number; level: number };

  private hp: number;
  private maxHp: number;
  private respawnAt = 0;
  private flashUntil = 0;
  private knockVx = 0;
  private bar = new Graphics();

  constructor(game: Game, x: number, level = 1, hp = 200) {
    super(game, 52, 68);
    this.body.x = x;
    this.body.y = GROUND_Y - this.body.h;
    this.armor = { def: 4, level };
    this.hp = this.maxHp = hp;

    const g = new Graphics();
    g.rect(-26, -68, 52, 68).fill(0x8a5a3a);
    g.circle(0, -76, 10).fill(0xd9b38c);
    this.bar.y = -92;
    this.view.addChild(g);
    this.view.addChild(this.bar);
  }

  takeDamage(info: DamageInfo): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - info.amount);
    this.flashUntil = performance.now() + 100;
    const dir = Math.sign(this.feet.x - info.fromX) || 1;
    this.knockVx = dir * info.knockbackX;
    if (!this.alive) {
      this.respawnAt = performance.now() + RESPAWN_MS;
      this.game.events.emit('enemy-died', { id: 'dummy' });
    }
  }

  update(dtMs: number): void {
    const now = performance.now();
    const dt = dtMs / 1000;

    if (!this.alive) {
      if (now >= this.respawnAt) {
        this.hp = this.maxHp;
        this.body.x = 400 + Math.random() * 1800;
        this.body.y = GROUND_Y - this.body.h;
      } else {
        this.view.visible = false;
        return;
      }
    }
    this.view.visible = true;

    this.knockVx *= Math.max(0, 1 - dt * 10);
    this.body.x += this.knockVx * dt;

    this.view.tint = now < this.flashUntil ? 0xff7a7a : 0xffffff;
    this.bar.clear();
    this.bar.rect(-26, 0, 52, 5).fill(0x30363d);
    this.bar.rect(-26, 0, 52 * (this.hp / this.maxHp), 5).fill(0xe3b341);
    this.syncView();
  }

  get alive(): boolean { return this.hp > 0; }
  get hitbox(): Box { return { ...this.body }; }
}
