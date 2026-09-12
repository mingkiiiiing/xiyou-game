/**
 * BT-2 美术数据契约（冻结）。
 *
 * 核心设计：**美术是数据，不是绘制代码**。
 * 同一份 Shape[] 由两个渲染器消费：
 *   - src/art/pixiRender.ts  → 画到屏幕（Pixi Graphics）
 *   - scripts/lib/raster.ts  → 画到 PNG（零依赖软件光栅化，用于视觉验证与联络表）
 * 因此程序化美术可被自动截图审查；将来替换为真实贴图时，只需替换 renderer 实现。
 *
 * 坐标约定：角色本地坐标，原点在**脚底中心**，y 向上为负（与 core/Entity 一致）。
 */

/** 支持的图元（刻意只留 4 种，便于软件光栅化与两边行为一致） */
export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; color: number; alpha?: number }
  | { kind: 'circle'; x: number; y: number; r: number; color: number; alpha?: number }
  | { kind: 'ellipse'; x: number; y: number; rx: number; ry: number; color: number; alpha?: number }
  /** 任意多边形，点为 [x1,y1,x2,y2,...]，扫描线填充（支持凹多边形） */
  | { kind: 'poly'; points: number[]; color: number; alpha?: number };

export type ShapeList = Shape[];

/** 调色板 */
export interface Palette {
  primary: number;
  secondary: number;
  accent: number;
  detail: number;
  /** 受击闪白色（通常为高亮白） */
  flash: number;
}

/** 动画片段定义 */
export interface AnimationClip {
  name: string;
  /** 单帧时长（毫秒）；程序化美术用它驱动姿态相位 */
  frameMs: number;
  loop: boolean;
  /** 动作总时长（毫秒），非循环动作到此结束 */
  durationMs: number;
}

/** 渲染上下文：由战斗实体每帧提供 */
export interface RenderContext {
  /** 状态名：idle/run/jump/fall/attack1..3/skill/hurt/dead 等 */
  state: string;
  /** 该状态内的归一化相位 0~1 */
  phase: number;
  facing: 1 | -1;
  /** 受击闪白中 */
  flash: boolean;
  /** 无敌帧闪烁（半透明） */
  blinking?: boolean;
}

/**
 * 角色美术定义：一个纯函数 —— (状态, 相位) → 形状列表。
 * 实现者（AT-2.1）只需保证纯函数性质，渲染与验证由框架负责。
 */
export interface CharacterArtDef {
  id: string;
  displayName: string;
  /** 碰撞/占位尺寸（用于审查页排版与碰撞体参考） */
  width: number;
  height: number;
  palette: Palette;
  clips: Record<string, AnimationClip>;
  /** 生成某状态某相位下的形状（不含朝向翻转；翻转由渲染器统一处理） */
  draw(state: string, phase: number): ShapeList;
}

/** 环境主题：多层视差背景 */
export interface EnvLayerSpec {
  id: string;
  /** 视差系数：0=完全不动（远景），1=随相机 1:1（近景） */
  parallax: number;
  /** 该层顶部的世界 y */
  y: number;
  height: number;
  /** 垂直渐变 [顶色, 底色] */
  colors: [number, number];
  motif: 'mountains' | 'clouds' | 'forest' | 'cave' | 'river' | 'stars';
  /** 图案重复数量 */
  count: number;
  seed?: number;
}

export interface EnvTheme {
  id: string;
  name: string;
  sky: [number, number];
  layers: EnvLayerSpec[];
  ambient: 'leaves' | 'embers' | 'dust' | 'snow' | 'none';
  ambientCount: number;
  groundTop: number;
  groundBottom: number;
}

/** UI 主题令牌 */
export interface ThemeTokens {
  bg: number;
  panel: number;
  panelAlt: number;
  border: number;
  accent: number;
  gold: number;
  text: number;
  textDim: number;
  danger: number;
  success: number;
  hp: number;
  mp: number;
  fontFamily: string;
}

/** 渲染器接口：程序化 / 贴图两种实现可互换 */
export interface CharacterRenderer {
  readonly view: import('pixi.js').Container;
  update(ctx: RenderContext): void;
  destroy(): void;
}
