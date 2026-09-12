import { Graphics } from 'pixi.js';
import { Entity } from '../core/Entity';
import type { Game } from '../core/Game';
import type { DamageInfo, Damageable, MonsterDef, Box } from '../shared/types';
import { moveAndCollide } from '../core/Physics';
import { getConfig } from '../data/ConfigLoader';
import { buildDamageInfo } from '../game/damage';
import { CharacterView, computePhase } from '../art/CharacterView';
import type { CharacterArtDef } from '../art/types';

/** 任务C：敌人共用底座（血条/受击闪白/击退/死亡爆裂/公式出手），AI 与 Boss 在子类实现 */
export abstract class EnemyBase extends Entity implements Damageable {
  armor: { def: number; level: number };

  protected hp: number;
  protected maxHp: number;
  protected atkStat: number;
  /** 暴击参数（子类可覆盖；不再硬编码在公式里） */
  protected critRate = 5;
  protected critDmg = 150;

  /** BT-2：表现状态（供造型动画；子类用 setDisplay 更新） */
  displayState = 'idle';
  displayStateAt = performance.now();
  private artView: CharacterView | null = null;
  private artViewDef: CharacterArtDef | null = null;

  protected setDisplay(s: string): void {
    if (s !== this.displayState) {
      this.displayState = s;
      this.displayStateAt = performance.now();
    }
  }

  /** BT-2：挂载美术造型（成功后隐藏灰盒色块） */
  attachArt(def: CharacterArtDef): void {
    if (this.artView) return;
    this.artView = new CharacterView(def);
    this.artViewDef = def;
    this.view.addChild(this.artView.view);
    this.bodyG.visible = false;
    this.fx.visible = false;
  }

  /** BT-2：每帧刷新造型（由 commonUpdate 调用） */
  private updateArt(): void {
    if (!this.artView || !this.artViewDef) return;
    const now = performance.now();
    this.artView.update({
      state: this.displayState,
      phase: computePhase(this.artViewDef, this.displayState, this.displayStateAt, now),
      facing: this.facing,
      flash: now < this.flashUntil,
    });
  }
  protected flashUntil = 0;
  protected knockVx = 0;
  protected dead = false;
  protected deathAt = 0;

  // ——— BT-3.2 韧性 / 硬直 / 霸体 ———
  /** 韧性上限（按等级与体型设定；重装/Boss 更硬） */
  protected poiseMax = 40;
  protected poise = 40;
  /** 韧性恢复速率（每秒） */
  protected poiseRegen = 15;
  /** 破韧后的长硬直截止时刻 */
  protected staggerUntil = 0;
  /** 霸体：为 true 时受击不进入硬直（Boss 前摇/冲锋/施法期间用） */
  protected superArmor = false;
  /** BT-3.4 伤害减免 0~1（护盾行为设置） */
  protected damageReduction = 0;

  setDamageReduction(v: number): void { this.damageReduction = Math.max(0, Math.min(0.95, v)); }
  get reductionRatio(): number { return this.damageReduction; }
  /** 外部（行为/AI）设置霸体 */
  setSuperArmorExternal(on: boolean): void { this.superArmor = on; }
  /** 治疗（retreat 行为用） */
  healHp(amount: number): void {
    if (this.dead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }
  get hpRatio(): number { return this.hp / Math.max(1, this.maxHp); }

  protected bar = new Graphics();
  private fx = new Graphics();
  private bodyG = new Graphics();
  private burst: { vx: number; vy: number; born: number }[] = [];

  constructor(game: Game, def: MonsterDef, w: number, h: number, color: number) {
    super(game, w, h);
    this.armor = { def: def.stats.def, level: def.level };
    this.hp = this.maxHp = def.stats.hp;
    this.atkStat = def.stats.atk;
    this.bodyG.rect(-w / 2, -h, w, h).fill(color);
    this.bar.y = -h - 14;
    this.view.addChild(this.bodyG);
    this.view.addChild(this.bar);
    this.view.addChild(this.fx);
  }

  abstract get monsterId(): string;

  takeDamage(info: DamageInfo): void {
    if (this.dead) return;
    // BT-3.4 护盾减伤
    const reduced = this.damageReduction > 0
      ? Math.max(1, Math.round(info.amount * (1 - this.damageReduction)))
      : info.amount;
    this.hp = Math.max(0, this.hp - reduced);
    info.amount = reduced;
    this.flashUntil = performance.now() + 100;
    const dir = Math.sign(this.feet.x - info.fromX) || 1;
    this.knockVx = dir * info.knockbackX * 0.5;

    // —— BT-3.2 韧性结算 ——
    // 霸体期间：吃伤害但不掉韧、不进硬直（Boss 前摇/冲锋的"压不倒"感）
    if (!this.superArmor) {
      const now = performance.now();
      const poiseDmg = info.poiseDamage ?? Math.max(1, Math.round(info.amount * 0.5));
      this.poise -= poiseDmg;
      if (this.poise <= 0) {
        // 破韧：进入长硬直，韧性重置
        this.poise = this.poiseMax;
        this.staggerUntil = now + this.staggerDurationMs;
        this.knockVx = dir * Math.max(info.knockbackX, 220); // 破韧击退更远
        info.brokePoise = true;
        if (this.onPoiseBreak) this.onPoiseBreak();
        this.setDisplay('hurt');
      }
    }

    if (this.hp === 0) this.die();
  }

  /** 破韧时长（子类可覆盖，Boss 更短） */
  protected staggerDurationMs = 900;
  /** 破韧回调（表现层播强反馈） */
  onPoiseBreak: (() => void) | null = null;

  /** 是否处于破韧硬直（AI 应暂停） */
  get staggered(): boolean {
    return performance.now() < this.staggerUntil;
  }

  /** 韧性比例 0~1（HUD/表现层用） */
  get poiseRatio(): number {
    return Math.max(0, Math.min(1, this.poise / this.poiseMax));
  }

  get alive(): boolean { return !this.dead && this.hp > 0; }
  get hitbox(): Box { return { ...this.body }; }

  /** 按公式（docs/02）对目标出手（public：弹幕池需要代替持有者结算命中） */
  dealTo(target: Damageable, mul: number, knockbackX: number, hitstopMs: number): void {
    if (!target.alive) return;
    const info = buildDamageInfo(
      { atk: this.atkStat, critRate: this.critRate, critDmg: this.critDmg },
      { def: target.armor.def, level: target.armor.level },
      mul,
      getConfig.formula(),
      { fromX: this.feet.x, knockbackX, hitstopMs },
    );
    target.takeDamage(info);
    this.game.events.emit('damage', { target, info });
    if (hitstopMs > 0) this.game.hitstop(Math.min(hitstopMs, 40));
  }

  protected die(): void {
    this.dead = true;
    this.deathAt = performance.now();
    this.setDisplay('dead');
    for (let i = 0; i < 10; i++) {
      this.burst.push({ vx: (Math.random() - 0.5) * 520, vy: -80 - Math.random() * 380, born: performance.now() });
    }
    this.game.events.emit('enemy-died', { id: this.monsterId });
  }

  /** 子类 update 开头调用：处理死亡动画/击退衰减/闪白/血条 */
  protected commonUpdate(dtMs: number): boolean {
    const now = performance.now();
    const dt = dtMs / 1000;
    if (this.dead) {
      this.fx.clear();
      const age = now - this.deathAt;
      this.view.alpha = Math.max(0, 1 - age / 400);
      this.burst = this.burst.filter((b) => {
        const t = now - b.born;
        if (t > 420) return false;
        b.vy += 1200 * dt;
        this.fx.rect(b.vx * t / 1000, -this.body.h / 2 + b.vy * t / 1000, 8, 8).fill({ color: 0xd29922, alpha: 1 - t / 420 });
        return true;
      });
      this.updateArt();
      return false; // 已死亡：子类跳过 AI
    }
    this.view.alpha = 1;
    this.knockVx *= Math.max(0, 1 - dt * 8);
    if (this.knockVx !== 0) {
      const vel = { vx: this.knockVx, vy: 0 };
      moveAndCollide(this.body, vel, dt, this.solidsRef);
    }
    // BT-3.2：韧性随时间恢复
    if (this.poise < this.poiseMax) {
      this.poise = Math.min(this.poiseMax, this.poise + this.poiseRegen * dt);
    }
    this.view.tint = now < this.flashUntil ? 0xff7a7a : 0xffffff;
    this.bar.clear();
    const barW = this.body.w;
    this.bar.rect(-barW / 2, 0, barW, 5).fill(0x30363d);
    this.bar.rect(-barW / 2, 0, barW * (this.hp / this.maxHp), 5).fill(0xf85149);
    // BT-3.2：韧性条（仅在韧性受损且未破韧时显示，细黄条）
    if (this.poise < this.poiseMax * 0.999 && !this.staggered) {
      this.bar.rect(-barW / 2, 6, barW * this.poiseRatio, 3).fill(0xe3b341);
    }
    if (this.staggered) {
      // 破韧硬直表现：白色高亮闪烁
      this.view.tint = Math.floor(now / 80) % 2 ? 0xfff0a0 : 0xffffff;
    }
    this.updateArt();
    return true;
  }

  /** 场景注入的碰撞体（任务F/集成时由关卡场景传入） */
  solidsRef: readonly Box[] = [];
}
