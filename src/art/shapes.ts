/** 形状构造辅助：把旋转矩形转成多边形，保证两个渲染器只需实现 4 种图元 */
import type { Shape, ShapeList } from './types';

export function rotRect(cx: number, cy: number, w: number, h: number, angleRad: number, color: number, alpha?: number): Shape {
  const hw = w / 2, hh = h / 2;
  const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
  const pts: number[] = [];
  for (const [dx, dy] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as const) {
    pts.push(cx + dx * cos - dy * sin, cy + dx * sin + dy * cos);
  }
  return { kind: 'poly', points: pts, color, alpha };
}

/** 由矩形四角构造多边形 */
export function quad(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, color: number, alpha?: number): Shape {
  return { kind: 'poly', points: [x1, y1, x2, y2, x3, y3, x4, y4], color, alpha };
}

/** 正多边形（用于光环、结晶、花瓣等） */
export function regularPoly(cx: number, cy: number, r: number, sides: number, rot: number, color: number, alpha?: number): Shape {
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (Math.PI * 2 * i) / sides;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return { kind: 'poly', points: pts, color, alpha };
}

/** 数字颜色 → 十六进制字符串（审查页与调试用） */
export function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

/** 形状列表整体镜像（facing=-1 时使用；围绕 x=0 镜像） */
export function mirrorShapes(shapes: ShapeList): ShapeList {
  return shapes.map((s) => {
    switch (s.kind) {
      case 'rect': return { ...s, x: -s.x - s.w };
      case 'circle': return { ...s, x: -s.x };
      case 'ellipse': return { ...s, x: -s.x };
      case 'poly': {
        const p = s.points.slice();
        for (let i = 0; i < p.length; i += 2) p[i] = -p[i];
        return { ...s, points: p };
      }
    }
  });
}

/** 形状列表整体平移 */
export function translateShapes(shapes: ShapeList, dx: number, dy: number): ShapeList {
  return shapes.map((s) => {
    switch (s.kind) {
      case 'rect': return { ...s, x: s.x + dx, y: s.y + dy };
      case 'circle': return { ...s, x: s.x + dx, y: s.y + dy };
      case 'ellipse': return { ...s, x: s.x + dx, y: s.y + dy };
      case 'poly': {
        const p = s.points.slice();
        for (let i = 0; i < p.length; i += 2) { p[i] += dx; p[i + 1] += dy; }
        return { ...s, points: p };
      }
    }
  });
}

/** 形状列表整体缩放（围绕原点；用于联络表放大观察与不同 DPI） */
export function scaleShapes(shapes: ShapeList, k: number): ShapeList {
  return shapes.map((s) => {
    switch (s.kind) {
      case 'rect': return { ...s, x: s.x * k, y: s.y * k, w: s.w * k, h: s.h * k };
      case 'circle': return { ...s, x: s.x * k, y: s.y * k, r: s.r * k };
      case 'ellipse': return { ...s, x: s.x * k, y: s.y * k, rx: s.rx * k, ry: s.ry * k };
      case 'poly': return { ...s, points: s.points.map((v) => v * k) };
    }
  });
}

/** 颜色按系数缩放亮度（用于明暗面） */
export function shade(color: number, k: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * k)));
  const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * k)));
  return (r << 16) | (g << 8) | b;
}

/** 两色线性插值 */
export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
