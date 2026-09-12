import { Text } from 'pixi.js';
import type { Container } from 'pixi.js';

export type FloatStyle = 'crit' | 'normal' | 'hurt' | 'heal';

interface FloatItem {
  view: Text;
  vy: number;
  born: number;
  lifeMs: number;
  bounce: boolean;
}

const STYLES: Record<FloatStyle, { color: number; size: number; bounce: boolean; lifeMs: number }> = {
  crit: { color: 0xffd700, size: 28, bounce: true, lifeMs: 800 },
  normal: { color: 0xffffff, size: 17, bounce: false, lifeMs: 650 },
  hurt: { color: 0xff7a7a, size: 19, bounce: false, lifeMs: 650 },
  heal: { color: 0x56d364, size: 19, bounce: false, lifeMs: 750 },
};

/** 任务G：飘字系统（暴击金色弹跳 / 普通白 / 受伤红 / 治疗绿） */
export class FloatingText {
  private items: FloatItem[] = [];
  private parent: Container | null = null;

  attach(parent: Container): void { this.parent = parent; }

  spawn(x: number, y: number, text: string, style: FloatStyle = 'normal'): void {
    if (!this.parent) return;
    const st = STYLES[style];
    const t = new Text({
      text,
      style: { fill: st.color, fontSize: st.size, fontWeight: 'bold', fontFamily: 'Consolas, monospace' },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.parent.addChild(t);
    this.items.push({ view: t, vy: -70, born: performance.now(), lifeMs: st.lifeMs, bounce: st.bounce });
  }

  update(dtMs: number): void {
    const now = performance.now();
    const dt = dtMs / 1000;
    this.items = this.items.filter((it) => {
      const age = now - it.born;
      if (age > it.lifeMs) { it.view.destroy(); return false; }
      if (it.bounce) {
        // 暴击：先放大回弹
        const k = age < 150 ? 1 + (age / 150) * 0.6 : 1.6 - ((age - 150) / (it.lifeMs - 150)) * 0.5;
        it.view.scale.set(Math.max(0.8, k));
      }
      it.view.y += it.vy * dt;
      it.vy *= 0.96;
      it.view.alpha = Math.max(0, 1 - age / it.lifeMs);
      return true;
    });
  }

  clear(): void {
    this.items.forEach((i) => i.view.destroy());
    this.items = [];
  }
}
