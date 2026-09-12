import type { Game } from '../core/Game';
import { EnemyBase } from './EnemyBase';
import type { Damageable, MonsterDef, Box } from '../shared/types';
import {
  isBehaviorId, newBehaviorRuntime, initBehaviorCooldowns, pickBehavior,
  startBehavior, tickBehavior,
  type BehaviorHost, type BehaviorId, type BehaviorRuntime,
} from './behaviors';

const CHASE_RANGE = 500;   // 仇恨视野
const ATTACK_WINDUP_MS = 400; // 攻击前摇（变色预警）
const EDGE = 60;

/** 任务C：小怪（近战/远程一体，按 MonsterDef.aiType 分支） */
export class Enemy extends EnemyBase {
  get monsterId(): string { return this.def.id; }

  private def: MonsterDef;
  private target: Damageable | null;
  private patrolMin: number;
  private patrolMax: number;
  private dir: 1 | -1 = 1;
  private windupUntil = 0;
  private atkCdUntil = 0;
  /** 本帧是否在移动（供造型选择 run/idle） */
  private moving = false;
  // BT-3.4 行为库
  private behaviors: BehaviorId[] = [];
  private behaviorRt: BehaviorRuntime = newBehaviorRuntime();
  /** 由场景注入：发射弹幕 */
  onFanShot: ((vx: number, vy: number, dmgMul: number) => void) | null = null;
  /** 由场景注入：召唤小怪 */
  onSummonEnemy: ((monsterId: string, x: number) => void) | null = null;

  constructor(game: Game, def: MonsterDef, x: number, target: Damageable | null, patrolMin: number, patrolMax: number, solids: readonly Box[]) {
    const size = def.aiType === 'ranged' ? { w: 44, h: 52 } : { w: 52, h: 60 };
    super(game, def, size.w, size.h, def.aiType === 'ranged' ? 0xa371f7 : 0xdb6161);
    this.def = def;
    this.target = target;
    this.patrolMin = patrolMin;
    this.patrolMax = patrolMax;
    this.solidsRef = solids;
    this.body.x = x;
    this.body.y = 620 - this.body.h;
    this.dir = Math.random() < 0.5 ? 1 : -1;

    // BT-3.2 韧性：按体型与等级设定（重装更硬）
    const bulk = size.w * size.h / 1000;
    this.poiseMax = Math.round(26 + def.level * 4 + bulk * 12);
    this.poise = this.poiseMax;
    this.poiseRegen = 12 + def.level * 0.8;

    // BT-3.4 行为库：从配置读取（未配置则保持 BT-1 行为）
    const raw = def as unknown as { behaviors?: string[] };
    this.behaviors = (raw.behaviors ?? []).filter(isBehaviorId);
    initBehaviorCooldowns(this.behaviorRt, this.behaviors, performance.now(), def.level);
  }

  update(dtMs: number): void {
    const now = performance.now();
    const dt = dtMs / 1000;
    this.moving = false;
    if (!this.commonUpdate(dtMs)) { this.syncView(); return; }
    // BT-3.2：破韧硬直期间不行动
    if (this.staggered) {
      this.setDisplay('hurt');
      this.syncView();
      return;
    }
    const target = this.target;
    const tx = target && target.alive ? target.hitbox.x + target.hitbox.w / 2 : null;

    // —— BT-3.4 行为库优先：进行中则托管控制，空闲则尝试挑招 ——
    if (this.behaviors.length > 0 && target && tx !== null) {
      if (this.behaviorRt.active) {
        if (tickBehavior(this.behaviorRt, this.behaviorHost(), now)) {
          this.setDisplay(
            this.behaviorRt.active === 'charge' || this.behaviorRt.active === 'leap' ? 'attack1'
            : this.behaviorRt.active === 'summon' || this.behaviorRt.active === 'fanShot' ? 'skill'
            : this.behaviorRt.active === 'shield' ? 'idle' : 'run',
          );
          this.syncView();
          return;
        }
      } else {
        const dist = Math.abs(tx - this.feet.x);
        const pick = pickBehavior(this.behaviors, this.behaviorRt, dist, this.hpRatio, now);
        if (pick) {
          startBehavior(this.behaviorRt, pick, now);
          return; // 本帧由行为接管
        }
      }
    }

    if (tx !== null && Math.abs(tx - this.feet.x) <= CHASE_RANGE && now >= this.atkCdUntil) {
      // —— 追击 ——
      const dist = tx - this.feet.x;
      const range = this.def.attack.range;
      if (Math.abs(dist) > range * 0.8) {
        this.dir = dist > 0 ? 1 : -1;
        const moved = this.body.x + this.dir * this.def.stats.moveSpeed * dt;
        if (moved > this.patrolMin - EDGE && moved < this.patrolMax + EDGE) { this.body.x = moved; this.moving = true; }
      } else if (now >= this.windupUntil && now >= this.atkCdUntil) {
        // —— 进入前摇 ——
        this.windupUntil = now + ATTACK_WINDUP_MS;
        this.atkCdUntil = now + this.windupUntil + this.def.attack.cooldownMs;
      }
    }

    // —— 前摇结束结算 ——
    if (this.windupUntil > 0 && now >= this.windupUntil) {
      this.windupUntil = 0;
      if (tx !== null) {
        const dist = Math.abs(tx - this.feet.x);
        if (dist <= this.def.attack.range + 30) {
          if (this.def.aiType === 'melee') {
            this.dealTo(target as Damageable, this.def.attack.damageMul, 160, 30);
          } else {
            this.onRangedFire?.(tx, (target as Damageable));
          }
        }
      }
    }

    // —— 巡逻（无仇恨时）——
    if (tx === null || Math.abs(tx - this.feet.x) > CHASE_RANGE) {
      const moved = this.body.x + this.dir * this.def.stats.moveSpeed * 0.45 * dt;
      if (moved <= this.patrolMin || moved >= this.patrolMax) this.dir = (this.dir === 1 ? -1 : 1);
      else { this.body.x = moved; this.moving = true; }
    }

    // 前摇预警：变亮黄
    this.view.tint = now < this.windupUntil ? 0xffe066 : now < this.flashUntil ? 0xff7a7a : 0xffffff;
    this.facing = this.dir;
    // BT-2 造型状态：受击 > 攻击前摇 > 移动 > 待机
    if (now < this.flashUntil) this.setDisplay('hurt');
    else if (this.windupUntil > 0) this.setDisplay('attack1');
    else if (this.moving) this.setDisplay('run');
    else this.setDisplay('idle');
    this.syncView();
  }

  /** 远程发射回调（由演示/关卡场景注入弹道系统） */
  onRangedFire: ((targetX: number, target: Damageable) => void) | null = null;

  /** BT-3.4 把自身能力包装成行为宿主（行为只依赖这个接口） */
  private behaviorHost(): BehaviorHost {
    return {
      x: this.feet.x,
      y: this.feet.y,
      facing: this.dir,
      target: this.target,
      hpRatio: this.hpRatio,
      distToTarget: this.target && this.target.alive
        ? Math.abs((this.target.hitbox.x + this.target.hitbox.w / 2) - this.feet.x)
        : 999,
      onGround: this.onGroundFlag,
      fireProjectile: (vx, vy, dmgMul) => this.onFanShot?.(vx, vy, dmgMul),
      summon: (monsterId, offsetX) => this.onSummonEnemy?.(monsterId, this.feet.x + offsetX),
      setDamageReduction: (v) => this.setDamageReduction(v),
      setSuperArmor: (on) => this.setSuperArmorExternal(on),
      heal: (amount) => this.healHp(amount),
      requestMoveX: (vx) => {
        const moved = this.body.x + vx * (1 / 60);
        if (moved > this.patrolMin - EDGE && moved < this.patrolMax + EDGE) {
          this.body.x = moved;
          if (Math.abs(vx) > 1) this.moving = true;
        }
        if (vx !== 0) this.dir = vx > 0 ? 1 : -1;
      },
      requestJump: (vy) => { this.vy = vy; this.onGroundFlag = false; },
    };
  }

  /** requestJump 用（Enemy 无重力物理，仅作行为标记） */
  private onGroundFlag = true;
}
