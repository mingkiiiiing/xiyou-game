# BIGTASK-3 战斗系统深化

**状态：🚧 进行中（2026-09-12）**

大任务目标：把战斗从"能打"提升到**有深度、有手感、有反馈**——对标造梦4的动作核心：
闪避翻滚、韧性硬直、技能成长、连招指令、怪物行为多样化。

验收总标准：
1. 闪避翻滚有**无敌帧**且能取消攻击后摇（手感核心）
2. 韧性系统：敌人积累破韧 → 长硬直；Boss 特定招式带**霸体**不被打断
3. 技能可升级（等级影响伤害/耗蓝/CD），升级消耗技能点
4. 至少 6 种新怪物行为（冲锋/跳扑/护盾/召唤/散射/撤退回复）配置化接入
5. 战斗 HUD 完整：技能栏（含等级与 CD）、闪避 CD、连击评级、Boss 阶段条
6. `npm run verify` 全绿 + 新增战斗专项测试全绿
7. **`npm run frame` 能渲染出战斗画面 PNG**（无浏览器环境下的视觉联调手段）

---

## 子任务分解

| 编号 | 子任务 | 角色 | 负责文件 | 依赖 | 并行 |
|---|---|---|---|---|---|
| BT-3.1 | 闪避翻滚 + 移动手感精修 | 战斗程序 | `battle/PlayerFighter.ts` | — | 关键路径 |
| BT-3.2 | 韧性/硬直/霸体系统 | 战斗程序 | `battle/PlayerFighter.ts`、`enemy/EnemyBase.ts`、`game/damage.ts` | 3.1 | 关键路径 |
| BT-3.3 | 技能升级 + 连招指令 | 玩法程序/数值 | `config/skills.json`、`battle/skillTree.ts`、`item/bridge.ts` | 3.2 | 关键路径 |
| BT-3.4 | 怪物 AI 行为库扩充 | 战斗程序（agent） | `enemy/behaviors.ts`、`enemy/Enemy.ts`、`config/monsters.json` | — | ✅ 并行 |
| BT-3.5 | 战斗 HUD 强化 | UI/UX（agent） | `ui/CombatHud.ts`（新建） | 接口冻结 | ✅ 并行 |
| BT-3.6 | 战斗场景合成器（视觉联调） | 主程 | `scripts/render-frame.ts` | 3.1~3.5 | 收尾 |
| BT-3.7 | 战斗专项测试 + 压测扩展 | 测试 QA | `scripts/smoke-test.ts`（扩展）、`docs/测试报告.md` | 3.1~3.4 | 收尾 |

---

## BT-3.1 闪避翻滚 + 移动手感精修

**产出**：`PlayerFighter` 新增 `dodge` 状态
- 触发：`L` 键（或 Shift）；地面可翻滚，方向取当前输入（无输入则朝朝向）
- 无敌帧：翻滚前 60% 时长无敌（`invincibleUntil` 复用）
- CD 1.2s，翻滚距离约 180px，翻滚中不可转向
- **可取消攻击后摇**（`lockUntil` 期间按闪避立即中断 → 这是"感觉爽"的关键）
- 翻滚结束有小硬直（避免无限翻滚）
- 手感精修：落地轻微压扁、起步加速曲线

## BT-3.2 韧性/硬直/霸体

**产出**
- `EnemyBase` 增加 `poise`（韧性值）与 `poiseMax`；受击扣韧，归零 → `stagger` 状态（长硬直 900ms，期间吃全额伤害）
- 韧性随时间恢复（如 3/s），Boss 恢复更快
- **霸体（super armor）**：`Boss` 在冲撞/拍击等前摇与释放期间不进入 hurt/stagger（仅掉血）
- 玩家受击硬直保持，但**翻滚的无敌帧可规避**
- 破韧时给明显表现：闪白 + 顿帧加强 + 音效（音效走 vfx/AudioManager）
- 新增伤害事件字段：`poiseDamage`、`brokePoise`（扩展 `DamageInfo`，主会话合并进 shared/types）

## BT-3.3 技能升级 + 连招指令

**产出**
- `config/skills.json` 每个技能增加 `levels: [{damageMul, mpCost, cdMs}]`（5 级）
- `battle/skillTree.ts`：技能等级管理（升级消耗技能点、等级上限、当前等级生效数值）
- 技能点来源：升级获得（`meta/save.ts` 扩展 `skillPoints`，与现有存档兼容）
- **连招指令**（配置化 `battle/comboCommands.ts`）：
  - `下 + 攻击` = 下段扫击（打低位）
  - `跳跃中 + 攻击` = 空中下劈
  - `冲刺中 + 攻击` = 突进斩
- `item/bridge.ts` 扩展：技能等级参与伤害计算

## BT-3.4 怪物 AI 行为库扩充（agent）

**产出**：`enemy/behaviors.ts` + `Enemy` 支持配置化行为
- 行为池（至少 6 种新行为）：`charge`(冲锋) / `leap`(跳跃扑击) / `shield`(举盾减伤) / `summon`(召唤小怪) / `fanShot`(扇形散射) / `retreat`(后撤退回血)
- `monsters.json` 每个怪物可配 `behaviors: string[]`，`Enemy` 按配置选择
- 保持既有 id 与数值不变（只加字段）
- 既有近战/远程行为作为默认，不配置时行为不变（向后兼容）

## BT-3.5 战斗 HUD 强化（agent）

**产出**：`src/ui/CombatHud.ts`，接口冻结为：
```ts
export interface HudSkill { id: string; name: string; level: number; cdRemainMs: number; cdTotalMs: number; mpCost: number; ready: boolean; }
export interface CombatHudModel {
  hp: number; maxHp: number; mp: number; maxMp: number;
  playerLevel: number; exp: number; expNeeded: number;
  skills: HudSkill[];
  dodge: { cdRemainMs: number; cdTotalMs: number };
  combo: number; comboRank: string;
  boss: { name: string; hp: number; maxHp: number; phase: number; phaseMarks: number[] } | null;
  progressText: string; lootCount: number; pickedCount: number;
  godMode: boolean;
  toasts: { text: string; color: number; remainMs: number }[];
}
export class CombatHud {
  readonly view: import('pixi.js').Container;
  constructor(game: Game);
  update(model: CombatHudModel, dtMs: number): void;
  destroy(): void;
}
```
- 视觉：血/蓝条（带白色缓冲）、技能栏（图标+等级角标+CD 扇形遮罩+就绪高亮）、闪避图标、连击数与评级、Boss 顶部条（阶段刻度）、拾取提示 toast
- 复用 `art/ui.ts` 的组件与 `art/theme.ts` 令牌

## BT-3.6 战斗场景合成器（主程，视觉联调关键）

**背景**：环境无浏览器，无法截图。本任务用零依赖光栅化器渲染**完整战斗画面**：
- `scripts/render-frame.ts`（`npm run frame`）→ `docs/preview/battle-frame.png`
- 内容：环境主题背景（复用 `envLayerShapes`/`skyShapes`/`groundShapes`）+ 玩家 + 多个敌人 + Boss（`composeCharacter`）+ 特效粒子示意 + HUD 条
- 用途：验证**尺度关系、构图、可读性、配色和谐**——这些是纯造型联络表看不到的

## BT-3.7 测试

- `smoke-test.ts` 扩展：闪避无敌帧判定、破韧阈值、霸体不吃硬直、技能升级数值、连招指令映射
- `stress-test.ts` 扩展：100 怪 + 韧性计算 + 行为 AI 的逻辑帧开销
- `docs/测试报告.md` 追加 BT-3 章节

---

## 收尾流程

1. **审查**：逐子任务核对产出与验收标准
2. **联调**：`npm run frame` 生成战斗画面并**用 Read 实际查看**；`npm run verify` 不回归
3. **压力测试**：`npm run stress`
4. **修复问题**：记录并修复
5. **更新任务卡** + 完成报告

## 完成报告（待填）

---

# 完成报告（2026-09-12）

**状态：✅ 已完成** — 闪避/韧性/技能成长/行为库/HUD 全部落地，全量回归通过。

## 子任务交付

| 编号 | 交付 | 执行 | 结果 |
|---|---|---|---|
| BT-3.1 | 闪避翻滚（`PlayerFighter` 的 `dodge` 状态、无敌帧、**可取消攻击后摇**、收招硬直） | 主会话 | ✅ |
| BT-3.2 | 韧性/硬直/霸体（`EnemyBase.poise` + `staggerUntil` + `superArmor`；Boss 前摇与冲锋霸体） | 主会话 | ✅ |
| BT-3.3 | 技能升级（`config/skills.json` 每技能 5 级 + `battle/skillTree.ts`）+ 连招指令（`battle/comboCommands.ts`） | 主会话 | ✅ |
| BT-3.4 | 行为库 `enemy/behaviors.ts`（charge/leap/shield/summon/fanShot/retreat）+ 11 怪全部配置 | 主会话（agent 因会话中断未产出） | ✅ |
| BT-3.5 | 战斗 HUD `art/CombatHud.ts`（血条缓冲/技能栏等级角标+CD遮罩/闪避格/连击评级/Boss阶段条/toast） | 主会话（agent 因会话中断未产出） | ✅ |
| BT-3.6 | 战斗场景合成器 `scripts/render-frame.ts`（`npm run frame`） | 主会话 | ✅ |
| BT-3.7 | 战斗专项测试 `scripts/combat-test.ts`（49 项）+ 压力测试扩展（场景6） | 主会话 | ✅ |

## 新增操作

| 按键 | 动作 |
|---|---|
| `L` / `Shift` | **闪避翻滚**（前 60% 无敌；可取消攻击后摇） |
| `S` / `↓` + `J` | 下段扫击 |
| 空中 + `J` | 空中下劈 |
| 移动中 + `J` | 突进斩 |

## 验证结果

| 项目 | 结果 |
|---|---|
| `npx tsc --noEmit` | ✅ 零错误 |
| `npm run build` | ✅ 成功（443.77 kB / gzip 142.03 kB） |
| `npm run verify` | ✅ 全绿（数据 + 装备 81 + **战斗专项 49** + 冒烟 78 + 压力 + 美术覆盖率） |
| `npm run frame` | ✅ 生成战斗画面 `docs/preview/battle-frame.png`（354 形状） |

**新增压力测试（场景6）**
- 伤害+韧性计算 100,000 次 / 13.7ms → 0.000137 ms/次
- **100 怪行为 AI 单帧：p50 0.021ms · p95 0.043ms**（占 60fps 预算 0.3%）
- 技能等级解析 20,000 次 / 8.9ms → 0.00044 ms/次

## 主会话修复的问题（战斗画面合成器发现）

| # | 问题 | 修复 |
|---|---|---|
| 1 | 森林层树高远超角色，角色"陷在树丛里"，战斗主体不突出 | 森林带压矮至 64px 高并贴地（树顶不高于角色头顶） |
| 2 | 山脊层过深过尖，像黑色尖刺压住画面中部 | 改用"空气透视"：颜色向天空靠拢、坡度平缓、层高降低 |

> 这两个问题**只有把完整场景合成出来才看得见**——纯造型联络表无法发现。这正是 BT-3.6 的价值。

## 遗留问题（转 BT-4/BT-5）

1. **浏览器实跑仍未完成**（环境 `browser guest not attached` 持续不可用）。战斗"手感"（翻滚时机、破韧节奏、霸体公平性）**只能由真人实机确认**，这是本任务最大的验证缺口
2. 技能树已实现但**尚无升级 UI**（技能点来源：存档 `skillPoints` 未接线；当前 `MainGameScene` 用固定 3 点）——建议 BT-4 做正式养成界面时接入
3. Boss 阶段转换仍缺演出（镜头/停顿/特效），BT-5 补
4. 行为库的 `leap` 在 Enemy（无重力物理）上是"标记式跳跃"，位移表现有限；接入真实物理后可增强
5. `fanShot` 弹幕使用固定 0.9 倍率（弹幕伤害可配置化留待 BT-4）
