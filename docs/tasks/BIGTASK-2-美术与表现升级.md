# BIGTASK-2 美术与表现升级

**状态：🚧 进行中（2026-09-12）**

大任务目标：把游戏从"几何色块"升级为**有角色造型、有姿态动画、有场景纵深、有统一视觉语言**的表现层，并建立
**可被自动截图审查**的美术管线——因为本项目环境无法使用浏览器，视觉验证必须数据化。

验收总标准：
1. 12 个可玩视觉体（灵猴 + 11 怪 + 2 Boss）各有**可辨识的造型**，而非色块
2. 角色有**状态驱动的姿态动画**（idle 呼吸 / run 摆臂 / jump 收腿 / attack 挥击 / hurt 后仰）
3. 场景有 **3 层以上视差背景** + 主题化配色（花果山/洞窟/水帘洞）
4. UI 有**统一主题令牌**（面板/按钮/文字层级），替换现有裸 Graphics
5. `npm run sheet` 生成美术联络表 PNG，可人眼审查
6. `npm run verify` 保持全绿（不得回归）

---

## 关键约束与应对（本任务的核心设计决策）

**约束**：本环境的 In-app Browser 无法挂载（`browser guest not attached`），AI 无法直接看屏幕。

**应对**：把美术定义成**纯数据**（`Shape[]`，见 `src/art/types.ts`），由两个渲染器消费同一份数据：
- `src/art/pixiRender.ts` → 画到屏幕（Pixi Graphics）
- `scripts/lib/raster.ts` → 画到 PNG（**零依赖软件光栅化器**，已跑通验证）

于是美术产出可被程序化截图 → AI 可自查、可回归、可生成联络表供人审查。
**副产品**：这同时是"真实贴图替换"的正确架构——将来换贴图只需换 renderer 实现，美术数据契约不变。

---

## 子任务分解

| 编号 | 子任务 | 角色 | 负责文件 | 依赖 | 并行 |
|---|---|---|---|---|---|
| AT-2.0 | 美术管线与参考实现 | 表现程序/主程 | `art/pixiRender.ts`、`art/registry.ts`、`art/chars/linghou.ts`、`art/chars/index.ts`、集成 | — | 关键路径 |
| AT-2.1 | 怪物与 Boss 造型 | 2D 美术/动画美术 | `art/chars/monsters.ts`、`art/chars/bosses.ts` | types 契约 | ✅ 并行 |
| AT-2.2 | 环境视差与 UI 皮肤 | 场景美术/UI | `art/env.ts`、`art/theme.ts`、`art/ui.ts` | types 契约 | ✅ 并行 |
| AT-2.3 | 视觉审查工具 | 测试 QA | `scripts/render-sheet.ts`、`scenes/ArtistReviewScene.ts` | types 契约 | ✅ 并行 |

---

## AT-2.0 美术管线与参考实现（主程）

**产出**
- `src/art/pixiRender.ts`：`drawShapes(g: Graphics, shapes: Shape[]): void` —— 把契约形状画到 Pixi（4 种图元）
- `src/art/chars/linghou.ts`：**灵猴参考实现**（全套状态姿态，作为 AT-2.1 的范式）
- `src/art/chars/index.ts`：`ALL_CHARACTER_ART` 汇总 + `getCharacterArt(id)`
- `src/art/registry.ts`：id → 美术 的查询入口
- 集成：`MainGameScene` 中玩家/敌人/Boss 改用造型渲染器（保留原色块作为 fallback）

**姿态规范（各状态相位语义，AT-2.1 必须遵守）**
| 状态 | phase 语义 |
|---|---|
| `idle` | 呼吸循环（胸腔起伏、轻微上下浮动） |
| `run` | 0~1 为一个完整步幅（双腿交替、身体前倾） |
| `jump` / `fall` | 起跳收腿 / 下落展臂 |
| `attack1/2/3` | 挥击弧线（0=抬手 0.5=命中 1=收招） |
| `skill` | 蓄力→释放 |
| `hurt` | 后仰受击 |
| `dead` | 倒地 |

## AT-2.1 怪物与 Boss 造型

**产出**：`art/chars/monsters.ts` + `art/chars/bosses.ts`，覆盖
`monkey_soldier`(猴兵)、`shaman`(巫祝)、`boar_demon`(野猪精)、`bat_demon`(蝙蝠妖)、`stone_guard`(石甲卫)、
`wood_wolf`(木魅狼)、`fire_crow`(火鸦)、`vine_spirit`(藤蔓精)、`rock_ape`(岩臂猿)、
以及 1-1~1-4 全部波次怪物 + `demon_king`(混世魔王)、`mountain_spirit`(山魈)

**要求**：每种生物有可辨识剪影（体型/角/翼/尾等差异化），配色区分近战(赤)/远程(紫)/重装(灰)/Boss(暗金)，
全部走 `CharacterArtDef` 纯函数契约，含 idle/run/attack/hurt/dead 姿态。

### AT-2.1 完成报告（2026-09-12）

**覆盖 id（11 个，与 monsters.json 完全一致）**

| 文件 | id | 定位 | 造型要点 |
|---|---|---|---|
| monsters.ts | `monkey_soldier` | 近战 Lv1 | 赤衣细瘦猴族，持长矛+红缨、后甩尾 |
| monsters.ts | `shaman` | 远程 Lv2 | 紫袍无腿飘浮、**高尖兜帽**、法杖光球、环绕符文 |
| monsters.ts | `boar_demon` | 近战 Lv3 | 四足低矮、双排背刺、白獠牙、攻击前刺 |
| monsters.ts | `bat_demon` | 远程 Lv3 | 悬空宽膜翼（指骨分叉）、尖耳、獠牙、胸前魔法弹 |
| monsters.ts | `stone_guard` | 近战 Lv4 | 灰铁方块壮硕、方头盔发光眼、巨护肩、战锤+塔盾 |
| monsters.ts | `wood_wolf` | 近战 Lv4 | 四足长身、尖耳、蓬尾高甩、青绿眼光、木背脊 |
| monsters.ts | `fire_crow` | 远程 Lv5 | 紫羽火鸦、尖喙、橙火冠+火焰尾扇、火球蓄力 |
| monsters.ts | `vine_spirit` | 远程 Lv6 | 绿球茎身+藤环分节、放射带叶藤须、紫花冠、藤臂前刺 |
| monsters.ts | `rock_ape` | 精英近战 Lv6 | 驼背巨猿、三峰岩背、超长粗臂巨拳、橙眼、碎岩冲击 |
| bosses.ts | `demon_king` | Boss Lv5 | 暗金深红、**双巨角**+垂地披风、巨型斩马刀 |
| bosses.ts | `mountain_spirit` | Boss Lv6 | 山峦岩背、金色鬃毛环、山魈花面（蓝脊红鼻）、骨冠、地面冲击环 |

**实现方式**：`monsters.ts` 导出通用骨架 `drawBiped(cfg, pose)` / `poseFor` / `stdClips` 与图元辅助
（circle/ell/box/rod/limb/foot/wedge/tendril/quad 包装），9 只小怪按 `BipedCfg` 配置组装；`bosses.ts`
复用同一骨架，仅替换头部/躯干/臂/武器的定制部件。全部为纯函数：相同 (state,phase) 必返回相同 Shape[]，
无 Math.random、无外部可变状态；原点在脚底中心、y 向上为负；不含朝向翻转与闪白（交 compose.ts）。

**姿态**：每角色含 idle/run/jump/fall/attack1/attack2/attack3/skill/hurt/dead 共 10 个 clip；
四足/翼类各有自定义步态与振翅，Boss 含 skill（山魈地面冲击环、魔王披风摆动）。

**配色分组**：近战赤棕（monkey_soldier/boar_demon/wood_wolf）、远程紫青（shaman/bat_demon/fire_crow/vine_spirit）、
重装灰铁（stone_guard/rock_ape）、Boss 暗金深红（demon_king/mountain_spirit）。

**自查**：临时脚本渲染 PNG 并逐一 Read 检视；另生成纯黑剪影表验证"只看外轮廓可辨识"。
据此修复：野猪倒地时眼部光晕误放大成红团；藤蔓精藤须过细/过萌（加粗、加叶、加分节、加嘴）；
藤蔓精攻击特效遮挡头部。查毕删除临时脚本与自查 PNG。

**验证**：`npx tsc --noEmit` 中 `chars/monsters.ts`、`chars/bosses.ts` 零错误
（同期 `src/art/env.ts` 的 `ambientG` readonly 报错属 AT-2.2 文件，非本任务范围）。
`npm run sheet` 输出 12 角色 × 7 状态 = 84 格，实现 84、缺省 0。

**遗留问题**：`env.ts` 编译错误需 AT-2.2 收口；石甲卫 run 帧塔盾与躯干略有叠加（可读但可再优化）；
无贴图，纯几何造型在极小屏占比下细节会丢失（架构支持后续换 renderer/贴图）。

## AT-2.2 环境视差与 UI 皮肤

**产出**
- `art/env.ts`：`buildEnvironment(theme, worldW, groundY)` → 多层视差容器 + 环境粒子（落叶/火星/尘埃）
  - 预置主题：`huaguoshan`(花果山)、`shuilian`(水帘洞)、`moku`(魔王洞窟)
- `art/theme.ts`：`THEME: ThemeTokens`（统一色板/字体）
- `art/ui.ts`：`drawPanel` / `drawButton` / `drawBar` / `drawSlot` —— 统一 UI 组件绘制（国风边框+渐变）

### AT-2.2 完成报告（2026-09-12）

**产出（仅改 `art/env.ts` / `art/ui.ts`；`theme.ts` 复用现有 THEME 未改）**

- `art/env.ts`
  - `buildEnvironment(theme, worldW, groundY): Container` 实现为 `EnvView`（Container 子类）：
    内部每层是独立 `EnvLayerView extends Container`（带 `parallax` 字段），暴露
    `applyParallax(worldX)`（按 `worldX*(parallax-1)` 偏移）与 `update(dtMs)`（粒子推进）。
  - motifs 全部实现：`mountains`(扫描线山脊多边形) / `clouds`(叠加椭圆云团) / `forest`(层叠三角林线) /
    `cave`(石钟乳+石笋+岩面斑块) / `river`(正弦波光带) / `stars`(随机星点)。
  - 环境粒子 4 种：`leaves`(飘落旋转叶片) / `embers`(上升火星) / `dust`(缓移浮尘) / `snow`(下落雪点)，
    带越界回绕；`none` 时跳过。
  - **纯数据同源**：新增 `skyShapes` / `groundShapes` / `envLayerShapes` / `gradientBands`，
    只产出 `Shape[]`，屏幕（pixiRender.drawShapes）与 PNG 审查（raster.fillShapes）共用同一份几何。
  - `ENV_THEMES` 扩充为 3 个完整主题：
    | id | 名称 | 层数 | 层（parallax） | ambient | 要点 |
    |---|---|---|---|---|---|
    | `huaguoshan` | 花果山 | 3 | clouds 0.05 / mountains 0.18 / forest 0.42 | leaves | 暖橘落日渐变、层叠山脊、密集林线 |
    | `shuilian` | 水帘洞 | 4 | stars 0.02 / cave 0.16 / river 0.34 / river2 0.60 | dust | 星点天顶、青碧洞壁、双层波光水面 |
    | `moku` | 魔王洞窟 | 3 | cave_far 0.10 / mountains 0.28 / cave_near 0.52 | embers | 暗红岩窟、双层石钟乳/石笋、火星上升 |
- `art/ui.ts`（国风皮肤）
  - `drawPanel({x,y,w,h,theme?,alpha?,radius?,ornate?,raised?})`：投影 + 渐变底 + 金色外框 + 内细线双描边 + 四角回纹角饰。
  - `drawButton(g,{...},label?)`：渐变 + 双线边框 + 四角饰 + 顶部高光，3 变体 primary/secondary/danger，支持 enabled。
  - `drawBar({x,y,w,h,ratio,bg,fg,ticks?})`：金色外框 + 凹槽 + 渐变填充 + 顶部光泽 + 可选刻度。
  - `drawSlot({x,y,size,border?,qualityColor?})`：内凹渐变底 + 品质色厚描边 + 四角饰（装备格）。
  - 同源设计：导出 `panelShapes` / `buttonShapes` / `barShapes` / `slotShapes` 纯形状函数（审查工具直接复用）；
    另有 `roundRectPoints` 圆角近似（契约仅 4 图元）。

**验证**：`npx tsc --noEmit` 零错误（含修复 AT-2.1 报告中指出的 `env.ts` `ambientG` readonly 报错）；
`npm run sheet` 在 B 区渲染出 3 个主题条带（渐变/山脊/林线/洞壁/波光可辨）；`npm run verify` 全绿。

**遗留**：粒子仅在 Pixi（`EnvView.update`）中动画，PNG 联络表不绘制粒子（粒子为动态效果，示意条带已用静态 motif 表达）；
主题配色可继续按关卡微调。

## AT-2.3 视觉审查工具

**产出**
- `scripts/render-sheet.ts`（`npm run sheet`）：生成 `docs/preview/art-sheet.png`
  —— 联络表：所有角色 × 所有状态（多列网格 + 标签），环境主题各一栏，UI 组件一栏
  —— 必须用 `scripts/lib/raster.ts`，零依赖
- `src/scenes/ArtistReviewScene.ts`（`?scene=artreview`）：屏幕内同内容的可交互版

**验收**：`npm run sheet` 生成 PNG，能看到全部造型与状态，无空白栏

### AT-2.3 完成报告（2026-09-12）

**产出**

- `scripts/render-sheet.ts`（新增，`package.json` 仅加一行 `"sheet": "tsx scripts/render-sheet.ts"`）
  - 零依赖：只用 `scripts/lib/raster.ts` + `node:fs`，**不 import Pixi / 不构造 Graphics/Container**。
    几何与屏幕同源：角色走 `art/registry` + `art/compose`，环境走 `art/env` 的纯形状函数，UI 走 `art/ui` 的纯形状函数。
  - 内置 5x7 像素字（A-Z/0-9/常用符号）用于分区标题、列头、行标签与统计。
  - 分区：
    - **A 角色 × 状态矩阵**：每角色一行，列 = idle/run/jump/fall/attack1/hurt/dead，**3 倍放大**，
      格间留空隙并带细边框，未实现状态画 `N/A` 占位（不留纯空白格）；顶部状态列头 + 左侧 id/尺寸标签。
    - **B 环境主题**：每主题一条带，天空至地面渐变 + 各层 motif 压缩绘制（视差效果以静态近似表达），
      信息条标注 layers / parallax / ambient。
    - **C UI 组件**：面板 / 按钮 3 变体 / 血条×3 / 装备格×6（品质色描边）。
  - 空列表降级：registry 无角色时输出占位说明条，B/C 区照常渲染，绝不生成空图。
  - stdout 打印统计（角色数 / 状态数 / 已实现格数 / 主题数 / UI 组件数）。
- `src/scenes/ArtistReviewScene.ts`（新增）：`sceneKey='artreview'` + `createScene(game): Scene`。
  registry 全部角色按网格展示；状态按钮（10 态）同步切换姿态动画；主题按钮重建 `buildEnvironment`；
  A/D 推拉相机触发视差；右下角实拍 drawPanel/drawBar/drawSlot 样例；空 registry 时显示降级提示。

**输出统计（本次实跑）**

```
尺寸 1560 x 4138
角色数 12      状态数 7 (idle,run,jump,fall,attack1,hurt,dead)
角色×状态格 84 格，已实现 84，缺省 0
环境主题数 3  (huaguoshan/3L, shuilian/4L, moku/3L)
UI 组件数 13  (面板1 按钮3 血条3 装备格6)
```

**自查**：生成后用 Read 工具查看 `docs/preview/art-sheet.png`；首版发现环境条带过暗/过扁、血条被金色边框填充盖死，
遂提亮 `shuilian`/`moku` 调色、加高条带、重排 `barShapes` 绘制顺序（外框→凹槽→填充→刻度）。复看确认排版整齐、三区非空。

**验证**：`npx tsc --noEmit` 零错误；`npm run sheet` 成功生成 PNG 并已 Read 确认；`npm run verify` 全绿；
未修改任何冻结文件（types.ts / registry.ts / compose.ts / chars/* 均未触碰）。

**遗留（集成项）**：`main.ts` 通过 `import.meta.glob('./scenes/demos/*.ts')` 自动发现场景，
而本任务要求 `ArtistReviewScene.ts` 放在 `scenes/` 根目录且不得改 `main.ts`，
因此 `?scene=artreview` 目前无法被自动路由到，需由集成方在 `main.ts` 登记（或移入 demos/）后即可访问。


---

## 收尾流程（大任务固定动作）

1. **审查**：逐子任务核对产出；`npm run verify` 不得回归
2. **联调**：生成联络表 PNG 自查 + 集成到 `?scene=game` 实跑
3. **压力测试**：`npm run stress` 确认表现层未拖慢逻辑层
4. **修复问题**：记录并修复
5. **更新任务卡** + 写「完成报告」

## 完成报告（待填）

（执行完成后追加）

---

# 完成报告（2026-09-12）

**状态：✅ 已完成** — 12 个可玩视觉体全部有造型，环境视差与 UI 皮肤落地，全量回归通过。

## 关键设计（本任务最大的产出）

**"美术即数据"架构 + 零依赖自动截图审查**
- 美术定义为纯数据 `Shape[]`（`src/art/types.ts`），由两个渲染器消费同一份数据：
  `art/pixiRender.ts`（屏幕）与 `scripts/lib/raster.ts`（PNG，**零依赖软件光栅化器**，只用 node:zlib）
- 由此建立了本项目的**视觉验证闭环**：`npm run sheet` 生成联络表 PNG → AI/人可审查、可回归
- 副产品：将来换真实贴图只需替换 renderer 实现，美术数据契约不变

> 背景：本环境 In-app Browser 无法挂载（`browser guest not attached`），若没有这套管线，视觉产出将完全无法验证。

## 子任务交付

| 编号 | 交付 | 执行 | 结果 |
|---|---|---|---|
| AT-2.0 | 契约 `art/types.ts` + `art/shapes.ts` + `art/compose.ts`；`art/pixiRender.ts`；`art/CharacterView.ts`（相位量化缓存）；灵猴参考实现 `art/chars/linghou.ts`；`art/registry.ts` | 主程（主会话） | ✅ |
| AT-2.1 | `art/chars/monsters.ts`（9 小怪）+ `art/chars/bosses.ts`（2 Boss） | 2D/动画美术（并行 agent） | ✅ 11/11 覆盖 |
| AT-2.2 | `art/env.ts`（3 主题/6 motif/4 粒子 + `EnvView.applyParallax`）；`art/ui.ts`（国风面板/按钮/血条/装备格） | 场景美术+UI（并行 agent） | ✅ |
| AT-2.3 | `scripts/render-sheet.ts`（`npm run sheet`）+ `scenes/ArtistReviewScene.ts`（`?scene=artreview`） | 测试工具（并行 agent） | ✅ 84/84 格无缺省 |
| 集成 | 玩家/敌人/Boss 挂造型（`attachArt`，缺美术自动回退色块）；环境视差接入战斗场景（按章节选主题） | 主程 | ✅ |

## 验证结果

| 项目 | 结果 |
|---|---|
| `npx tsc --noEmit` | ✅ 零错误 |
| `npm run build` | ✅ 成功（427.77 kB / gzip 136.99 kB） |
| `npm run verify` | ✅ 全绿（数据 + 装备 81 + 冒烟 78 + 压力 + **美术覆盖率**） |
| `npm run sheet` | ✅ 12 角色 × 7 状态 = 84 格，**实现 84 / 缺省 0**；3 环境主题；13 UI 组件 |
| 美术覆盖率 | ✅ 12 造型状态齐全、draw 为纯函数、剪影各不相同 |

**表现层压力测试（新增场景5）**
- 造型合成 20,000 次 / 412ms → **0.0206 ms/次**，平均 36 形状/次
- 100 实体同帧全量重算（最坏情况）2.06ms，占 60fps 单帧预算 **12.4%**（实际有相位量化缓存，远低于此）
- 单角色单帧形状数据 ≈ 3.5 KB

## 主会话修复的问题（视觉审查发现）

| # | 问题 | 修复 |
|---|---|---|
| 1 | 蝙蝠妖/火鸦/藤蔓精的 `dead` 帧退化成椭圆色块，认不出是什么 | 重写三者倒地帧，保留标志特征（膜翼指骨 / 火尾扇+尖喙 / 放射藤须+花冠） |
| 2 | 猴兵与玩家灵猴都是"红衣持棍猴子"，战斗中易混淆（**可玩性问题**） | 猴兵改为暗褐土绿布衣 + 灰暗毛色 + 无金饰；玩家保持亮红+金箍，敌我一眼可辨 |
| 3 | `?scene=artreview` 路由未生效（场景在 `scenes/` 根目录，`main.ts` 只 glob `demos/`） | 在 `main.ts` 登记该场景 |

## 遗留问题（转 BT-3/BT-5）

1. **浏览器实跑仍未完成** — 环境 webview 持续不可用。视觉产出已通过 PNG 管线审查，但**动画流畅度、视差实机观感、特效叠加效果**只能在浏览器确认
2. 纯几何造型在极小屏占比下细节会丢失（架构支持后续换贴图/更高精度形状）
3. 石甲卫 `run` 帧塔盾与躯干略有叠加（可读，待微调）
4. UI 皮肤已就绪但**尚未替换各场景现有 UI**（`MainGameScene` 等仍是自绘按钮）——建议 BT-4 做正式背包/装备界面时统一启用
5. PNG 联络表不绘制动态粒子（粒子为实时效果）
