import { Container, Graphics, Text } from 'pixi.js';
import type { Game } from '../../core/Game';
import { Scene } from '../../core/Scene';
import { Camera } from '../../core/Camera';
import { overlaps } from '../../core/Physics';
import { Player } from '../entities/Player';
import { Enemy } from '../../enemy/Enemy';
import { Boss } from '../../enemy/Boss';
import { Spawner } from '../../enemy/Spawner';
import { ProjectilePool } from '../../enemy/ProjectilePool';
import { getConfig } from '../../data/ConfigLoader';
import { LevelFlow, isLevelUnlocked, type LevelRunResult } from '../../meta/levelFlow';
import { loadSave, writeSave, clearSave, playerBaseStats, expNeeded, type SaveData } from '../../meta/save';
import type { BattleStats, Damageable, MonsterDef, SkillDef, Box } from '../../shared/types';

export const sceneKey = 'taskF';

const VIEW_W = 1280;
const WORLD_W = 2400;
const GROUND_Y = 620;

/** 任务F演示：主城 → 选关 → 波次战斗 → Boss → 结算 → 存档（刷新页面进度保留） */
export function createScene(game: Game): Scene {
  return new TaskFDemo(game);
}

class TaskFDemo extends Scene {
  private world = new Container();
  private ui = new Container();
  private solids: Box[] = [];
  private save: SaveData = loadSave();
  private flow = new LevelFlow();

  private player: Player | null = null;
  private enemies: Enemy[] = [];
  private boss: Boss | null = null;
  private pool: ProjectilePool | null = null;
  private spawner: Spawner | null = null;
  private camera: Camera | null = null;
  private battlePhase: 'waves' | 'boss' | 'done' = 'waves';
  private result: LevelRunResult | null = null;
  private paused = false;
  private dispHp = 0; // 血条白色缓冲

  private hudG = new Graphics();
  private hudT = new Text({ text: '', style: { fill: 0xe6edf3, fontSize: 14, fontFamily: 'Consolas, monospace', lineHeight: 20 } });
  private offs: (() => void)[] = [];

  constructor(game: Game) { super(game); }

  init(): void {
    this.view.addChild(this.world);
    this.view.addChild(this.ui);
    this.renderUI();
  }

  // ———————————— UI 工具 ————————————

  private mkButton(parent: Container, label: string, x: number, y: number, w: number, h: number, cb: () => void, disabled = false): void {
    const g = new Graphics();
    g.rect(0, 0, w, h).fill({ color: disabled ? 0x30363d : 0x238636 });
    g.rect(0, 0, w, h).stroke({ width: 1, color: 0x3fb950 });
    const t = new Text({
      text: label,
      style: { fill: disabled ? 0x6e7681 : 0xffffff, fontSize: 15, fontFamily: 'Consolas, monospace' },
    });
    t.anchor.set(0.5);
    t.position.set(w / 2, h / 2);
    g.addChild(t);
    g.position.set(x, y);
    if (!disabled) {
      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.on('pointertap', cb);
    }
    parent.addChild(g);
  }

  private mkLabel(parent: Container, text: string, x: number, y: number, size = 16, color = 0xe6edf3): Text {
    const t = new Text({ text, style: { fill: color, fontSize: size, fontFamily: 'Consolas, monospace', lineHeight: 24 } });
    t.position.set(x, y);
    parent.addChild(t);
    return t;
  }

  private renderUI(): void {
    this.ui.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.world.visible = true;
    this.hudG.visible = false;
    this.hudT.visible = false;
    if (this.flow.state === 'city') this.renderCity();
    else if (this.flow.state === 'select') this.renderSelect();
    else if (this.flow.state === 'battle') this.renderBattleHud();
    else if (this.flow.state === 'settle') this.renderSettle();
    else if (this.flow.state === 'fail') this.renderFail();
  }

  private renderCity(): void {
    this.world.visible = false;
    const panel = new Container();
    this.mkLabel(panel, '造  梦  纪', 520, 180, 42, 0xffd257);
    this.mkLabel(panel, `西游篇 · M1 灰盒   玩家 Lv.${this.save.playerLevel}  Exp ${this.save.exp}/${expNeeded(this.save.playerLevel)}`, 460, 250, 15, 0x9aa7b3);
    this.mkButton(panel, '开 始 冒 险', 540, 330, 200, 52, () => { this.flow.toSelect(); this.renderUI(); });
    this.mkButton(panel, '清 除 存 档', 540, 400, 200, 40, () => { clearSave(); this.save = loadSave(); this.renderUI(); });
    this.ui.addChild(panel);
  }

  private renderSelect(): void {
    this.world.visible = false;
    const panel = new Container();
    this.mkLabel(panel, '选 择 关 卡', 560, 100, 26, 0xffd257);
    let y = 170;
    for (const lv of getConfig.allLevels()) {
      const unlocked = isLevelUnlocked(this.save, lv, getConfig.allLevels());
      const cleared = this.save.clearedLevels.includes(lv.id);
      const label = `${lv.id} ${lv.name}   推荐Lv.${lv.recLevel}${cleared ? '  ✓已通关' : ''}${unlocked ? '' : '  🔒'}`;
      this.mkButton(panel, label, 390, y, 500, 48, () => this.enterLevel(lv.id), !unlocked);
      y += 64;
    }
    this.mkButton(panel, '返 回 主 城', 540, y + 20, 200, 40, () => { this.flow.toCity(); this.renderUI(); });
    this.ui.addChild(panel);
  }

  private renderSettle(): void {
    this.world.visible = false;
    const r = this.result!;
    const panel = new Container();
    this.mkLabel(panel, `通关评级  ${r.rating}`, 560, 140, 36, r.rating === 'S' ? 0xffd700 : 0xffd257);
    this.mkLabel(panel, `用时 ${(r.elapsedMs / 1000).toFixed(1)}s   经验 +${r.expGain}${r.levelUps > 0 ? `   升级 ×${r.levelUps}！` : ''}`, 460, 210, 16);
    this.mkLabel(panel, `掉落：${r.drops.length ? r.drops.join('、') : '（无）'}`, 460, 245, 15, 0x9aa7b3);
    this.mkButton(panel, '再 打 一 次', 460, 320, 170, 46, () => this.enterLevel(r.levelId));
    this.mkButton(panel, '返 回 主 城', 655, 320, 170, 46, () => { this.flow.toCity(); this.renderUI(); });
    this.ui.addChild(panel);
  }

  private renderFail(): void {
    this.world.visible = false;
    const panel = new Container();
    this.mkLabel(panel, '挑 战 失 败', 565, 180, 34, 0xf85149);
    this.mkLabel(panel, '提升等级或装备后再来挑战（本次进度已保存）', 460, 240, 15, 0x9aa7b3);
    this.mkButton(panel, '重 新 挑 战', 460, 310, 170, 46, () => this.enterLevel(this.flow.currentLevel!.id));
    this.mkButton(panel, '返 回 主 城', 655, 310, 170, 46, () => { this.flow.toCity(); this.renderUI(); });
    this.ui.addChild(panel);
  }

  // ———————————— 战斗 ————————————

  private enterLevel(levelId: string): void {
    const lv = getConfig.level(levelId);
    this.flow.enter(lv);
    this.enemies.forEach((e) => e.destroy());
    this.enemies = [];
    this.boss?.destroy();
    this.boss = null;
    this.world.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.pool = null;
    this.spawner = null;
    this.camera = null;
    this.player = null;
    this.battlePhase = 'waves';
    this.result = null;
    this.paused = false;

    const bg = new Graphics();
    bg.rect(0, 0, WORLD_W, 720).fill(0x11161d);
    bg.rect(0, GROUND_Y, WORLD_W, 100).fill(0x24321f);
    this.world.addChild(bg);
    this.solids = [{ x: -200, y: GROUND_Y, w: WORLD_W + 400, h: 120 }];

    this.pool = new ProjectilePool(this.game, this.solids);
    this.world.addChild(this.pool.view);

    const stats = playerBaseStats(this.save) as unknown as BattleStats;
    const hitQuery = (box: Box): Damageable[] => [
      ...this.enemies.filter((e) => e.alive && overlaps(box, e.hitbox)),
      ...(this.boss && this.boss.alive && overlaps(box, this.boss.hitbox) ? [this.boss] : []),
    ];
    this.player = new Player(this.game, stats, getConfig.allSkills() as unknown as SkillDef[], hitQuery, this.solids);
    this.player.armor = { def: stats.def, level: this.save.playerLevel };
    this.player.body.x = 260;
    this.player.body.y = GROUND_Y - this.player.body.h;
    this.world.addChild(this.player.view);

    this.spawner = new Spawner(lv.waves, {
      spawnMonster: (id) => this.spawnSmall(id),
      isMonsterCleared: () => this.enemies.every((e) => !e.alive),
    });
    this.spawner.start();
    this.camera = new Camera(this.world, VIEW_W, WORLD_W);

    this.hudG.visible = true;
    this.hudT.visible = true;
    this.hudT.position.set(16, 140);
    this.view.addChild(this.hudG);
    this.view.addChild(this.hudT);
    this.dispHp = stats.maxHp;

    // 战斗 HUD 元素常驻（渲染在 renderLoop 中重画）
    this.ui.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.view.addChild(this.hudG, this.hudT);
    this.renderUIBattleOnly();
  }

  private renderUIBattleOnly(): void {
    // 顶部提示 + 暂停按钮占位（Esc）
    this.mkLabel(this.ui, `${this.flow.currentLevel!.id} ${this.flow.currentLevel!.name}   Esc 暂停`, 16, 12, 14, 0x9aa7b3);
  }

  private spawnSmall(id: string, atX?: number): void {
    if (!this.player) return;
    const def = getConfig.monster(id) as unknown as MonsterDef;
    const e = new Enemy(this.game, def, atX ?? 1200 + Math.random() * 900, this.player, 400, 2300, this.solids);
    e.onRangedFire = (tx, target) => {
      if (!this.pool || !e.alive) return;
      const f = e.feet;
      const ty = target.hitbox.y + target.hitbox.h / 2;
      const dx = tx - f.x, dy = ty - (f.y - 30);
      const len = Math.hypot(dx, dy) || 1;
      this.pool.fire(f.x, f.y - 30, (dx / len) * 380, (dy / len) * 380, def.attack.damageMul, e, target);
    };
    this.enemies.push(e);
    this.world.addChild(e.view);
  }

  private renderBattleHud(): void { /* 战斗 HUD 由 update 每帧重画（hudG/hudT） */ }

  private drawHud(): void {
    if (!this.player) return;
    const s = this.player.stats;
    this.dispHp += (s.hp - this.dispHp) * 0.06; // 白色缓冲条缓慢跟随
    const g = this.hudG;
    g.clear();
    // 血条（缓冲白 + 前景红）
    g.rect(16, 46, 260, 16).fill(0x30363d);
    g.rect(16, 46, 260 * Math.max(0, this.dispHp / s.maxHp), 16).fill(0xffffff);
    g.rect(16, 46, 260 * Math.max(0, s.hp / s.maxHp), 16).fill(0xf85149);
    // 蓝条
    g.rect(16, 66, 200, 10).fill(0x30363d);
    g.rect(16, 66, 200 * Math.max(0, s.mp / s.maxMp), 10).fill(0x58a6ff);
    // 技能槽 CD
    const skills = getConfig.allSkills();
    skills.forEach((sk, i) => {
      const x = 16 + i * 54;
      const cd = this.player!.skillCd(sk.id);
      const total = sk.cdMs / 1000;
      g.rect(x, 84, 46, 46).fill(0x21262d).stroke({ width: 1, color: 0x3fb950 });
      if (cd > 0) g.rect(x, 84 + 46 * (1 - Math.min(1, cd / total)), 46, 46 * Math.min(1, cd / total)).fill({ color: 0x0d1117, alpha: 0.75 });
      const key = ['U', 'I', 'O'][i];
      const label = new Text({ text: key, style: { fill: 0xe6edf3, fontSize: 13, fontFamily: 'Consolas, monospace' } });
      label.position.set(x + 4, 88);
      this.hudG.addChild(label);
      this.hudLabels.push(label);
    });
    // Boss 血条
    if (this.boss && this.boss.alive) {
      const bx = (VIEW_W - 600) / 2;
      g.rect(bx, 40, 600, 16).fill(0x30363d);
      g.rect(bx, 40, 600 * Math.max(0, this.boss.hpFrac), 16).fill(0xf85149);
      for (const mark of [0.3, 0.6]) g.rect(bx + 600 * mark - 1, 40, 2, 16).fill(0x0d1117);
    }
  }

  private hudLabels: Text[] = [];

  private renderPause(): void {
    const panel = new Container();
    const shade = new Graphics();
    shade.rect(0, 0, VIEW_W, 720).fill({ color: 0x000000, alpha: 0.6 });
    panel.addChild(shade);
    this.mkLabel(panel, '暂 停', 590, 240, 30, 0xffd257);
    this.mkButton(panel, '继 续', 560, 300, 160, 42, () => this.togglePause());
    this.mkButton(panel, '重 新 开 始', 560, 352, 160, 42, () => this.enterLevel(this.flow.currentLevel!.id));
    this.mkButton(panel, '回 城（保存）', 560, 404, 160, 42, () => { writeSave(this.save); this.flow.toCity(); this.renderUI(); });
    this.ui.addChild(panel);
  }

  private togglePause(): void {
    if (this.flow.state !== 'battle') return;
    this.paused = !this.paused;
    if (this.paused) this.renderPause();
    else {
      this.ui.removeChildren().forEach((c) => c.destroy({ children: true }));
      this.renderUIBattleOnly();
    }
  }

  update(dtMs: number): void {
    if (this.flow.state !== 'battle' || !this.player || !this.spawner || !this.camera || !this.pool) return;
    if (this.paused) {
      if (this.game.input.wasPressed('pause')) this.togglePause();
      return;
    }

    // —— 波次 → Boss → 结算 ——
    if (this.battlePhase === 'waves') {
      const done = this.spawner.update();
      if (done && this.enemies.every((e) => !e.alive)) {
        const lv = this.flow.currentLevel!;
        if (lv.bossId) {
          this.battlePhase = 'boss';
          const def = getConfig.monster(lv.bossId) as unknown as MonsterDef;
          const b = new Boss(this.game, def, 2000, this.player, this.solids);
          b.onSummon = (n) => { for (let i = 0; i < n; i++) this.spawnSmall('monkey_soldier', b.body.x + (i === 0 ? -140 : 140)); };
          b.fireRing = (x, y) => {
            for (let i = 0; i < 16; i++) {
              const a = (Math.PI * 2 * i) / 16;
              this.pool!.fire(x, y, Math.cos(a) * 300, Math.sin(a) * 300, 1.0, b, this.player!);
            }
          };
          this.boss = b;
          this.world.addChild(b.view);
        } else {
          this.finishLevel();
          return;
        }
      }
    } else if (this.battlePhase === 'boss' && this.boss && !this.boss.alive) {
      this.finishLevel();
      return;
    }

    // —— 暂停 ——
    if (this.game.input.wasPressed('pause')) { this.togglePause(); }

    // —— 模拟更新 ——
    this.player.update(dtMs);
    this.player.body.x = Math.max(0, Math.min(WORLD_W - this.player.body.w, this.player.body.x));
    for (const e of this.enemies) e.update(dtMs);
    this.boss?.update(dtMs);
    this.pool.update(dtMs);
    this.camera.followX(this.player.feet.x);

    if (!this.player.alive) {
      this.flow.fail();
      writeSave(this.save);
      this.renderUI();
      return;
    }

    // —— HUD 重画 ——
    this.hudLabels.forEach((l) => l.destroy());
    this.hudLabels = [];
    this.drawHud();
    const s = this.player.stats;
    const phaseText = this.battlePhase === 'boss' ? 'BOSS 战！' : this.spawner.progressText;
    this.hudT.text = `Lv.${this.save.playerLevel}  ${phaseText}`;
  }

  private finishLevel(): void {
    this.battlePhase = 'done';
    this.result = this.flow.settle(this.save);
    writeSave(this.save);
    this.renderUI();
  }

  destroy(): void {
    this.offs.forEach((off) => off());
    writeSave(this.save);
    super.destroy();
  }
}
