/** 形状 → Pixi Graphics 渲染器（4 种图元，与软件光栅化器行为一致） */
import { Graphics } from 'pixi.js';
import type { Shape, ShapeList } from './types';

export function drawShapes(g: Graphics, shapes: readonly Shape[]): void {
  for (const s of shapes) {
    const fill = s.alpha === undefined ? { color: s.color } : { color: s.color, alpha: s.alpha };
    switch (s.kind) {
      case 'rect':
        g.rect(s.x, s.y, s.w, s.h).fill(fill);
        break;
      case 'circle':
        g.circle(s.x, s.y, s.r).fill(fill);
        break;
      case 'ellipse':
        g.ellipse(s.x, s.y, s.rx, s.ry).fill(fill);
        break;
      case 'poly':
        g.poly(s.points).fill(fill);
        break;
    }
  }
}

/** 把形状列表画进一个新的 Graphics（每次重建，造型变化时调用） */
export function shapesToGraphics(shapes: ShapeList): Graphics {
  const g = new Graphics();
  drawShapes(g, shapes);
  return g;
}
