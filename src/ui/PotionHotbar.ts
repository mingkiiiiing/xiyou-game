/**
 * BT-4.4 战斗药水快捷栏（完整版）：Q 红药 / E 蓝药 —— 数量角标 + 共用 CD 遮罩 + 低血闪烁。
 *
 * ┌─────────────────────────────────────────────────────────────────────────────────────
 * │ 布局坐标表（本地坐标；view.position = (580, 648)，
 * │ 即 1280×720 画布下方中央（CombatHud 文档标注的左下技能栏右侧）；
 * │ 整体 120×56，屏幕覆盖 580..700 × 648..704，不超屏、不与 CombatHud 任何元素相交）
 * │
 * │ 底板面板  panelShapes (0, 0, 120×56)
 * │ 红药格    (4, 2, 52×52)；蓝药格 (64, 2, 52×52)（slotShapes，描边= THEME.hp / THEME.mp）
 * │ 每格内部（格左上角记 (sx, sy)，sy=2）：
 * │   键帽底        (sx+3, sy+3, 16×16)
 * │   键标 Q / E    文字中心 (sx+11, sy+11) 10px（常驻 Text）
 * │   药瓶图标      瓶颈 (sx+22, sy+13, 8×5)；瓶身 roundRect (sx+15, sy+18, 22×20, r4)；
 * │                 高光 (sx+18, sy+21, 4×12)；数量为 0 时整体 alpha 0.38
 * │   数量角标      右下对齐 (sx+49, sy+50) anchor(1,1) 13px（常驻 Text，×N）
 * │   CD 遮罩       (sx+3, sy+3, 46×46×frac) 自上而下压暗 alpha 0.66（共用 CD，两格同步）
 * │   CD 秒数      文字中心 (sx+26, sy+30) 15px 金色（常驻 Text，CD 中显示）
 * │   低血闪烁     仅红药格：hpRatio < 0.3 时整格外框 stroke 2.5px 金色，alpha 0.45..1 正弦脉动
 * └─────────────────────────────────────────────────────────────────────────────────────
 * 性能：每帧 update —— 单个 Graphics clear 后重画（约 30 个图元），全部 Text 构造一次复用，
 *       无每帧 new / 无数组分配；数值每帧 clamp，异常输入安全。
 */
import { Container, Graphics, Text } from 'pixi.js';
import { THEME } from '../art/theme';
import { panelShapes, slotShapes } from '../art/ui';
import { drawShapes } from '../art/pixiRender';

export interface PotionHotbarModel {
  potions: { hp: number; mp: number };
  cooldownRemainMs: number;   // 共用 CD 剩余
  cooldownTotalMs: number;
  hpRatio: number;            // 玩家当前血/蓝比例（低血时红药格闪烁提醒）
  mpRatio: number;
}

// ───────────────────────── 常量（与文件头坐标表一一对应） ─────────────────────────

const VIEW_W = 1280;
const VIEW_H = 720;
const BAR_W = 120;
const BAR_H = 56;
const BAR_X = (VIEW_W - BAR_W) / 2;         // 580
const BAR_Y = VIEW_H - BAR_H - 16;          // 648
const SLOT = 52;
const SLOT_Y = 2;
const LOW_HP_THRESHOLD = 0.3;
/** CD/闪光等时间量上限（防 update 传入异常巨大 dt 造成跳变） */
const MAX_DT_MS = 100;

export class PotionHotbar {
  readonly view = new Container();

  private readonly g = new Graphics();
  private readonly keyTexts: Text[] = [];
  private readonly countTexts: Text[] = [];
  private readonly cdTexts: Text[] = [];
  private blinkT = 0;

  constructor() {
    this.view.position.set(BAR_X, BAR_Y);
    this.view.addChild(this.g);
    const keys = ['Q', 'E'];
    for (let i = 0; i < 2; i++) {
      const sx = 4 + i * (SLOT + 8);
      const key = new Text({
        text: keys[i],
        style: { fill: THEME.textDim, fontSize: 10, fontFamily: THEME.fontFamily, fontWeight: 'bold' },
      });
      key.anchor.set(0.5);
      key.position.set(sx + 11, SLOT_Y + 11);
      this.keyTexts.push(key);
      this.view.addChild(key);

      const count = new Text({
        text: '',
        style: { fill: THEME.text, fontSize: 13, fontFamily: THEME.fontFamily, fontWeight: 'bold' },
      });
      count.anchor.set(1, 1);
      count.position.set(sx + SLOT - 3, SLOT_Y + SLOT - 2);
      this.countTexts.push(count);
      this.view.addChild(count);

      const cd = new Text({
        text: '',
        style: { fill: THEME.gold, fontSize: 15, fontFamily: THEME.fontFamily, fontWeight: 'bold' },
      });
      cd.anchor.set(0.5);
      cd.position.set(sx + SLOT / 2, SLOT_Y + 30);
      cd.visible = false;
      this.cdTexts.push(cd);
      this.view.addChild(cd);
    }
  }

  /** 每帧调用：单 Graphics clear 重画，Text 复用，零对象分配 */
  update(model: PotionHotbarModel, dtMs: number): void {
    this.blinkT = (this.blinkT + Math.max(0, Math.min(dtMs, MAX_DT_MS))) % 1_000_000;
    const g = this.g;
    g.clear();

    // 底板
    drawShapes(g, panelShapes({ x: 0, y: 0, w: BAR_W, h: BAR_H, radius: 8 }));

    const cdFrac = model.cooldownTotalMs > 0
      ? Math.max(0, Math.min(1, model.cooldownRemainMs / model.cooldownTotalMs))
      : 0;
    const onCd = model.cooldownRemainMs > 0;
    const kinds: ('hp' | 'mp')[] = ['hp', 'mp'];

    for (let i = 0; i < 2; i++) {
      const kind = kinds[i];
      const sx = 4 + i * (SLOT + 8);
      const color = kind === 'hp' ? THEME.hp : THEME.mp;
      const count = Math.max(0, model.potions[kind] | 0);
      const ratio = Math.max(0, Math.min(1, kind === 'hp' ? model.hpRatio : model.mpRatio));

      // 底格（国风品质描边格）
      drawShapes(g, slotShapes({ x: sx, y: SLOT_Y, size: SLOT, qualityColor: color }));
      g.rect(sx + 3, SLOT_Y + 3, SLOT - 6, SLOT - 6).fill({ color: 0x141920, alpha: 1 });

      // 药瓶图标（空瓶半透明）
      const empty = count === 0;
      const a = empty ? 0.38 : 1;
      g.rect(sx + 22, SLOT_Y + 13, 8, 5).fill({ color: 0x39424e, alpha: a });            // 瓶颈
      g.roundRect(sx + 15, SLOT_Y + 18, 22, 20, 4).fill({ color, alpha: a });            // 瓶身
      g.rect(sx + 18, SLOT_Y + 21, 4, 12).fill({ color: 0xffffff, alpha: 0.22 * a });    // 高光
      g.roundRect(sx + 15, SLOT_Y + 18, 22, 20, 4).stroke({ width: 1, color: 0x0d1117 });

      // CD 压暗遮罩（自上而下，按共用 CD 比例）
      if (onCd && cdFrac > 0) {
        g.rect(sx + 3, SLOT_Y + 3, SLOT - 6, (SLOT - 6) * cdFrac).fill({ color: 0x000000, alpha: 0.66 });
      }

      // 低血提醒：红药格金色脉动边框（有药才提示）
      if (kind === 'hp' && !empty && ratio < LOW_HP_THRESHOLD) {
        const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.blinkT * 0.012));
        g.rect(sx + 1, SLOT_Y + 1, SLOT - 2, SLOT - 2).stroke({ width: 2.5, color: THEME.gold, alpha: pulse });
      }

      // 常驻文本（复用）
      const countText = this.countTexts[i];
      countText.text = `×${count}`;
      countText.style.fill = empty ? THEME.textDim : THEME.text;
      countText.alpha = empty ? 0.7 : 1;
      const cdText = this.cdTexts[i];
      cdText.visible = onCd;
      if (onCd) cdText.text = (Math.max(0, model.cooldownRemainMs) / 1000).toFixed(1);
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
