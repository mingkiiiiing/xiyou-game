import { Container } from 'pixi.js';
import type { Game } from './Game';
import type { Box } from '../shared/types';

/**
 * 实体基类：body 以左上角定位参与物理；
 * view 锚点 = 脚底中心（子元素向上画负 y），syncView 自动贴合并按朝向翻转。
 */
export abstract class Entity {
  view = new Container();
  body: Box;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;

  constructor(protected game: Game, w = 48, h = 64) {
    this.body = { x: 100, y: 100, w, h };
  }

  abstract update(dtMs: number): void;

  get feet(): { x: number; y: number } {
    return { x: this.body.x + this.body.w / 2, y: this.body.y + this.body.h };
  }

  syncView(): void {
    const f = this.feet;
    this.view.position.set(f.x, f.y);
    this.view.scale.x = this.facing;
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
