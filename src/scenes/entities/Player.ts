import { Graphics } from 'pixi.js';
import { Entity } from '../../core/Entity';
import type { Game } from '../../core/Game';
import { moveAndCollide } from '../../core/Physics';
import type { BattleStats, DamageInfo, Damageable, HitboxDef, HitQuery, SkillDef, Box } from '../../shared/types';
import formulaJson from '../../config/formula.json';

const GRAVITY = 2200;
const JUMP_V = -880;
const COMBO_MUL = [1.0, 1.1, 1.4];
const COMBO_WINDOW_MS = 900;
const SWING_LOCK_MS = 280;

/**
 * M0 灰盒玩家：验证框架与操作手感的参考实现（冻结，仅供只读参考）。
 * 任务B将在 src/battle/ 重构为完整状态机版本；伤害公式 TODO(D)。
 */
export class Player extends Entity implements Damageable {
  stats: BattleStats;
  armor = { def: 5, level: 1 };

  private skills: SkillDef[];
  private hitQuery: HitQuery;
  private solids: readonly Box[];
  private cdUntil = new Map<string, number>();
  private pendingHits: { fireAt: number; mul: number; def: HitboxDef; knockbackX: number; hitstopMs: number }[] = [];
  private combo = 0;
  private comboUntil = 0;
  private lockUntil = 0;
  private skillLockUntil = 0;
  private dashUntil = 0;
  private jumpsLeft = 2;
  private onGround = false;
  private hurtFlashUntil = 0;
  private hpBar = new Graphics();

  constructor(game: Game, stats: BattleStats, skills: SkillDef[], hitQuery: HitQuery, solids: readonly Box[]) {
    super(game, 48, 64);
    this.stats = { ...stats };
    this.skills = skills;
    this.hitQuery = hitQuery;
    this.solids = solids;

    const g = new Graphics();
    g.rect(-24, -64, 48, 64).fill(0x4da3ff);
    g.poly([24, -48, 42, -38, 24, -28]).fill(0xffcc44); // 朝向鼻子
    this.hpBar.y = -80;
    this.view.addChild(g);
    this.view.addChild(this.hpBar);
  }

  update(dtMs: number): void {
    const now = performance.now();
    const dt = dtMs / 1000;
    const input = this.game.input;

    // —— 水平移动（攻击/技能期间锁位移；技能位移期间保持 dash 速度）——
    const acting = now < this.lockUntil || now < this.skillLockUntil;
    if (now >= this.dashUntil) {
      if (!acting) {
        if (input.isDown('left')) { this.vx = -this.stats.moveSpeed; this.facing = -1; }
        else if (input.isDown('right')) { this.vx = this.stats.moveSpeed; this.facing = 1; }
        else this.vx = 0;
      }
    }

    // —— 跳跃（二段跳）——
    if (input.wasPressed('jump') && this.jumpsLeft > 0) {
      this.vy = JUMP_V;
      this.jumpsLeft--;
    }

    // —— 普攻三连 ——
    if (input.wasPressed('attack') && now >= this.lockUntil && now >= this.skillLockUntil) {
      if (now > this.comboUntil) this.combo = 0;
      const stage = this.combo;
      const heavy = stage === COMBO_MUL.length - 1;
      this.pendingHits.push({
        fireAt: now + 80,
        mul: COMBO_MUL[stage],
        def: { w: 92, h: 76, offsetX: 56, offsetY: -64, delayMs: 0, activeMs: 0 },
        knockbackX: heavy ? 280 : 90,
        hitstopMs: heavy ? 90 : 40,
      });
      this.combo = (stage + 1) % COMBO_MUL.length;
      this.comboUntil = now + COMBO_WINDOW_MS;
      this.lockUntil = now + SWING_LOCK_MS;
    }

    // —— 技能（U/I/O → skills[0..2]）——
    for (let i = 0; i < 3; i++) {
      if (!input.wasPressed(`skill${i + 1}`)) continue;
      if (now < this.skillLockUntil || now < this.lockUntil) break;
      const sk = this.skills[i];
      if (!sk) break;
      if (now < (this.cdUntil.get(sk.id) ?? 0)) break;
      if (this.stats.mp < sk.mpCost) break;
      this.stats.mp -= sk.mpCost;
      this.cdUntil.set(sk.id, now + sk.cdMs);
      this.pendingHits.push({
        fireAt: now + sk.hitbox.delayMs,
        mul: sk.damageMul,
        def: sk.hitbox,
        knockbackX: 180,
        hitstopMs: 60,
      });
      if (sk.dashSpeed) {
        this.vx = this.facing * sk.dashSpeed;
        this.dashUntil = now + 160;
      }
      this.skillLockUntil = now + 220;
      break;
    }

    // —— 命中判定结算（TODO(D)：公式接入 ConfigLoader 后移除硬编码）——
    this.pendingHits = this.pendingHits.filter((p) => {
      if (now < p.fireAt) return true;
      const f = this.feet;
      const cx = f.x + this.facing * p.def.offsetX;
      const box: Box = { x: cx - p.def.w / 2, y: f.y + p.def.offsetY, w: p.def.w, h: p.def.h };
      const fm = formulaJson as { variance: number; defenseK: number; defenseLevelFactor: number };
      for (const target of this.hitQuery(box)) {
        if (!target.alive) continue;
        const raw = this.stats.atk * p.mul * (1 - fm.variance + Math.random() * fm.variance * 2);
        const isCrit = Math.random() * 100 < this.stats.critRate;
        let dmg = raw * (isCrit ? this.stats.critDmg / 100 : 1);
        dmg *= 1 - target.armor.def / (target.armor.def + fm.defenseK + fm.defenseLevelFactor * target.armor.level);
        const info: DamageInfo = {
          amount: Math.max(1, Math.round(dmg)),
          isCrit,
          fromX: f.x,
          knockbackX: p.knockbackX,
          hitstopMs: p.hitstopMs,
        };
        target.takeDamage(info);
        this.game.events.emit('damage', { target, info });
        this.game.hitstop(info.hitstopMs);
      }
      return false;
    });

    // —— 物理 ——
    this.vy += GRAVITY * dt;
    this.onGround = moveAndCollide(this.body, this, dt, this.solids);
    if (this.onGround) this.jumpsLeft = 2;

    // —— 回蓝 ——
    const fm2 = formulaJson as { mpRegenPerSec: number };
    this.stats.mp = Math.min(this.stats.maxMp, this.stats.mp + fm2.mpRegenPerSec * dt);

    // —— 表现 ——
    this.view.tint = now < this.hurtFlashUntil ? 0xff9999 : 0xffffff;
    this.hpBar.clear();
    const ratio = Math.max(0, this.stats.hp / this.stats.maxHp);
    this.hpBar.rect(-24, 0, 48, 5).fill(0x30363d);
    this.hpBar.rect(-24, 0, 48 * ratio, 5).fill(0x3fb950);
    this.syncView();
  }

  takeDamage(info: DamageInfo): void {
    this.stats.hp = Math.max(0, this.stats.hp - info.amount);
    this.hurtFlashUntil = performance.now() + 120;
  }

  get alive(): boolean { return this.stats.hp > 0; }
  get hitbox(): Box { return { ...this.body }; }

  /** 技能剩余 CD 秒数（HUD 用） */
  skillCd(id: string): number {
    return Math.max(0, ((this.cdUntil.get(id) ?? 0) - performance.now()) / 1000);
  }
}
