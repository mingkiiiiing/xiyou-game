import { Graphics } from 'pixi.js';
import { Entity } from '../core/Entity';
import type { Game } from '../core/Game';
import { moveAndCollide } from '../core/Physics';
import type { BattleStats, DamageInfo, Damageable, HitboxDef, HitQuery, SkillDef, Box } from '../shared/types';
import { getConfig } from '../data/ConfigLoader';
import { buildDamageInfo } from '../game/damage';
import { matchCombo } from './comboCommands';
import { CharacterView, computePhase } from '../art/CharacterView';
import type { CharacterArtDef } from '../art/types';

const GRAVITY = 2200;
const JUMP_V = -880;
const COYOTE_MS = 80;        // 土狼时间：离开平台后仍可起跳的宽限
const JUMP_BUFFER_MS = 120;  // 跳跃缓冲：落地前提前按跳也生效
const COMBO_WINDOW_MS = 900; // 连击窗口：超时回落到第一段
const SWING_LOCK_MS = 260;   // 每段攻击的出手硬直
const HURT_MS = 250;         // 受击硬直
const INVINCIBLE_MS = 600;   // 受击后无敌帧
// BT-3.1 闪避翻滚
const DODGE_MS = 320;              // 翻滚总时长
const DODGE_SPEED = 620;           // 翻滚初速
const DODGE_CD_MS = 1200;          // 翻滚冷却
const DODGE_IFRAME_FRAC = 0.6;     // 前 60% 时长无敌
const DODGE_END_LOCK_MS = 70;      // 翻滚结束小硬直（防无限翻滚）
const COMBO_MUL = [1.0, 1.1, 1.4] as const;
const COMBO_HITBOX: HitboxDef = { w: 92, h: 76, offsetX: 56, offsetY: -64, delayMs: 60, activeMs: 0 };

export type FighterState =
  | 'idle' | 'run' | 'jump' | 'fall'
  | 'attack1' | 'attack2' | 'attack3' | 'skill'
  | 'dodge' | 'hurt' | 'invincible';

interface PendingHit {
  fireAt: number;
  mul: number;
  def: HitboxDef;
  knockbackX: number;
  hitstopMs: number;
}

/**
 * 任务B：完整战斗角色（状态机 + 连段缓冲 + 技能组件 + 打击感 + 平台手感）。
 * 数值来自 src/config（TODO(D) 已完成：公式走 ConfigLoader）。
 */
export class PlayerFighter extends Entity implements Damageable {
  stats: BattleStats;
  armor = { def: 5, level: 1 };
  state: FighterState = 'idle';

  /** 技能释放回调（集成层用于播放技能特效/音效，可选注入） */
  onSkillCast: ((skillId: string, x: number, y: number, facing: 1 | -1) => void) | null = null;

  // BT-5.3 远程普攻（云璿类角色）：置位后普攻改为发射弹幕（回调由场景注入）
  rangedBasic = false;
  fireBasic: ((x: number, y: number, dir: 1 | -1, mul: number) => void) | null = null;

  /** BT-2：状态进入时刻（供造型动画计算相位） */
  stateEnteredAt = performance.now();
  private artView: CharacterView | null = null;

  /** BT-2：挂载美术造型（成功后隐藏灰盒色块） */
  attachArt(def: CharacterArtDef): void {
    if (this.artView) return;
    this.artView = new CharacterView(def);
    this.artViewDef = def;
    this.view.addChild(this.artView.view);
    this.bodyG.visible = false;
    this.fx.visible = false;
  }

  private skills: SkillDef[];
  private hitQuery: HitQuery;
  private solids: readonly Box[];

  private cdUntil = new Map<string, number>();
  private pendingHits: PendingHit[] = [];

  // 连段/输入缓冲
  private combo = 0;
  private comboUntil = 0;
  private attackBufferUntil = 0;
  private lockUntil = 0;       // 攻击/技能出手硬直
  private skillLockUntil = 0;
  private dashUntil = 0;
  private pendingSkill: SkillDef | null = null;
  // BT-3.1 闪避
  private dodgeUntil = 0;
  private dodgeCdUntil = 0;
  private dodgeInvincibleUntil = 0;
  private dodgeActive = false;

  // 平台手感
  private jumpsLeft = 2;
  private jumpBufferUntil = 0;
  private lastGroundedAt = 0;
  private onGround = false;

  // 受击
  private hurtUntil = 0;
  private invincibleUntil = 0;
  private knockVx = 0;

  // 表现
  private bodyG = new Graphics();
  private fx = new Graphics();       // 落地尘土/技能提示
  private dust: { x: number; y: number; born: number }[] = [];

  constructor(game: Game, stats: BattleStats, skills: SkillDef[], hitQuery: HitQuery, solids: readonly Box[]) {
    super(game, 48, 64);
    this.stats = { ...stats };
    this.skills = skills;
    this.hitQuery = hitQuery;
    this.solids = solids;
    this.bodyG.rect(-24, -64, 48, 64).fill(0x4da3ff);
    this.bodyG.poly([24, -48, 42, -38, 24, -28]).fill(0xffcc44);
    this.view.addChild(this.bodyG);
    this.view.addChild(this.fx);
  }

  /** 状态优先级：hurt > skill/attack > air > run/idle */
  private setState(s: FighterState): void {
    if (s !== this.state) this.stateEnteredAt = performance.now();
    this.state = s;
    const color =
      s === 'hurt' || s === 'invincible' ? 0xff6677 :
      s === 'dodge' ? 0x6fe3c4 :
      s.startsWith('attack') || s === 'skill' ? 0xffd257 :
      s === 'run' ? 0x53b7ff : 0x4da3ff;
    this.bodyG.clear();
    this.bodyG.rect(-24, -64, 48, 64).fill(color);
    this.bodyG.poly([24, -48, 42, -38, 24, -28]).fill(0xffcc44);
  }

  update(dtMs: number): void {
    const now = performance.now();
    const dt = dtMs / 1000;
    const input = this.game.input;

    if (input.wasPressed('attack')) this.attackBufferUntil = now + 200;
    if (input.wasPressed('jump')) this.jumpBufferUntil = now + JUMP_BUFFER_MS;

    const busy = this.state.startsWith('attack') || this.state === 'skill' || this.state === 'hurt';
    const locked = now < this.lockUntil || now < this.skillLockUntil || now < this.hurtUntil;

    // —— 闪避翻滚：可取消攻击/技能后摇（手感核心）——
    if (input.wasPressed('dodge') && now >= this.dodgeCdUntil && now >= this.hurtUntil) {
      let dir: 1 | -1 = this.facing;
      if (input.isDown('left')) dir = -1;
      else if (input.isDown('right')) dir = 1;
      this.facing = dir;
      this.dodgeUntil = now + DODGE_MS;
      this.dodgeCdUntil = now + DODGE_CD_MS;
      this.dodgeInvincibleUntil = now + DODGE_MS * DODGE_IFRAME_FRAC;
      // 中断当前动作：清掉攻击/技能后摇与待结算的判定
      this.lockUntil = 0;
      this.skillLockUntil = 0;
      this.dashUntil = 0;
      this.pendingSkill = null;
      this.knockVx = 0;
      this.setState('dodge');
    }

    // —— 水平移动 ——
    if (now < this.dodgeUntil) {
      // 翻滚中：保持方向与速度（末段减速），不响应转向输入
      const t = 1 - (this.dodgeUntil - now) / DODGE_MS; // 0 → 1
      this.vx = this.facing * DODGE_SPEED * (1 - t * 0.45);
    } else if (now < this.dashUntil) {
      // 技能位移中：保持 dash 速度
    } else if (this.knockVx !== 0) {
      this.vx = this.knockVx;
      this.knockVx *= Math.max(0, 1 - dt * 9);
      if (Math.abs(this.knockVx) < 8) this.knockVx = 0;
    } else if (!locked) {
      if (input.isDown('left')) { this.vx = -this.stats.moveSpeed; this.facing = -1; }
      else if (input.isDown('right')) { this.vx = this.stats.moveSpeed; this.facing = 1; }
      else this.vx = 0;
    }

    // —— 跳跃：缓冲 + 土狼时间 + 二段跳 ——
    const coyoteOk = now - this.lastGroundedAt <= COYOTE_MS;
    if (this.jumpBufferUntil > now && (this.onGround || coyoteOk || this.jumpsLeft > 0)) {
      const first = this.onGround || coyoteOk;
      this.vy = JUMP_V;
      this.jumpsLeft = first ? 1 : this.jumpsLeft - 1;
      this.jumpBufferUntil = 0;
      this.onGround = false;
      this.setState('jump');
    }
    // 可变跳高：上升中松开跳跃 → 截断
    if (!input.isDown('jump') && this.vy < -200) this.vy *= 0.86;

    // —— 攻击：远程角色发射弹幕；近战先匹配连招指令，否则走普攻三连 ——
    if (this.attackBufferUntil > now && !busy && now >= this.skillLockUntil) {
      this.attackBufferUntil = 0;

      if (this.rangedBasic && this.fireBasic) {
        // 远程普攻：三连倍率照常轮换，弹幕代替近战判定框
        if (now > this.comboUntil) this.combo = 0;
        const stage = Math.min(this.combo, COMBO_MUL.length - 1);
        this.fireBasic(this.feet.x, this.feet.y - 42, this.facing, COMBO_MUL[stage]);
        this.combo = (stage + 1) % COMBO_MUL.length;
        this.comboUntil = now + COMBO_WINDOW_MS;
        this.lockUntil = now + 210;
        this.setState('attack1');
      } else {
        const cmd = matchCombo({
          down: input.isDown('down'),
          airborne: !this.onGround,
          absVx: Math.abs(this.vx),
          runThreshold: this.stats.moveSpeed * 0.75,
        });

        if (cmd) {
          // 连招指令：单发，不进三连计数
          this.pendingHits.push({
            fireAt: now + cmd.hitbox.delayMs,
            mul: cmd.damageMul,
            def: cmd.hitbox,
            knockbackX: cmd.knockbackX,
            hitstopMs: cmd.hitstopMs,
          });
          if (cmd.dashSpeed > 0) {
            this.vx = this.facing * cmd.dashSpeed;
            this.dashUntil = now + 130;
          }
          if (cmd.selfHop) this.vy = cmd.selfHop;
          if (cmd.slamDown) this.vy = Math.max(this.vy, 900); // 快速砸向地面
          this.lockUntil = now + SWING_LOCK_MS + 60;
          this.combo = 0;
          this.setState('attack3');
        } else {
          if (now > this.comboUntil) this.combo = 0;
          const stage = Math.min(this.combo, COMBO_MUL.length - 1);
          const heavy = stage === COMBO_MUL.length - 1;
          this.pendingHits.push({
            fireAt: now + COMBO_HITBOX.delayMs,
            mul: COMBO_MUL[stage],
            def: COMBO_HITBOX,
            knockbackX: heavy ? 300 : 90,
            hitstopMs: heavy ? 90 : 40,
          });
          this.combo = (stage + 1) % COMBO_MUL.length;
          this.comboUntil = now + COMBO_WINDOW_MS;
          this.lockUntil = now + SWING_LOCK_MS;
          this.setState(`attack${stage + 1}` as FighterState);
        }
      }
    }

    // —— 技能（U/I/O，空中可放）——
    if (!this.state.startsWith('attack') && this.state !== 'hurt') {
      for (let i = 0; i < 3; i++) {
        if (!input.wasPressed(`skill${i + 1}`)) continue;
        const sk = this.skills[i];
        if (!sk) break;
        if (now < (this.cdUntil.get(sk.id) ?? 0)) break;
        if (this.stats.mp < sk.mpCost) break;
        this.stats.mp -= sk.mpCost;
        this.cdUntil.set(sk.id, now + sk.cdMs);
        this.pendingSkill = sk;
        this.setState('skill');
        break;
      }
    }
    if (this.pendingSkill) {
      const sk = this.pendingSkill;
      this.pendingSkill = null;
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
      this.skillLockUntil = now + 240;
      this.onSkillCast?.(sk.id, this.feet.x, this.feet.y - 40, this.facing);
    }

    // —— 命中判定（公式统一走 game/damage.ts，规格 docs/02）——
    this.pendingHits = this.pendingHits.filter((p) => {
      if (now < p.fireAt) return true;
      const f = this.feet;
      const cx = f.x + this.facing * p.def.offsetX;
      const box: Box = { x: cx - p.def.w / 2, y: f.y + p.def.offsetY, w: p.def.w, h: p.def.h };
      const fm = getConfig.formula();
      for (const target of this.hitQuery(box)) {
        if (!target.alive) continue;
        const info = buildDamageInfo(
          this.stats,
          { def: target.armor.def, level: target.armor.level },
          p.mul,
          fm,
          { fromX: f.x, knockbackX: p.knockbackX, hitstopMs: p.hitstopMs },
        );
        target.takeDamage(info);
        this.game.events.emit('damage', { target, info });
        this.game.hitstop(info.hitstopMs);
      }
      return false;
    });

    // —— 物理 ——
    const wasGround = this.onGround;
    this.vy += GRAVITY * dt;
    this.onGround = moveAndCollide(this.body, this, dt, this.solids);
    if (this.onGround) {
      this.jumpsLeft = 2;
      this.lastGroundedAt = now;
      if (!wasGround) this.dust.push({ x: this.feet.x, y: this.feet.y, born: now }); // 落地尘土
    }

    // —— 状态推进 ——
    if (now < this.dodgeUntil) {
      this.dodgeActive = true;
      this.setState('dodge');
    } else {
      // 翻滚刚结束：给一点收招硬直，避免无脑连滚
      if (this.dodgeActive) {
        this.dodgeActive = false;
        this.lockUntil = Math.max(this.lockUntil, now + DODGE_END_LOCK_MS);
      }
      if (now >= this.hurtUntil && now >= this.lockUntil && now >= this.skillLockUntil) {
        if (!this.onGround) this.setState(this.vy < 0 ? 'jump' : 'fall');
        else if (this.vx !== 0 && this.knockVx === 0 && now >= this.dashUntil) this.setState('run');
        else this.setState('idle');
      }
    }
    // 无敌帧只在非翻滚时覆盖状态（翻滚有自己的姿态）
    if (now < this.invincibleUntil && now >= this.dodgeUntil) this.state = 'invincible';

    // —— 回蓝 ——
    const fm = getConfig.formula();
    this.stats.mp = Math.min(this.stats.maxMp, this.stats.mp + fm.mpRegenPerSec * dt);

    // —— 表现 ——
    this.view.alpha = now < this.invincibleUntil ? (Math.floor(now / 60) % 2 ? 0.35 : 0.9) : 1;
    this.view.tint = now < this.hurtUntil ? 0xff9999 : 0xffffff;
    this.fx.clear();
    this.dust = this.dust.filter((d) => {
      const age = now - d.born;
      if (age > 260) return false;
      const r = 4 + age / 20;
      this.fx.circle(d.x - this.feet.x, d.y - this.feet.y - r / 3, r).fill({ color: 0x8b8b7a, alpha: 1 - age / 260 });
      return true;
    });
    this.syncView();

    // —— BT-2 造型动画（与 PNG 联络表同源）——
    if (this.artView) {
      const artState = this.state === 'invincible' ? 'hurt' : this.state;
      this.artView.update({
        state: artState,
        phase: computePhase(this.artViewDef!, artState, this.stateEnteredAt, now),
        facing: this.facing,
        flash: now < this.hurtUntil,
        blinking: now < this.invincibleUntil || now < this.dodgeInvincibleUntil,
      });
    }
  }

  private artViewDef: CharacterArtDef | null = null;

  takeDamage(info: DamageInfo): void {
    const now = performance.now();
    // 受击无敌帧 / 翻滚无敌帧（BT-3.1：翻滚是核心生存手段）
    if (now < this.invincibleUntil || now < this.dodgeInvincibleUntil || !this.alive) return;
    this.stats.hp = Math.max(0, this.stats.hp - info.amount);
    this.hurtUntil = now + HURT_MS;
    this.invincibleUntil = now + HURT_MS + INVINCIBLE_MS;
    const dir = Math.sign(this.feet.x - info.fromX) || 1;
    this.knockVx = dir * info.knockbackX * 0.6;
    this.pendingSkill = null;
    this.setState('hurt');
  }

  get alive(): boolean { return this.stats.hp > 0; }
  get hitbox(): Box { return { ...this.body }; }

  /** 是否处于无敌（受击无敌或翻滚无敌）——HUD/调试用 */
  get invincible(): boolean {
    const now = performance.now();
    return now < this.invincibleUntil || now < this.dodgeInvincibleUntil;
  }

  /** BT-3.1 翻滚剩余 CD（秒），HUD 用 */
  get dodgeCdRemain(): number {
    return Math.max(0, (this.dodgeCdUntil - performance.now()) / 1000);
  }

  /** BT-3.1 翻滚总 CD（秒），HUD 画进度用 */
  get dodgeCdTotal(): number {
    return DODGE_CD_MS / 1000;
  }

  skillCd(id: string): number {
    return Math.max(0, ((this.cdUntil.get(id) ?? 0) - performance.now()) / 1000);
  }
}

