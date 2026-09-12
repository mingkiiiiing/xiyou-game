/** 统一 UI 主题令牌（BT-2 视觉统一；所有面板/按钮/文字从这里取色） */
import type { ThemeTokens } from './types';

export const THEME: ThemeTokens = {
  bg: 0x0f1319,
  panel: 0x1a2029,
  panelAlt: 0x232c38,
  border: 0x3a4654,
  accent: 0x3fb950,
  gold: 0xffd257,
  text: 0xe6edf3,
  textDim: 0x8b98a5,
  danger: 0xf85149,
  success: 0x3fb950,
  hp: 0xd9482f,
  mp: 0x4a9de8,
  fontFamily: 'Consolas, monospace',
};

/** 品质色（与 item/data.ts 的 QUALITY_COLOR 保持一致，UI 侧引用） */
export { QUALITY_COLOR } from '../item/data';
