import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';

export interface ShakeConfig { power: number; durationMs: number; freqHz: number; }

/** 任务G：相机表现——震屏叠加层（不改 core/Camera，在场景把世界定位后叠加偏移）与全屏白闪 */
export class CameraFx {
  private shakeUntil = 0;
  private cfg: ShakeConfig = { power: 0, durationMs: 0, freqHz: 30 };
  ox = 0;
  oy = 0;

  private flashG: Graphics | null = null;
  private flashUntil = 0;

  /** screenLayer：屏幕空间容器（场景 view 直属子级），用于画白闪 */
  attachScreenLayer(screenLayer: Container): void {
    this.flashG = new Graphics();
    this.flashG.rect(0, 0, 100000, 100000).fill(0xffffff);
    this.flashG.visible = false;
    screenLayer.addChild(this.flashG);
  }

  shake(power = 8, durationMs = 180, freqHz = 35): void {
    this.cfg = { power, durationMs, freqHz };
    this.shakeUntil = performance.now() + durationMs;
  }

  flash(ms = 50): void {
    if (!this.flashG) return;
    this.flashUntil = performance.now() + ms;
    this.flashG.visible = true;
    this.flashG.alpha = 0.85;
  }

  /** 每帧在世界容器已被正常定位之后调用（叠加偏移） */
  update(dtMs: number, world: Container): void {
    const now = performance.now();
    if (now < this.shakeUntil) {
      const t = now * this.cfg.freqHz * Math.PI * 2;
      const decay = (this.shakeUntil - now) / this.cfg.durationMs;
      this.ox = Math.sin(t * 1.1) * this.cfg.power * decay;
      this.oy = Math.cos(t * 1.7) * this.cfg.power * 0.6 * decay;
      world.x += this.ox;
      world.y += this.oy;
    } else {
      this.ox = this.oy = 0;
    }
    if (this.flashG && this.flashG.visible) {
      const left = this.flashUntil - now;
      if (left <= 0) this.flashG.visible = false;
      else this.flashG.alpha = 0.85 * (left / 60);
    }
    void dtMs;
  }
}
