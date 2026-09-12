# TASK-C 敌人 AI 与 Boss

**状态：🚧 进行中（2026-09-12 领取）**

负责目录：`src/enemy/` + 演示 `src/scenes/demos/taskC.ts`（sceneKey='taskC'）
前置：TASK-A 已完成。怪物数据：`src/config/monsters.json`（只读 import）

## 目标

交付造梦式的敌人体感：小怪会打人会掉落，Boss 有阶段、有前摇预警、有弹幕。

## 任务清单

1. `EnemyBase`：复用 Entity，灰盒血条、受击闪白/击退、死亡（色块爆裂占位）+ 发 `enemy-died` 事件
2. 近战 AI 状态机：patrol（到边缘转身）→ chase（视野 500px 内追击）→ attack（前摇 400ms 变色预警 → 判定框）→ hurt → die
3. 远程 AI：与目标保持 300~500 距离，直线/抛物线弹道，弹幕用简单对象池
4. Boss 框架：按血量阶段切换（100%→60%→30%），每阶段一组技能，全部配置化（`BossDef` 本模块定义）；前摇预警用地面红条/色块闪烁；至少实现 4 招：冲撞 / 范围拍击 / 召唤小怪 / 全屏弹幕
5. `Spawner` 刷怪器：读 `WaveDef[]` 定时刷怪（为任务F关卡流程准备）
6. 测试目标：做 1 个不可动的「稻草人」`Damageable` 代替玩家，让敌人能攻击它

## 使用契约

`Damageable / DamageInfo / HitboxDef / MonsterDef / WaveDef / Box`；命中查询自己实现（演示场景内写 HitQuery 同款闭包）。

## 验收标准

- `?scene=taskC`：一波 3 近战 + 2 远程 + 1 个两阶段 Boss（可被打死、会打死稻草人、会掉 `enemy-died` 事件）
- `npx tsc --noEmit` 对本目录零错误
- 禁止事项：改 core/ shared/ battle/ scenes/entities/（可只读 import）；禁止 npm install

## 完成报告（2026-09-12，主会话代并行agent执行）
- 新增 `src/enemy/`：EnemyBase(血条/闪白/击退/死亡爆裂/公式出手)、Enemy(近战追击+前摇预警 / 远程保持距离+弹道)、ProjectilePool(对象池弹幕)、Boss(三阶段：冲撞/拍击/召唤/全屏弹环，前摇红色预警条)、Spawner(波次刷怪器)、Scarecrow(稻草人替身)
- 新增 `src/scenes/demos/taskC.ts`（?scene=taskC，按 J 模拟玩家攻击可击杀 Boss）
- 验收：tsc 零错误
