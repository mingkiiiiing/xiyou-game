import { Container, Graphics, Text } from 'pixi.js';
import type { Game } from '../../core/Game';
import { Scene } from '../../core/Scene';
import { Camera } from '../../core/Camera';
import { overlaps } from '../../core/Physics';
import { PlayerFighter } from '../../battle/PlayerFighter';
import { Dummy } from '../entities/Dummy';
import playerJson from '../../config/player.json';
import { getConfig } from '../../data/ConfigLoader';
import type { BattleStats, Damageable, SkillDef, Box } from '../../shared/types';

export const sceneKey = 'taskB';

const VIEW_W = 1280;
const WORLD_W = 2400;
const GROUND_Y = 620;

/** 任务B演示：新战斗角色（状态机/连段缓冲/技能/手感）打木桩，与 ?scene=battle 的 M0 版对比手感 */
export function createScene(game: Game): Scene {
  return new TaskBDemo(game);
}

class TaskBDemo extends Scene {
  private world = new Container();
  private solids: Box[] = [];
  private fighter!: PlayerFighter;
  private dummies: Dummy[] = [];
  private camera!: Camera;
  private hud!: Text;
  private floaters: { view: Text; vy: number; until: number }[] = [];
  private offs: (() => void)[] = [];

  constructor(game: Game) { super(game); }

  init(): void {
    const bg = new Graphics();
    bg.rect(0, 0, WORLD_W, 720).fill(0x11161d);
    bg.rect(0, GROUND_Y, WORLD_W, 100).fill(0x24321f);
    bg.rect(720, 470, 260, 22).fill(0x37424f);
    this.world.addChild(bg);

    this.solids = [
      { x: -200, y: GROUND_Y, w: WORLD_W + 400, h: 120 },
      { x: 720, y: 470, w: 260, h: 22 },
    ];
    this.view.addChild(this.world);

    const hitQuery = (box: Box): Damageable[] =>
      this.dummies.filter((d) => d.alive && overlaps(box, d.hitbox));

    const skills = getConfig.allSkills() as unknown as SkillDef[];
    this.fighter = new PlayerFighter(
      this.game,
      playerJson as unknown as BattleStats,
      skills,
      hitQuery,
      this.solids,
    );
    this.fighter.body.x = 300;
    this.fighter.body.y = GROUND_Y - this.fighter.body.h;
    this.world.addChild(this.fighter.view);

    for (const x of [900, 1150, 1450]) {
      const d = new Dummy(this.game, x);
      this.dummies.push(d);
      this.world.addChild(d.view);
    }

    this.camera = new Camera(this.world, VIEW_W, WORLD_W);

    this.hud = new Text({
      text: '',
      style: { fill: 0xe6edf3, fontSize: 16, fontFamily: 'Consolas, monospace', lineHeight: 24 },
    });
    this.hud.position.set(16, 12);
    this.view.addChild(this.hud);

    this.offs.push(this.game.events.on('damage', ({ target, info }) => {
      const hb = target.hitbox;
      this.spawnFloater(hb.x + hb.w / 2, hb.y, info.amount, info.isCrit);
    }));
  }

  private spawnFloater(x: number, y: number, amount: number, isCrit: boolean): void {
    const t = new Text({
      text: isCrit ? `${amount}!` : `${amount}`,
      style: {
        fill: isCrit ? 0xffd700 : 0xffffff,
        fontSize: isCrit ? 26 : 17,
        fontWeight: 'bold',
        fontFamily: 'Consolas, monospace',
      },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.world.addChild(t);
    this.floaters.push({ view: t, vy: -70, until: performance.now() + 650 });
  }

  update(dtMs: number): void {
    const now = performance.now();
    this.fighter.update(dtMs);
    this.fighter.body.x = Math.max(0, Math.min(WORLD_W - this.fighter.body.w, this.fighter.body.x));
    for (const d of this.dummies) d.update(dtMs);
    this.camera.followX(this.fighter.feet.x);

    this.floaters = this.floaters.filter((f) => {
      if (now >= f.until) { f.view.destroy(); return false; }
      f.view.y += f.vy * (dtMs / 1000);
      f.view.alpha = Math.max(0, (f.until - now) / 650);
      return true;
    });

    const s = this.fighter.stats;
    const cdParts = (getConfig.allSkills() as unknown as SkillDef[]).map((sk) => {
      const cd = this.fighter.skillCd(sk.id);
      return `${sk.name} ${cd > 0 ? cd.toFixed(1) + 's' : '就绪'}`;
    });
    this.hud.text =
      `状态 ${this.fighter.state}   HP ${Math.ceil(s.hp)}/${s.maxHp}   MP ${Math.floor(s.mp)}/${s.maxMp}\n` +
      cdParts.join('   ');
  }

  destroy(): void {
    this.offs.forEach((off) => off());
    super.destroy();
  }
}
