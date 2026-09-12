/**
 * BT-3.5 战斗 HUD（接口冻结版）。
 *
 * 布局（1280×720 画布）：
 *   左上：Lv 徽章 + 血条(含白色缓冲) + 蓝条 + 经验条
 *   左下：技能栏（3 技能，等级角标 + CD 遮罩）+ 闪避格
 *   左上偏下：波次进度文字
 *   中上：Boss 血条（名字 + 阶段刻度）
 *   右上：连击数 + 评级
 *   右下：toast 消息（拾取/装备提示）
 *
 * 性能：update 每帧调用。所有 Graphics 复用一个对象（clear 后重画），
 * Text 按需创建但复用池（技能名/等级等静态文本缓存 key，变化才重建）。
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { Game } from '../core/Game';
import { THEME } from './theme';
import { barShapes, panelShapes, slotShapes } from './ui';
import { drawShapes } from './pixiRender';

export interface HudSkill {
  id: string;
  name: string;
  level: number;
  cdRemainMs: number;
  cdTotalMs: number;
  mpCost: number;
  ready: boolean;
}

export interface CombatHudModel {
  hp: number; maxHp: number;
  mp: number; maxMp: number;
  playerLevel: number; exp: number; expNeeded: number;
  skills: HudSkill[];
  dodge: { cdRemainMs: number; cdTotalMs: number };
  combo: number;
  comboRank: string;
  boss: { name: string; hp: number; maxHp: number; phase: number; phaseMarks: number[] } | null;
  progressText: string;
  lootCount: number;
  pickedCount: number;
  godMode: boolean;
  toasts: { text: string; color: number; remainMs: number }[];
}

const VIEW_W = 1280;

export class CombatHud {
  readonly view = new Container();
  private g = new Graphics();
  private dynText = new Text({ text: '', style: { fill: THEME.text, fontSize: 14, fontFamily: THEME.fontFamily, lineHeight: 20 } });
  /** 技能名文本池（按槽位复用） */
  private skillLabels: Text[] = [];
  private toastTexts: Text[] = [];
  private dispHp = 0;
  private comboScale = 1;

  constructor(_game: Game) {
    this.view.addChild(this.g);
    this.dynText.position.set(16, 12);
    this.view.addChild(this.dynText);
  }

  update(model: CombatHudModel, dtMs: number): void {
    this.ensureInit();
    const g = this.g;
    g.clear();
    const dt = Math.min(dtMs, 50);

    // —— 血条（白色缓冲条缓慢跟随，制造"刚掉了多少血"的反馈）——
    this.dispHp += (model.hp - this.dispHp) * Math.min(1, dt / 220);
    if (this.dispHp < model.hp) this.dispHp = model.hp; // 回血时直接跟上
    const bx = 16, by = 40, bw = 300, bh = 20;
    drawShapes(g, panelShapes({ x: bx - 3, y: by - 3, w: bw + 6, h: bh + 6 }));
    g.rect(bx, by, bw, bh).fill(THEME.panelAlt);
    const dispRatio = Math.max(0, Math.min(1, this.dispHp / Math.max(1, model.maxHp)));
    const hpRatio = Math.max(0, Math.min(1, model.hp / Math.max(1, model.maxHp)));
    g.rect(bx, by, bw * dispRatio, bh).fill(0xf2c9c2);          // 缓冲白
    g.rect(bx, by, bw * hpRatio, bh).fill(THEME.hp);             // 当前血
    // 血量刻度
    for (let i = 1; i < 5; i++) g.rect(bx + (bw * i) / 5, by, 1, bh).fill({ color: 0x000000, alpha: 0.25 });

    // —— 蓝条 ——
    const my = by + bh + 4, mw = 240, mh = 9;
    g.rect(bx, my, mw, mh).fill(THEME.panelAlt);
    g.rect(bx, my, mw * Math.max(0, Math.min(1, model.mp / Math.max(1, model.maxMp))), mh).fill(THEME.mp);

    // —— 经验条（最细，金色）——
    const ey = my + mh + 4, ew = 240, eh = 4;
    g.rect(bx, ey, ew, eh).fill(THEME.panelAlt);
    g.rect(bx, ey, ew * Math.max(0, Math.min(1, model.exp / Math.max(1, model.expNeeded))), eh).fill(THEME.gold);

    // —— 技能栏 + 闪避 ——
    const slotSize = 52, gap = 8, sy = 92;
    for (let i = 0; i < 3; i++) {
      const sx = bx + i * (slotSize + gap);
      const sk = model.skills[i];
      this.drawSkillSlot(g, sx, sy, slotSize, sk);
      this.ensureSkillLabel(i, sx, sy, slotSize, sk);
    }
    // 闪避格
    const dx = bx + 3 * (slotSize + gap);
    this.drawDodgeSlot(g, dx, sy, slotSize, model.dodge);
    this.ensureSkillLabel(3, dx, sy, slotSize, null);

    // —— Boss 血条 ——
    if (model.boss) {
      const bbw = 620, bbx = (VIEW_W - bbw) / 2, bby = 66;
      drawShapes(g, panelShapes({ x: bbx - 4, y: bby - 4, w: bbw + 8, h: 26 }));
      g.rect(bbx, bby, bbw, 18).fill(0x1a1216);
      const ratio = Math.max(0, Math.min(1, model.boss.hp / Math.max(1, model.boss.maxHp)));
      // 按阶段改变配色（越后期越烈）
      const phaseColor = model.boss.phase >= 3 ? 0xff3860 : model.boss.phase === 2 ? 0xf85149 : 0xd9482f;
      g.rect(bbx, bby, bbw * ratio, 18).fill(phaseColor);
      // 阶段刻度
      for (const mark of model.boss.phaseMarks) {
        g.rect(bbx + bbw * mark - 1, bby - 2, 2, 22).fill(THEME.gold);
      }
      g.rect(bbx, bby, bbw, 18).stroke({ width: 1, color: THEME.border });
    }

    // —— 连击数 + 评级 ——
    if (model.combo > 0) {
      this.comboScale += (1 - this.comboScale) * Math.min(1, dt / 120);
      const k = model.combo >= 10 ? 1.5 : model.combo >= 5 ? 1.25 : 1;
      g.circle(VIEW_W - 92, 96, 40).fill({ color: 0x000000, alpha: 0.35 });
      g.circle(VIEW_W - 92, 96, 40).stroke({ width: 2, color: model.combo >= 10 ? THEME.gold : THEME.border });
      void k;
    }

    // —— 文本 ——
    const rankText = model.combo > 0 && model.comboRank ? ` ${model.comboRank}` : '';
    this.dynText.text =
      `Lv.${model.playerLevel}${model.godMode ? ' [无敌]' : ''}\n` +
      `${model.progressText}\n` +
      `掉落 ${model.lootCount} · 已拾取 ${model.pickedCount}`;
    this.dynText.position.set(VIEW_W - 300, 138);

    // 连击数字单独用大号文本
    this.comboText.text = model.combo > 1 ? `${model.combo}${rankText}` : '';
    this.comboText.visible = model.combo > 1;
    this.comboText.style.fontSize = model.combo >= 10 ? 42 : model.combo >= 5 ? 34 : 28;
    if (model.combo > 1) {
      this.comboScale += (1.15 - this.comboScale) * 0.2;
      this.comboText.scale.set(this.comboScale);
      this.comboScale += (1 - this.comboScale) * 0.15;
    }

    // Boss 名
    if (model.boss) {
      this.bossText.text = `${model.boss.name}  ·  阶段 ${model.boss.phase}   ${Math.ceil(model.boss.hp)}/${model.boss.maxHp}`;
      this.bossText.visible = true;
    } else {
      this.bossText.visible = false;
    }

    this.updateToasts(model);
  }

  private comboText = new Text({ text: '', style: { fill: THEME.gold, fontSize: 30, fontWeight: 'bold', fontFamily: THEME.fontFamily } });
  private bossText = new Text({ text: '', style: { fill: 0xffd6d0, fontSize: 13, fontFamily: THEME.fontFamily } });
  private comboInited = false;

  private drawSkillSlot(g: Graphics, x: number, y: number, size: number, sk: HudSkill | undefined): void {
    const ready = sk ? sk.ready : false;
    drawShapes(g, slotShapes({ x, y, size, qualityColor: sk ? (ready ? THEME.accent : THEME.border) : THEME.border }));
    g.rect(x + 3, y + 3, size - 6, size - 6).fill({ color: ready ? 0x1c2b20 : 0x1a1f26, alpha: 1 });
    if (!sk) return;
    // CD 遮罩：从下往上覆盖
    if (sk.cdRemainMs > 0 && sk.cdTotalMs > 0) {
      const frac = Math.max(0, Math.min(1, sk.cdRemainMs / sk.cdTotalMs));
      g.rect(x + 3, y + 3 + (size - 6) * (1 - frac), size - 6, (size - 6) * frac).fill({ color: 0x000000, alpha: 0.66 });
    }
    // 就绪高亮
    if (ready) g.rect(x + 1, y + 1, size - 2, size - 2).stroke({ width: 2, color: THEME.accent });
  }

  private drawDodgeSlot(g: Graphics, x: number, y: number, size: number, dodge: { cdRemainMs: number; cdTotalMs: number }): void {
    const ready = dodge.cdRemainMs <= 0;
    drawShapes(g, slotShapes({ x, y, size, qualityColor: ready ? 0x6fe3c4 : THEME.border }));
    g.rect(x + 3, y + 3, size - 6, size - 6).fill({ color: ready ? 0x16302c : 0x1a1f26, alpha: 1 });
    if (!ready && dodge.cdTotalMs > 0) {
      const frac = Math.max(0, Math.min(1, dodge.cdRemainMs / dodge.cdTotalMs));
      g.rect(x + 3, y + 3 + (size - 6) * (1 - frac), size - 6, (size - 6) * frac).fill({ color: 0x000000, alpha: 0.66 });
    }
    if (ready) g.rect(x + 1, y + 1, size - 2, size - 2).stroke({ width: 2, color: 0x6fe3c4 });
  }

  /** 技能格子内的文字（名字首字 + 等级角标），槽位复用避免每帧 new */
  private ensureSkillLabel(idx: number, x: number, y: number, size: number, sk: HudSkill | undefined | null): void {
    let t = this.skillLabels[idx];
    if (!t) {
      t = new Text({ text: '', style: { fill: THEME.text, fontSize: 18, fontFamily: THEME.fontFamily } });
      t.anchor.set(0.5);
      this.skillLabels[idx] = t;
      this.view.addChild(t);
    }
    if (idx === 3) {
      t.text = '闪避';
      t.style.fontSize = 13;
      t.tint = 0x6fe3c4;
      t.position.set(x + size / 2, y + size / 2);
      return;
    }
    t.text = sk ? sk.name.slice(0, 1) : '';
    t.style.fontSize = 20;
    t.tint = sk && sk.ready ? THEME.text : THEME.textDim;
    t.position.set(x + size / 2, y + size / 2 - 3);
    // 等级角标
    let lvText = this.levelTexts[idx];
    if (!lvText) {
      lvText = new Text({ text: '', style: { fill: THEME.gold, fontSize: 11, fontFamily: THEME.fontFamily } });
      lvText.anchor.set(1, 1);
      this.levelTexts[idx] = lvText;
      this.view.addChild(lvText);
    }
    lvText.text = sk ? `Lv${sk.level}` : '';
    lvText.position.set(x + size - 3, y + size - 3);
  }

  private levelTexts: Text[] = [];

  private updateToasts(model: CombatHudModel): void {
    const maxToasts = 5;
    for (let i = 0; i < maxToasts; i++) {
      let t = this.toastTexts[i];
      if (!t) {
        t = new Text({ text: '', style: { fill: THEME.text, fontSize: 14, fontFamily: THEME.fontFamily } });
        t.anchor.set(1, 0);
        this.toastTexts[i] = t;
        this.view.addChild(t);
      }
      const item = model.toasts[i];
      if (!item) { t.visible = false; continue; }
      t.visible = true;
      t.text = item.text;
      t.tint = item.color;
      t.alpha = Math.max(0, Math.min(1, item.remainMs / 500));
      t.position.set(VIEW_W - 20, 200 + i * 24);
    }
  }

  /** 首个 update 前初始化需要挂到 view 的常驻文本 */
  private ensureInit(): void {
    if (this.comboInited) return;
    this.comboInited = true;
    this.comboText.anchor.set(0.5);
    this.comboText.position.set(VIEW_W - 92, 96);
    this.view.addChild(this.comboText);
    this.bossText.anchor.set(0.5, 1);
    this.bossText.position.set(VIEW_W / 2, 62);
    this.view.addChild(this.bossText);
    this.dispHp = 0;
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
