import { Graphics } from 'pixi.js';
import { Entity } from '../core/Entity';
import type { Game } from '../core/Game';
import type { DamageInfo, Damageable, Box } from '../shared/types';

const GROUND_Y = 620;

/** 任务C：稻草人——不可动的玩家替身，供敌人 AI 验证（死亡 2s 后原地复活） */
export class Scarecrow extends Entity implements Damageable {
  armor = { def: 4, level: 1 };

  private hp = 300;
  private maxHp = 300;
  private respawnAt = 0;
  private flashUntil = 0;
  private bar = new Graphics();

  constructor(game: Game, x: number) {
    super(game, 48, 64);
    this.body.x = x;
    this.body.y = GROUND_Y - this.body.h;
    const g = new Graphics();
    g.rect(-24, -64, 48, 64).fill(0x9e6a03);
    g.poly([-24, -64, 0, -96, 24, -64]).fill(0x9e6a03); // 草帽
    this.bar.y = -104;
    this.view.addChild(g);
    this.view.addChild(this.bar);
  }

  takeDamage(info: DamageInfo): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - info.amount);
    this.flashUntil = performance.now() + 100;
    if (this.hp === 0) {
      this.respawnAt = performance.now() + 2000;
      this.game.events.emit('enemy-died', { id: 'scarecrow' });
    }
  }

  update(dtMs: number): void {
    const now = performance.now();
    if (!this.alive) {
      if (now >= this.respawnAt) this.hp = this.maxHp;
      else { this.view.visible = false; return; }
    }
    this.view.visible = true;
    this.view.tint = now < this.flashUntil ? 0xff7a7a : 0xffffff;
    this.bar.clear();
    this.bar.rect(-24, 0, 48, 5).fill(0x30363d);
    this.bar.rect(-24, 0, 48 * (this.hp / this.maxHp), 5).fill(0x58a6ff);
    void dtMs;
    this.syncView();
  }

  get alive(): boolean { return this.hp > 0; }
  get hitbox(): Box { return { ...this.body }; }
}
