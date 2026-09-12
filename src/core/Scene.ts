import { Container } from 'pixi.js';
import type { Game } from './Game';

export abstract class Scene {
  view = new Container();

  constructor(protected game: Game) {}

  abstract init(): void | Promise<void>;
  abstract update(dtMs: number): void;

  /** 子类如有事件订阅等资源，覆写后记得 super.destroy() */
  destroy(): void {
    this.view.destroy({ children: true });
  }
}
