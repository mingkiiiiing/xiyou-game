/**
 * TASK-E 演示场景 —— 掉落 → 背包 → 穿戴 → 强化 → 宝石 全链路灰盒。
 * 访问：?scene=taskE
 * 素材：纯 Graphics + Text；交互：pixi eventMode + pointertap（鼠标点击）。
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { Game } from '../../core/Game';
import { Scene } from '../../core/Scene';
import type { BattleStats } from '../../shared/types';
import playerJson from '../../config/player.json';
import {
  DropResolver,
  Inventory,
  Equipment,
  GemBag,
  gemMapOf,
  mulberry32,
  recalcStats,
  itemStats,
  tryStrengthen,
  strengthenCost,
  strengthenSuccessRate,
  socketGem,
  unsocketGem,
  ITEM_TABLE,
  STRENGTHEN_CONFIG,
  DEFAULT_GEMS,
  DEFAULT_AFFIX_POOL,
  QUALITY_WEIGHTS,
  QUALITY_AFFIX_COUNT,
  QUALITY_COLOR,
  QUALITY_LABEL,
  SLOT_LABEL,
  STAT_LABEL,
  EQUIPMENT_SLOTS,
} from '../../item';
import type { DropRule } from '../../item';
import type { InventoryItem, StatKey } from '../../item';

// ───────────── 灰盒配色 ─────────────
const COL_PANEL = 0x161b22;
const COL_CELL = 0x0d1117;
const COL_LINE = 0x30363d;
const COL_TEXT = 0xd0d7de;
const COL_DIM = 0x8b949e;
const COL_OFF = 0x484f58;
const COL_ACCENT = 0x58a6ff;
const COL_GOLD = 0xe3b341;
const COL_GREEN = 0x7ee787;

function makeText(str: string, size = 13, color: number = COL_TEXT): Text {
  return new Text({ text: str, style: { fontFamily: 'sans-serif', fontSize: size, fill: color } });
}

/** 可点击色块按钮 */
function makeButton(
  x: number, y: number, w: number, h: number,
  label: string, onTap: () => void, bg = 0x21262d,
): Container {
  const c = new Container();
  const g = new Graphics();
  g.roundRect(0, 0, w, h, 4).fill(bg).stroke({ width: 1, color: COL_ACCENT });
  const t = makeText(label, 12);
  t.position.set((w - t.width) / 2, (h - t.height) / 2);
  c.addChild(g, t);
  c.position.set(x, y);
  c.eventMode = 'static';
  c.cursor = 'pointer';
  c.on('pointertap', onTap);
  c.on('pointerover', () => { g.alpha = 0.8; });
  c.on('pointerout', () => { g.alpha = 1; });
  return c;
}

/** 任务卡演示掉落表：现有 items.json 全部装备，各 60% 掉率 */
function demoDropRules(): DropRule[] {
  return ITEM_TABLE.map((def) => ({ itemId: def.id, chance: 0.6 }));
}

class TaskEScene extends Scene {
  private body: Container = new Container();
  private readonly rng = mulberry32(Date.now() % 2147483647);
  private readonly resolver = new DropResolver({
    items: ITEM_TABLE,
    rng: this.rng,
    qualityWeights: QUALITY_WEIGHTS,
    affixPool: DEFAULT_AFFIX_POOL,
    affixCountByQuality: QUALITY_AFFIX_COUNT,
  });
  private readonly bag = new Inventory(24);
  private readonly equip = new Equipment();
  private readonly gemBag = new GemBag();
  private readonly gems = gemMapOf(DEFAULT_GEMS);
  private readonly baseStats: BattleStats = { ...playerJson };
  private stones = 30;
  private selectedUid: string | null = null;
  private logs: string[] = [];

  constructor(game: Game) {
    super(game);
  }

  init(): void {
    this.view.addChild(this.body);
    this.log('点「模拟掉落」开始：掉装 → 穿戴 → 强化 → 镶宝石');
    this.render();
  }

  /** 纯点击驱动 UI，无逐帧逻辑 */
  update(_dtMs: number): void { /* 空 */ }

  // ───────────── 状态工具 ─────────────
  private selectedItem(): InventoryItem | null {
    if (!this.selectedUid) return null;
    const inBag = this.bag.get(this.selectedUid);
    if (inBag) return inBag;
    for (const s of EQUIPMENT_SLOTS) {
      const it = this.equip.get(s);
      if (it && it.uid === this.selectedUid) return it;
    }
    return null;
  }

  private isEquipped(item: InventoryItem): boolean {
    return this.equip.get(item.slot)?.uid === item.uid;
  }

  private totalStats(): BattleStats {
    return recalcStats(this.baseStats, this.equip.all(), DEFAULT_GEMS, STRENGTHEN_CONFIG);
  }

  private log(msg: string): void {
    this.logs.push(msg);
    if (this.logs.length > 30) this.logs.shift();
  }

  // ───────────── 玩法动作 ─────────────
  private doDrop(): void {
    const dropped = this.resolver.resolve(demoDropRules());
    const { added, overflow } = this.bag.addAll(dropped);
    const stonesGain = 1 + Math.floor(this.rng() * 3);
    this.stones += stonesGain;
    const families = ['atk', 'def', 'hp', 'mp'] as const;
    const gemId = `gem_${families[Math.floor(this.rng() * families.length)]}_1`;
    this.gemBag.add(gemId);
    const gem = this.gems.get(gemId);
    let msg = `掉落 ${added.length} 件装备 · 强化石 +${stonesGain} · ${gem ? gem.name : gemId} +1`;
    if (overflow.length > 0) msg += `（背包已满，${overflow.length} 件散落）`;
    this.log(msg);
    this.render();
  }

  private doEquip(item: InventoryItem): void {
    if (!this.bag.has(item.uid)) return;
    const res = this.equip.equip(item);
    if (!res.ok) {
      this.log(`穿戴失败：${res.reason ?? '未知原因'}`);
      this.render();
      return;
    }
    this.bag.remove(item.uid);
    if (res.replaced) {
      if (!this.bag.add(res.replaced)) {
        // 背包满：回滚换装，保证物品不丢
        this.equip.equip(res.replaced);
        this.bag.add(item);
        this.log('背包已满，穿戴取消');
        this.render();
        return;
      }
      this.log(`已装备 ${item.name}，换下 ${res.replaced.name}`);
    } else {
      this.log(`已装备 ${item.name}`);
    }
    this.render();
  }

  private doUnequip(item: InventoryItem): void {
    const taken = this.equip.unequip(item.slot);
    if (!taken) return;
    if (!this.bag.add(taken)) {
      this.equip.equip(taken);
      this.log('背包已满，无法卸下');
    } else {
      this.log(`已卸下 ${taken.name}`);
    }
    this.render();
  }

  private doStrengthen(item: InventoryItem): void {
    const res = tryStrengthen(item, STRENGTHEN_CONFIG, this.stones, this.rng);
    if (!res.performed) {
      this.log(`强化未执行：${res.reason ?? '未知原因'}`);
      this.render();
      return;
    }
    this.stones -= res.cost;
    this.log(
      res.success
        ? `强化成功！${item.name} +${res.toLevel}（消耗强化石 ${res.cost}）`
        : `强化失败，等级不变（消耗强化石 ${res.cost}）`,
    );
    this.render();
  }

  /** 点击宝石孔：有宝石 → 摘除；空孔 → 镶入一颗持有的宝石（随机家族，低级优先） */
  private doToggleSocket(item: InventoryItem, index: number): void {
    if (item.sockets[index] !== null) {
      const r = unsocketGem(item, index);
      if (r.ok && r.gemId) {
        this.gemBag.add(r.gemId);
        const g = this.gems.get(r.gemId);
        this.log(`摘下 ${g ? g.name : r.gemId}（${item.name}）`);
      }
      this.render();
      return;
    }
    const available = DEFAULT_GEMS.filter((g) => this.gemBag.count(g.id) > 0);
    if (available.length === 0) {
      this.log('没有可镶嵌的宝石，先「模拟掉落」攒一些');
      this.render();
      return;
    }
    const lowestTier = Math.min(...available.map((g) => g.tier));
    const cand = available.filter((g) => g.tier === lowestTier)[Math.floor(this.rng() * available.filter((g) => g.tier === lowestTier).length)];
    const r = socketGem(item, index, cand.id, this.gems);
    if (r.ok) {
      this.gemBag.remove(cand.id);
      this.log(`镶嵌 ${cand.name} → ${item.name}`);
    } else {
      this.log(`镶嵌失败：${r.reason ?? '未知原因'}`);
    }
    this.render();
  }

  /** 点击宝石库：镶入选中装备的第一个空孔 */
  private doSocketFromBag(item: InventoryItem, gemId: string): void {
    const free = item.sockets.findIndex((s) => s === null);
    if (free < 0) {
      this.log(`${item.name} 的孔位已满`);
      this.render();
      return;
    }
    const r = socketGem(item, free, gemId, this.gems);
    if (r.ok) {
      this.gemBag.remove(gemId);
      const g = this.gems.get(gemId);
      this.log(`镶嵌 ${g ? g.name : gemId} → ${item.name}`);
    } else {
      this.log(`镶嵌失败：${r.reason ?? '未知原因'}`);
    }
    this.render();
  }

  // ───────────── 渲染（状态变化后整体重建，规模小、简单可靠） ─────────────
  private render(): void {
    this.body.destroy({ children: true });
    this.body = new Container();
    this.view.addChild(this.body);
    const root = this.body;
    const total = this.totalStats();

    // ── 顶栏 ──
    root.addChild(makeText('造梦纪 · 装备与成长（TASK-E）', 16, COL_ACCENT)).position.set(16, 16);
    root.addChild(makeButton(340, 10, 110, 28, '模拟掉落', () => this.doDrop()));
    root.addChild(makeText(`强化石 × ${this.stones}`, 13, COL_GOLD)).position.set(470, 17);
    root.addChild(makeText(`背包 ${this.bag.size}/${this.bag.capacity}`, 13, COL_DIM)).position.set(585, 17);
    root.addChild(makeText('点背包/装备栏选中 → 穿戴 → 强化 → 镶宝石', 12, COL_DIM)).position.set(720, 18);

    // ── 左：装备栏 ──
    const eqPanel = new Graphics();
    eqPanel.roundRect(16, 50, 208, 380, 6).fill(COL_PANEL).stroke({ width: 1, color: COL_LINE });
    root.addChild(eqPanel);
    root.addChild(makeText('装备栏', 13, COL_DIM)).position.set(26, 58);
    EQUIPMENT_SLOTS.forEach((slot, i) => {
      const y = 82 + i * 69;
      const item = this.equip.get(slot);
      const c = new Container();
      const g = new Graphics();
      g.roundRect(0, 0, 188, 62, 4).fill(COL_CELL).stroke({ width: 1, color: COL_LINE });
      c.addChild(g);
      c.addChild(makeText(SLOT_LABEL[slot], 10, COL_DIM)).position.set(6, 4);
      if (item) {
        c.addChild(makeText(item.name, 12, QUALITY_COLOR[item.quality])).position.set(6, 20);
        c.addChild(makeText(`+${item.strengthenLevel}  ${QUALITY_LABEL[item.quality]}`, 11, COL_GOLD)).position.set(6, 40);
      } else {
        c.addChild(makeText('（空）', 12, COL_OFF)).position.set(6, 24);
      }
      c.position.set(26, y);
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.on('pointertap', () => {
        if (item) {
          this.selectedUid = item.uid;
          this.render();
        }
      });
      root.addChild(c);
    });

    // ── 左下：属性面板（基础 → 装备后） ──
    const stPanel = new Graphics();
    stPanel.roundRect(16, 440, 208, 264, 6).fill(COL_PANEL).stroke({ width: 1, color: COL_LINE });
    root.addChild(stPanel);
    root.addChild(makeText('属性（基础 → 装备后）', 13, COL_DIM)).position.set(26, 448);
    const statLines: string[] = [
      `生命 ${total.hp}/${total.maxHp}（基础${this.baseStats.maxHp}）`,
      `法力 ${total.mp}/${total.maxMp}（基础${this.baseStats.maxMp}）`,
      ...(STAT_KEYS_LIST.map((k) => `${STAT_LABEL[k]} ${this.baseStats[k]} → ${total[k]}`)),
    ];
    statLines.forEach((line, i) => {
      root.addChild(makeText(line, 12)).position.set(26, 476 + i * 22);
    });

    // ── 中：背包 ──
    const bagPanel = new Graphics();
    bagPanel.roundRect(232, 50, 520, 370, 6).fill(COL_PANEL).stroke({ width: 1, color: COL_LINE });
    root.addChild(bagPanel);
    root.addChild(makeText(`背包（点击选中 · ${this.bag.size}/${this.bag.capacity}）`, 13, COL_DIM)).position.set(244, 58);
    const cols = 6;
    const cell = 76;
    const gap = 6;
    this.bag.list().forEach((it, idx) => {
      const cx = 244 + (idx % cols) * (cell + gap);
      const cy = 80 + Math.floor(idx / cols) * (cell + gap);
      root.addChild(this.itemCell(it, cx, cy, cell, cell, it.uid === this.selectedUid));
    });

    // ── 中下：详情 / 强化 / 宝石孔 ──
    const detail = new Graphics();
    detail.roundRect(232, 430, 520, 274, 6).fill(COL_PANEL).stroke({ width: 1, color: COL_LINE });
    root.addChild(detail);
    root.addChild(makeText('详情 / 强化 / 宝石', 13, COL_DIM)).position.set(244, 438);

    const sel = this.selectedItem();
    if (!sel) {
      root.addChild(makeText('点击背包或装备栏中的装备查看详情', 12, COL_DIM)).position.set(244, 480);
    } else {
      const equipped = this.isEquipped(sel);
      root.addChild(
        makeText(`${sel.name}  [${QUALITY_LABEL[sel.quality]}·${SLOT_LABEL[sel.slot]}]  +${sel.strengthenLevel}`, 15, QUALITY_COLOR[sel.quality]),
      ).position.set(244, 464);

      const baseParts = (Object.entries(sel.baseStats) as [StatKey, number | undefined][])
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${STAT_LABEL[k]}+${v}`);
      root.addChild(makeText(`基础: ${baseParts.join(' ') || '无'}`, 12)).position.set(244, 492);

      const affixText = sel.affixes.map((a) => `${STAT_LABEL[a.stat]}+${a.value}`).join(' ') || '无';
      root.addChild(makeText(`词条: ${affixText}`, 11, COL_DIM)).position.set(244, 514);

      const contrib = itemStats(sel, DEFAULT_GEMS, STRENGTHEN_CONFIG);
      const contribParts = (Object.entries(contrib) as [StatKey, number | undefined][])
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${STAT_LABEL[k]}+${v}`);
      root.addChild(makeText(`合计(含强化/词条/宝石): ${contribParts.join(' ') || '无'}`, 11, COL_GREEN)).position.set(244, 534);

      // 宝石孔（点击：空→镶嵌，有→摘除）
      root.addChild(makeText('宝石孔:', 12, COL_DIM)).position.set(244, 566);
      sel.sockets.forEach((gemId, i) => {
        const bx = 310 + i * 146;
        const c = new Container();
        const g = new Graphics();
        g.roundRect(0, 0, 140, 36, 4).fill(COL_CELL).stroke({ width: 1, color: gemId ? COL_GREEN : COL_LINE });
        c.addChild(g);
        if (gemId) {
          const gm = this.gems.get(gemId);
          c.addChild(makeText(gm ? `${gm.name} ${STAT_LABEL[gm.stat]}+${gm.value}` : gemId, 10, COL_GREEN)).position.set(5, 3);
          c.addChild(makeText('点击摘除', 9, COL_DIM)).position.set(5, 20);
        } else {
          c.addChild(makeText('空孔', 10, COL_DIM)).position.set(5, 3);
          c.addChild(makeText('点击镶入低级宝石', 9, COL_DIM)).position.set(5, 20);
        }
        c.position.set(bx, 562);
        c.eventMode = 'static';
        c.cursor = 'pointer';
        c.on('pointertap', () => this.doToggleSocket(sel, i));
        root.addChild(c);
      });

      // 按钮：穿戴/卸下 + 强化
      root.addChild(
        makeButton(244, 620, 100, 32, equipped ? '卸下' : '穿戴', () => {
          if (equipped) this.doUnequip(sel);
          else this.doEquip(sel);
        }),
      );
      const rate = strengthenSuccessRate(STRENGTHEN_CONFIG, sel.strengthenLevel);
      const cost = strengthenCost(sel.strengthenLevel);
      const stLabel = rate === null ? '强化已满级' : `强化 +1（成功率${rate}% · ${cost}石）`;
      root.addChild(makeButton(354, 620, 230, 32, stLabel, () => this.doStrengthen(sel), 0x2b2113));
      root.addChild(
        makeText(`每级强化 = 装备基础属性 +${Math.round(STRENGTHEN_CONFIG.bonusPerLevel * 100)}%`, 10, COL_DIM),
      ).position.set(596, 630);
    }

    // ── 右：宝石库 ──
    const gemPanel = new Graphics();
    gemPanel.roundRect(760, 50, 504, 300, 6).fill(COL_PANEL).stroke({ width: 1, color: COL_LINE });
    root.addChild(gemPanel);
    root.addChild(makeText('宝石库（点击镶入选中装备第一个空孔）', 13, COL_DIM)).position.set(772, 58);
    DEFAULT_GEMS.forEach((gem, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 772 + col * 244;
      const y = 82 + row * 42;
      const count = this.gemBag.count(gem.id);
      const c = new Container();
      const g = new Graphics();
      g.roundRect(0, 0, 238, 36, 4).fill(COL_CELL).stroke({ width: 1, color: count > 0 ? COL_GREEN : COL_LINE });
      c.addChild(g);
      c.addChild(makeText(`${gem.name}  ${STAT_LABEL[gem.stat]}+${gem.value}`, 11, count > 0 ? COL_GREEN : COL_OFF)).position.set(6, 3);
      c.addChild(makeText(`持有 ×${count}  T${gem.tier}`, 10, COL_DIM)).position.set(6, 19);
      c.position.set(x, y);
      if (count > 0) {
        c.eventMode = 'static';
        c.cursor = 'pointer';
        c.on('pointertap', () => {
          const sel2 = this.selectedItem();
          if (!sel2) {
            this.log('先在背包/装备栏选中一件装备');
            this.render();
            return;
          }
          this.doSocketFromBag(sel2, gem.id);
        });
      }
      root.addChild(c);
    });

    // ── 右下：日志 ──
    const logPanel = new Graphics();
    logPanel.roundRect(760, 360, 504, 344, 6).fill(COL_PANEL).stroke({ width: 1, color: COL_LINE });
    root.addChild(logPanel);
    root.addChild(makeText('日志', 13, COL_DIM)).position.set(772, 368);
    const recent = this.logs.slice(-13);
    recent.forEach((line, i) => {
      root.addChild(makeText(line, 11, i === recent.length - 1 ? COL_TEXT : COL_DIM)).position.set(772, 394 + i * 22);
    });
  }

  /** 背包格子（品质描边 + 名称 + 强化等级 + 宝石数） */
  private itemCell(item: InventoryItem, x: number, y: number, w: number, h: number, selected: boolean): Container {
    const c = new Container();
    const g = new Graphics();
    g.roundRect(0, 0, w, h, 4)
      .fill(COL_CELL)
      .stroke({ width: selected ? 2 : 1, color: selected ? COL_ACCENT : QUALITY_COLOR[item.quality] });
    c.addChild(g);
    c.addChild(makeText(item.name.slice(0, 5), 11, QUALITY_COLOR[item.quality])).position.set(5, 4);
    c.addChild(makeText(`+${item.strengthenLevel}`, 11, COL_GOLD)).position.set(5, h - 18);
    const gemCount = item.sockets.filter((s) => s !== null).length;
    if (gemCount > 0) {
      c.addChild(makeText(`◆${gemCount}`, 11, COL_GREEN)).position.set(w - 26, h - 18);
    }
    c.position.set(x, y);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', () => {
      this.selectedUid = item.uid;
      this.render();
    });
    return c;
  }
}

/** STAT_KEYS 的本地别名（避免在样式区外散落 import） */
const STAT_KEYS_LIST: readonly StatKey[] = ['atk', 'def', 'critRate', 'critDmg', 'moveSpeed'];

export const sceneKey = 'taskE';

export function createScene(game: Game): Scene {
  return new TaskEScene(game);
}
