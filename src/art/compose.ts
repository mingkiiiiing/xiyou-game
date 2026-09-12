/**
 * 角色合成：把 CharacterArtDef 的纯函数输出组装成最终形状列表。
 * 屏幕渲染（art/pixiRender）与 PNG 联络表（scripts/render-sheet）都必须走这里，
 * 保证两边产物完全一致——这是"AI 能靠 PNG 验证屏幕效果"的前提。
 */
import type { CharacterArtDef, RenderContext, ShapeList } from './types';
import { mirrorShapes } from './shapes';

/** 受击闪白：整体提亮为略透明的白色 */
function flashShapes(shapes: ShapeList, flashColor: number): ShapeList {
  return shapes.map((s) => ({ ...s, color: flashColor, alpha: Math.max(s.alpha ?? 1, 0.75) }));
}

export function composeCharacter(def: CharacterArtDef, ctx: RenderContext): ShapeList {
  const base = def.draw(ctx.state, clamp01(ctx.phase));
  const oriented = ctx.facing < 0 ? mirrorShapes(base) : base;
  return ctx.flash ? flashShapes(oriented, def.palette.flash) : oriented;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
