import { Graphics } from 'pixi.js';
import type { Game } from '../core/Game';
import { EnemyBase } from './EnemyBase';
import { overlaps } from '../core/Physics';
import type { Damageable, MonsterDef, Box } from '../shared/types';

type BossSkill = 'charge' | 'slam' | 'summon' | 'ring';

const WINDUP: Record<BossSkill, number> = { charge: 600, slam: 500, summon: 400, ring: 600 };
const CHARGE_SPEED = 800;
const CHARGE_MS = 500;

/**
 * 任务C：Boss 框架（混世魔王）。
 * 阶段：血量 >60% P1[冲撞/拍击] · 30~60% P2[+召唤] · <30% P3[+全屏弹幕，节奏加快]。
 * 所有招式都有前摇预警（地面红色预警条）。
 */
export class Boss extends EnemyBase {
  get monsterId(): string { return this.def.id; }
  phase = 1;
  get curHp(): number { return this.hp; }
  get hpFrac(): number { return this.hp / this.maxHp; }

  /** 由场景注入：召唤小怪 / 发射全屏弹幕 */
  onSummon: ((count: number) => void) | null = null;
  fireRing: ((x: number, y: number) => void) | null = null;

  private def: MonsterDef;
  private target: Damageable | null;
  private tele = new Graphics();
  private skill: BossSkill | null = null;
  private skillIdx = 0;
  private windupUntil = 0;
  private nextSkillAt = 0;
  private chargeUntil = 0;
  private chargeDir: 1 | -1 = 1;
  private chargeHit = false;

  constructor(game: Game, def: MonsterDef, x: number, target: Damageable | null, solids: readonly Box[]) {
    super(game, def, 110, 120, 0xb3543f);
    this.def = def;
    this.target = target;
    this.solidsRef = solids;
    this.body.x = x;
    this.body.y = 620 - this.body.h;
    this.view.addChild(this.tele);

    // BT-3.2 Boss 韧性：远高于小怪，且破韧硬直更短
    this.poiseMax = 120 + def.level * 10;
    this.poise = this.poiseMax;
    this.poiseRegen = 28;
    this.staggerDurationMs = 650; // 比小怪的 900ms 短，Boss 恢复更快
  }

  update(dtMs: number): void {
    const now = performance.now();
    const dt = dtMs / 1000;
    if (!this.commonUpdate(dtMs)) { this.syncView(); return; }

    const hpFrac = this.hp / this.maxHp;
    const newPhase = hpFrac > 0.6 ? 1 : hpFrac > 0.3 ? 2 : 3;
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      // BT-5.5 阶段切换事件（表现层播演出：顿帧/白闪/震屏/播报）
      this.game.events.emit('boss-phase', { name: this.def.name, phase: newPhase, x: this.feet.x, y: this.feet.y });
    }

    const t = this.target;
    const tx = t && t.alive ? t.hitbox.x + t.hitbox.w / 2 : null;

    // —— 选招 ——
    if (this.skill === null && this.chargeUntil === 0 && now >= this.nextSkillAt && tx !== null) {
      const pool: BossSkill[] =
        this.phase === 1 ? ['charge', 'slam'] :
        this.phase === 2 ? ['charge', 'slam', 'summon'] :
        ['charge', 'slam', 'summon', 'ring'];
      const s = pool[this.skillIdx++ % pool.length];
      this.skill = s;
      this.windupUntil = now + WINDUP[s] * (this.phase === 3 ? 0.8 : 1);
      this.chargeDir = tx > this.feet.x ? 1 : -1;
      this.facing = this.chargeDir;
      this.drawTelegraph(s);
    }

    // —— 前摇结束 → 结算 ——
    if (this.skill && this.windupUntil > 0 && now >= this.windupUntil) {
      const s = this.skill;
      this.windupUntil = 0;
      this.tele.clear();
      if (s === 'charge') {
        this.chargeUntil = now + CHARGE_MS;
        this.chargeHit = false;
      } else if (s === 'slam') {
        if (t && t.alive) {
          const box: Box = {
            x: this.chargeDir > 0 ? this.feet.x : this.feet.x - 240,
            y: this.feet.y - 140, w: 240, h: 140,
          };
          if (overlaps(box, t.hitbox)) this.dealTo(t, 1.8, 300, 60);
        }
        this.endSkill(now);
      } else if (s === 'summon') {
        this.onSummon?.(2);
        this.endSkill(now);
      } else {
        this.fireRing?.(this.feet.x, this.feet.y - 60);
        this.endSkill(now);
      }
    }

    // —— 冲撞进行中 ——
    if (this.chargeUntil > 0) {
      if (now >= this.chargeUntil) {
        this.chargeUntil = 0;
        this.endSkill(now);
      } else {
        const moved = this.body.x + this.chargeDir * CHARGE_SPEED * dt;
        this.body.x = Math.max(80, Math.min(2320 - this.body.w, moved));
        if (!this.chargeHit && t && t.alive && overlaps(this.hitbox, t.hitbox)) {
          this.chargeHit = true;
          this.dealTo(t, 1.5, 350, 60);
        }
      }
    }

    // —— 预警条脉动 ——
    if (this.skill && this.windupUntil > 0) {
      this.tele.alpha = 0.45 + 0.35 * Math.sin(now / 70);
    }

    // BT-3.2 霸体：前摇（蓄力）与冲锋期间不被打断 —— Boss 的压迫感来源
    this.superArmor = this.windupUntil > 0 || this.chargeUntil > 0;

    // 破韧硬直：暂停出招（但已经进入前摇的招式不中断）
    if (this.staggered && this.skill === null && this.chargeUntil === 0) {
      this.setDisplay('hurt');
      this.nextSkillAt = Math.max(this.nextSkillAt, this.staggerUntil + 300);
      this.syncView();
      return;
    }

    this.view.tint =
      now < this.windupUntil && this.windupUntil > 0 ? 0xffe066 :
      now < this.flashUntil ? 0xff7a7a : 0xffffff;
    // BT-2 造型状态：受击 > 前摇(蓄力) > 冲撞 > 待机
    if (now < this.flashUntil) this.setDisplay('hurt');
    else if (this.windupUntil > 0) this.setDisplay('skill');
    else if (this.chargeUntil > 0) this.setDisplay('attack1');
    else this.setDisplay('idle');
    this.syncView();
  }

  private endSkill(now: number): void {
    this.skill = null;
    this.nextSkillAt = now + Math.max(900, 2200 - this.phase * 350);
  }

  private drawTelegraph(s: BossSkill): void {
    this.tele.clear();
    if (s === 'charge') {
      this.tele.rect(this.chargeDir > 0 ? 0 : -420, -8, 420, 10).fill({ color: 0xff4d4d, alpha: 0.85 });
    } else if (s === 'slam') {
      this.tele.rect(this.chargeDir > 0 ? 0 : -240, -140, 240, 140).fill({ color: 0xff4d4d, alpha: 0.4 });
    } else {
      this.tele.circle(0, -60, 130).stroke({ width: 4, color: 0xff4d4d, alpha: 0.85 });
    }
    this.tele.alpha = 0.8;
  }
}
