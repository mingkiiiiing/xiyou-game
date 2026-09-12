/**
 * BT-6.4 日程面板（成就 + 日常），主城按 N 打开。
 * 数据由 host 提供（AchievementTracker / DailyBoard 的快照视图），领取走 host 回调。
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { AchievementDef, AchievementTracker } from '../meta/achievements';
import type { DailyBoard, DailyQuestDef } from '../meta/daily';
import { drawPanel, barShapes, slotShapes } from '../art/ui';
import { drawShapes } from '../art/pixiRender';
import { THEME } from '../art/theme';

export interface ServicePanelHost {
  achievements(): { def: AchievementDef; progress: number; complete: boolean; claimed: boolean }[];
  dailies(): { def: DailyQuestDef; progress: number; complete: boolean; claimed: boolean; expired: boolean }[];
  claimAchievement(id: string): { ok: boolean; msg: string };
  claimDaily(id: string): { ok: boolean; msg: string };
  close(): void;
}

const TABS = ['成就', '日常'] as const;
const VIEW_W = 1280;

export class ServicePanel {
  readonly view = new Container();
  private g = new Graphics();
  private content = new Container();
  private msgText: Text;
  private msgTimer = 0;
  private tab: (typeof TABS)[number] = '成就';
  private visibleState = false;
  private chromeG = new Graphics();
  private tabGs: Graphics[] = [];

  constructor(private host: ServicePanelHost) {
    this.view.addChild(this.chromeG);
    this.view.addChild(this.content);
    this.msgText = new Text({ text: '', style: { fill: THEME.textDim, fontSize: 13, fontFamily: THEME.fontFamily } });
    this.msgText.position.set(230, 606);
    this.view.addChild(this.msgText);
    this.view.visible = false;
    this.buildChrome();
  }

  get visible(): boolean { return this.visibleState; }

  show(): void { this.visibleState = true; this.view.visible = true; this.refresh(); }
  hide(): void { this.visibleState = false; this.view.visible = false; }

  private buildChrome(): void {
    // 遮罩
    const dim = new Graphics();
    dim.rect(0, 0, VIEW_W, 720).fill({ color: 0x000000, alpha: 0.6 });
    dim.eventMode = 'static';
    dim.on('pointertap', () => this.host.close());
    this.view.addChildAt(dim, 0);
    this.chromeG.eventMode = 'static';
    this.chromeG.on('pointertap', () => { /* 吞空白点击 */ });
    drawPanel(this.chromeG, { x: 190, y: 80, w: 900, h: 560 });
    this.chromeG.rect(214, 132, TABS.length * 150, 36).fill({ color: THEME.panelAlt, alpha: 0.9 });
    TABS.forEach((t, i) => {
      const g = new Graphics();
      g.position.set(214 + i * 150, 132);
      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.on('pointertap', () => { this.tab = t; this.refresh(); });
      this.chromeG.addChild(g);
      this.tabGs.push(g);
      const label = new Text({ text: t, style: { fill: THEME.text, fontSize: 15, fontWeight: 'bold', fontFamily: THEME.fontFamily } });
      label.anchor.set(0.5);
      label.position.set(75, 18);
      g.addChild(label);
    });
    const title = new Text({ text: '日 程', style: { fill: THEME.gold, fontSize: 22, fontWeight: 'bold', fontFamily: THEME.fontFamily } });
    title.position.set(214, 92);
    const close = this.mkClose();
    this.content.addChild(title, close);
  }

  private mkClose(): Container {
    const c = new Container();
    const g = new Graphics();
    drawShapes(g, slotShapes({ x: 0, y: 0, size: 38, border: THEME.border }));
    const x = new Text({ text: '×', style: { fill: THEME.text, fontSize: 18, fontFamily: THEME.fontFamily } });
    x.anchor.set(0.5);
    x.position.set(19, 19);
    c.addChild(g, x);
    c.position.set(1052, 86);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', () => this.host.close());
    return c;
  }

  refresh(): void {
    if (!this.visibleState) return;
    this.content.removeChildren().forEach((ch) => ch.destroy({ children: true }));
    const title = new Text({ text: '日 程', style: { fill: THEME.gold, fontSize: 22, fontWeight: 'bold', fontFamily: THEME.fontFamily } });
    title.position.set(214, 92);
    this.content.addChild(title, this.mkClose());
    this.tabGs.forEach((g, i) => {
      g.clear();
      drawShapes(g, barShapes({ x: 0, y: 0, w: 150, h: 36, ratio: this.tab === TABS[i] ? 1 : 0.25, bg: THEME.panelAlt, fg: this.tab === TABS[i] ? THEME.accent : THEME.border }));
    });
    if (this.tab === '成就') this.buildAchievements();
    else this.buildDailies();
    this.msgText.position.set(230, 606);
  }

  private buildAchievements(): void {
    const list = this.host.achievements();
    let y = 196;
    for (const item of list) {
      const row = new Container();
      row.position.set(214, y);
      const bg = new Graphics();
      drawShapes(bg, barShapes({ x: 0, y: 0, w: 852, h: 60, ratio: item.complete ? 1 : item.progress / Math.max(1, item.def.goal), bg: THEME.panel, fg: item.complete ? THEME.gold : THEME.accent }));
      row.addChild(bg);
      const name = new Text({ text: `${item.def.name}${item.claimed ? ' ✓已领' : ''}`, style: { fill: item.claimed ? THEME.textDim : THEME.text, fontSize: 14, fontWeight: 'bold', fontFamily: THEME.fontFamily } });
      name.position.set(14, 8);
      const desc = new Text({ text: item.def.desc, style: { fill: THEME.textDim, fontSize: 12, fontFamily: THEME.fontFamily } });
      desc.position.set(14, 32);
      const prog = new Text({ text: `${Math.min(item.progress, item.def.goal)}/${item.def.goal}`, style: { fill: THEME.text, fontSize: 13, fontFamily: THEME.fontFamily } });
      prog.position.set(560, 8);
      const reward = new Text({ text: `奖：${item.def.rewardGold} 金${item.def.rewardSkillPoints ? ` +${item.def.rewardSkillPoints} 技能点` : ''}`, style: { fill: THEME.gold, fontSize: 11, fontFamily: THEME.fontFamily } });
      reward.position.set(560, 32);
      row.addChild(name, desc, prog, reward);
      if (item.complete && !item.claimed) {
        const btn = new Graphics();
        drawShapes(btn, barShapes({ x: 0, y: 0, w: 110, h: 38, ratio: 1, bg: THEME.panelAlt, fg: THEME.gold }));
        const bt = new Text({ text: '领 取', style: { fill: THEME.gold, fontSize: 14, fontWeight: 'bold', fontFamily: THEME.fontFamily } });
        bt.anchor.set(0.5);
        bt.position.set(55, 19);
        btn.addChild(bt);
        btn.position.set(726, 11);
        btn.eventMode = 'static';
        btn.cursor = 'pointer';
        btn.on('pointertap', () => {
          const r = this.host.claimAchievement(item.def.id);
          this.showMessage(r.msg, r.ok);
          this.refresh();
        });
        row.addChild(btn);
      } else if (item.claimed) {
        const done = new Text({ text: '已领取', style: { fill: THEME.textDim, fontSize: 12, fontFamily: THEME.fontFamily } });
        done.position.set(756, 22);
        row.addChild(done);
      }
      this.content.addChild(row);
      y += 68;
    }
  }

  private buildDailies(): void {
    const list = this.host.dailies();
    let y = 200;
    for (const item of list) {
      const row = new Container();
      row.position.set(214, y);
      const bg = new Graphics();
      drawShapes(bg, slotShapes({ x: 0, y: 0, size: 400, border: item.claimed ? THEME.border : item.complete ? THEME.gold : THEME.accent }));
      bg.removeChildren();
      row.addChild(bg);
      const name = new Text({ text: item.def.name, style: { fill: THEME.text, fontSize: 15, fontWeight: 'bold', fontFamily: THEME.fontFamily } });
      name.position.set(16, 10);
      const prog = new Text({ text: `${Math.min(item.progress, item.def.goal)}/${item.def.goal}`, style: { fill: THEME.textDim, fontSize: 13, fontFamily: THEME.fontFamily } });
      prog.position.set(16, 36);
      const reward = new Text({ text: `奖 ${item.def.rewardGold} 金`, style: { fill: THEME.gold, fontSize: 13, fontFamily: THEME.fontFamily } });
      reward.position.set(220, 22);
      row.addChild(name, prog, reward);
      const bar = new Graphics();
      drawShapes(bar, barShapes({ x: 340, y: 18, w: 180, h: 16, ratio: Math.min(1, item.progress / Math.max(1, item.def.goal)), bg: THEME.panelAlt, fg: THEME.accent }));
      row.addChild(bar);
      if (item.complete && !item.claimed) {
        const btn = new Graphics();
        drawShapes(btn, barShapes({ x: 0, y: 0, w: 110, h: 38, ratio: 1, bg: THEME.panelAlt, fg: THEME.gold }));
        const bt = new Text({ text: '领 取', style: { fill: THEME.gold, fontSize: 14, fontWeight: 'bold', fontFamily: THEME.fontFamily } });
        bt.anchor.set(0.5);
        bt.position.set(55, 19);
        btn.addChild(bt);
        btn.position.set(580, 2);
        btn.eventMode = 'static';
        btn.cursor = 'pointer';
        btn.on('pointertap', () => {
          const r = this.host.claimDaily(item.def.id);
          this.showMessage(r.msg, r.ok);
          this.refresh();
        });
        row.addChild(btn);
      } else if (item.claimed) {
        const done = new Text({ text: '已领取', style: { fill: THEME.textDim, fontSize: 12, fontFamily: THEME.fontFamily } });
        done.position.set(600, 22);
        row.addChild(done);
      }
      this.content.addChild(row);
      y += 74;
    }
    const tip = new Text({ text: '日常任务每天 0 点刷新（进度与领取状态同步重置）', style: { fill: THEME.textDim, fontSize: 12, fontFamily: THEME.fontFamily } });
    tip.position.set(214, y + 10);
    this.content.addChild(tip);
  }

  showMessage(msg: string, ok: boolean): void {
    this.msgText.text = msg;
    this.msgText.tint = ok ? THEME.success : THEME.danger;
    this.msgTimer = 2200;
  }

  update(dtMs: number): void {
    if (this.msgTimer > 0) {
      this.msgTimer -= dtMs;
      if (this.msgTimer <= 0) {
        this.msgText.text = '';
        this.msgTimer = 0;
      }
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
