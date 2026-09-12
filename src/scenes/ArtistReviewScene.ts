/**
 * AT-2.3 美术审查场景（`?scene=artreview`）。
 *
 * 屏幕内可交互版美术审查页：
 *  - 展示 registry 中全部角色造型（角色/怪物/Boss 自动纳入，列表为空时优雅降级）
 *  - 状态切换按钮：所有角色同步切换到选定状态，观察姿态
 *  - 环境主题切换：调用 art/env.buildEnvironment 重建多层视差与粒子
 *  - A/D（或 ←/→）水平推拉相机，直观看到视差层级错动
 *
 * 说明：main.ts 仅自动发现 `scenes/demos/*.ts`，本文件按 AT-2.3 规格放在 scenes/ 根目录，
 * 需由集成方在 main.ts 登记后经 `?scene=artreview` 访问（本任务不得修改 main.ts）。
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { Game } from '../core/Game';
import { Scene } from '../core/Scene';
import { ALL_CHARACTER_ART } from '../art/registry';
import { composeCharacter } from '../art/compose';
import { drawShapes } from '../art/pixiRender';
import { buildEnvironment, ENV_THEMES, EnvView } from '../art/env';
import { drawButton, drawPanel, drawBar, drawSlot } from '../art/ui';
import { THEME } from '../art/theme';
import { QUALITY_COLOR } from '../item/data';
import type { CharacterArtDef } from '../art/types';

export const sceneKey = 'artreview';

const VIEW_W = 1280;
const VIEW_H = 720;
const WORLD_W = 2800;
const GROUND_Y = 700;

/** 状态展示顺序（与 AT-2.0 相位规范一致） */
const STATES = ['idle', 'run', 'jump', 'fall', 'attack1', 'attack2', 'attack3', 'skill', 'hurt', 'dead'] as const;

export function createScene(game: Game): Scene {
  return new ArtistReviewScene(game);
}

interface CharSlot {
  def: CharacterArtDef;
  g: Graphics;
  label: Text;
  scale: number;
  x: number;
  y: number;
}

class ArtistReviewScene extends Scene {
  private envHost = new Container();
  private charLayer = new Container();
  private uiLayer = new Container();

  private env: EnvView | null = null;
  private themeIndex = 0;
  private stateIndex = 0;
  private worldX = 0;
  private elapsed = 0;
  private slots: CharSlot[] = [];
  private missing: CharacterArtDef[] = [];

  constructor(game: Game) { super(game); }

  init(): void {
    this.view.addChild(this.envHost);
    this.view.addChild(this.charLayer);
    this.view.addChild(this.uiLayer);
    this.rebuildEnv();
    this.rebuildCharacters();
    this.rebuildUi();
  }

  // ————————————————— 环境 —————————————————

  private rebuildEnv(): void {
    this.envHost.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.env = buildEnvironment(ENV_THEMES[this.themeIndex], WORLD_W, GROUND_Y) as EnvView;
    this.env.applyParallax(this.worldX);
    this.envHost.addChild(this.env);
  }

  // ————————————————— 角色 —————————————————

  private rebuildCharacters(): void {
    this.charLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.slots = [];
    this.missing = [];

    const chars = ALL_CHARACTER_ART;
    if (chars.length === 0) {
      const t = new Text({
        text: '暂无角色美术定义（registry 为空）——等待 AT-2.1 填充',
        style: { fill: THEME.textDim, fontSize: 20, fontFamily: THEME.fontFamily },
      });
      t.position.set(40, 200);
      this.charLayer.addChild(t);
      return;
    }

    const cols = Math.min(7, chars.length);
    const rows = Math.ceil(chars.length / cols);
    const cellW = (VIEW_W - 36) / cols;
    const cellH = Math.min(190, (430 - 70) / Math.max(1, rows));

    chars.forEach((def, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = 18 + cellW * (col + 0.5);
      const by = 70 + cellH * (row + 0.86);
      const hasAny = STATES.some((s) => def.clips[s]);
      if (!hasAny) this.missing.push(def);

      const g = new Graphics();
      g.position.set(cx, by);
      this.charLayer.addChild(g);
      const label = new Text({
        text: def.displayName || def.id,
        style: { fill: THEME.text, fontSize: 13, fontFamily: THEME.fontFamily },
      });
      label.anchor.set(0.5, 0);
      label.position.set(cx, by + 4);
      this.charLayer.addChild(label);

      this.slots.push({ def, g, label, scale: Math.min(1.5, cellH / 150), x: cx, y: by });
    });
  }

  // ————————————————— UI —————————————————

  private rebuildUi(): void {
    this.uiLayer.removeChildren().forEach((c) => c.destroy({ children: true }));

    // 标题
    this.mkText(`美术审查  ART REVIEW   ·   角色 ${ALL_CHARACTER_ART.length}   主题 ${ENV_THEMES.length}   状态 ${STATES.length}`, 20, 12, 16, THEME.gold);

    // 状态按钮（两行）
    this.mkText('状态 STATE', 20, 448, 13, THEME.textDim);
    STATES.forEach((s, i) => {
      const x = 20 + (i % 5) * 124;
      const y = 468 + Math.floor(i / 5) * 44;
      this.mkButton(this.labelOf(s), x, y, 116, 36, i === this.stateIndex, () => {
        this.stateIndex = i;
        this.rebuildUi();
      });
    });

    // 主题按钮
    this.mkText('环境主题 ENV THEME', 20, 572, 13, THEME.textDim);
    ENV_THEMES.forEach((t, i) => {
      this.mkButton(t.name, 20 + i * 168, 592, 156, 40, i === this.themeIndex, () => {
        this.themeIndex = i;
        this.rebuildEnv();
        this.rebuildUi();
      });
    });

    // 操作提示
    this.mkText('A / D  推拉相机（观察视差）  ·  点击按钮切换状态与主题', 20, 660, 13, THEME.textDim);

    // 右下：UI 组件样例（drawPanel / drawBar / drawSlot 实拍）
    const px = 700;
    const py = 452;
    const pg = new Graphics();
    drawPanel(pg, { x: px, y: py, w: 560, h: 200, raised: true });
    this.uiLayer.addChild(pg);
    this.mkText('UI 组件样例（art/ui.ts）', px + 18, py + 12, 13, THEME.gold);

    const bars = new Graphics();
    drawBar(bars, { x: px + 20, y: py + 44, w: 300, h: 18, ratio: 0.72, bg: 0x30363d, fg: THEME.hp, ticks: 5 });
    drawBar(bars, { x: px + 20, y: py + 70, w: 300, h: 14, ratio: 0.45, bg: 0x30363d, fg: THEME.mp, ticks: 4 });
    drawBar(bars, { x: px + 20, y: py + 92, w: 300, h: 12, ratio: 0.9, bg: 0x30363d, fg: THEME.gold });
    this.uiLayer.addChild(bars);
    this.mkText('HP 72%    MP 45%    蓄力 90%', px + 336, py + 44, 12, THEME.text);

    const slots = new Graphics();
    const qualities = ['white', 'green', 'blue', 'purple'] as const;
    qualities.forEach((q, i) => {
      drawSlot(slots, { x: px + 24 + i * 56, y: py + 128, size: 48, qualityColor: QUALITY_COLOR[q] });
    });
    this.uiLayer.addChild(slots);
    this.mkText('装备格（品质色描边）', px + 264, py + 140, 12, THEME.textDim);
  }

  private labelOf(state: string): string {
    const map: Record<string, string> = {
      idle: '待机', run: '奔跑', jump: '起跳', fall: '下落',
      attack1: '普攻1', attack2: '普攻2', attack3: '普攻3', skill: '技能', hurt: '受击', dead: '倒地',
    };
    return `${map[state] ?? state} ${state}`;
  }

  private mkText(text: string, x: number, y: number, size: number, color: number): Text {
    const t = new Text({ text, style: { fill: color, fontSize: size, fontFamily: THEME.fontFamily } });
    t.position.set(x, y);
    this.uiLayer.addChild(t);
    return t;
  }

  private mkButton(label: string, x: number, y: number, w: number, h: number, selected: boolean, onClick: () => void): void {
    const g = new Graphics();
    drawButton(g, { x: 0, y: 0, w, h, variant: selected ? 'primary' : 'secondary' }, label);
    g.position.set(x, y);
    g.eventMode = 'static';
    g.cursor = 'pointer';
    g.on('pointertap', onClick);
    this.uiLayer.addChild(g);
  }

  // ————————————————— 主循环 —————————————————

  update(dtMs: number): void {
    this.elapsed += dtMs;

    // 相机推拉 → 视差
    const speed = 0.45;
    if (this.game.input.isDown('left')) this.worldX = Math.min(0, this.worldX + speed * dtMs);
    if (this.game.input.isDown('right')) this.worldX = Math.max(-(WORLD_W - VIEW_W), this.worldX - speed * dtMs);
    this.env?.applyParallax(this.worldX);

    // 环境粒子
    this.env?.update(dtMs);

    // 角色姿态动画
    const state = STATES[this.stateIndex];
    for (const s of this.slots) {
      const clip = s.def.clips[state];
      s.g.clear();
      if (!clip) {
        // 未实现该状态：画一行的占位提示，不留纯空白
        s.g.rect(-18, -6, 36, 3).fill({ color: THEME.textDim, alpha: 0.5 });
        continue;
      }
      const dur = Math.max(1, clip.durationMs);
      const t = this.elapsed % dur;
      const phase = clip.loop ? t / dur : Math.min(1, t / dur);
      const shapes = composeCharacter(s.def, { state, phase, facing: 1, flash: false });
      s.g.scale.set(s.scale);
      drawShapes(s.g, shapes);
    }
  }

  destroy(): void {
    super.destroy();
  }
}
