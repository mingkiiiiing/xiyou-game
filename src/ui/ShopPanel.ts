/**
 * BT-4.4 商店面板（完整双栏版，替换 STUB 占位实现）。
 *
 * 数据源：src/meta/progression.ts 的 ShopModel / GemView / ItemView / OpResultMsg。
 * 定价由模型层给出（potionPrices / stonePrice / GemView.price / ItemView.sellPrice），UI 只展示。
 * 国风皮肤：art/ui.ts 的 panelShapes / buttonShapes / slotShapes + art/theme.ts THEME。
 *
 * ┌─────────────────────────────────────────────────────────────────────────────────────
 * │ 布局坐标表（面板本地坐标；面板 860×540，view.position = (210, 90)，
 * │ 屏幕覆盖 210..1070 × 90..630，位于 1280×720 画布内，不超屏）
 * │
 * │ 顶部栏  y 0..58
 * │   标题「西 游 坊 市」     文本 (26, 16) 22px 金色
 * │   金币/强化石             文本 (470, 24) 14px（右边界 ~700，避让关闭按钮）
 * │   关闭按钮【×】          视觉 (788, 14) 56×34，热区 (780, 6) 72×46
 * │   横分隔线 y=58（x 16..844）；竖分隔线 x=480（y 64..492）
 * │
 * │ 左栏「购 买」 x 20..470
 * │   栏头                    文本 (20, 62) 15px 金色
 * │   红药/蓝药/强化石行 ×3   行 y = 94 / 140 / 186，行高 40（行底色 20,y,430×40）
 * │     图标 28×28            (20, y+6)
 * │     名称                  (58, y+2) 14px
 * │     价格                  (58, y+21) 12px 金色
 * │     拥有数                右对齐至 x=368（anchor 1,0），12px 暗色
 * │     买按钮                视觉 (386, y+2) 64×36，热区 (386, y) 64×40
 * │   宝石栏头                文本 (20, 234) 15px 金色
 * │   宝石格 ×12（2 列 × 6 行，全部 GemView）
 * │     列 x = 20 / 245，格宽 225；行 y = 262 + r×40（262..462），格高 38（底色 225×38）
 * │     图标 18×18            (colX, rowY+10)（按属性配色菱形）
 * │     名称                  (colX+24, rowY+2) 12px
 * │     拥有/属性             (colX+24, rowY+19) 11px 暗色（价格并入买按钮标签）
 * │     买按钮（含价格标签）  视觉 (colX+160, rowY+4) 58×30，热区 (colX+146, rowY-1) 74×40
 * │
 * │ 右栏「出 售」 x 490..840
 * │   栏头                    文本 (490, 62) 15px 金色；「滚轮翻页」提示 (556, 67) 11px（溢出才显示）
 * │   装备行 ×10（背包 >10 时滚轮翻页，行高 40 × 整除窗口 400 → 无半行裁切）
 * │     行底色                (490, y, 344×40)，y = 94 + r×40（94..454）
 * │     品质格 28×28          (490, y+6)（slotShapes，品质色描边）
 * │     名称                  (528, y+3) 13px（品质色，含 [槽位] 与 +强化 前后缀）
 * │     售价                  (528, y+22) 11px 金色（读 ItemView.sellPrice）
 * │     卖按钮                视觉 (772, y+2) 62×36，热区 (772, y) 62×40
 * │   空背包提示              居中 (665, 268) anchor 0.5
 * │
 * │ 消息条  (20, 502) 820×30，文字居中 (430, 517) 13px；显示 1400ms 后 600ms 淡出（共 2s）
 * └─────────────────────────────────────────────────────────────────────────────────────
 * 自查：所有按钮热区 ≥40×40（宝石买按钮 74×40、药水 64×40、卖 62×40、关闭 72×46）；
 *       左右栏 / 消息条互不重叠（左栏 ≤470 | 竖线 480 | 右栏 ≥490；内容最深 494 < 消息条 502）。
 *
 * 性能：refresh() 仅在 打开/交易/翻页 时全量重画（dyn Graphics clear 重画 + Text 池复用，
 *       UiButton 构造一次仅改状态）；update(dtMs) 每帧只做消息条 alpha 衰减，零对象分配、零重绘。
 */
import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { OpResultMsg, ShopModel } from '../meta/progression';
import { THEME } from '../art/theme';
import { QUALITY_COLOR, SLOT_LABEL, STAT_LABEL } from '../item/data';
import { buttonShapes, drawPanel, slotShapes } from '../art/ui';
import { drawShapes } from '../art/pixiRender';

// ───────────────────────── 常量（与文件头坐标表一一对应） ─────────────────────────

const VIEW_W = 1280;
const VIEW_H = 720;
const PANEL_W = 860;
const PANEL_H = 540;
const PANEL_X = (VIEW_W - PANEL_W) / 2; // 210
const PANEL_Y = (VIEW_H - PANEL_H) / 2; // 90
const SELL_VISIBLE = 10; // 右栏可见行数（400px 窗口 ÷ 40px 行高）
const GEM_CELLS = 12;   // 3 tier × 4 属性
const MSG_TOTAL_MS = 2000;
const MSG_FADE_MS = 600;

/** 宝石属性 → 图标色 */
const GEM_STAT_COLOR: Record<string, number> = {
  atk: 0xf85149, def: 0x4493f8, maxHp: 0x3fb950, maxMp: 0xab7df8,
  critRate: 0xf0883e, critDmg: 0xffd257, moveSpeed: 0x6fe3c4,
};

export interface ShopPanelHost {
  getModel(): ShopModel;
  buyPotion(kind: 'hp' | 'mp'): OpResultMsg;
  buyStone(): OpResultMsg;
  buyGem(gemId: string): OpResultMsg;
  sell(uid: string): OpResultMsg;
  close(): void;
}

// ───────────────────────── 内部按钮（视觉 + 扩大热区，构造一次复用） ─────────────────────────

type BtnVariant = 'primary' | 'secondary' | 'danger';

class UiButton extends Container {
  private readonly g = new Graphics();
  /** 按钮文字（避开 Container.label: string 的可访问性属性，故叫 labelText） */
  readonly labelText: Text;
  private readonly bw: number;
  private readonly bh: number;
  private readonly variant: BtnVariant;
  private enabled = true;

  constructor(
    bw: number, bh: number, label: string,
    onTap: () => void,
    variant: BtnVariant = 'primary',
    /** 热区（本地坐标，可大于视觉尺寸）；默认 = 视觉矩形 */
    hit?: { x: number; y: number; w: number; h: number },
  ) {
    super();
    this.bw = bw;
    this.bh = bh;
    this.variant = variant;
    this.hitArea = hit ? new Rectangle(hit.x, hit.y, hit.w, hit.h) : new Rectangle(0, 0, bw, bh);
    this.labelText = new Text({
      text: label,
      style: {
        fill: THEME.text,
        fontSize: Math.max(11, Math.min(18, Math.round(bh * 0.42))),
        fontFamily: THEME.fontFamily,
        fontWeight: 'bold',
      },
    });
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(bw / 2, bh / 2);
    this.addChild(this.g, this.labelText);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointertap', onTap);
    this.redraw();
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.eventMode = on ? 'static' : 'none';
    this.labelText.style.fill = on ? THEME.text : THEME.textDim;
    this.redraw();
  }

  setText(s: string): void {
    this.labelText.text = s;
  }

  private redraw(): void {
    this.g.clear();
    drawShapes(this.g, buttonShapes({ x: 0, y: 0, w: this.bw, h: this.bh, enabled: this.enabled, variant: this.variant }));
  }
}

// ───────────────────────── 商店面板 ─────────────────────────

export class ShopPanel {
  readonly view = new Container();

  private host: ShopPanelHost;
  private model: ShopModel | null = null;
  private scroll = 0;
  private msgRemainMs = 0;

  private readonly chrome = new Graphics(); // 静态：面板底/分隔线/消息条底
  private readonly dyn = new Graphics();    // 动态：行底色/图标/品质格，refresh 重画

  private readonly currencyText: Text;
  private readonly sellHintText: Text;
  private readonly emptyText: Text;
  private readonly msgText: Text;

  private readonly potionName: Text[] = [];
  private readonly potionPrice: Text[] = [];
  private readonly potionOwned: Text[] = [];
  private readonly potionBuy: UiButton[] = [];

  private readonly gemName: Text[] = [];
  private readonly gemOwned: Text[] = [];
  private readonly gemBuy: UiButton[] = [];

  private readonly sellName: Text[] = [];
  private readonly sellPrice: Text[] = [];
  private readonly sellBtn: UiButton[] = [];

  constructor(host: ShopPanelHost) {
    this.host = host;
    this.view.position.set(PANEL_X, PANEL_Y);
    this.view.visible = false;
    this.view.eventMode = 'static';
    this.view.hitArea = new Rectangle(0, 0, PANEL_W, PANEL_H); // 滚轮翻页热区 = 整个面板

    // —— 静态底 ——
    const c = this.chrome;
    drawPanel(c, { x: 0, y: 0, w: PANEL_W, h: PANEL_H, radius: 10 });
    c.rect(16, 58, PANEL_W - 32, 1).fill({ color: THEME.border, alpha: 0.55 });
    c.rect(480, 64, 1, 428).fill({ color: THEME.border, alpha: 0.55 });
    c.rect(20, 502, 820, 30).fill({ color: 0x10141a, alpha: 0.92 });
    c.rect(20, 502, 820, 30).stroke({ width: 1, color: THEME.border });
    this.view.addChild(c);
    this.view.addChild(this.dyn);

    // —— 顶部 ——
    this.mkText('西 游 坊 市', 26, 16, 22, THEME.gold, true);
    this.currencyText = this.mkText('金币 0    强化石 0', 470, 24, 14, THEME.text);
    const closeBtn = new UiButton(
      56, 34, '×', () => this.host.close(), 'secondary',
      { x: -8, y: -8, w: 72, h: 46 },
    );
    closeBtn.position.set(788, 14);
    this.view.addChild(closeBtn);

    // —— 栏头 ——
    this.mkText('购 买', 20, 62, 15, THEME.gold, true);
    this.mkText('出 售', 490, 62, 15, THEME.gold, true);
    this.sellHintText = this.mkText('（滚轮翻页）', 556, 67, 11, THEME.textDim);
    this.sellHintText.visible = false;
    this.emptyText = new Text({
      text: '背包空空如也\n去关卡里捡点装备再来吧～',
      style: { fill: THEME.textDim, fontSize: 14, fontFamily: THEME.fontFamily, align: 'center', lineHeight: 24 },
    });
    this.emptyText.anchor.set(0.5);
    this.emptyText.position.set(665, 268);
    this.emptyText.visible = false;
    this.view.addChild(this.emptyText);

    // —— 左栏：药水 / 强化石 ×3 ——
    for (let i = 0; i < 3; i++) {
      const y = 94 + i * 46;
      this.potionName.push(this.mkText('', 58, y + 2, 14, THEME.text));
      this.potionPrice.push(this.mkText('', 58, y + 21, 12, THEME.gold));
      const owned = this.mkText('', 368, y + 11, 12, THEME.textDim);
      owned.anchor.set(1, 0);
      this.potionOwned.push(owned);
      const cb = i === 0 ? () => this.act(this.host.buyPotion('hp'))
        : i === 1 ? () => this.act(this.host.buyPotion('mp'))
          : () => this.act(this.host.buyStone());
      const btn = new UiButton(64, 36, '买', cb, 'primary', { x: 0, y: -2, w: 64, h: 40 });
      btn.position.set(386, y + 2);
      this.potionBuy.push(btn);
      this.view.addChild(btn);
    }

    // —— 左栏：宝石 2 列 × 6 行 ——
    for (let i = 0; i < GEM_CELLS; i++) {
      const col = i % 2;
      const row = (i / 2) | 0;
      const cx = col === 0 ? 20 : 245;
      const cy = 262 + row * 40;
      this.gemName.push(this.mkText('', cx + 24, cy + 2, 12, THEME.text));
      this.gemOwned.push(this.mkText('', cx + 24, cy + 19, 11, THEME.textDim));
      const btn = new UiButton(
        58, 30, '', () => {
          const gv = this.model?.gems[i];
          if (gv) this.act(this.host.buyGem(gv.id));
        },
        'secondary', { x: -14, y: -5, w: 74, h: 40 },
      );
      btn.position.set(cx + 160, cy + 4);
      this.gemBuy.push(btn);
      this.view.addChild(btn);
    }

    // —— 右栏：出售 ×10（滚轮翻页） ——
    for (let r = 0; r < SELL_VISIBLE; r++) {
      const y = 94 + r * 40;
      const name = this.mkText('', 528, y + 3, 13, THEME.text);
      this.sellName.push(name);
      this.sellPrice.push(this.mkText('', 528, y + 22, 11, THEME.gold));
      const btn = new UiButton(
        62, 36, '卖', () => {
          const it = this.model?.sellable[this.scroll + r];
          if (it) this.act(this.host.sell(it.uid));
        },
        'danger', { x: 0, y: -2, w: 62, h: 40 },
      );
      btn.position.set(772, y + 2);
      this.sellBtn.push(btn);
      this.view.addChild(btn);
    }

    // —— 消息条 ——
    this.msgText = new Text({
      text: '',
      style: { fill: THEME.text, fontSize: 13, fontFamily: THEME.fontFamily, fontWeight: 'bold' },
    });
    this.msgText.anchor.set(0.5);
    this.msgText.position.set(430, 517);
    this.msgText.visible = false;
    this.view.addChild(this.msgText);

    // —— 滚轮：右栏列表翻页 ——
    this.view.on('wheel', (e) => {
      const len = this.model?.sellable.length ?? 0;
      if (len <= SELL_VISIBLE) return;
      const before = this.scroll;
      this.scroll = Math.max(0, Math.min(len - SELL_VISIBLE, this.scroll + (e.deltaY > 0 ? 1 : -1)));
      if (this.scroll !== before) this.refresh();
    });
  }

  show(): void {
    this.view.visible = true;
    this.refresh();
  }

  hide(): void {
    this.view.visible = false;
  }

  get visible(): boolean {
    return this.view.visible;
  }

  /** Escape 关闭；返回是否消费该按键（面板隐藏时不消费） */
  handleKey(code: string): boolean {
    if (!this.view.visible) return false;
    if (code === 'Escape') {
      this.host.close();
      return true;
    }
    return false;
  }

  /** 每帧：仅消息条淡出（无重绘、零分配） */
  update(dtMs: number): void {
    if (this.msgRemainMs <= 0) return;
    this.msgRemainMs -= dtMs;
    if (this.msgRemainMs <= 0) {
      this.msgRemainMs = 0;
      this.msgText.visible = false;
      return;
    }
    this.msgText.alpha = this.msgRemainMs > MSG_FADE_MS ? 1 : this.msgRemainMs / MSG_FADE_MS;
  }

  /** 兼容 STUB 版的外部推送消息入口（等价内部消息条，不触发 refresh） */
  showMessage(msg: string, ok: boolean): void {
    this.pushMsg({ ok, msg });
  }

  /** 交易/翻页后重建全部动态内容 */
  refresh(): void {
    const m = this.host.getModel();
    this.model = m;
    this.currencyText.text = `金币 ${m.gold}    强化石 ${m.stones}`;

    // —— 药水 / 强化石 ——
    const rows: { name: string; price: number; owned: number }[] = [
      { name: '红药 · 生命', price: m.potionPrices.hp, owned: m.potions.hp },
      { name: '蓝药 · 法力', price: m.potionPrices.mp, owned: m.potions.mp },
      { name: '强化石', price: m.stonePrice, owned: m.stones },
    ];
    for (let i = 0; i < 3; i++) {
      const r = rows[i];
      this.potionName[i].text = r.name;
      this.potionPrice[i].text = `${r.price} 金币`;
      this.potionOwned[i].text = `拥有 ${r.owned}`;
      this.potionBuy[i].setEnabled(m.gold >= r.price);
    }

    // —— 宝石 ——
    for (let i = 0; i < GEM_CELLS && i < m.gems.length; i++) {
      const gv = m.gems[i];
      this.gemName[i].text = gv.name;
      this.gemOwned[i].text = `拥有 ${gv.count} · ${STAT_LABEL[gv.stat]} +${gv.value}`;
      this.gemBuy[i].setText(`${gv.price}金`);
      this.gemBuy[i].setEnabled(m.gold >= gv.price);
    }

    // —— 出售列表（滚轮翻页） ——
    const list = m.sellable;
    const maxScroll = Math.max(0, list.length - SELL_VISIBLE);
    if (this.scroll > maxScroll) this.scroll = maxScroll;
    this.sellHintText.visible = list.length > SELL_VISIBLE;
    this.emptyText.visible = list.length === 0;
    for (let r = 0; r < SELL_VISIBLE; r++) {
      const it = list[this.scroll + r];
      const name = this.sellName[r];
      const price = this.sellPrice[r];
      const btn = this.sellBtn[r];
      if (!it) {
        name.visible = false;
        price.visible = false;
        btn.visible = false;
        continue;
      }
      name.visible = true;
      price.visible = true;
      btn.visible = true;
      const plus = it.strengthenLevel > 0 ? ` +${it.strengthenLevel}` : '';
      name.text = `[${SLOT_LABEL[it.slot]}] ${it.name}${plus}`;
      name.style.fill = QUALITY_COLOR[it.quality];
      price.text = `${it.sellPrice} 金币`;
    }

    this.redrawDyn(m);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  // ───────────── 内部 ─────────────

  private act(res: OpResultMsg): void {
    this.pushMsg(res);
    this.refresh();
  }

  private pushMsg(res: OpResultMsg): void {
    this.msgRemainMs = MSG_TOTAL_MS;
    this.msgText.text = `${res.ok ? '✔' : '✘'} ${res.msg}`;
    this.msgText.style.fill = res.ok ? THEME.success : THEME.danger;
    this.msgText.alpha = 1;
    this.msgText.visible = true;
  }

  private mkText(text: string, x: number, y: number, size: number, fill: number, bold = false): Text {
    const t = new Text({ text, style: { fill, fontSize: size, fontFamily: THEME.fontFamily, fontWeight: bold ? 'bold' : 'normal' } });
    t.position.set(x, y);
    this.view.addChild(t);
    return t;
  }

  private redrawDyn(m: ShopModel): void {
    const g = this.dyn;
    g.clear();

    // 左栏行底 + 药水/强化石图标
    for (let i = 0; i < 3; i++) {
      const y = 94 + i * 46;
      g.rect(20, y, 430, 40).fill({ color: THEME.panelAlt, alpha: 0.4 });
      const color = i === 0 ? THEME.hp : i === 1 ? THEME.mp : 0x8b98a5;
      this.drawPotionIcon(g, 20, y + 6, color, i === 2);
    }

    // 宝石格底 + 图标
    for (let i = 0; i < GEM_CELLS && i < m.gems.length; i++) {
      const col = i % 2;
      const row = (i / 2) | 0;
      const cx = col === 0 ? 20 : 245;
      const cy = 262 + row * 40;
      g.rect(cx, cy, 225, 38).fill({ color: THEME.panelAlt, alpha: 0.32 });
      this.drawGemIcon(g, cx, cy + 10, GEM_STAT_COLOR[m.gems[i].stat] ?? 0x8b98a5);
    }

    // 出售行底 + 品质格
    for (let r = 0; r < SELL_VISIBLE; r++) {
      const it = m.sellable[this.scroll + r];
      if (!it) continue;
      const y = 94 + r * 40;
      g.rect(490, y, 344, 40).fill({ color: THEME.panelAlt, alpha: 0.4 });
      drawShapes(g, slotShapes({ x: 490, y: y + 6, size: 28, qualityColor: QUALITY_COLOR[it.quality] }));
    }
  }

  /** 药瓶 / 矿石图标（28×28 区域，原点左上） */
  private drawPotionIcon(g: Graphics, x: number, y: number, color: number, stone: boolean): void {
    if (stone) {
      g.poly([x + 14, y, x + 28, y + 14, x + 14, y + 28, x, y + 14]).fill(0x39424e);
      g.poly([x + 14, y + 4, x + 24, y + 14, x + 14, y + 24, x + 4, y + 14]).fill(0x6e7681);
      g.poly([x + 14, y + 4, x + 24, y + 14, x + 14, y + 14]).fill(0xd0d7de);
      return;
    }
    g.rect(x + 10, y + 1, 8, 7).fill(0x39424e); // 瓶颈
    g.roundRect(x + 3, y + 7, 22, 20, 4).fill(color); // 瓶身
    g.rect(x + 6, y + 16, 16, 8).fill({ color: 0xffffff, alpha: 0.18 }); // 液面高光
    g.roundRect(x + 3, y + 7, 22, 20, 4).stroke({ width: 1, color: 0x0d1117 });
  }

  /** 宝石图标（18×18 区域，原点左上，按属性配色） */
  private drawGemIcon(g: Graphics, x: number, y: number, color: number): void {
    g.poly([x + 9, y, x + 18, y + 9, x + 9, y + 18, x, y + 9]).fill(0x0d1117);
    g.poly([x + 9, y + 2, x + 16, y + 9, x + 9, y + 16, x + 2, y + 9]).fill(color);
    g.poly([x + 9, y + 2, x + 16, y + 9, x + 9, y + 9]).fill({ color: 0xffffff, alpha: 0.35 });
  }
}
