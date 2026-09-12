import { Application } from 'pixi.js';
import { EventBus } from '../shared/events';
import { Input } from './Input';
import { SceneManager } from './SceneManager';

/**
 * 游戏总入口：持有渲染器、输入、场景栈、事件总线。
 * 并行任务通过 Game 拿到一切：game.input / game.events / game.hitstop()
 */
export class Game {
  app = new Application();
  input = new Input();
  events = new EventBus();
  sceneManager!: SceneManager;
  private hitstopUntil = 0;

  async init(parent: HTMLElement): Promise<void> {
    await this.app.init({ width: 1280, height: 720, background: 0x0d1117, antialias: true });
    parent.appendChild(this.app.canvas);
    this.sceneManager = new SceneManager(this);
    this.app.ticker.add(() => {
      // 顿帧（hit-stop）：冻结世界但保持渲染，制造打击停顿感。
      // 注意顺序：必须先 update（消费 wasPressed）再 endFrame 清空本帧按键，
      // 否则所有点按类输入在到达场景前就被清掉（BT-4 e2e 实测发现的 P0 bug）。
      if (performance.now() >= this.hitstopUntil) {
        this.sceneManager.update(Math.min(this.app.ticker.deltaMS, 50));
      }
      this.input.endFrame();
    });
  }

  /** 全局顿帧，任务B手感四件套之一 */
  hitstop(ms: number): void {
    this.hitstopUntil = performance.now() + ms;
  }
}
