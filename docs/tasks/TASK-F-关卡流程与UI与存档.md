# TASK-F 关卡流程 · UI · 存档

**状态：🚧 进行中（2026-09-12 领取）**

负责目录：`src/meta/` + 演示 `src/scenes/demos/taskF.ts`（sceneKey='taskF'）
前置：TASK-A 已完成。数据：`src/config/levels.json`（只读 import）

## 目标

搭起游戏的"骨架流程"：主城 → 选关 → 战斗 → 结算 → 存档，让 M1 能以完整流程被玩到。

## 任务清单

1. `SaveData` schema + localStorage 封装：玩家等级经验/背包/装备/关卡进度/设置，带版本号字段（为迁移预留），损坏时安全回退默认档
2. 关卡流程状态机：`enter → wave(逐波刷) → boss → clear → 结算面板(用时/评级/掉落列表)`；失败 → 重试/回城
3. 关卡选择 UI（灰盒）：章节-关卡列表、推荐等级、三星条件占位、锁定态
4. 战斗 HUD：血条蓝条（带白色缓冲条）、技能 CD 圆环或进度条、连击计数、Boss 血条（顶部大条带阶段刻度）
5. 主城占位（色块+按钮：开始冒险/角色/背包）与暂停菜单（继续/重开/回城/键位说明）

## 使用契约

`LevelDef / WaveDef / BattleStats`；`SaveData / LevelState / HudModel` 等新类型本模块定义。战斗演示可直接 import M0 的 `Player/Dummy`（只读）或用色块假人。

## 验收标准

- `?scene=taskF`：主城 → 选关 1-1 → 波次战斗 → Boss → 结算 → 存档；**刷新页面进度保留**；清档按钮可用
- `npx tsc --noEmit` 对本目录零错误
- 禁止事项：改 core/ shared/ enemy/ item/ config/；禁止 npm install

## 完成报告（2026-09-12，主会话执行）
- 新增 `src/meta/save.ts`（localStorage v1 版本号/损坏回退/经验升级曲线/清档）、`src/meta/levelFlow.ts`（city→select→battle→settle/fail 状态机、解锁规则、评级与掉落结算）
- 新增 `src/scenes/demos/taskF.ts`（?scene=taskF）：主城/选关(锁定态)/战斗(接 M0 Player + C 的 Enemy/Boss/Spawner)/结算(评级/经验/掉落)/失败重试/Esc 暂停菜单；血蓝条带白色缓冲条、技能CD槽、Boss顶部血条带阶段刻度；刷新页面进度保留
- 验收：tsc 零错误
