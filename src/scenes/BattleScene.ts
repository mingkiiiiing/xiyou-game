import { Container, Graphics, Text } from 'pixi.js';
import { Scene } from '../core/Scene';
import type { Game } from '../core/Game';
import { Camera } from '../core/Camera';
import { overlaps } from '../core/Physics';
import { Player } from './entities/Player';
import { Dummy } from './entities/Dummy';
import playerJson from '../config/player.json';
import skillsJson from '../config/skills.json';
import type { BattleStats, Damageable, SkillDef, Box } from '../shared/types';

const VIEW_W = 1280;
const WORLD_W = 2400;
const GROUND_Y = 620;

/** M0 灰盒参考关（冻结）：验证移动/跳跃/普攻三连/技能/木桩/飘字/HUD/相机 */
export class BattleScene extends Scene {
  private world = new Container();
  private solids: Box[] = [];
  private player!: Player;
  private dummies: Dummy[] = [];
  private camera!: Camera;
  private hud!: Text;
  private floaters: { view: Text; vy: number; until: number }[] = [];
  private kills = 0;
  private offs: (() => void)[] = [];

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

    this.player = new Player(
      this.game,
      playerJson as unknown as BattleStats,
      skillsJson as unknown as SkillDef[],
      hitQuery,
      this.solids,
    );
    this.player.body.x = 300;
    this.player.body.y = GROUND_Y - this.player.body.h;
    this.world.addChild(this.player.view);

    for (const x of [900, 1100, 1400, 1700]) {
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
    this.offs.push(this.game.events.on('enemy-died', () => { this.kills++; }));
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

    this.player.update(dtMs);
    this.player.body.x = Math.max(0, Math.min(WORLD_W - this.player.body.w, this.player.body.x));
    for (const d of this.dummies) d.update(dtMs);
    this.camera.followX(this.player.feet.x);

    this.floaters = this.floaters.filter((f) => {
      if (now >= f.until) { f.view.destroy(); return false; }
      f.view.y += f.vy * (dtMs / 1000);
      f.view.alpha = Math.max(0, (f.until - now) / 650);
      return true;
    });

    const s = this.player.stats;
    const cdParts = (skillsJson as unknown as SkillDef[]).map((sk) => {
      const cd = this.player.skillCd(sk.id);
      return `${sk.name} ${cd > 0 ? cd.toFixed(1) + 's' : '就绪'}`;
    });
    this.hud.text =
      `HP ${Math.ceil(s.hp)}/${s.maxHp}   MP ${Math.floor(s.mp)}/${s.maxMp}   击杀 ${this.kills}\n` +
      cdParts.join('   ');
  }

  destroy(): void {
    this.offs.forEach((off) => off());
    super.destroy();
  }
}
