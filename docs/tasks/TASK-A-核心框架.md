# TASK-A 核心框架（游戏循环/场景/实体/物理/输入/相机）

**状态：✅ 已完成（2026-09-12，主会话交付，即 M0）**

负责目录：`src/core/`、`src/scenes/`、`index.html`、`package.json`、`tsconfig.json`、`scripts/`

## 已交付

- `Game`：1280×720 渲染循环 + 全局顿帧 `game.hitstop(ms)`（打击感核心）
- `SceneManager` / `Scene`：场景切换与生命周期
- `Entity`：实体基类（脚底中心锚点、朝向、视图同步）
- `Physics.moveAndCollide`：分轴 AABB 平台碰撞 + `overlaps`
- `Input`：动作映射（A/D 移动、W/K 跳、J 普攻、U/I/O 技能）
- `Camera.followX`：横向跟随并夹在世界边界
- `EventBus`：类型化事件总线（damage / enemy-died / level-complete）
- `BattleScene` 灰盒参考关：移动/二段跳/三连普攻/3 技能/木桩/飘字/HUD
- `shared/types.ts` 全部公共契约 + `config/*.json` 首批数据表
- 演示场景自动发现机制（`?scene=key`，见 docs/01 协作规则 4）

## 已知简化（后续跟进列表）

- 无贴图/动画渲染层（全色块）、无资源加载管道 → 需要时由本任务追加
- 物理无扫掠、无斜坡、无单向平台
- 无对象池（大量弹幕时由任务C自行加池）
- 伤害公式硬编码于 `Player.update`（标注 TODO(D)）→ **集成阶段**由主会话切到任务D的 ConfigLoader

## 冻结声明

并行冲刺期间 `src/core/`、`src/shared/`、`BattleScene`、`entities/` 冻结；发现框架缺陷时在**自己的任务卡**「完成报告」里记录，集成阶段统一处理。
