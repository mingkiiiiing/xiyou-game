# TASK-E 装备与成长系统

**状态：🚧 进行中（2026-09-12 领取）**

负责目录：`src/item/` + 演示 `src/scenes/demos/taskE.ts`（sceneKey='taskE'）
前置：TASK-A 已完成。数据：`src/config/items.json`、`strengthen.json`（只读 import；表内容以任务D为准，先用现有样例）

## 目标

打通造梦核心养成闭环：**打怪掉装 → 穿戴变强 → 强化/宝石进一步提升**，属性聚合必须纯净可测。

## 任务清单

1. `DropResolver`：输入 drops 表（+品质权重）→ 产出装备实例（品质 roll + 词条 roll，词条池可配置）
2. `Inventory`：背包数据 + 容量上限 + add/remove/sort；`Equipment`：5 槽位（weapon/head/body/shoes/accessory）穿戴校验与换装
3. 属性聚合 `recalcStats(base, equipment, gems, strengthen)`：**纯函数**，基础+装备+强化+宝石 → `BattleStats`
4. 强化：消耗材料 + 成功率表（`config/strengthen.json`），v1 失败不掉级
5. 宝石：3 级宝石体系、镶嵌/摘除、每件装备 3 孔
6. 灰盒 UI：背包格子 / 装备栏 / 强化面板（纯 Graphics+Text，鼠标点击交互；事件用 DOM click → 坐标映射或 pixi eventPointers 均可）

## 使用契约

`ItemDef / BattleStats / Damageable(不需要)`；`InventoryItem / EquipmentSlot / GemDef` 等新类型在本模块定义。

## 验收标准

- `?scene=taskE`：点「模拟掉落」出装备 → 穿戴 → 数值变化 → 强化成功 → 镶宝石，全链路可演示
- 属性聚合单元测试：`npx tsx src/item/test.ts`（自写断言，输出 ✓/✗，exit code 正确）
- `npx tsc --noEmit` 对本目录零错误
- 禁止事项：改 core/ shared/ battle/ enemy/ config/；禁止 npm install

## 完成报告（2026-09-12，并行agent完成，主会话验收）
- agent 交付 `src/item/` 全套 11 文件：rng/dropResolver/inventory/equipment/strengthen/gems/stats(recalcStats 纯函数)/data/index/test + `src/scenes/demos/taskE.ts`
- 主会话验收：`npx tsx src/item/test.ts` 81/81 通过；tsc 零错误；掉落→穿戴→强化→宝石全链路可演示
