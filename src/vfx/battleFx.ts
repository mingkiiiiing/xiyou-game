/**
 * IT-1.3 战斗表现层门面（接口已冻结，供 IT-1.1 的 MainGameScene 调用）。
 * 完整实现：飘字 + 打击火星 + 暴击金弹跳/震屏 + 技能特效/白闪 + 死亡爆裂 + 拾取粒子。
 * ⚠️ 不得修改导出的类型与类成员签名。
 */
import { Container } from 'pixi.js';
import type { Game } from '../core/Game';
import type { Damageable } from '../shared/types';
import { FloatingText } from './FloatingText';
import { VfxPlayer, VFX_PRESETS } from './VfxPlayer';
import type { VfxDef } from './VfxPlayer';
import { CameraFx } from './CameraFx';
import { audio } from './AudioManager';

export interface BattleFxOptions {
  /** 世界层：飘字 / 粒子（随相机移动） */
  world: Container;
  /** 屏幕层：全屏白闪（不随相机移动） */
  screen: Container;
  /** 判断某个受击目标是否玩家（决定飘字用受伤红还是伤害白） */
  isPlayer: (target: Damageable) => boolean;
}

/** 技能 id → 特效 key 映射（特效 key 见 VfxPlayer.VFX_PRESETS） */
export function skillVfxKey(skillId: string): string {
  switch (skillId) {
    case 'thrust': return 'thrust_afterimage';
    case 'sweep': return 'sweep_arc';
    case 'leap_slash': return 'leap_slash_shockwave';
    default: return 'sweep_arc';
  }
}

/**
 * IT-1.3 新增特效预设（不改 VfxPlayer.ts，通过 vfx.register 注入）。
 * EmitterDef 约定：angleDeg 0=向右、90=向上；速度沿角度方向，gravity 作用于 vy。
 */
const EXTRA_PRESETS: Record<string, VfxDef> = {
  /** 普通命中火星：全向白色/暖色碎屑 + 一圈白色冲击环 */
  hit_spark: {
    emitters: [
      { count: 11, shape: 'rect', size: [4, 10], speed: [190, 430], angleDeg: [0, 360], gravity: 560, lifeMs: [120, 240], colors: [0xffffff, 0xffe08a, 0xffd257] },
      { count: 1, shape: 'ring', size: [6, 6], speed: [0, 0], angleDeg: [0, 0], gravity: 0, lifeMs: [150, 150], colors: [0xffffff] },
    ],
  },
  /** 暴击火星：数量更多、更快、金色，叠加金色冲击环与上方迸溅 */
  crit_spark: {
    emitters: [
      { count: 24, shape: 'rect', size: [5, 13], speed: [300, 720], angleDeg: [0, 360], gravity: 720, lifeMs: [200, 360], colors: [0xffd700, 0xfff2b8, 0xffa657, 0xffffff] },
      { count: 1, shape: 'ring', size: [10, 10], speed: [0, 0], angleDeg: [0, 0], gravity: 0, lifeMs: [260, 260], colors: [0xffd700] },
      { count: 7, shape: 'circle', size: [3, 6], speed: [130, 320], angleDeg: [40, 140], gravity: 420, lifeMs: [300, 520], colors: [0xffd700, 0xfff2b8] },
    ],
  },
  /** 死亡爆裂：橙色冲击环 + 全向碎块 + 向下抛洒的残渣 */
  death_burst: {
    emitters: [
      { count: 1, shape: 'ring', size: [12, 12], speed: [0, 0], angleDeg: [0, 0], gravity: 0, lifeMs: [330, 330], colors: [0xff8c42] },
      { count: 28, shape: 'circle', size: [3, 8], speed: [200, 640], angleDeg: [0, 360], gravity: 1100, lifeMs: [320, 620], colors: [0xd29922, 0xffa657, 0x8b8b7a, 0xffffff] },
      { count: 12, shape: 'rect', size: [4, 11], speed: [260, 540], angleDeg: [200, 340], gravity: 900, lifeMs: [300, 520], colors: [0xff6b4a, 0xffd257] },
    ],
  },
  /** 拾取上升粒子：向上漂浮的绿/金色光点 + 小冲击环 */
  pickup_spark: {
    emitters: [
      { count: 14, shape: 'circle', size: [2, 5], speed: [120, 340], angleDeg: [45, 135], gravity: -150, lifeMs: [300, 560], colors: [0x56d364, 0xb8f5c0, 0xffe08a] },
      { count: 1, shape: 'ring', size: [5, 5], speed: [0, 0], angleDeg: [0, 0], gravity: 0, lifeMs: [200, 200], colors: [0x56d364] },
    ],
  },
};

export class BattleFx {
  private floats = new FloatingText();
  private vfx = new VfxPlayer();
  private camFx = new CameraFx();
  private detach: (() => void)[] = [];

  /** 最近受击的非玩家目标（用于在 enemy-died 只带 id 时定位死亡爆裂位置） */
  private recent: { target: Damageable; at: number }[] = [];
  /** 已收到 enemy-died、等待同帧 damage 事件补齐死亡位置的待处理队列（时间戳） */
  private pendingDeaths: number[] = [];

  constructor(private game: Game, private opts: BattleFxOptions) {
    for (const key of Object.keys(EXTRA_PRESETS)) {
      this.vfx.register(key, EXTRA_PRESETS[key]);
    }
    opts.world.addChild(this.vfx.view);
    this.floats.attach(opts.world);
    this.camFx.attachScreenLayer(opts.screen);
  }

  /** 订阅战斗事件；返回卸载函数（场景 destroy 时调用） */
  attach(): () => void {
    this.detach.push(this.game.events.on('damage', ({ target, info }) => {
      const hb = target.hitbox;
      const x = hb.x + hb.w / 2;
      const y = hb.y;                 // 飘字：hitbox 顶部中心
      const cx = x;
      const cy = hb.y + hb.h / 2;     // 粒子：hitbox 中心

      if (this.opts.isPlayer(target)) {
        // 玩家受伤：红色飘字 + hurt 音效 + 轻微震屏
        this.floats.spawn(x, y, `-${info.amount}`, 'hurt');
        audio.play('hurt');
        this.camFx.shake(4, 100);
      } else {
        // 记录击杀位置来源（enemy-died 事件只带 id，需借此定位爆裂点）
        this.rememberTarget(target);
        if (info.isCrit) {
          // 暴击：金色弹跳飘字 + 更强火星 + hit 音效 + 震屏
          this.floats.spawn(x, y, `${info.amount}!`, 'crit');
          this.vfx.play('crit_spark', cx, cy);
          audio.play('hit');
          this.camFx.shake(7, 140);
        } else {
          // 普通命中：白色飘字 + 打击火星 + hit 音效
          this.floats.spawn(x, y, `${info.amount}`, 'normal');
          this.vfx.play('hit_spark', cx, cy);
          audio.play('hit');
        }
      }
    }));

    this.detach.push(this.game.events.on('enemy-died', () => {
      // 死亡爆裂位置在本帧稍后（damage 事件）或上一击时才能确定，先入队延迟结算
      audio.play('hurt');
      this.camFx.shake(3, 90);
      this.pendingDeaths.push(performance.now());
    }));

    return () => {
      this.detach.forEach((f) => f());
      this.detach = [];
      this.recent = [];
      this.pendingDeaths = [];
    };
  }

  update(dtMs: number): void {
    // 结算死亡爆裂（等待同帧 damage 事件补齐位置，最多重试约 400ms）
    if (this.pendingDeaths.length > 0) {
      const now = performance.now();
      this.pendingDeaths = this.pendingDeaths.filter((born) => {
        if (this.spawnDeathBurst()) return false;
        return now - born < 400;
      });
    }
    const now = performance.now();
    this.recent = this.recent.filter((r) => now - r.at < 2000);

    this.floats.update(dtMs);
    this.vfx.update(dtMs);
    this.camFx.update(dtMs, this.opts.world);
  }

  /** 技能释放表现（由 MainGameScene 在技能命中回调里调用） */
  playSkill(vfxKey: string, x: number, y: number, facing: 1 | -1): void {
    // 容错：拿到的是技能 id（非预设 key）时映射为对应特效
    const key = VFX_PRESETS[vfxKey] ? vfxKey : skillVfxKey(vfxKey);
    this.vfx.play(key, x, y, facing < 0);
    audio.play('skill');
    this.camFx.flash(45); // 释放瞬间轻微白闪
  }

  playPickup(x: number, y: number): void {
    this.floats.spawn(x, y, '✦', 'heal');
    this.vfx.play('pickup_spark', x, y);
    audio.play('pickup');
  }

  /** BT-5.5 Boss 阶段切换演出：大字播报 + 强震屏 + 白闪（新增方法，不改动既有签名） */
  playPhase(x: number, y: number, name: string, phase: number): void {
    this.floats.spawn(x, y - 60, `${name} · 阶段 ${phase}`, 'crit');
    this.camFx.shake(14, 320, 30);
    this.camFx.flash(90);
    audio.play('skill');
  }

  /** 记录最近受击的非玩家目标，供死亡事件定位 */
  private rememberTarget(target: Damageable): void {
    const now = performance.now();
    const hit = this.recent.find((r) => r.target === target);
    if (hit) hit.at = now;
    else this.recent.push({ target, at: now });
    if (this.recent.length > 64) this.recent.splice(0, this.recent.length - 64);
  }

  /** 从最近受击目标中找出已死亡者，在其位置播放爆裂；返回是否成功 */
  private spawnDeathBurst(): boolean {
    for (let i = this.recent.length - 1; i >= 0; i--) {
      const t = this.recent[i].target;
      if (!t.alive) {
        const hb = t.hitbox;
        this.recent.splice(i, 1);
        this.vfx.play('death_burst', hb.x + hb.w / 2, hb.y + hb.h / 2);
        return true;
      }
    }
    return false;
  }
}
