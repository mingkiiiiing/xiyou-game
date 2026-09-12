/**
 * IT-1.1 集成主场景 `?scene=game`
 * 闭环：主城 → 选关 → 战斗(装备属性生效) → 怪死掉落到地上 → 走过去拾取 → 结算 → 变强 → 再战
 *
 * 与各模块的关系：
 *  - 角色/敌人/Boss/Spawner 来自 TASK-B/C
 *  - 战斗属性来自 TASK-E 的 recalcStats（经 item/bridge）
 *  - 掉落来自 TASK-E 的 DropResolver → item/LootEntity
 *  - 特效/音效来自 TASK-G（经 vfx/battleFx）
 *  - 存档/关卡流程来自 TASK-F；波次编排来自 game/BattleDirector
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { Game } from '../core/Game';
import { Scene } from '../core/Scene';
import { Camera } from '../core/Camera';
import { overlaps } from '../core/Physics';
import { PlayerFighter } from '../battle/PlayerFighter';
import { Enemy } from '../enemy/Enemy';
import { EnemyBase } from '../enemy/EnemyBase';
import { Boss } from '../enemy/Boss';
import { ProjectilePool } from '../enemy/ProjectilePool';
import { BattleDirector } from '../game/BattleDirector';
import { LootEntity } from '../item/LootEntity';
import { resolveMonsterDrops, createDefaultDropResolver } from '../item/bridge';
import { QUALITY_COLOR, QUALITY_LABEL, SLOT_LABEL } from '../item/data';
import { itemStats } from '../item/stats';
import { STRENGTHEN_CONFIG, DEFAULT_GEMS } from '../item/data';
import { gemMapOf } from '../item/gems';
import { Progression, goldDropOf } from '../meta/progression';
import { buildDamageInfo } from '../game/damage';
import { ProgressionPanel } from '../ui/ProgressionPanel';
import { ServicePanel } from '../ui/ServicePanel';
import { PET_TABLE, getPet, petAttackStep, petBuffStats, petFollowPos, type PetDef } from '../pet/PetSystem';
import { PetEntity } from '../pet/PetEntity';
import { AchievementTracker, ACHIEVEMENTS } from '../meta/achievements';
import { DailyBoard, DAILY_QUESTS, todayKey } from '../meta/daily';
import { ShopPanel } from '../ui/ShopPanel';
import { PotionHotbar, type PotionHotbarModel } from '../ui/PotionHotbar';
import type { InventoryItem, EquipmentSlot } from '../item/types';
import { getConfig } from '../data/ConfigLoader';
import { LevelFlow } from '../meta/levelFlow';
import { loadSave, writeSave, clearSave, playerBaseStats, expNeeded, type SaveData } from '../meta/save';
import { BattleFx, skillVfxKey } from '../vfx/battleFx';
import { audio } from '../vfx/AudioManager';
import { getCharacterArt } from '../art/registry';
import { buildEnvironment, getEnvTheme, ENV_THEMES, EnvView } from '../art/env';
import { CombatHud, type CombatHudModel, type HudSkill } from '../art/CombatHud';
import { SkillTree } from '../battle/skillTree';
import { CHARACTERS, getCharacter, skillsForChar, applyCharMult } from '../game/characterSystem';
import { DIFFICULTIES, getDifficulty, scaleMonsterDef, qualityWeightsFor, difficultyRank } from '../game/difficulty';
import { genSolids, groundY, playerSpawnX, spawnRangeX, bossSpawnX, patrolRangeX } from '../game/levelUtils';
import { DropResolver } from '../item/dropResolver';
import { ITEM_TABLE } from '../item/data';
import type { ItemDef } from '../shared/types';

/** 连击评级（BT-3.5） */
function rankOfCombo(n: number): string {
  if (n >= 30) return 'S';
  if (n >= 20) return 'A';
  if (n >= 12) return 'B';
  if (n >= 5) return 'C';
  return '';
}

/** 章节 → 环境主题（BT-2；后续 BT-5 扩充章节时在此登记） */
function chapterThemeId(chapter: number): string {
  switch (chapter) {
    case 1: return 'huaguoshan';
    case 2: return 'shuilian';
    default: return 'moku';
  }
}
import type { BattleStats, Damageable, MonsterDef, SkillDef, Box, WaveDef } from '../shared/types';
import type { RawLevel } from '../data/schemas';

export const sceneKey = 'game';

const VIEW_W = 1280;
const DEFAULT_WORLD_W = 2400;
const GROUND_Y = 620;

export function createScene(game: Game): Scene {
  return new MainGameScene(game);
}

export class MainGameScene extends Scene {
  private world = new Container();
  private screen = new Container();
  private ui = new Container();

  private save: SaveData = loadSave();
  private flow = new LevelFlow();
  private progression: Progression | null = null;
  private gemTable = gemMapOf(DEFAULT_GEMS);
  private drops = createDefaultDropResolver('loot');
  private progressionPanel: ProgressionPanel | null = null;
  private shopPanel: ShopPanel | null = null;
  private hotbar: PotionHotbar | null = null;
  private potionCdUntil = 0;
  private servicePanel: ServicePanel | null = null;
  private petView: PetEntity | null = null;
  private petFireCdUntil = 0;

  private player: PlayerFighter | null = null;
  private enemies: Enemy[] = [];
  private boss: Boss | null = null;
  private loot: LootEntity[] = [];
  private pool: ProjectilePool | null = null;
  private director: BattleDirector | null = null;
  private camera: Camera | null = null;
  private env: EnvView | null = null;
  private combatHud: CombatHud | null = null;
  private comboCount = 0;
  private worldW = DEFAULT_WORLD_W;
  private difficultyId = 'normal';
  private battleFx: BattleFx | null = null;
  private detachFx: (() => void) | null = null;

  private dropped = new WeakSet<EnemyBase>();
  private picked: InventoryItem[] = [];
  private toasts: { view: Text; until: number; text: string; color: number }[] = [];
  private offs: (() => void)[] = [];
  private lastComboAt = 0;
  private solids: Box[] = [];
  private dispHp = 0;
  private paused = false;
  private godMode = false;

  private hudG = new Graphics();
  private hudT = new Text({ text: '', style: { fill: 0xe6edf3, fontSize: 14, fontFamily: 'Consolas, monospace', lineHeight: 20 } });
  private toastLayer = new Container();
  private rawKeys = new Set<string>();
  private rawSeen = new Set<string>();
  private lastKeyCode = '';
  private listeners: (() => void)[] = [];

  constructor(game: Game) { super(game); }

  init(): void {
    this.progression = new Progression(this.save);
    // BT-6 日常跨天重置
    if (this.save.daily.date !== todayKey()) {
      this.save.daily = { date: todayKey(), progress: {}, claimed: [] };
      writeSave(this.save);
    }
    this.view.addChild(this.world);
    this.view.addChild(this.screen);
    this.view.addChild(this.ui);
    this.view.addChild(this.hudG);
    this.view.addChild(this.hudT);
    this.view.addChild(this.toastLayer);
    this.hudG.visible = false;
    this.hudT.visible = false;

    const dn = (e: KeyboardEvent) => { this.rawKeys.add(e.code); this.lastKeyCode = e.code; };
    const up = (e: KeyboardEvent) => { this.rawKeys.delete(e.code); this.rawSeen.delete(e.code); };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    this.listeners.push(() => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup', up);
    });

    this.renderMenu();
  }

  /** BT-6.1 宠物：购买/出战/休息 */
  private petAction(id: string): void {
    const pet = getPet(id);
    const pets = this.save.pets;
    if (pets.active === id) {
      pets.active = null;
      writeSave(this.save);
      this.renderMenu();
      return;
    }
    if (!pets.owned.includes(id)) {
      if (!this.progression || this.progression.gold < pet.price) { this.toast('金币不足', 0xf85149); return; }
      this.progression.gold -= pet.price;
      pets.owned.push(id);
      this.toast(`获得宠物 ${pet.name}`, 0xffd257);
    }
    pets.active = id;
    writeSave(this.save);
    this.renderMenu();
  }

  /** BT-6.3 导出存档到剪贴板（失败降级为下载文件） */
  private exportSave(): void {
    writeSave(this.save);
    const json = localStorage.getItem('zaomengji_save_v1') ?? '{}';
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(json)
        .then(() => this.toast('存档已复制到剪贴板', 0x3fb950))
        .catch(() => this.downloadSave(json));
    } else {
      this.downloadSave(json);
    }
  }

  private downloadSave(json: string): void {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'zaomengji-save.json';
    a.click();
    URL.revokeObjectURL(a.href);
    this.toast('存档已导出为文件', 0x3fb950);
  }

  /** BT-6.3 导入存档（粘贴 JSON） */
  private importSave(): void {
    const raw = window.prompt('粘贴存档 JSON（导出时复制的内容）：');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data.version !== 2) throw new Error('版本不符');
      localStorage.setItem('zaomengji_save_v1', JSON.stringify(data));
      this.save = loadSave();
      this.progression = new Progression(this.save);
      this.save.pets = this.save.pets ?? { owned: [], active: null };
      this.toast('存档导入成功', 0x3fb950);
      this.renderMenu();
    } catch {
      this.toast('导入失败：无效的存档数据', 0xf85149);
    }
  }

  // ————————————————— 菜单层 —————————————————

  // ———————— BT-4 养成/商店面板 ————————
  private openPanel(kind: 'progression' | 'shop' | 'service'): void {
    if (!this.progression) return;
    if (kind === 'service') {
      if (!this.servicePanel) {
        this.servicePanel = new ServicePanel({
          achievements: () => {
            const tracker = new AchievementTracker(this.save.lifeStats, this.save.achClaimed);
            return ACHIEVEMENTS.map((def) => ({
              def,
              progress: tracker.progressOf(def.id),
              complete: tracker.isComplete(def.id),
              claimed: this.save.achClaimed.includes(def.id),
            }));
          },
          dailies: () => {
            const board = new DailyBoard(this.save.daily.date, this.save.daily.progress, this.save.daily.claimed);
            return DAILY_QUESTS.map((def) => ({
              def,
              progress: board.progressOf(def.id),
              complete: board.isComplete(def.id),
              claimed: this.save.daily.claimed.includes(def.id),
              expired: board.isExpired(this.save.daily.date),
            }));
          },
          claimAchievement: (id) => this.panelOp(() => {
            const tracker = new AchievementTracker(this.save.lifeStats, this.save.achClaimed);
            const r = tracker.claim(id);
            if (!r.ok) return { ok: false, msg: r.msg };
            this.progression!.gold += r.gold;
            this.save.lifeStats.goldEarned = (this.save.lifeStats.goldEarned ?? 0) + r.gold;
            if (r.skillPoints) this.progression!.skillTree.grant(r.skillPoints);
            this.save.achClaimed.push(id);
            return { ok: true, msg: `成就奖励：+${r.gold} 金币${r.skillPoints ? ` +${r.skillPoints} 技能点` : ''}` };
          }),
          claimDaily: (id) => this.panelOp(() => {
            const board = new DailyBoard(this.save.daily.date, this.save.daily.progress, this.save.daily.claimed);
            const r = board.claim(id);
            if (!r.ok) return { ok: false, msg: r.msg };
            this.progression!.gold += r.gold;
            return { ok: true, msg: `日常奖励：+${r.gold} 金币` };
          }),
          close: () => this.closePanels(),
        });
        this.view.addChild(this.servicePanel.view);
      }
      this.progressionPanel?.hide();
      this.shopPanel?.hide();
      this.servicePanel.show();
      return;
    }
    if (kind === 'progression') {
      if (!this.progressionPanel) {
        this.progressionPanel = new ProgressionPanel({
          getModel: () => this.progression!.buildProgressionModel(),
          equip: (uid) => this.panelOp(() => this.progression!.equip(uid)),
          unequip: (slot) => this.panelOp(() => this.progression!.unequip(slot)),
          sell: (uid) => this.panelOp(() => this.progression!.sell(uid)),
          strengthen: (uid) => this.panelOp(() => this.progression!.strengthen(uid)),
          socketGem: (uid, i, g) => this.panelOp(() => this.progression!.socketGem(uid, i, g)),
          unsocketGem: (uid, i) => this.panelOp(() => this.progression!.unsocketGem(uid, i)),
          upgradeSkill: (id) => this.panelOp(() => this.progression!.upgradeSkill(id)),
          close: () => this.closePanels(),
        });
        this.view.addChild(this.progressionPanel.view);
      }
      this.shopPanel?.hide();
      this.progressionPanel.show();
    } else {
      if (!this.shopPanel) {
        this.shopPanel = new ShopPanel({
          getModel: () => this.progression!.buildShopModel(),
          buyPotion: (k) => this.panelOp(() => this.progression!.buyPotion(k)),
          buyStone: () => this.panelOp(() => this.progression!.buyStone()),
          buyGem: (id) => this.panelOp(() => this.progression!.buyGem(id)),
          sell: (uid) => this.panelOp(() => this.progression!.sell(uid)),
          close: () => this.closePanels(),
        });
        this.view.addChild(this.shopPanel.view);
      }
      this.progressionPanel?.hide();
      this.shopPanel.show();
    }
    this.renderMenu();
  }

  /** 面板操作统一包装：执行 → 落盘 → 刷新主城顶栏 */
  private panelOp(fn: () => { ok: boolean; msg: string }): { ok: boolean; msg: string } {
    const before = this.progression ? `${this.progression.stones}|${this.progression.gemBag.total()}` : '';
    const r = fn();
    if (r.ok) {
      // BT-6 生涯统计：强化/镶宝石（按操作前后差值）
      if (this.progression) {
        const after = `${this.progression.stones}|${this.progression.gemBag.total()}`;
        if (after !== before) {
          const [s0, g0] = before.split('|').map(Number);
          const [s1, g1] = after.split('|').map(Number);
          if (s1 < s0) this.save.lifeStats.strenghtens = (this.save.lifeStats.strenghtens ?? 0) + (s0 - s1);
          if (g1 < g0) this.save.lifeStats.gemsSocketed = (this.save.lifeStats.gemsSocketed ?? 0) + (g0 - g1);
        }
      }
      writeSave(this.save);
    }
    this.renderMenu();
    return r;
  }

  private closePanels(): void {
    this.progressionPanel?.hide();
    this.shopPanel?.hide();
    this.servicePanel?.hide();
  }

  private anyPanelVisible(): boolean {
    return !!(this.progressionPanel?.visible || this.shopPanel?.visible || this.servicePanel?.visible);
  }

  private renderMenu(): void {
    this.ui.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.world.visible = true;
    this.hudG.visible = false;
    this.hudT.visible = false;
    this.toastLayer.visible = false;
    this.world.removeChildren().forEach((c) => c.destroy({ children: true }));

    if (this.flow.state === 'city') this.renderCity();
    else if (this.flow.state === 'select') this.renderSelect();
    else if (this.flow.state === 'settle') this.renderSettle();
    else if (this.flow.state === 'fail') this.renderFail();
  }

  private mkButton(parent: Container, label: string, x: number, y: number, w: number, h: number, cb: () => void, disabled = false): Graphics {
    const g = new Graphics();
    g.rect(0, 0, w, h).fill({ color: disabled ? 0x2a2f36 : 0x238636 }).stroke({ width: 1, color: disabled ? 0x3a4048 : 0x3fb950 });
    const t = new Text({ text: label, style: { fill: disabled ? 0x6e7681 : 0xffffff, fontSize: 15, fontFamily: 'Consolas, monospace' } });
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
    return g;
  }

  private mkLabel(parent: Container, text: string, x: number, y: number, size = 16, color = 0xe6edf3): Text {
    const t = new Text({ text, style: { fill: color, fontSize: size, fontFamily: 'Consolas, monospace', lineHeight: 26 } });
    t.position.set(x, y);
    parent.addChild(t);
    return t;
  }

  private equippedSummary(): string {
    const parts: string[] = [];
    for (const it of this.progression?.equipment.equippedItems() ?? []) {
      parts.push(`${SLOT_LABEL[it.slot]}:${it.name}`);
    }
    return parts.length ? parts.join('  ') : '（未穿戴任何装备）';
  }

  private renderCity(): void {
    const p = new Container();
    this.mkLabel(p, '造  梦  纪', 520, 110, 44, 0xffd257);
    this.mkLabel(p, `西游篇 · 集成版   玩家 Lv.${this.save.playerLevel}   Exp ${this.save.exp}/${expNeeded(this.save.playerLevel)}`, 452, 182, 15, 0x9aa7b3);
    const stats = this.currentStats();
    this.mkLabel(p, `战力 ${stats.atk * 10 + stats.def * 8 + stats.maxHp}   HP ${stats.maxHp}  ATK ${stats.atk}  DEF ${stats.def}  暴击 ${stats.critRate}%`, 430, 214, 15, 0x79c0ff);
    this.mkLabel(p, `装备： ${this.equippedSummary()}`, 430, 244, 14, 0x9aa7b3);
    this.mkLabel(p, `背包 ${this.progression?.inventory.size ?? 0}/24   金币 ${this.progression?.gold ?? 0}   强化石 ${this.progression?.stones ?? 0}   技能点 ${this.progression?.skillTree.points ?? 0}`, 430, 270, 14, 0x9aa7b3);
    // BT-5.3 角色选择
    this.mkLabel(p, '选 择 角 色', 300, 312, 14, 0xffd257);
    const curChar = getCharacter(this.save.charId ?? 'linghou');
    CHARACTERS.forEach((c, i) => {
      const active = c.id === curChar.id;
      const btn = this.mkButton(p, `${c.name}${active ? ' ✓' : ''}`, 386 + i * 160, 306, 150, 40, () => {
        this.save.charId = c.id;
        this.progression?.persist();
        writeSave(this.save);
        this.renderMenu();
      });
      btn.tint = active ? 0x3fb950 : (btn.tint ?? 0xffffff);
      this.mkLabel(p, c.role, 386 + i * 160 + 8, 350, 11, 0x8b98a5);
      void btn;
    });
    this.mkLabel(p, `${curChar.name}：${curChar.blurb}`, 330, 368, 12, 0x9aa7b3);
    this.mkButton(p, '养 成 (B)', 380, 394, 140, 38, () => this.openPanel('progression'));
    this.mkButton(p, '商 店 (V)', 540, 394, 140, 38, () => this.openPanel('shop'));
    this.mkButton(p, '日 程 (N)', 700, 394, 140, 38, () => this.openPanel('service'));
    // BT-6.1 宠物
    this.mkLabel(p, '宠 物', 300, 448, 14, 0xffd257);
    PET_TABLE.forEach((pet, i) => {
      const owned = this.save.pets.owned.includes(pet.id);
      const active = this.save.pets.active === pet.id;
      const btnLabel = active ? `${pet.name} ✓出战` : owned ? `${pet.name}（出战）` : `${pet.name} ${pet.price}金`;
      this.mkButton(p, btnLabel, 386 + i * 160, 442, 150, 38, () => this.petAction(pet.id), active);
      this.mkLabel(p, pet.blurb, 386 + i * 160 + 8, 484, 11, 0x8b98a5);
    });
    // BT-6.3 备份
    this.mkButton(p, '备份存档', 380, 524, 140, 34, () => this.exportSave());
    this.mkButton(p, '导入存档', 540, 524, 140, 34, () => this.importSave());
    this.mkButton(p, '开 始 冒 险', 540, 444, 200, 50, () => { this.flow.toSelect(); this.renderMenu(); });
    this.mkButton(p, '清 除 存 档', 540, 506, 200, 36, () => {
      clearSave(); this.save = loadSave(); this.progression = new Progression(this.save); this.difficultyId = 'normal'; this.renderMenu();
    });
    this.mkLabel(p, '操作：A/D 移动 · W/K 跳跃 · J 普攻 · U/I/O 技能 · L 闪避 · Esc 暂停 · F1 无敌 · F2 增援', 300, 556, 13, 0x6e7681);
    this.ui.addChild(p);
  }

  private renderSelect(): void {
    const p = new Container();
    this.mkLabel(p, '选 择 关 卡', 550, 56, 26, 0xffd257);
    // BT-5.4 难度选择器（全局循环：普通 → 精英 → 噩梦）
    const diff = getDifficulty(this.difficultyId);
    this.mkLabel(p, `当前难度：${diff.name}（点下方按钮切换）`, 520, 96, 14, diff.id === 'nightmare' ? 0xf85149 : diff.id === 'elite' ? 0xf0883e : 0x3fb950);
    this.mkButton(p, '切换难度 ▶', 700, 96, 150, 30, () => {
      const idx = DIFFICULTIES.findIndex((d) => d.id === this.difficultyId);
      this.difficultyId = DIFFICULTIES[(idx + 1) % DIFFICULTIES.length].id;
      this.renderMenu();
    });
    let y = 148;
    for (const lv of getConfig.allLevels()) {
      const unlocked = this.isUnlocked(lv);
      const cleared = this.difficultyUnlockedFor(lv.id) !== null;
      const top = this.save.clearedDiff?.[lv.id];
      const label = `${lv.id}  ${lv.name}   推荐 Lv.${lv.recLevel}${top ? `  ✓${getDifficulty(top).name}` : ''}${unlocked ? '' : '   🔒'}`;
      this.mkButton(p, label, 380, y, 520, 44, () => this.enterLevel(lv.id), !unlocked);
      y += 56;
    }
    this.mkLabel(p, `当前难度加成：怪物 HP×${diff.hp} ATK×${diff.atk}  金币×${diff.gold}  掉落品质提升${diff.qualityBonus > 0 ? ` +${diff.qualityBonus} 档` : ''}`, 350, y + 4, 13, 0x9aa7b3);
    this.mkButton(p, '返 回 主 城', 540, y + 26, 200, 38, () => { this.flow.toCity(); this.renderMenu(); });
    this.ui.addChild(p);
  }

  /** 该关已通关的最高难度（未通关返回 null） */
  private difficultyUnlockedFor(levelId: string): string | null {
    const top = this.save.clearedDiff?.[levelId] ?? null;
    if (top) return top;
    return this.save.clearedLevels.includes(levelId) ? 'normal' : null;
  }

  /** 难度是否可用：精英需该关普通通关，噩梦需该关精英通关 */
  private isDifficultyAvailable(levelId: string, diffId: string): boolean {
    const diff = getDifficulty(diffId);
    if (diff.unlock === 'none') return true;
    const have = this.difficultyUnlockedFor(levelId);
    if (!have) return false;
    return difficultyRank(have) >= difficultyRank(diff.unlock);
  }

  private isUnlocked(level: RawLevel): boolean {
    if (level.id === '1-1') return true;
    const prev = getConfig.allLevels()
      .filter((l) => l.chapter === level.chapter && l.recLevel < level.recLevel)
      .sort((a, b) => b.recLevel - a.recLevel)[0];
    return prev ? this.save.clearedLevels.includes(prev.id) : true;
  }

  private renderSettle(): void {
    const p = new Container();
    const r = this.result!;
    this.mkLabel(p, `通 关 评 级   ${r.rating}`, 520, 110, 38, r.rating === 'S' ? 0xffd700 : 0xffd257);
    this.mkLabel(p, `用时 ${(r.elapsedMs / 1000).toFixed(1)}s    经验 +${r.expGain}${r.levelUps > 0 ? `    升级 ×${r.levelUps} ！` : ''}`, 430, 180, 16);
    this.mkLabel(p, `拾取装备（${r.drops.length}）`, 430, 216, 15, 0x79c0ff);
    let y = 246;
    for (const name of r.drops.slice(0, 8)) {
      this.mkLabel(p, `  · ${name}`, 440, y, 14, 0x9aa7b3);
      y += 24;
    }
    if (r.drops.length === 0) this.mkLabel(p, '  （本次没有掉落）', 440, y, 14, 0x6e7681);
    const stats = this.currentStats();
    this.mkLabel(p, `当前战力 ${stats.atk * 10 + stats.def * 8 + stats.maxHp}   ATK ${stats.atk}  HP ${stats.maxHp}`, 430, y + 20, 15, 0x79c0ff);
    this.mkButton(p, '再 打 一 次', 430, y + 60, 180, 44, () => this.enterLevel(r.levelId));
    this.mkButton(p, '返 回 主 城', 630, y + 60, 180, 44, () => { this.flow.toCity(); this.renderMenu(); });
    this.ui.addChild(p);
  }

  private renderFail(): void {
    const p = new Container();
    this.mkLabel(p, '挑 战 失 败', 545, 170, 34, 0xf85149);
    this.mkLabel(p, '进度已保存。可回主城或直接重试。', 470, 240, 15, 0x9aa7b3);
    this.mkButton(p, '重 新 挑 战', 450, 310, 180, 44, () => this.enterLevel(this.flow.currentLevel!.id));
    this.mkButton(p, '返 回 主 城', 650, 310, 180, 44, () => { this.flow.toCity(); this.renderMenu(); });
    this.ui.addChild(p);
  }

  private renderPause(): void {
    const p = new Container();
    const shade = new Graphics();
    shade.rect(0, 0, VIEW_W, 720).fill({ color: 0x000000, alpha: 0.62 });
    p.addChild(shade);
    this.mkLabel(p, '暂 停', 590, 220, 30, 0xffd257);
    this.mkButton(p, '继 续', 560, 280, 160, 42, () => this.togglePause());
    this.mkButton(p, '重 新 开 始', 560, 332, 160, 42, () => this.enterLevel(this.flow.currentLevel!.id));
    this.mkButton(p, '回 城（保存）', 560, 384, 160, 42, () => { writeSave(this.save); this.flow.toCity(); this.renderMenu(); });
    this.ui.addChild(p);
  }

  // ————————————————— 战斗层 —————————————————

  private currentStats(): BattleStats {
    const base = playerBaseStats(this.save) as unknown as BattleStats;
    return this.progression ? this.progression.currentStats() : base;
  }

  private enterLevel(levelId: string): void {
    const lv = getConfig.level(levelId);
    // BT-5.4 难度可用性：未解锁则回落到该关最高已解锁难度
    if (!this.isDifficultyAvailable(levelId, this.difficultyId)) {
      const have = this.difficultyUnlockedFor(levelId);
      this.difficultyId = have === 'nightmare' ? 'nightmare' : have === 'elite' ? 'elite' : 'normal';
    }
    this.cleanupBattle();
    this.flow.enter(lv);
    this.picked = [];

    // BT-5：长关卡世界宽度 + 确定性地形；章节环境主题
    this.worldW = lv.worldW ?? DEFAULT_WORLD_W;
    const theme = getEnvTheme(chapterThemeId(lv.chapter)) ?? ENV_THEMES[0];
    this.env = buildEnvironment(theme, this.worldW, GROUND_Y) as EnvView;
    this.world.addChild(this.env);

    this.solids = genSolids(lv.id, this.worldW);

    this.pool = new ProjectilePool(this.game, this.solids);
    this.world.addChild(this.pool.view);

    const stats = this.currentStats();
    const hitQuery = (box: Box): Damageable[] => {
      const out: Damageable[] = this.enemies.filter((e) => e.alive && overlaps(box, e.hitbox));
      if (this.boss && this.boss.alive && overlaps(box, this.boss.hitbox)) out.push(this.boss);
      return out;
    };
    this.player = new PlayerFighter(this.game, stats, this.resolvedSkills(), hitQuery, this.solids);
    this.player.armor = { def: stats.def, level: this.save.playerLevel };
    this.player.body.x = playerSpawnX();
    this.player.body.y = groundY() - this.player.body.h;
    this.player.onSkillCast = (id, x, y, facing) => {
      this.battleFx?.playSkill(skillVfxKey(id), x, y, facing);
    };
    // BT-5.3 远程普攻角色（云璿）：注入弹幕发射回调
    const charDef = getCharacter(this.save.charId ?? 'linghou');
    if (charDef.rangedBasic) {
      this.player.rangedBasic = true;
      this.player.fireBasic = (x, y, dir, mul) => {
        if (!this.pool) return;
        this.pool.fireFree(x, y, dir * 620, -40, (t) => {
          // 弹幕命中：按玩家属性结算（公式走 game/damage）
          const info = buildDamageInfo(
            this.player!.stats,
            { def: t.armor.def, level: t.armor.level },
            mul,
            getConfig.formula(),
            { fromX: x, knockbackX: 70, hitstopMs: 30 },
          );
          t.takeDamage(info);
          this.game.events.emit('damage', { target: t, info });
          this.game.hitstop(info.hitstopMs);
          if (this.player) this.comboCount++;
        }, (box) => {
          const targets: Damageable[] = this.enemies.filter((e) => e.alive && overlaps(box, e.hitbox));
          if (this.boss && this.boss.alive && overlaps(box, this.boss.hitbox)) targets.push(this.boss);
          return targets;
        });
      };
    }
    // BT-5.3 角色造型
    const playerArt = getCharacterArt(charDef.artId);
    if (playerArt) this.player.attachArt(playerArt);
    this.world.addChild(this.player.view);

    this.camera = new Camera(this.world, VIEW_W, this.worldW);
    this.dispHp = stats.maxHp;

    // 表现层（IT-1.3 门面，接口已冻结）
    this.battleFx = new BattleFx(this.game, {
      world: this.world,
      screen: this.screen,
      isPlayer: (t) => t === this.player,
    });
    this.detachFx = this.battleFx.attach();

    // BT-3.5 连击计数：玩家命中敌人时累加（3 秒未命中则清空）
    const offCombo = this.game.events.on('damage', ({ target, info }) => {
      if (!this.player) return;
      if (target === this.player) { this.comboCount = 0; return; } // 挨打即断连
      if (info.amount > 0) {
        this.comboCount++;
        this.lastComboAt = performance.now();
      }
    });
    this.offs.push(offCombo);

    // BT-5.5 Boss 阶段演出订阅
    this.offs.push(this.game.events.on('boss-phase', ({ name, phase, x, y }) => {
      this.game.hitstop(320);
      this.battleFx?.playPhase(x, y, name, phase);
      this.toast(`${name} 进入阶段 ${phase}！`, 0xffd257);
    }));

    // 战斗编排（波次 → Boss → 通关）
    this.director = new BattleDirector(lv.waves as unknown as WaveDef[], lv.bossId, {
      spawnMonster: (id) => this.spawnSmall(id),
      aliveMonsterCount: () => this.enemies.filter((e) => e.alive).length,
      spawnBoss: (id) => this.spawnBoss(id),
      isBossAlive: () => !!this.boss && this.boss.alive,
    });

    // BT-3.5 战斗 HUD
    this.combatHud = new CombatHud(this.game);
    this.view.addChild(this.combatHud.view);
    // BT-4.5 药水快捷栏
    if (!this.hotbar) {
      this.hotbar = new PotionHotbar();
      this.view.addChild(this.hotbar.view);
    }
    this.comboCount = 0;
    this.potionCdUntil = 0;
    // BT-6.1 出战宠物
    this.petView?.destroy();
    this.petView = null;
    const activePet = this.save.pets.active;
    if (activePet && this.save.pets.owned.includes(activePet)) {
      this.petView = new PetEntity(getPet(activePet));
      this.world.addChild(this.petView.view);
      this.petFireCdUntil = 0;
    }

    this.hudG.visible = true;
    this.hudT.visible = true;
    this.toastLayer.visible = true;
    this.paused = false;
    this.world.visible = true;
  }

  private cleanupBattle(): void {
    this.detachFx?.();
    this.detachFx = null;
    this.enemies.forEach((e) => e.destroy());
    this.enemies = [];
    this.boss?.destroy();
    this.boss = null;
    this.loot.forEach((l) => l.destroy());
    this.loot = [];
    this.player?.destroy();
    this.player = null;
    this.pool = null;
    this.director = null;
    this.camera = null;
    this.env = null;
    this.battleFx = null;
    this.combatHud?.destroy();
    this.combatHud = null;
    this.petView?.destroy();
    this.petView = null;
    this.petFireCdUntil = 0;
    this.dropped = new WeakSet<EnemyBase>();
    this.ui.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  /** BT-5.3 按角色过滤 + 技能等级解析 */
  private resolvedSkills(): SkillDef[] {
    const charId = this.save.charId ?? 'linghou';
    return this.progression
      ? this.progression.skillTree.resolve(skillsForChar(getConfig.allSkills() as unknown as SkillDef[], charId))
      : skillsForChar(getConfig.allSkills() as unknown as SkillDef[], charId);
  }

  private hotbarModel(): PotionHotbarModel {
    const stats = this.player?.stats;
    const p = this.progression;
    return {
      potions: p ? { ...p.potions } : { hp: 0, mp: 0 },
      cooldownRemainMs: Math.max(0, this.potionCdUntil - performance.now()),
      cooldownTotalMs: 8000,
      hpRatio: stats ? stats.hp / stats.maxHp : 1,
      mpRatio: stats ? stats.mp / stats.maxMp : 1,
    };
  }

  private buildHudModel(): CombatHudModel {
    const s = this.player!.stats;
    // BT-5.3 只显示当前角色的技能（与战斗实际装载一致）
    const charSkills: SkillDef[] = this.resolvedSkills();
    const skills: HudSkill[] = charSkills.map((raw) => {
      const cdRemainMs = this.player!.skillCd(raw.id) * 1000;
      const resolved = this.progression ? this.progression.skillTree.resolve([raw as unknown as SkillDef])[0] : raw;
      return {
        id: raw.id,
        name: raw.name,
        level: this.progression?.skillTree.levelOf(raw.id) ?? 1,
        cdRemainMs,
        cdTotalMs: resolved.cdMs,
        mpCost: resolved.mpCost,
        ready: cdRemainMs <= 0 && s.mp >= resolved.mpCost,
      };
    });
    return {
      hp: s.hp, maxHp: s.maxHp,
      mp: s.mp, maxMp: s.maxMp,
      playerLevel: this.save.playerLevel,
      exp: this.save.exp,
      expNeeded: expNeeded(this.save.playerLevel),
      skills,
      dodge: { cdRemainMs: this.player!.dodgeCdRemain * 1000, cdTotalMs: this.player!.dodgeCdTotal * 1000 },
      combo: this.comboCount,
      comboRank: rankOfCombo(this.comboCount),
      boss: this.boss && this.boss.alive
        ? {
            name: '混世魔王',
            hp: this.boss.curHp,
            maxHp: getConfig.monster('demon_king').stats.hp,
            phase: this.boss.phase,
            phaseMarks: [0.3, 0.6],
          }
        : null,
      progressText: this.director!.progressText,
      lootCount: this.loot.length,
      pickedCount: this.picked.length,
      godMode: this.godMode,
      toasts: this.toasts.map((t) => ({ text: t.text, color: t.color, remainMs: Math.max(0, t.until - performance.now()) })),
    };
  }

  private spawnSmall(id: string, atX?: number): void {
    if (!this.player) return;
    const diff = getDifficulty(this.difficultyId);
    const def = scaleMonsterDef(getConfig.monster(id) as unknown as MonsterDef, diff);
    const range = spawnRangeX(this.worldW);
    const patrol = patrolRangeX(this.worldW);
    const e = new Enemy(this.game, def, atX ?? range.min + Math.random() * (range.max - range.min), this.player, patrol.min, patrol.max, this.solidsRef());
    e.onRangedFire = (tx, target) => {
      if (!this.pool || !e.alive) return;
      this.fireAt(e, target, tx);
    };
    // BT-3.4 行为库回调：散射与召唤
    e.onFanShot = (vx, vy, dmgMul) => {
      if (!this.pool || !e.alive || !this.player) return;
      const f = e.feet;
      this.pool.fire(f.x, f.y - 30, vx, vy, dmgMul, e, this.player);
    };
    e.onSummonEnemy = (monsterId, x) => this.spawnSmall(monsterId, x);
    // BT-2：挂载造型美术
    const eArt = getCharacterArt(id);
    if (eArt) e.attachArt(eArt);
    this.enemies.push(e);
    this.world.addChild(e.view);
  }

  /** 敌人朝目标发射一枚弹幕 */
  private fireAt(e: Enemy, target: Damageable, tx: number): void {
    if (!this.pool) return;
    const f = e.feet;
    const ty = target.hitbox.y + target.hitbox.h / 2;
    const dx = tx - f.x, dy = ty - (f.y - 30);
    const len = Math.hypot(dx, dy) || 1;
    this.pool.fire(f.x, f.y - 30, (dx / len) * 380, (dy / len) * 380, 0.9, e, target);
  }

  private spawnBoss(id: string): void {
    if (!this.player) return;
    const diff = getDifficulty(this.difficultyId);
    const def = scaleMonsterDef(getConfig.monster(id) as unknown as MonsterDef, diff);
    const b = new Boss(this.game, def, bossSpawnX(this.worldW), this.player, this.solidsRef());
    b.onSummon = (n) => {
      for (let i = 0; i < n; i++) this.spawnSmall('monkey_soldier', b.body.x + (i === 0 ? -150 : 150));
    };
    b.fireRing = (x, y) => {
      for (let i = 0; i < 16; i++) {
        const a = (Math.PI * 2 * i) / 16;
        this.pool!.fire(x, y, Math.cos(a) * 300, Math.sin(a) * 300, 1.0, b, this.player!);
      }
    };
    this.boss = b;
    // BT-2：挂载造型美术
    const bArt = getCharacterArt(id);
    if (bArt) b.attachArt(bArt);
    this.world.addChild(b.view);
  }

  /** 取出并清空最近一次按键 code（面板 Esc/数字键用） */
  private rawKeyEvent(): string {
    const code = this.lastKeyCode;
    this.lastKeyCode = '';
    return code;
  }

  private solidsRef(): Box[] {
    return this.solids;
  }

  // ————————————————— 掉落与拾取 —————————————————

  private handleDeaths(): void {
    const now = performance.now();
    const check = (e: EnemyBase, isBoss: boolean) => {
      if (e.alive || this.dropped.has(e)) return;
      this.dropped.add(e);
      const f = e.feet;
      const defId = e.monsterId;
      // BT-6 生涯统计：击杀 + 日常进度
      this.save.lifeStats.kills = (this.save.lifeStats.kills ?? 0) + 1;
      if (this.save.daily.date === todayKey()) this.save.daily.progress.today_kills = (this.save.daily.progress.today_kills ?? 0) + 1;
      try {
        const m = getConfig.monster(defId) as unknown as MonsterDef;
        // BT-4.5 杀怪金币
        const gold = Math.round(goldDropOf(m) * getDifficulty(this.difficultyId).gold);
        this.progression?.addGold(gold);
        if (this.save.daily.date === todayKey()) this.save.daily.progress.today_gold = (this.save.daily.progress.today_gold ?? 0) + gold;
        this.toast(`金币 +${gold}`, 0xffd257);
        const items = resolveMonsterDrops(m, this.drops);
        for (const it of items) {
          const l = new LootEntity(this.game, it, f.x - 12 + Math.random() * 24, f.y - 30, this.solidsRef());
          this.loot.push(l);
          this.world.addChild(l.view);
        }
      } catch { /* 未知怪物无掉落 */ }
      if (isBoss) this.director?.notifyBossDefeated();
      void now;
    };
    for (const e of this.enemies) check(e, false);
    if (this.boss) check(this.boss, true);
  }

  private updateLoot(dtMs: number): void {
    if (!this.player) return;
    const pf = this.player.feet;
    for (const l of this.loot) {
      l.update(dtMs);
      if (l.state === 'ground' && l.inPickupRange(pf.x, pf.y - 20)) l.beginMagnet(pf.x, pf.y - 20);
      if (l.state === 'taken' && !(l as unknown as { consumed?: boolean }).consumed) {
        (l as unknown as { consumed?: boolean }).consumed = true;
        this.acquire(l.item, l.feet.x, l.feet.y);
        l.destroy();
      }
    }
    this.loot = this.loot.filter((l) => l.state !== 'taken');
  }

  /** 拾取一件装备：槽位为空则装上，更好则替换，否则进背包 */
  private acquire(item: InventoryItem, x: number, y: number): void {
    const eq = this.progression!.equipment;
    const inv = this.progression!.inventory;
    const cur = eq.get(item.slot);
    if (!cur) {
      eq.equip(item);
      this.picked.push(item);
      this.toast(`装备 ${SLOT_LABEL[item.slot]} → ${item.name}`, QUALITY_COLOR[item.quality]);
    } else if (this.scoreItem(item) > this.scoreItem(cur)) {
      eq.equip(item);
      this.picked.push(item);
      inv.add(cur);
      this.toast(`替换 ${SLOT_LABEL[item.slot]} → ${item.name}`, QUALITY_COLOR[item.quality]);
    } else if (inv.add(item)) {
      this.picked.push(item);
      this.toast(`背包 +1 ${item.name}`, QUALITY_COLOR[item.quality]);
    } else {
      this.toast('背包已满，掉落未拾取', 0xf85149);
      return;
    }
    this.progression!.persist();
    this.battleFx?.playPickup(x, y);
  }

  /** 装备强度评分（含强化/词条/宝石，用于自动换装判断） */
  private scoreItem(it: InventoryItem): number {
    const c = itemStats(it, this.gemTable, STRENGTHEN_CONFIG as never);
    return (c.atk ?? 0) * 10 + (c.def ?? 0) * 8 + (c.maxHp ?? 0) + (c.critRate ?? 0) * 5;
  }

  /** BT-4.5 战斗中使用药水 */
  private useBattlePotion(kind: 'hp' | 'mp'): void {
    const now = performance.now();
    if (now < this.potionCdUntil) { this.toast('药水冷却中', 0x9aa7b3); return; }
    if (!this.progression || !this.player) return;
    const r = this.progression.usePotion(kind);
    if (!r.ok) { this.toast(r.msg, 0xf85149); return; }
    const stats = this.player.stats;
    if (r.hpHeal > 0) stats.hp = Math.min(stats.maxHp, stats.hp + r.hpHeal);
    if (r.mpHeal > 0) stats.mp = Math.min(stats.maxMp, stats.mp + r.mpHeal);
    this.potionCdUntil = now + 8000;
    this.toast(r.msg, kind === 'hp' ? 0x56d364 : 0x58a6ff);
    const f = this.player.feet;
    this.battleFx?.playPickup(f.x, f.y - 60);
  }

  /** BT-3.5 toast 改为纯数据，由 CombatHud 统一渲染（避免双重显示） */
  private toast(msg: string, color: number): void {
    this.toasts.push({ view: null as never, until: performance.now() + 2200, text: msg, color });
  }

  // ————————————————— 主循环 —————————————————

  private result: ReturnType<LevelFlow['settle']> | null = null;

  update(dtMs: number): void {
    // BT-4.5 主城面板：B 养成 / V 商店 / Esc 关闭
    if (this.flow.state === 'city') {
      if (this.game.input.wasPressed('bag')) {
        if (this.progressionPanel?.visible) this.closePanels();
        else this.openPanel('progression');
      }
      if (this.game.input.wasPressed('shop')) {
        if (this.shopPanel?.visible) this.closePanels();
        else this.openPanel('shop');
      }
      if (this.game.input.wasPressed('service')) {
        if (this.servicePanel?.visible) this.closePanels();
        else this.openPanel('service');
      }
      if (this.anyPanelVisible()) {
        const code = this.rawKeyEvent();
        if (code) {
          this.progressionPanel?.handleKey(code);
          this.shopPanel?.handleKey(code);
        }
        this.progressionPanel?.update(dtMs);
        this.shopPanel?.update(dtMs);
        return; // 面板打开时暂停世界
      }
    }
    if (this.flow.state !== 'battle' || !this.player || !this.director || !this.camera || !this.pool) return;

    // BT-4.5 战斗药水（Q/E，共用 CD 8s）
    if (this.game.input.wasPressed('potionHp')) this.useBattlePotion('hp');
    if (this.game.input.wasPressed('potionMp')) this.useBattlePotion('mp');

    // 调试热键
    if (this.rawKeys.has('F1') && !this.rawSeen.has('F1')) { this.rawSeen.add('F1'); this.godMode = !this.godMode; this.toast(`无敌 ${this.godMode ? 'ON' : 'OFF'}`, 0xffd257); }
    if (this.rawKeys.has('F2') && !this.rawSeen.has('F2')) {
      this.rawSeen.add('F2');
      for (let i = 0; i < 8; i++) this.spawnSmall('monkey_soldier', 1300 + i * 60);
      this.toast('增援 8 只', 0xf85149);
    }

    if (this.game.input.wasPressed('pause')) { this.togglePause(); return; }
    if (this.paused) return;

    // BT-6.1 宠物跟随与攻击
    if (this.petView && this.player) {
      const activePetId = this.save.pets.active;
      if (activePetId) {
        const petDef = getPet(activePetId);
        this.petView.update(dtMs, this.player.feet.x, this.player.feet.y, this.player.facing);
        if (petDef.kind === 'attacker' && this.pool) {
          const targets = [
            ...this.enemies.filter((e) => e.alive).map((e) => ({ x: e.feet.x, y: e.feet.y - 30, alive: true })),
            ...(this.boss && this.boss.alive ? [{ x: this.boss.feet.x, y: this.boss.feet.y - 40, alive: true }] : []),
          ];
          const step = petAttackStep(this.petFireCdUntil, performance.now(), this.player.feet.x, this.player.feet.y, targets, petDef.damageMul ?? 0.5);
          this.petFireCdUntil = step.cdUntil;
          if (step.fired && this.player) {
            const pv = this.petView.view;
            const dx = (step.x ?? 0) - pv.x, dy = (step.y ?? 0) - pv.y;
            const len = Math.hypot(dx, dy) || 1;
            this.pool.fireFree(pv.x, pv.y, (dx / len) * 480, (dy / len) * 480, (t) => {
              const info = buildDamageInfo(
                this.player!.stats,
                { def: t.armor.def, level: t.armor.level },
                petDef.damageMul ?? 0.5,
                getConfig.formula(),
                { fromX: pv.x, knockbackX: 40, hitstopMs: 20 },
              );
              t.takeDamage(info);
              this.game.events.emit('damage', { target: t, info });
            }, (box) => {
              const out: Damageable[] = this.enemies.filter((e) => e.alive && overlaps(box, e.hitbox));
              if (this.boss && this.boss.alive && overlaps(box, this.boss.hitbox)) out.push(this.boss);
              return out;
            });
          }
        }
      }
    }

    // BT-4.5 药水快捷栏
    this.hotbar?.update(this.hotbarModel(), dtMs);

    // 编排推进
    this.director.update();
    if (this.director.status === 'cleared') { this.finishLevel(); return; }

    // 实体更新
    this.player.update(dtMs);
    this.player.body.x = Math.max(0, Math.min(this.worldW - this.player.body.w, this.player.body.x));
    for (const e of this.enemies) e.update(dtMs);
    this.boss?.update(dtMs);
    this.pool.update(dtMs);
    this.camera.followX(this.player.feet.x);
    // BT-2：视差层跟着相机偏移 + 天气粒子推进
    this.env?.applyParallax(this.world.x);
    this.env?.update(dtMs);

    // 掉落生成 → 拾取
    this.handleDeaths();
    this.updateLoot(dtMs);

    // 清理死亡小怪（保留 0.5s 死亡动画）
    this.enemies = this.enemies.filter((e) => {
      if (e.alive) return true;
      const deadAt = (e as unknown as { deathAt?: number }).deathAt ?? 0;
      if (performance.now() - deadAt > 500) { e.destroy(); return false; }
      return true;
    });

    // 表现层
    this.battleFx?.update(dtMs);

    // 死亡判定
    if (!this.player.alive && !this.godMode) {
      this.director.fail();
      this.flow.fail();
      writeSave(this.save);
      this.cleanupBattle();
      this.renderMenu();
      return;
    }

    // Toast 生命期（HUD 负责渲染，这里只清理过期数据）
    const now = performance.now();
    this.toasts = this.toasts.filter((t) => now < t.until);
    // 连击超时断连（3 秒无命中）
    if (this.comboCount > 0 && now - this.lastComboAt > 3000) this.comboCount = 0;

    // BT-3.5 战斗 HUD（每帧喂模型）
    this.combatHud?.update(this.buildHudModel(), dtMs);
  }

  private togglePause(): void {
    if (this.flow.state !== 'battle') return;
    this.paused = !this.paused;
    if (this.paused) this.renderPause();
    else this.ui.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private finishLevel(): void {
    const lv = this.flow.currentLevel!;
    this.result = this.flow.settle(this.save);
    // BT-5.4 记录该关最高通关难度
    if (!this.save.clearedDiff) this.save.clearedDiff = {};
    const prev = this.save.clearedDiff[lv.id];
    if (!prev || difficultyRank(this.difficultyId) > difficultyRank(prev)) {
      this.save.clearedDiff[lv.id] = this.difficultyId;
    }
    // BT-6 生涯统计：通关次数 + 日常进度
    this.save.lifeStats.levelsCleared = (this.save.lifeStats.levelsCleared ?? 0) + 1;
    if (this.save.daily.date === todayKey()) this.save.daily.progress.today_levels = (this.save.daily.progress.today_levels ?? 0) + 1;
    // BT-4.5 每升 1 级奖励 1 技能点
    if (this.result.levelUps > 0 && this.progression) {
      this.progression.skillTree.grant(this.result.levelUps);
      this.progression.persist();
    }
    // 用真实拾取列表替换结算面板的展示（更准确）
    this.result.drops = this.picked.map((p) => `${p.name}(${QUALITY_LABEL[p.quality]})`);
    writeSave(this.save);
    this.cleanupBattle();
    this.renderMenu();
    void lv;
  }

  destroy(): void {
    this.listeners.forEach((f) => f());
    this.detachFx?.();
    writeSave(this.save);
    super.destroy();
  }
}
