/**
 * 造型渲染器：把 CharacterArtDef 挂到战斗实体上。
 *
 * 关键设计：
 * 1) 与 PNG 联络表**完全同源** —— 两者都走 composeCharacter，所以审查图所见即屏幕所得
 * 2) 相位量化 + 脏检查：Graphics 只在 (状态, 量化相位, 闪白) 变化时重建，避免每帧重建开销
 * 3) 与色块渲染互斥：attach 后隐藏原色块；未提供美术定义时保持色块（新增怪物不会因缺美术而崩）
 */
import { Container, Graphics } from 'pixi.js';
import type { CharacterArtDef, RenderContext } from './types';
import { composeCharacter } from './compose';
import { drawShapes } from './pixiRender';

/** 相位量化级数：越高越顺滑、重建越频繁；14 在 60fps 下足够顺滑 */
const PHASE_STEPS = 14;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 计算动画相位。
 * - 循环状态(idle/run/fall)：按 clip 的 durationMs 循环推进
 * - 一次性状态(attack/jump/hurt/dead)：从进入状态起算，到 durationMs 后定格为 1
 */
export function computePhase(def: CharacterArtDef, state: string, enteredAt: number, now: number): number {
  const clip = def.clips[state];
  const dur = clip?.durationMs ?? 400;
  const elapsed = now - enteredAt;
  if (clip && clip.loop) {
    const cycle = Math.max(1, dur);
    return (elapsed % cycle) / cycle;
  }
  return clamp01(elapsed / Math.max(1, dur));
}

export class CharacterView {
  readonly view = new Container();
  private g = new Graphics();
  private lastKey = '';
  private def: CharacterArtDef;
  /** 额外的垂直偏移（用于腾空/倒地等整体位移，可选） */
  offsetY = 0;

  constructor(def: CharacterArtDef) {
    this.def = def;
    this.view.addChild(this.g);
  }

  /** 返回是否发生了重建（供性能统计/调试） */
  update(ctx: RenderContext): boolean {
    const step = Math.round(clamp01(ctx.phase) * PHASE_STEPS);
    const key = `${ctx.state}|${step}|${ctx.flash ? 1 : 0}|${ctx.facing}`;
    if (key === this.lastKey) {
      this.g.y = this.offsetY;
      return false;
    }
    this.lastKey = key;

    this.g.clear();
    const shapes = composeCharacter(this.def, { ...ctx, phase: step / PHASE_STEPS });
    drawShapes(this.g, shapes);
    this.g.y = this.offsetY;
    return true;
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
