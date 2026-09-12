import type { Box } from '../shared/types';

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export interface Velocity { vx: number; vy: number; }

/**
 * 灰盒分轴碰撞：先 X 后 Y 解算，返回是否落地。
 * 已知简化（TASK-A 跟进列表）：无扫掠、无斜坡、无单向平台。
 */
export function moveAndCollide(body: Box, vel: Velocity, dtSec: number, solids: readonly Box[]): boolean {
  body.x += vel.vx * dtSec;
  for (const s of solids) {
    if (!overlaps(body, s)) continue;
    if (vel.vx > 0) body.x = s.x - body.w;
    else if (vel.vx < 0) body.x = s.x + s.w;
  }

  body.y += vel.vy * dtSec;
  let onGround = false;
  for (const s of solids) {
    if (!overlaps(body, s)) continue;
    if (vel.vy > 0) { body.y = s.y - body.h; onGround = true; vel.vy = 0; }
    else if (vel.vy < 0) { body.y = s.y + s.h; vel.vy = 0; }
  }
  return onGround;
}
