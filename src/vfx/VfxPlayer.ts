import { Container, Graphics } from 'pixi.js';

/** 特效定义（纯数据）：一次特效 = 多个发射器，每个发射器喷 count 个粒子 */
export interface EmitterDef {
  count: number;
  shape: 'rect' | 'circle' | 'ring';
  size: [number, number];
  speed: [number, number];
  angleDeg: [number, number]; // 0=向右，90=向上（屏幕坐标向下为正，故向上用负值区间）
  gravity: number;
  lifeMs: [number, number];
  colors: number[];
}
export interface VfxDef { emitters: EmitterDef[]; }

export const VFX_PRESETS: Record<string, VfxDef> = {
  // 突刺残影：横向拖尾色块
  thrust_afterimage: {
    emitters: [
      { count: 7, shape: 'rect', size: [26, 46], speed: [40, 120], angleDeg: [170, 190], gravity: 0, lifeMs: [160, 260], colors: [0x79c0ff, 0xa5d6ff, 0xffffff] },
    ],
  },
  // 横扫剑气弧：扇形粒子
  sweep_arc: {
    emitters: [
      { count: 26, shape: 'rect', size: [6, 14], speed: [420, 640], angleDeg: [-65, 65], gravity: 60, lifeMs: [200, 320], colors: [0xffd257, 0xfff2b8, 0xffa657] },
    ],
  },
  // 跳劈落点冲击波：环形扩散 + 地面碎屑
  leap_slash_shockwave: {
    emitters: [
      { count: 1, shape: 'ring', size: [10, 10], speed: [900, 900], angleDeg: [0, 0], gravity: 0, lifeMs: [300, 300], colors: [0xffffff] },
      { count: 18, shape: 'circle', size: [3, 7], speed: [260, 520], angleDeg: [-170, -10], gravity: 900, lifeMs: [300, 480], colors: [0xd29922, 0x8b8b7a, 0xffa657] },
    ],
  },
};

interface Particle {
  active: boolean;
  x: number; y: number; vx: number; vy: number;
  age: number; lifeMs: number;
  gravity: number;
  size: number;
  color: number;
  shape: 'rect' | 'circle' | 'ring';
  view: Graphics;
}

const DEG = Math.PI / 180;

/** 任务G：数据驱动特效播放器（对象池，避免高频播放产生 GC 抖动） */
export class VfxPlayer {
  view = new Container();
  private pool: Particle[] = [];

  /** 预设之外可注册自定义特效（配置化扩展位） */
  register(key: string, def: VfxDef): void { VFX_PRESETS[key] = def; }

  play(key: string, x: number, y: number, flip = false): void {
    const def = VFX_PRESETS[key];
    if (!def) return;
    for (const em of def.emitters) {
      for (let i = 0; i < em.count; i++) {
        const p = this.acquire();
        const ang = (em.angleDeg[0] + Math.random() * (em.angleDeg[1] - em.angleDeg[0])) * DEG;
        const spd = em.speed[0] + Math.random() * (em.speed[1] - em.speed[0]);
        p.x = x; p.y = y;
        p.vx = Math.cos(ang) * spd * (flip ? -1 : 1);
        p.vy = -Math.sin(ang) * spd; // 屏幕坐标：定义里的"向上"取负
        p.gravity = em.gravity;
        p.lifeMs = em.lifeMs[0] + Math.random() * (em.lifeMs[1] - em.lifeMs[0]);
        p.age = 0;
        p.size = em.size[0] + Math.random() * (em.size[1] - em.size[0]);
        p.color = em.colors[Math.floor(Math.random() * em.colors.length)];
        p.shape = em.shape;
        p.active = true;
        p.view.visible = true;
      }
    }
  }

  private acquire(): Particle {
    let p = this.pool.find((q) => !q.active);
    if (!p) {
      const g = new Graphics();
      this.view.addChild(g);
      p = { active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, lifeMs: 0, gravity: 0, size: 1, color: 0xffffff, shape: 'circle', view: g };
      this.pool.push(p);
    }
    return p;
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dtMs;
      if (p.age >= p.lifeMs) {
        p.active = false;
        p.view.visible = false;
        p.view.clear();
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.age / p.lifeMs;
      const g = p.view;
      g.clear();
      g.position.set(p.x, p.y);
      switch (p.shape) {
        case 'rect':
          g.rect(-p.size / 2, -2, p.size, 4).fill({ color: p.color, alpha: k });
          break;
        case 'circle':
          g.circle(0, 0, p.size).fill({ color: p.color, alpha: k });
          break;
        case 'ring':
          g.circle(0, 0, p.size + (1 - k) * 120).stroke({ width: 6 * k + 1, color: p.color, alpha: k });
          break;
      }
    }
  }

  get activeCount(): number { return this.pool.reduce((n, p) => n + (p.active ? 1 : 0), 0); }
}
