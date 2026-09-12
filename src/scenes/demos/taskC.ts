import { Container, Graphics, Text } from 'pixi.js';
import type { Game } from '../../core/Game';
import { Scene } from '../../core/Scene';
import { Camera } from '../../core/Camera';
import { ProjectilePool } from '../../enemy/ProjectilePool';
import { Enemy } from '../../enemy/Enemy';
import { EnemyBase } from '../../enemy/EnemyBase';
import { Boss } from '../../enemy/Boss';
import { Spawner } from '../../enemy/Spawner';
import { Scarecrow } from '../../enemy/Scarecrow';
import { getConfig } from '../../data/ConfigLoader';
import type { WaveDef, MonsterDef, Damageable, Box } from '../../shared/types';

export const sceneKey = 'taskC';

const VIEW_W = 1280;
const WORLD_W = 2400;
const GROUND_Y = 620;

/**
 * 任务C演示：一波 3 近战 + 2 远程 → 清场后出现两阶段「混世魔王」。
 * 稻草人充当玩家替身被攻击；按 J 可对最近的敌人造成 60 点伤害（模拟玩家攻击，用于击杀 Boss 验证）。
 */
export function createScene(game: Game): Scene {
  return new TaskCDemo(game);
}

class TaskCDemo extends Scene {
  private world = new Container();
  private solids: Box[] = [];
  private scarecrow!: Scarecrow;
  private enemies: Enemy[] = [];
  private boss: Boss | null = null;
  private pool!: ProjectilePool;
  private spawner!: Spawner;
  private camera!: Camera;
  private hud!: Text;
  private bossBar!: Graphics;
  private bossBarText!: Text;
  private floaters: { view: Text; vy: number; until: number }[] = [];
  private offs: (() => void)[] = [];
  private wavesDone = false;

  private waveDefs: WaveDef[] = [
    { monsterId: 'monkey_soldier', count: 3, intervalMs: 900 },
    { monsterId: 'shaman', count: 2, intervalMs: 800 },
  ];

  constructor(game: Game) { super(game); }

  init(): void {
    const bg = new Graphics();
    bg.rect(0, 0, WORLD_W, 720).fill(0x131018);
    bg.rect(0, GROUND_Y, WORLD_W, 100).fill(0x2a1f2e);
    this.world.addChild(bg);
    this.solids = [{ x: -200, y: GROUND_Y, w: WORLD_W + 400, h: 120 }];
    this.view.addChild(this.world);

    this.pool = new ProjectilePool(this.game, this.solids);
    this.world.addChild(this.pool.view);

    this.scarecrow = new Scarecrow(this.game, 700);
    this.world.addChild(this.scarecrow.view);

    this.spawner = new Spawner(this.waveDefs, {
      spawnMonster: (id) => this.spawnSmall(id),
      isMonsterCleared: () => this.enemies.every((e) => !e.alive),
    });
    this.spawner.start();

    this.camera = new Camera(this.world, VIEW_W, WORLD_W);

    this.hud = new Text({
      text: '',
      style: { fill: 0xe6edf3, fontSize: 15, fontFamily: 'Consolas, monospace', lineHeight: 22 },
    });
    this.hud.position.set(16, 12);
    this.view.addChild(this.hud);

    this.bossBar = new Graphics();
    this.bossBar.position.set((VIEW_W - 600) / 2, 40);
    this.bossBar.visible = false;
    this.view.addChild(this.bossBar);
    this.bossBarText = new Text({
      text: '',
      style: { fill: 0xffc0c0, fontSize: 14, fontFamily: 'Consolas, monospace' },
    });
    this.bossBarText.position.set((VIEW_W - 600) / 2, 18);
    this.bossBarText.visible = false;
    this.view.addChild(this.bossBarText);

    this.offs.push(this.game.events.on('damage', ({ target, info }) => {
      const hb = target.hitbox;
      this.spawnFloater(hb.x + hb.w / 2, hb.y, info.amount, info.isCrit);
    }));
    this.offs.push(this.game.events.on('enemy-died', ({ id }) => {
      if (id === 'demon_king') { this.boss = null; }
    }));
  }

  private spawnSmall(id: string, atX?: number): void {
    const def = getConfig.monster(id) as unknown as MonsterDef;
    const x = atX ?? 1200 + Math.random() * 900;
    const e = new Enemy(this.game, def, x, this.scarecrow, 500, 2200, this.solids);
    e.onRangedFire = (tx, target) => {
      const f = e.feet;
      const ty = target.hitbox.y + target.hitbox.h / 2;
      const dx = tx - f.x;
      const dy = ty - (f.y - 30);
      const len = Math.hypot(dx, dy) || 1;
      this.pool.fire(f.x, f.y - 30, (dx / len) * 380, (dy / len) * 380, def.attack.damageMul, e, target);
    };
    this.enemies.push(e);
    this.world.addChild(e.view);
  }

  private spawnBoss(): void {
    const def = getConfig.monster('demon_king') as unknown as MonsterDef;
    const b = new Boss(this.game, def, 2000, this.scarecrow, this.solids);
    b.onSummon = (count) => {
      for (let i = 0; i < count; i++) this.spawnSmall('monkey_soldier', b.body.x + (i === 0 ? -140 : 140));
    };
    b.fireRing = (x, y) => {
      for (let i = 0; i < 16; i++) {
        const a = (Math.PI * 2 * i) / 16;
        this.pool.fire(x, y, Math.cos(a) * 300, Math.sin(a) * 300, 1.0, b, this.scarecrow);
      }
    };
    this.boss = b;
    this.world.addChild(b.view);
  }

  private spawnFloater(x: number, y: number, amount: number, isCrit: boolean): void {
    const t = new Text({
      text: isCrit ? `${amount}!` : `${amount}`,
      style: { fill: 0xff9d9d, fontSize: isCrit ? 24 : 16, fontWeight: 'bold', fontFamily: 'Consolas, monospace' },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.world.addChild(t);
    this.floaters.push({ view: t, vy: -60, until: performance.now() + 600 });
  }

  update(dtMs: number): void {
    const now = performance.now();

    // 波次推进 → 全清后出 Boss
    if (!this.wavesDone) {
      this.wavesDone = this.spawner.update();
      if (this.wavesDone && this.enemies.every((e) => !e.alive)) this.spawnBoss();
    }

    // 模拟玩家攻击：J 对 250px 内最近敌人造成 60 伤害
    if (this.game.input.wasPressed('attack')) {
      const fx = this.scarecrow.feet.x;
      const candidates: EnemyBase[] = [...this.enemies, ...(this.boss ? [this.boss] : [])];
      const near = candidates
        .filter((c) => c.alive && Math.abs(c.feet.x - fx) < 250)
        .sort((a, b) => Math.abs(a.feet.x - fx) - Math.abs(b.feet.x - fx))[0];
      if (near) {
        near.takeDamage({ amount: 60, isCrit: false, fromX: fx, knockbackX: 120, hitstopMs: 30 });
        this.game.hitstop(30);
      }
    }

    this.scarecrow.update(dtMs);
    for (const e of this.enemies) e.update(dtMs);
    this.enemies = this.enemies.filter((e) => e.alive || performance.now() - (e as unknown as { deathAt?: number }).deathAt! < 3000);
    this.boss?.update(dtMs);
    this.pool.update(dtMs);

    // 相机跟随稻草人与Boss中点
    const focus = this.boss ? (this.scarecrow.feet.x + this.boss.feet.x) / 2 : this.scarecrow.feet.x;
    this.camera.followX(focus);

    this.floaters = this.floaters.filter((f) => {
      if (now >= f.until) { f.view.destroy(); return false; }
      f.view.y += f.vy * (dtMs / 1000);
      f.view.alpha = Math.max(0, (f.until - now) / 600);
      return true;
    });

    // HUD
    const alive = this.enemies.filter((e) => e.alive).length;
    this.hud.text =
      `任务C 演示   按 J 攻击（稻草人替身）\n` +
      `${this.wavesDone ? (this.boss ? 'BOSS 战进行中' : 'BOSS 已被击败 ✓') : this.spawner.progressText}   场上小怪 ${alive}`;

    // Boss 血条（顶部，带阶段刻度）
    this.bossBar.visible = !!this.boss;
    this.bossBarText.visible = !!this.boss;
    if (this.boss) {
      const maxHp = getConfig.monster('demon_king').stats.hp;
      const cur = this.boss.curHp;
      this.bossBar.clear();
      this.bossBar.rect(0, 0, 600, 18).fill(0x30363d);
      this.bossBar.rect(0, 0, 600 * Math.max(0, this.boss.hpFrac), 18).fill(0xf85149);
      for (const mark of [0.3, 0.6]) this.bossBar.rect(600 * mark - 1, 0, 2, 18).fill(0x0d1117);
      this.bossBarText.text = `混世魔王 · 阶段 ${this.boss.phase}  ${Math.ceil(cur)}/${maxHp}`;
    }
  }

  destroy(): void {
    this.offs.forEach((off) => off());
    super.destroy();
  }
}
