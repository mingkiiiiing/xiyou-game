/**
 * BT-4.3 养成面板（主城 `B`）：背包 / 装备 / 强化 / 宝石 / 技能 五页签。
 * 接口冻结：ProgressionPanelHost / ProgressionPanel 的方法签名不得改动。
 *
 * 数据源：host.getModel()（Progression.buildProgressionModel 的纯数据视图），面板不持有业务状态。
 * 皮肤：art/ui.ts（panelShapes / buttonShapes / slotShapes）+ art/theme.ts 令牌。
 * 交互：pixi eventMode='static' + pointertap（同 MainGameScene.mkButton 写法）；
 *       所有 pointertap 引发的重绘走 queueMicrotask，避免在事件派发中销毁命中对象。
 *
 * ── 布局坐标表（1280×720，view 内绝对坐标）────────────────────────────────
 *  遮罩            (0, 0, 1280, 720)        点击面板外空白 → 关闭
 *  主面板          (190, 80, 900, 560)      panelShapes
 *  标题「养 成」    (214, 94) fs22           等级 (340, 102) fs13
 *  金币/强化石/技能点 (520,100)(670,100)(810,100) fs14
 *  关闭按钮 ×      (1044, 88, 38, 40)
 *  页签 ×5         (274 + i*148, 138, 140, 40)  标签「1 背包」…「5 技能」
 *  内容区          y ∈ [202, 590]           消息条 (210, 596, 860, 30)，文字 (222, 603) fs13，2s 淡出
 *
 *  背包页   格子 (214+col*66, 210+row*66, 56) 6列×4行 → 右缘600 / 下缘464；说明 (214, 476)
 *           详情面板 (620, 210, 450, 300)；按钮 穿戴(630,524,130,46) 出售(780,524,130,46)
 *  装备页   行 (210, 208+i*74, 396, 72)；槽位 (220, 214+i*74, 64)，i=0..4 → 下缘576
 *           详情面板同背包页；按钮 卸下(630,524,130,46)
 *  强化页   说明 (214,206)；格子 (214+col*50, 228+row*50, 44) 8列×4行 → 右缘608 / 下缘422；说明2 (214,432)
 *           信息面板 (630, 228, 440, 232)；按钮 强化(770, 480, 160, 52)
 *  宝石页   宝石行 (214, 228+i*26, 396, 22) i=0..11 → 下缘540
 *           装备格 (630+col*46, 228+row*46, 40) 8列 → 下缘406
 *           孔位说明 (630,418)；孔位 (630+i*64, 440, 48) → 下缘488；已选信息 (828, 446/466)
 *           按钮 镶嵌(630,540,130,44) 摘除(780,540,130,44)
 *  技能页   表头 (214,206)；卡片 (214, 232+i*106, 856, 96) i=0..2 → 下缘540
 *           升级按钮 (876, cy+26, 170, 44)；提示行 (214, 566)
 *  各页签元素均无重叠、不越界 1280×720；按钮热区高 ≥ 40（除页签 40、关闭 32、卡片按钮 44）。
 * ─────────────────────────────────────────────────────────────────────────
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { EquipmentSlot, StatKey } from '../item/types';
import { STAT_KEYS } from '../item/types';
import type { ProgressionModel, OpResultMsg, ItemView } from '../meta/progression';
import { buttonShapes, drawPanel, drawSlot } from '../art/ui';
import { drawShapes } from '../art/pixiRender';
import { THEME } from '../art/theme';
import { QUALITY_COLOR, SLOT_LABEL, STAT_LABEL, STRENGTHEN_CONFIG } from '../item/data';
import { strengthenCost, strengthenSuccessRate } from '../item/strengthen';

export const TABS = ['背包', '装备', '强化', '宝石', '技能'] as const;
export type ProgressionTab = (typeof TABS)[number];

export interface ProgressionPanelHost {
  getModel(): ProgressionModel;
  equip(uid: string): OpResultMsg;
  unequip(slot: EquipmentSlot): OpResultMsg;
  sell(uid: string): OpResultMsg;
  strengthen(uid: string): OpResultMsg;
  socketGem(uid: string, socketIndex: number, gemId: string): OpResultMsg;
  unsocketGem(uid: string, socketIndex: number): OpResultMsg;
  upgradeSkill(skillId: string): OpResultMsg;
  close(): void;
}

// ───────────────────────── 布局常量 ─────────────────────────
const VIEW_W = 1280;
const VIEW_H = 720;
const PX = 190, PY = 80, PW = 900, PH = 560;                 // 主面板
const TAB_X0 = 274, TAB_Y = 138, TAB_W = 140, TAB_H = 40, TAB_STEP = 148;
const MB_X = 210, MB_Y = 596, MB_W = 860, MB_H = 30;         // 消息条
const HINT = '提示：数字键 1-5 切换页签 · Tab 循环 · Esc 关闭';

const GB_X = 214, GB_Y = 210, GB_CELL = 56, GB_GAP = 10;     // 背包格
const GB_COLS = 6, GB_CAP = 24;                              // 与 Progression.inventory 容量一致（仅展示）
const DET_X = 620, DET_Y = 210, DET_W = 450, DET_H = 300;    // 详情面板
const BTN_Y = 524, BTN_H = 46;                               // 详情按钮行

const EP_X = 210, EP_Y0 = 214, EP_STEP = 74;                 // 装备页行
const SG_X = 214, SG_Y = 228, SG_CELL = 44, SG_STEP = 50, SG_COLS = 8; // 强化页格子
const SI_X = 630, SI_Y = 228, SI_W = 440, SI_H = 232;        // 强化页信息面板
const GM_X = 214, GM_Y = 228, GM_ROW_W = 396, GM_ROW_H = 26; // 宝石页行
const GG_X = 630, GG_Y = 228, GG_CELL = 40, GG_STEP = 46, GG_COLS = 8; // 宝石页装备格
const SKT_X = 630, SKT_Y = 440, SKT_SIZE = 48, SKT_STEP = 64;          // 宝石页孔位
const GB_BTN_Y = 540;                                        // 宝石页按钮行
const KC_X = 214, KC_Y0 = 232, KC_W = 856, KC_H = 96, KC_STEP = 106;   // 技能页卡片

const GEM_TIER_COLOR: Readonly<Record<number, number>> = { 1: 0xd0d7de, 2: 0x4493f8, 3: 0xffd257 };
const MSG_MS = 2000;

type GemV = ProgressionModel['gems'][number];

function fmtNum(n: number): string {
  return String(Number(n.toFixed(2)));
}

function gemMapOf(m: ProgressionModel): Map<string, GemV> {
  return new Map(m.gems.map((g) => [g.id, g]));
}

export class ProgressionPanel {
  readonly view = new Container();
  private host: ProgressionPanelHost;
  private chrome = new Container();
  private chromeG = new Graphics();
  private content = new Container();
  private tabGs: Graphics[] = [];
  private tabTs: Text[] = [];
  private resLv!: Text;
  private resGold!: Text;
  private resStone!: Text;
  private resPts!: Text;
  private msgText!: Text;
  private msgTimer = 0;
  private tab: ProgressionTab = '背包';
  private visibleState = false;
  private destroyed = false;

  // 选中状态（页签内记忆，refresh 时按最新 model 校验失效项）
  private selBagUid: string | null = null;
  private selEquipSlot: EquipmentSlot | null = null;
  private selStrUid: string | null = null;
  private gemUid: string | null = null;
  private gemSocket: number | null = null;
  private gemId: string | null = null;

  constructor(host: ProgressionPanelHost) {
    this.host = host;
    this.buildChrome();
    this.view.addChild(this.chrome);
    this.view.addChild(this.content);
    this.view.visible = false;
  }

  get visible(): boolean {
    return this.visibleState;
  }

  show(): void {
    if (this.destroyed) return;
    this.visibleState = true;
    this.view.visible = true;
    this.msgTimer = 0;
    this.msgText.text = HINT;
    this.msgText.tint = THEME.textDim;
    this.msgText.alpha = 1;
    this.refresh();
  }

  hide(): void {
    this.visibleState = false;
    this.view.visible = false;
  }

  /** 重新拉取 model 并重绘当前页签（操作后调用） */
  refresh(): void {
    if (this.destroyed) return;
    const m = this.host.getModel();
    this.resLv.text = `Lv.${m.playerLevel}`;
    this.resGold.text = `金币 ${m.gold}`;
    this.resStone.text = `强化石 ${m.stones}`;
    this.resPts.text = `技能点 ${m.skillPoints}`;
    this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    switch (this.tab) {
      case '背包': this.buildBagPage(m); break;
      case '装备': this.buildEquipPage(m); break;
      case '强化': this.buildStrengthenPage(m); break;
      case '宝石': this.buildGemPage(m); break;
      case '技能': this.buildSkillPage(m); break;
    }
  }

  /** 页签切换：Digit1..5 / Tab 循环；Escape 关闭。返回是否消费（仅可见时消费） */
  handleKey(code: string): boolean {
    if (!this.visibleState || this.destroyed) return false;
    if (code === 'Escape') {
      this.host.close();
      return true;
    }
    const di = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(code);
    if (di >= 0) {
      this.setTab(TABS[di]);
      return true;
    }
    if (code === 'Tab') {
      const i = TABS.indexOf(this.tab);
      this.setTab(TABS[(i + 1) % TABS.length]);
      return true;
    }
    return false;
  }

  /** 操作结果消息的淡出计时 */
  update(dtMs: number): void {
    if (this.destroyed || this.msgTimer <= 0) return;
    this.msgTimer -= dtMs;
    if (this.msgTimer <= 0) {
      this.msgTimer = 0;
      this.msgText.text = HINT;
      this.msgText.tint = THEME.textDim;
      this.msgText.alpha = 1;
    } else {
      this.msgText.alpha = Math.min(1, this.msgTimer / 600);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.view.destroy({ children: true });
  }

  // ───────────────────────── 框架层（构建一次） ─────────────────────────

  private buildChrome(): void {
    const c = this.chrome;
    // 遮罩（点击面板外空白关闭）
    const dim = new Graphics();
    dim.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x000000, alpha: 0.6 });
    dim.eventMode = 'static';
    dim.cursor = 'default';
    dim.on('pointertap', () => this.host.close());
    c.addChild(dim);
    // 面板底（static 吞掉面板内的空白点击，防止误触遮罩关闭）
    this.chromeG.eventMode = 'static';
    this.chromeG.on('pointertap', () => {});
    c.addChild(this.chromeG);
    // 注意：redrawChrome 依赖下方 tabGs/tabTs，必须在页签构建完成后调用
    // 标题 + 资源栏
    const title = new Text({ text: '养 成', style: { fill: THEME.gold, fontSize: 22, fontWeight: 'bold', fontFamily: THEME.fontFamily } });
    title.position.set(214, 94);
    c.addChild(title);
    this.resLv = this.mkText(c, '', 340, 102, 13, THEME.textDim);
    this.resGold = this.mkText(c, '', 520, 100, 14, THEME.gold);
    this.resStone = this.mkText(c, '', 670, 100, 14, 0xf0883e);
    this.resPts = this.mkText(c, '', 810, 100, 14, 0x79c0ff);
    // 关闭按钮
    const close = new Graphics();
    drawShapes(close, buttonShapes({ x: 0, y: 0, w: 38, h: 40, variant: 'secondary' }));
    const x = new Text({ text: '×', style: { fill: THEME.text, fontSize: 18, fontWeight: 'bold', fontFamily: THEME.fontFamily } });
    x.anchor.set(0.5);
    x.position.set(19, 20);
    close.addChild(x);
    close.position.set(1044, 88);
    close.eventMode = 'static';
    close.cursor = 'pointer';
    close.on('pointertap', () => this.host.close());
    c.addChild(close);
    // 页签（文字常驻复用，仅重绘底色）
    for (let i = 0; i < TABS.length; i++) {
      const t = TABS[i];
      const g = new Graphics();
      g.position.set(TAB_X0 + i * TAB_STEP, TAB_Y);
      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.on('pointertap', () => this.setTab(t));
      c.addChild(g);
      this.tabGs.push(g);
      const label = new Text({ text: `${i + 1} ${t}`, style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold', fontFamily: THEME.fontFamily } });
      label.anchor.set(0.5);
      label.position.set(TAB_X0 + i * TAB_STEP + TAB_W / 2, TAB_Y + TAB_H / 2);
      c.addChild(label);
      this.tabTs.push(label);
    }
    // 消息条
    this.msgText = this.mkText(c, HINT, MB_X + 12, MB_Y + 7, 13, THEME.textDim);
    // 页签与消息条就绪后才能重绘 chrome（依赖 tabGs/tabTs）
    this.redrawChrome();
  }

  private redrawChrome(): void {
    const g = this.chromeG;
    g.clear();
    drawPanel(g, { x: PX, y: PY, w: PW, h: PH });
    g.rect(MB_X, MB_Y, MB_W, MB_H).fill({ color: THEME.panelAlt, alpha: 0.9 }).stroke({ width: 1, color: THEME.border, alpha: 0.8 });
    for (let i = 0; i < TABS.length; i++) {
      const active = TABS[i] === this.tab;
      const tg = this.tabGs[i];
      tg.clear();
      drawShapes(tg, buttonShapes({ x: 0, y: 0, w: TAB_W, h: TAB_H, variant: active ? 'primary' : 'secondary' }));
      if (active) tg.rect(2, TAB_H - 4, TAB_W - 4, 3).fill(THEME.gold);
      this.tabTs[i].tint = active ? THEME.gold : THEME.textDim;
    }
  }

  private setTab(t: ProgressionTab): void {
    if (this.destroyed || this.tab === t) return;
    this.tab = t;
    this.redrawChrome();
    this.scheduleRefresh();
  }

  // ───────────────────────── 操作与消息 ─────────────────────────

  private runOp(r: OpResultMsg): void {
    this.msgText.text = r.msg;
    this.msgText.tint = r.ok ? THEME.success : THEME.danger;
    this.msgText.alpha = 1;
    this.msgTimer = MSG_MS;
    this.scheduleRefresh();
  }

  /** pointertap 派发过程中会销毁命中对象，统一延迟到微任务重绘 */
  private scheduleRefresh(): void {
    if (this.destroyed) return;
    queueMicrotask(() => {
      if (!this.destroyed) this.refresh();
    });
  }

  // ───────────────────────── 绘制小工具 ─────────────────────────

  private mkText(parent: Container, str: string, x: number, y: number, size: number, color: number): Text {
    const t = new Text({ text: str, style: { fill: color, fontSize: size, fontFamily: THEME.fontFamily } });
    t.position.set(x, y);
    parent.addChild(t);
    return t;
  }

  private mkBtn(
    parent: Container, label: string, x: number, y: number, w: number, h: number,
    onTap: () => void, enabled = true, variant: 'primary' | 'secondary' | 'danger' = 'primary', fontSize = 14,
  ): void {
    const g = new Graphics();
    drawShapes(g, buttonShapes({ x: 0, y: 0, w, h, enabled, variant }));
    const t = new Text({ text: label, style: { fill: enabled ? THEME.text : THEME.textDim, fontSize, fontWeight: 'bold', fontFamily: THEME.fontFamily } });
    t.anchor.set(0.5);
    t.position.set(w / 2, h / 2);
    g.addChild(t);
    g.position.set(x, y);
    if (enabled) {
      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.on('pointertap', onTap);
    }
    parent.addChild(g);
  }

  private mkSlotCell(parent: Container, x: number, y: number, size: number, qualityColor: number | undefined, onTap?: () => void): Graphics {
    const g = new Graphics();
    drawSlot(g, { x: 0, y: 0, size, qualityColor: qualityColor ?? THEME.border });
    g.position.set(x, y);
    if (onTap) {
      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.on('pointertap', onTap);
    } else {
      g.eventMode = 'none';
    }
    parent.addChild(g);
    return g;
  }

  private allItems(m: ProgressionModel): ItemView[] {
    return [...m.equipment.filter((x): x is ItemView => !!x), ...m.inventory];
  }

  // ───────────────────────── 背包页 ─────────────────────────

  private buildBagPage(m: ProgressionModel): void {
    const c = this.content;
    if (this.selBagUid && !m.inventory.some((i) => i.uid === this.selBagUid)) this.selBagUid = null;
    if (m.inventory.length === 0) {
      this.mkText(c, '背包空空如也 —— 去战斗拾取装备吧', GB_X + 90, GB_Y + 120, 14, THEME.textDim);
    }
    for (let i = 0; i < GB_CAP; i++) {
      const x = GB_X + (i % GB_COLS) * (GB_CELL + GB_GAP);
      const y = GB_Y + Math.floor(i / GB_COLS) * (GB_CELL + GB_GAP);
      const it = m.inventory[i];
      if (!it) {
        // 空格：暗色占位（不可交互，点击落入面板底不会误关面板）
        const g = new Graphics();
        drawSlot(g, { x: 0, y: 0, size: GB_CELL, border: THEME.border });
        g.alpha = 0.28;
        g.eventMode = 'none';
        g.position.set(x, y);
        c.addChild(g);
        continue;
      }
      const sel = it.uid === this.selBagUid;
      const qc = QUALITY_COLOR[it.quality];
      const g = this.mkSlotCell(c, x, y, GB_CELL, qc, () => {
        this.selBagUid = it.uid;
        this.scheduleRefresh();
      });
      const ch = new Text({ text: it.name.slice(0, 1), style: { fill: qc, fontSize: 22, fontWeight: 'bold', fontFamily: THEME.fontFamily } });
      ch.anchor.set(0.5);
      ch.position.set(GB_CELL / 2, GB_CELL / 2 - 3);
      g.addChild(ch);
      if (it.strengthenLevel > 0) {
        const lv = new Text({ text: `+${it.strengthenLevel}`, style: { fill: THEME.gold, fontSize: 10, fontFamily: THEME.fontFamily } });
        lv.anchor.set(1, 1);
        lv.position.set(GB_CELL - 2, GB_CELL - 2);
        g.addChild(lv);
      }
      if (sel) g.rect(0, 0, GB_CELL, GB_CELL).stroke({ width: 2, color: THEME.gold });
    }
    this.mkText(c, `背包 ${m.inventory.length}/${GB_CAP} · 点击装备查看详情`, GB_X, 476, 12, THEME.textDim);
    const sel = m.inventory.find((i) => i.uid === this.selBagUid) ?? null;
    this.buildItemDetail(m, sel, 'bag');
  }

  // ───────────────────────── 装备页 ─────────────────────────

  private buildEquipPage(m: ProgressionModel): void {
    const c = this.content;
    const slots: EquipmentSlot[] = ['weapon', 'head', 'body', 'shoes', 'accessory'];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const y = EP_Y0 + i * EP_STEP;
      const it = m.equipment[i];
      const active = this.selEquipSlot === slot;
      const row = new Graphics();
      row.rect(0, 0, 396, 72)
        .fill({ color: active ? THEME.panelAlt : THEME.panel, alpha: active ? 1 : 0.55 })
        .stroke({ width: 1, color: active ? THEME.gold : THEME.border, alpha: 0.7 });
      row.position.set(EP_X, y - 6);
      row.eventMode = 'static';
      row.cursor = 'pointer';
      row.on('pointertap', () => {
        this.selEquipSlot = slot;
        this.scheduleRefresh();
      });
      c.addChild(row);
      const cell = this.mkSlotCell(c, EP_X + 10, y, 64, it ? QUALITY_COLOR[it.quality] : undefined);
      const ch = new Text({
        text: it ? it.name.slice(0, 1) : '空',
        style: { fill: it ? QUALITY_COLOR[it.quality] : THEME.textDim, fontSize: 24, fontWeight: 'bold', fontFamily: THEME.fontFamily },
      });
      ch.anchor.set(0.5);
      ch.position.set(32, 30);
      cell.addChild(ch);
      this.mkText(c, SLOT_LABEL[slot], EP_X + 86, y + 8, 13, THEME.textDim);
      this.mkText(
        c,
        it ? `${it.name}${it.strengthenLevel > 0 ? ` +${it.strengthenLevel}` : ''}` : '（空）',
        EP_X + 86, y + 30, 14,
        it ? QUALITY_COLOR[it.quality] : THEME.textDim,
      );
    }
    const idx = this.selEquipSlot ? slots.indexOf(this.selEquipSlot) : -1;
    const sel = idx >= 0 ? m.equipment[idx] : null;
    this.buildItemDetail(m, sel, 'equip');
  }

  /** 背包/装备页共用的右侧详情（面板 (620,210,450,300) + 按钮行 y=524） */
  private buildItemDetail(m: ProgressionModel, it: ItemView | null, mode: 'bag' | 'equip'): void {
    const c = this.content;
    const g = new Graphics();
    drawPanel(g, { x: DET_X, y: DET_Y, w: DET_W, h: DET_H, raised: true, ornate: false });
    c.addChild(g);
    if (!it) {
      const tip = mode === 'bag'
        ? '← 点击左侧装备查看详情'
        : this.selEquipSlot
          ? '该槽位为空'
          : '← 点击左侧槽位查看详情';
      this.mkText(c, tip, DET_X + 24, DET_Y + 130, 14, THEME.textDim);
      if (mode === 'equip') this.mkBtn(c, '卸 下', DET_X + 10, BTN_Y, 130, BTN_H, () => {}, false, 'secondary');
      return;
    }
    const qc = QUALITY_COLOR[it.quality];
    this.mkText(c, `${it.name}${it.strengthenLevel > 0 ? ` +${it.strengthenLevel}` : ''}`, DET_X + 16, DET_Y + 10, 17, qc);
    this.mkText(
      c,
      `品质 ${it.qualityLabel} · 部位 ${SLOT_LABEL[it.slot]} · 评分 ${it.score}${it.equipped ? ' · 已穿戴' : ''}`,
      DET_X + 16, DET_Y + 40, 13, THEME.textDim,
    );
    g.rect(DET_X + 12, DET_Y + 64, DET_W - 24, 1).fill({ color: THEME.border, alpha: 0.8 });
    let y = DET_Y + 76;
    let any = false;
    for (const k of STAT_KEYS) {
      const v = it.stats[k as StatKey];
      if (!v) continue;
      any = true;
      this.mkText(c, STAT_LABEL[k], DET_X + 24, y, 13, THEME.textDim);
      this.mkText(c, `+${v}`, DET_X + 170, y, 13, THEME.text);
      y += 22;
    }
    if (!any) this.mkText(c, '（无属性加成）', DET_X + 24, y, 13, THEME.textDim);
    const gemMap = gemMapOf(m);
    this.mkText(
      c,
      `宝石：${it.sockets.map((id) => (id ? gemMap.get(id)?.name ?? '?' : '空')).join(' / ')}`,
      DET_X + 16, DET_Y + 240, 13, THEME.text,
    );
    this.mkText(c, `卖出价：${it.sellPrice} 金币`, DET_X + 16, DET_Y + 266, 14, THEME.gold);
    if (mode === 'bag') {
      this.mkBtn(c, '穿 戴', DET_X + 10, BTN_Y, 130, BTN_H, () => this.runOp(this.host.equip(it.uid)));
      this.mkBtn(c, '出 售', DET_X + 160, BTN_Y, 130, BTN_H, () => this.runOp(this.host.sell(it.uid)), true, 'danger');
    } else {
      this.mkBtn(c, '卸 下', DET_X + 10, BTN_Y, 130, BTN_H, () => this.runOp(this.host.unequip(it.slot)), it.equipped, 'secondary');
    }
  }

  // ───────────────────────── 强化页 ─────────────────────────

  private buildStrengthenPage(m: ProgressionModel): void {
    const c = this.content;
    const items = this.allItems(m);
    if (this.selStrUid && !items.some((i) => i.uid === this.selStrUid)) this.selStrUid = null;
    this.mkText(c, '选择装备（金点 = 已穿戴）', SG_X, 206, 13, THEME.textDim);
    items.slice(0, SG_COLS * 4).forEach((it, i) => {
      const x = SG_X + (i % SG_COLS) * SG_STEP;
      const y = SG_Y + Math.floor(i / SG_COLS) * SG_STEP;
      const sel = it.uid === this.selStrUid;
      const g = this.mkSlotCell(c, x, y, SG_CELL, QUALITY_COLOR[it.quality], () => {
        this.selStrUid = it.uid;
        this.scheduleRefresh();
      });
      const ch = new Text({
        text: it.strengthenLevel > 0 ? `+${it.strengthenLevel}` : it.name.slice(0, 1),
        style: { fill: it.strengthenLevel > 0 ? THEME.gold : QUALITY_COLOR[it.quality], fontSize: 14, fontWeight: 'bold', fontFamily: THEME.fontFamily },
      });
      ch.anchor.set(0.5);
      ch.position.set(SG_CELL / 2, SG_CELL / 2);
      g.addChild(ch);
      if (it.equipped) g.circle(7, 7, 3).fill(THEME.gold);
      if (sel) g.rect(0, 0, SG_CELL, SG_CELL).stroke({ width: 2, color: THEME.gold });
    });
    this.mkText(c, `共 ${items.length} 件 · 失败不掉级`, SG_X, 432, 12, THEME.textDim);

    const sel = items.find((i) => i.uid === this.selStrUid) ?? null;
    const pg = new Graphics();
    drawPanel(pg, { x: SI_X, y: SI_Y, w: SI_W, h: SI_H, raised: true, ornate: false });
    c.addChild(pg);
    let canDo = false;
    if (!sel) {
      this.mkText(c, '← 选择一件装备进行强化', SI_X + 24, SI_Y + 100, 14, THEME.textDim);
    } else {
      const lv = sel.strengthenLevel;
      const rate = strengthenSuccessRate(STRENGTHEN_CONFIG, lv);
      const cost = strengthenCost(lv);
      this.mkText(c, `${sel.name}${lv > 0 ? ` +${lv}` : ''}`, SI_X + 16, SI_Y + 12, 16, QUALITY_COLOR[sel.quality]);
      this.mkText(c, `部位 ${SLOT_LABEL[sel.slot]} · 品质 ${sel.qualityLabel}`, SI_X + 16, SI_Y + 42, 13, THEME.textDim);
      this.mkText(c, `当前强化：+${lv}`, SI_X + 16, SI_Y + 72, 14, THEME.text);
      if (rate === null) {
        this.mkText(c, `已达最大强化等级（+${STRENGTHEN_CONFIG.maxLevel}）`, SI_X + 16, SI_Y + 100, 14, THEME.gold);
        this.mkText(c, '这件装备已经无法继续强化了', SI_X + 16, SI_Y + 128, 12, THEME.textDim);
      } else {
        this.mkText(c, `下级成功率：${rate}%（+${lv} → +${lv + 1}）`, SI_X + 16, SI_Y + 100, 14, THEME.gold);
        this.mkText(c, `消耗强化石：${cost}（持有 ${m.stones}）`, SI_X + 16, SI_Y + 128, 14, m.stones >= cost ? THEME.text : THEME.danger);
        this.mkText(c, '失败不掉级，已消耗的强化石不返还', SI_X + 16, SI_Y + 156, 12, THEME.textDim);
        canDo = m.stones >= cost;
      }
    }
    const uid = sel?.uid;
    this.mkBtn(c, '强 化', SI_X + 140, 480, 160, 52, () => {
      if (uid) this.runOp(this.host.strengthen(uid));
    }, !!sel && canDo, 'primary', 16);
  }

  // ───────────────────────── 宝石页 ─────────────────────────

  private buildGemPage(m: ProgressionModel): void {
    const c = this.content;
    const items = this.allItems(m);
    if (this.gemUid && !items.some((i) => i.uid === this.gemUid)) this.gemUid = null;
    if (this.gemSocket !== null && (this.gemSocket < 0 || this.gemSocket > 2)) this.gemSocket = null;
    const gemMap = gemMapOf(m);
    // 左列：宝石列表
    this.mkText(c, '宝石（点击选择）', GM_X, 206, 13, THEME.textDim);
    m.gems.forEach((gem, i) => {
      const y = GM_Y + i * GM_ROW_H;
      const has = gem.count > 0;
      const sel = this.gemId === gem.id;
      const row = new Graphics();
      row.rect(0, 0, GM_ROW_W, GM_ROW_H - 4)
        .fill({ color: sel ? THEME.panelAlt : THEME.panel, alpha: sel ? 1 : 0.5 })
        .stroke({ width: 1, color: sel ? THEME.gold : THEME.border, alpha: 0.7 });
      row.position.set(GM_X, y);
      if (has) {
        row.eventMode = 'static';
        row.cursor = 'pointer';
        row.on('pointertap', () => {
          this.gemId = gem.id;
          this.scheduleRefresh();
        });
      }
      c.addChild(row);
      const col = has ? GEM_TIER_COLOR[gem.tier] ?? THEME.text : THEME.textDim;
      this.mkText(c, `${gem.name}  T${gem.tier}  ${STAT_LABEL[gem.stat]} +${gem.value}`, GM_X + 10, y + 4, 12, col);
      const cnt = this.mkText(c, `×${gem.count}`, GM_X + GM_ROW_W - 10, y + 4, 12, has ? THEME.gold : THEME.textDim);
      cnt.anchor.set(1, 0);
    });
    // 右上：装备选择
    this.mkText(c, '选择装备', GG_X, 206, 13, THEME.textDim);
    items.slice(0, GG_COLS * 4).forEach((it, i) => {
      const x = GG_X + (i % GG_COLS) * GG_STEP;
      const y = GG_Y + Math.floor(i / GG_COLS) * GG_STEP;
      const sel = it.uid === this.gemUid;
      const g = this.mkSlotCell(c, x, y, GG_CELL, QUALITY_COLOR[it.quality], () => {
        this.gemUid = it.uid;
        this.gemSocket = null; // 换装备后孔位语义变化，重置
        this.scheduleRefresh();
      });
      const ch = new Text({ text: it.name.slice(0, 1), style: { fill: QUALITY_COLOR[it.quality], fontSize: 16, fontWeight: 'bold', fontFamily: THEME.fontFamily } });
      ch.anchor.set(0.5);
      ch.position.set(GG_CELL / 2, GG_CELL / 2);
      g.addChild(ch);
      if (it.equipped) g.circle(7, 7, 3).fill(THEME.gold);
      if (sel) g.rect(0, 0, GG_CELL, GG_CELL).stroke({ width: 2, color: THEME.gold });
    });
    // 右下：孔位 + 流程
    const sel = items.find((i) => i.uid === this.gemUid) ?? null;
    const sockText = sel
      ? sel.sockets.map((id, i) => `${['①', '②', '③'][i]}${id ? gemMap.get(id)?.name ?? '?' : '空'}`).join('  ')
      : '（先选装备）';
    this.mkText(c, `孔位：${sockText}`, SKT_X, 418, 12, THEME.textDim);
    for (let i = 0; i < 3; i++) {
      const gid = sel ? sel.sockets[i] : null;
      const gv = gid ? gemMap.get(gid) : null;
      const tierColor = gv ? GEM_TIER_COLOR[gv.tier] ?? THEME.border : THEME.border;
      const g = this.mkSlotCell(c, SKT_X + i * SKT_STEP, SKT_Y, SKT_SIZE, tierColor, sel
        ? () => {
            this.gemSocket = i;
            this.scheduleRefresh();
          }
        : undefined);
      const ch = new Text({
        text: gv ? gv.name.slice(0, 1) : '空',
        style: { fill: gv ? tierColor : THEME.textDim, fontSize: gv ? 16 : 13, fontFamily: THEME.fontFamily },
      });
      ch.anchor.set(0.5);
      ch.position.set(SKT_SIZE / 2, SKT_SIZE / 2);
      g.addChild(ch);
      if (sel && this.gemSocket === i) g.rect(0, 0, SKT_SIZE, SKT_SIZE).stroke({ width: 2, color: THEME.gold });
    }
    const selGem = this.gemId ? m.gems.find((g) => g.id === this.gemId) ?? null : null;
    this.mkText(c, selGem ? `已选宝石：${selGem.name} ×${selGem.count}` : '未选宝石', 828, 446, 12, selGem && selGem.count > 0 ? THEME.text : THEME.textDim);
    this.mkText(c, sel ? '点孔位后可镶嵌/摘除' : '先在上方选择装备', 828, 466, 12, THEME.textDim);
    // 流程按钮：选装备 → 选孔 → 选宝石 → 镶嵌；已镶宝石可摘除
    const canSocket = !!sel && this.gemSocket !== null && sel.sockets[this.gemSocket] === null && !!selGem && selGem.count > 0;
    const canUnsocket = !!sel && this.gemSocket !== null && sel.sockets[this.gemSocket] !== null;
    this.mkBtn(c, '镶 嵌', GG_X, GB_BTN_Y, 130, 44, () => {
      if (sel && this.gemSocket !== null && selGem) this.runOp(this.host.socketGem(sel.uid, this.gemSocket, selGem.id));
    }, canSocket, 'primary');
    this.mkBtn(c, '摘 除', GG_X + 150, GB_BTN_Y, 130, 44, () => {
      if (sel && this.gemSocket !== null) this.runOp(this.host.unsocketGem(sel.uid, this.gemSocket));
    }, canUnsocket, 'danger');
  }

  // ───────────────────────── 技能页 ─────────────────────────

  private buildSkillPage(m: ProgressionModel): void {
    const c = this.content;
    this.mkText(c, `剩余技能点：${m.skillPoints}`, KC_X, 206, 15, THEME.gold);
    this.mkText(
      c,
      `攻击 ${m.stats.atk} · 防御 ${m.stats.def} · 生命 ${m.stats.maxHp} · 暴击 ${m.stats.critRate}%`,
      420, 209, 12, THEME.textDim,
    );
    m.skills.forEach((sk, i) => {
      const cy = KC_Y0 + i * KC_STEP;
      const g = new Graphics();
      g.rect(0, 0, KC_W, KC_H)
        .fill({ color: THEME.panelAlt, alpha: 0.55 })
        .stroke({ width: 1, color: THEME.border, alpha: 0.8 });
      g.rect(0, 0, 3, KC_H).fill(sk.canUpgrade ? THEME.accent : THEME.border);
      g.position.set(KC_X, cy);
      g.eventMode = 'none';
      c.addChild(g);
      this.mkText(c, sk.name, KC_X + 16, cy + 10, 16, THEME.text);
      this.mkText(c, `Lv ${sk.level}/${sk.maxLevel}`, KC_X + 16, cy + 38, 13, THEME.gold);
      this.mkText(c, `当前：倍率 ${fmtNum(sk.damageMul)} · 耗蓝 ${sk.mpCost} · CD ${(sk.cdMs / 1000).toFixed(1)}s`, KC_X + 16, cy + 62, 13, THEME.textDim);
      const maxed = sk.level >= sk.maxLevel;
      this.mkText(
        c,
        maxed ? '已满级' : sk.nextDamageMul != null ? `下级：倍率 ${fmtNum(sk.nextDamageMul)}` : '',
        KC_X + 240, cy + 62, 13, maxed ? THEME.gold : THEME.text,
      );
      const btnX = KC_X + KC_W - 24 - 170;
      if (maxed) {
        this.mkBtn(c, '已满级', btnX, cy + 26, 170, 44, () => {}, false, 'secondary');
      } else {
        this.mkBtn(c, `升级（消耗 ${sk.upCost} 点）`, btnX, cy + 26, 170, 44, () => this.runOp(this.host.upgradeSkill(sk.id)), sk.canUpgrade, 'primary', 12);
        if (!sk.canUpgrade) this.mkText(c, '技能点不足', btnX + 42, cy + 74, 11, THEME.danger);
      }
    });
    this.mkText(c, '提示：玩家升级时自动获得技能点（每级 +1）', KC_X, 566, 12, THEME.textDim);
  }
}
