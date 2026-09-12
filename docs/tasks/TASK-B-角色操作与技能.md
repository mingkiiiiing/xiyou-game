# TASK-B 角色操作与技能系统

**状态：🚧 进行中（2026-09-12 领取）**

负责目录：`src/battle/` + 演示 `src/scenes/demos/taskB.ts`（sceneKey='taskB'）
前置：TASK-A 已完成。参考实现：`src/scenes/entities/Player.ts`（只读参考，禁止修改）

## 目标

把 M0 灰盒 Player 升级为**完整、可配置、手感优秀**的战斗角色，对标造梦西游悟空的操作体验。

## 任务清单

1. 有限状态机：idle / run / jump / fall / attack1~3 / skill / hurt / invincible；动画占位用色块缩放闪烁即可
2. 连段系统：输入缓冲（当前攻击中提前按攻击键则结束后自动接下一段）、连击窗口 900ms、第三段击退+顿帧加强
3. 技能组件 `SkillCaster`：读 `SkillDef[]`（CD/耗蓝/倍率/判定框/位移），支持空中释放
4. 手感四件套：`game.hitstop()` 顿帧、受击闪白、击退速度衰减、落地色块尘土占位
5. 平台跳跃手感：土狼时间 80ms、跳跃缓冲 100ms、可变跳跃高度（松开跳键截断上升）
6. 受击表现：无敌帧 600ms、受击硬直 250ms、大伤害倒地与起身

## 使用契约

从 `src/shared/types.ts` import：`BattleStats / SkillDef / HitboxDef / DamageInfo / Damageable / HitQuery / Box`；需要新类型先在本模块定义（集成时合并）。

## 验收标准

- `?scene=taskB`：完整操作 + 三连段 + 3 技能打 3 个木桩，手感明显优于 `?scene=battle`
- `npx tsc --noEmit` 对本目录零错误
- 禁止事项：改 core/ shared/ enemy/ item/ scenes/entities/（可只读 import Player/Dummy 做对比测试）；数值硬编码仅限 demo 内且标 `TODO(D)`

## 完成报告（2026-09-12，主会话代并行agent执行）
- 新增 `src/battle/PlayerFighter.ts`：状态机(idle/run/jump/fall/attack1~3/skill/hurt/invincible)、输入缓冲连段、技能组件、土狼时间/跳跃缓冲/可变跳高、无敌帧、落地尘土
- 新增 `src/scenes/demos/taskB.ts`（?scene=taskB）
- 验收：tsc 零错误；伤害公式已接 ConfigLoader（无硬编码遗留）
