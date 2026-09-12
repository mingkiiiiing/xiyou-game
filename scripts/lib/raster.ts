/**
 * 零依赖软件光栅化器 + PNG 编码器（BT-2 视觉验证基础设施）。
 *
 * 为什么需要它：本项目美术是**几何形状数据**（见 src/art/types.ts），
 * 因此可以在 Node 中把同一份数据光栅化成 PNG，用于
 *   1) 自动生成美术联络表（供人眼审查）
 *   2) 让 AI 在无浏览器环境下也能"看到"渲染结果并自查
 * 只使用 node:zlib（PNG 需要的 deflate），不引入任何第三方依赖。
 */
import { deflateSync } from 'node:zlib';
import type { Shape } from '../../src/art/types';

export interface Canvas {
  w: number;
  h: number;
  /** RGBA，长度 w*h*4 */
  data: Uint8Array;
}

export function createCanvas(w: number, h: number, bg = 0x000000, bgAlpha = 255): Canvas {
  const data = new Uint8Array(w * h * 4);
  const r = (bg >> 16) & 0xff, g = (bg >> 8) & 0xff, b = bg & 0xff;
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = bgAlpha;
  }
  return { w, h, data };
}

/** 垂直渐变背景填充 */
export function fillGradient(c: Canvas, top: number, bottom: number, y0: number, y1: number): void {
  const tr = (top >> 16) & 0xff, tg = (top >> 8) & 0xff, tb = top & 0xff;
  const br = (bottom >> 16) & 0xff, bg2 = (bottom >> 8) & 0xff, bb = bottom & 0xff;
  for (let y = Math.max(0, y0); y < Math.min(c.h, y1); y++) {
    const t = (y - y0) / Math.max(1, y1 - y0 - 1);
    const r = Math.round(tr + (br - tr) * t);
    const g = Math.round(tg + (bg2 - tg) * t);
    const b = Math.round(tb + (bb - tb) * t);
    for (let x = 0; x < c.w; x++) {
      const i = (y * c.w + x) * 4;
      c.data[i] = r; c.data[i + 1] = g; c.data[i + 2] = b; c.data[i + 3] = 255;
    }
  }
}

function blendPixel(c: Canvas, x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h || a <= 0) return;
  const i = (y * c.w + x) * 4;
  const d = c.data;
  if (a >= 1) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; return; }
  d[i] = Math.round(r * a + d[i] * (1 - a));
  d[i + 1] = Math.round(g * a + d[i + 1] * (1 - a));
  d[i + 2] = Math.round(b * a + d[i + 2] * (1 - a));
  d[i + 3] = 255;
}

/** 扫描线填充多边形（偶奇规则，支持凹多边形） */
function fillPoly(c: Canvas, pts: number[], color: number, alpha: number): void {
  const n = pts.length / 2;
  if (n < 3) return;
  const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = pts[i * 2 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const yStart = Math.max(0, Math.floor(minY));
  const yEnd = Math.min(c.h - 1, Math.ceil(maxY));
  const xs: number[] = [];
  for (let y = yStart; y <= yEnd; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const y1 = pts[i * 2 + 1], y2 = pts[j * 2 + 1];
      if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) {
        const x1 = pts[i * 2], x2 = pts[j * 2];
        xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.floor(xs[k]));
      const x1 = Math.min(c.w - 1, Math.ceil(xs[k + 1]));
      for (let x = x0; x <= x1; x++) blendPixel(c, x, y, r, g, b, alpha);
    }
  }
}

/** 把形状列表绘制到画布（origin 为形状坐标原点对应的像素位置） */
export function fillShapes(c: Canvas, shapes: readonly Shape[], originX: number, originY: number): void {
  for (const s of shapes) {
    const a = s.alpha ?? 1;
    switch (s.kind) {
      case 'rect': {
        const x0 = Math.floor(originX + s.x), y0 = Math.floor(originY + s.y);
        const x1 = Math.ceil(originX + s.x + s.w), y1 = Math.ceil(originY + s.y + s.h);
        const r = (s.color >> 16) & 0xff, g = (s.color >> 8) & 0xff, b = s.color & 0xff;
        for (let y = Math.max(0, y0); y < Math.min(c.h, y1); y++) {
          for (let x = Math.max(0, x0); x < Math.min(c.w, x1); x++) blendPixel(c, x, y, r, g, b, a);
        }
        break;
      }
      case 'circle': {
        const cx = originX + s.x, cy = originY + s.y, rr = s.r;
        const r = (s.color >> 16) & 0xff, g = (s.color >> 8) & 0xff, b = s.color & 0xff;
        for (let y = Math.max(0, Math.floor(cy - rr)); y <= Math.min(c.h - 1, Math.ceil(cy + rr)); y++) {
          const dy = y + 0.5 - cy;
          const half = Math.sqrt(Math.max(0, rr * rr - dy * dy));
          for (let x = Math.max(0, Math.floor(cx - half)); x <= Math.min(c.w - 1, Math.ceil(cx + half)); x++) {
            const dx = x + 0.5 - cx;
            if (dx * dx + dy * dy <= rr * rr) blendPixel(c, x, y, r, g, b, a);
          }
        }
        break;
      }
      case 'ellipse': {
        const cx = originX + s.x, cy = originY + s.y, rx = s.rx, ry = s.ry;
        const r = (s.color >> 16) & 0xff, g = (s.color >> 8) & 0xff, b = s.color & 0xff;
        for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(c.h - 1, Math.ceil(cy + ry)); y++) {
          const dy = (y + 0.5 - cy) / ry;
          const half = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
          for (let x = Math.max(0, Math.floor(cx - half)); x <= Math.min(c.w - 1, Math.ceil(cx + half)); x++) {
            const dx = (x + 0.5 - cx) / rx;
            if (dx * dx + dy * dy <= 1) blendPixel(c, x, y, r, g, b, a);
          }
        }
        break;
      }
      case 'poly': {
        const pts: number[] = [];
        for (let i = 0; i < s.points.length; i += 2) {
          pts.push(originX + s.points[i], originY + s.points[i + 1]);
        }
        fillPoly(c, pts, s.color, a);
        break;
      }
    }
  }
}

/** 盒式降采样（用于超采样抗锯齿） */
export function downsample(src: Canvas, factor: number): Canvas {
  const w = Math.floor(src.w / factor), h = Math.floor(src.h / factor);
  const out = createCanvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * src.w + (x * factor + dx)) * 4;
          r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; n++;
        }
      }
      const o = (y * w + x) * 4;
      out.data[o] = Math.round(r / n);
      out.data[o + 1] = Math.round(g / n);
      out.data[o + 2] = Math.round(b / n);
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/** 把另一张画布贴到目标画布（alpha 混合） */
export function blit(dst: Canvas, src: Canvas, ox: number, oy: number, alpha = 1): void {
  for (let y = 0; y < src.h; y++) {
    const ty = oy + y;
    if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      const tx = ox + x;
      if (tx < 0 || tx >= dst.w) continue;
      const si = (y * src.w + x) * 4;
      const di = (ty * dst.w + tx) * 4;
      const sa = (src.data[si + 3] / 255) * alpha;
      if (sa <= 0) continue;
      dst.data[di] = Math.round(src.data[si] * sa + dst.data[di] * (1 - sa));
      dst.data[di + 1] = Math.round(src.data[si + 1] * sa + dst.data[di + 1] * (1 - sa));
      dst.data[di + 2] = Math.round(src.data[si + 2] * sa + dst.data[di + 2] * (1 - sa));
      dst.data[di + 3] = 255;
    }
  }
}

// ───────────────────────── PNG 编码 ─────────────────────────

let crcTable: Uint32Array | null = null;
function crc32(buf: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** 把画布编码为 PNG（8 位 RGBA，无滤波） */
export function encodePNG(c: Canvas): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0);
  ihdr.writeUInt32BE(c.h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // 每行前置 filter byte 0
  const raw = Buffer.alloc((c.w * 4 + 1) * c.h);
  for (let y = 0; y < c.h; y++) {
    raw[y * (c.w * 4 + 1)] = 0;
    Buffer.from(c.data.buffer, c.data.byteOffset + y * c.w * 4, c.w * 4).copy(raw, y * (c.w * 4 + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
