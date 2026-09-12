import type { Container } from 'pixi.js';

/** 横向跟随相机：平移世界容器，使目标保持在屏幕中央并夹在世界边界内 */
export class Camera {
  constructor(
    private world: Container,
    private viewW: number,
    private worldW: number,
  ) {}

  followX(targetX: number): void {
    const min = this.viewW - this.worldW; // 负值
    this.world.x = Math.max(min, Math.min(0, this.viewW / 2 - targetX));
  }
}
