# TASK-D 数值与数据表

**状态：🚧 进行中（2026-09-12 领取）**

负责目录：`src/data/`、`src/config/`、`scripts/validate-config.ts`
前置：TASK-A 已完成。规格书：`docs/02-数值与数据表设计.md`（严格按它做）

## 目标

把"数值即配置"落到实处：全部表 + schema 校验 + 统一加载入口，让其他任务的数值来源可追溯可调参。

## 任务清单

1. 按规格书第 4 节补全/扩展全部数据表：monsters（至少 5 种小怪）、skills（3 技能）、items（30 件白→蓝装备）、strengthen、gems、levels（1-1 与 1-2 两关）、formula、player（含每级成长率）
2. `src/data/schemas.ts`：手写类型守卫（零依赖，不装 zod），每张表一个 `validateXxx`
3. `src/data/ConfigLoader.ts`：同步 import 全部表 → 校验 → 通过 getter 暴露（`getSkill(id)` / `getMonster(id)` / `getLevel(id)` / `getItemsByLevel(lv)` 等）
4. `scripts/validate-config.ts` 升级为全表校验：id 唯一、外键引用完整（drops→items、waves→monsters、bossId→monsters）、数值范围合理
5. 平衡 sanity：按规格书第 5 节锚点调平数值，把「Lv1~50 战力曲线核对表」追加到 docs/02 附录（只允许改 docs/02 的附录部分）

## 使用契约

新增类型一律定义在 `src/data/schemas.ts`；**不得修改** `src/shared/types.ts`（集成时由主会话对齐）。现有表可扩充但保持已有 id 不变（B/C/E/F 正在引用它们）。

## 验收标准

- `npm run check-data` 全绿
- `?scene=taskD`（可选）：演示 ConfigLoader 读取并展示几张表的关键内容
- `npx tsc --noEmit` 对本目录零错误
- 集成（主会话做，非本任务）：把 Player/BattleScene 的硬编码数值切到 ConfigLoader

## 完成报告（2026-09-12，主会话执行）
- 扩充 `src/config/`：monsters×6(2近战+2远程+1重装+Boss)、items×30(5槽×6品质带)、gems×9(3属性×3级)、levels 1-1/1-2、player 增长率、strengthen/formula
- 新增 `src/data/schemas.ts`（零依赖校验守卫）+ `src/data/ConfigLoader.ts`（fail-fast 加载器 + playerStatsAtLevel/powerOf）
- `npm run check-data` 全绿；docs/02 附录A 战力曲线核对表已写入；Player 伤害公式已切换 ConfigLoader
