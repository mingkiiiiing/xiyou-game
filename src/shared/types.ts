/**
 * 公共接口契约 —— 所有并行任务的唯一通信面。
 * 规则：并行冲刺期间任何任务不得修改本文件；需要新类型先在自己模块内定义，集成时由主会话合并。
 */

/** 轴对齐包围盒（世界坐标，x/y 为左上角） */
export interface Box { x: number; y: number; w: number; h: number; }

/** 战斗属性（数值来源见 docs/02-数值与数据表设计.md，由任务D维护 config 表） */
export interface BattleStats {
  hp: number; maxHp: number;
  mp: number; maxMp: number;
  atk: number; def: number;
  critRate: number;  // 百分数，5 = 5%
  critDmg: number;   // 百分数，150 = 1.5 倍
  moveSpeed: number; // px/s
}

/** 一次伤害事件（攻击方构造，受击方消费，飘字/音频/特效订阅） */
export interface DamageInfo {
  amount: number;
  isCrit: boolean;
  fromX: number;      // 攻击者脚底 x（决定击退方向）
  knockbackX: number; // 击退初速度
  hitstopMs: number;  // 顿帧时长
  /** BT-3.2 韧性伤害（重击破韧更多；省略时受击方按 amount 折算） */
  poiseDamage?: number;
  /** BT-3.2 本次是否击破韧性（受击方填充，供表现层播强反馈） */
  brokePoise?: boolean;
}

/**
 * 攻击判定框：offsetX/offsetY 相对持有者「脚底中心」，offsetY 向上为负；
 * facing=-1 时 offsetX 自动镜像。delayMs 后生效，持续 activeMs。
 */
export interface HitboxDef { w: number; h: number; offsetX: number; offsetY: number; delayMs: number; activeMs: number; }

/** 技能定义（任务D维护 config/skills.json，任务B消费） */
export interface SkillDef {
  id: string; name: string;
  cdMs: number; mpCost: number;
  damageMul: number;  // 倍率，× atk
  hitbox: HitboxDef;
  dashSpeed?: number; // 释放时的位移速度
  vfxKey?: string;    // 任务G特效 key（预留）
  /** BT-5 归属角色（缺省=灵猴可用；按角色过滤技能表） */
  charId?: string;
}

/** 可受击实体（玩家/怪物都实现） */
export interface Damageable {
  /** M0 简化：防御与等级参与伤害公式，正式化在集成阶段进行 */
  armor: { def: number; level: number };
  takeDamage(info: DamageInfo): void;
  get hitbox(): Box; // 世界坐标
  get alive(): boolean;
}

/** 攻击方查询场景内可受击目标的回调（由场景注入） */
export type HitQuery = (box: Box) => Damageable[];

/** 小怪定义（任务C/D） */
export interface MonsterDef {
  id: string; name: string; level: number;
  stats: { hp: number; atk: number; def: number; moveSpeed: number };
  aiType: 'melee' | 'ranged' | 'boss';
  attack: { damageMul: number; range: number; cooldownMs: number };
  drops: { itemId: string; chance: number }[];
}

/** 装备定义（任务E/D） */
export interface ItemDef {
  id: string; name: string;
  slot: 'weapon' | 'head' | 'body' | 'shoes' | 'accessory';
  quality: 'white' | 'green' | 'blue' | 'purple' | 'orange' | 'red';
  baseStats: Partial<Record<'atk' | 'def' | 'maxHp' | 'maxMp', number>>;
}

/** 关卡定义（任务F/D） */
export interface WaveDef { monsterId: string; count: number; intervalMs: number; }
export interface LevelDef {
  id: string; chapter: number; name: string; recLevel: number;
  waves: WaveDef[];
  bossId: string | null;
  /** BT-5 关卡世界宽度（默认 2400；长关卡 3000~4800） */
  worldW?: number;
}

/** 全局事件（扩充需走集成合并） */
export interface GameEvents {
  damage: { target: Damageable; info: DamageInfo };
  'enemy-died': { id: string };
  'level-complete': { levelId: string };
  /** BT-5 Boss 阶段切换（表现层播演出） */
  'boss-phase': { name: string; phase: number; x: number; y: number };
}
