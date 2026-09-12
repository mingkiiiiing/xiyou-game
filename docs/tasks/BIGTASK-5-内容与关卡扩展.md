# BIGTASK-5 内容与关卡扩展

**状态：🚧 进行中（2026-09-13）**

大任务目标：把游戏从"一个角色打四关"扩成**有选择、有纵深、有重复可玩性**的内容体量——
3 个可玩角色、第一章 5 关 + 东海龙宫 2 关、精英/噩梦难度、Boss 阶段演出、真实横版长关卡。

验收总标准：
1. **3 角色**可选用且手感差异明显（灵猴均衡 / 蛮岩重装 / 云璿远程），各有专属 3 技能
2. **7 个关卡**（1-1~1-5 + 2-1~2-2），长关卡（世界宽 3000~4800，多段落平台）
3. **精英/噩梦难度**：进关可选，怪物数值/金币/掉落品质随难度提升，进度记录到存档
4. **Boss 阶段演出**：切阶段瞬间 顿帧+白闪+震屏+阶段播报
5. 新怪物 ≥5 种（龙宫系）+ 新 Boss ≥1（东海龙王），全部有造型
6. `npm run verify` 全绿（新增内容专项测试）+ 美术联络表自动覆盖新造型

---

## 子任务分解

| 编号 | 子任务 | 角色 | 负责文件 | 执行 |
|---|---|---|---|---|
| BT-5.1 | 关卡/怪物/技能配置扩展 | 数值/关卡策划 | `config/levels.json`、`monsters.json`、`skills.json`、平衡报告 | **并行 agent** |
| BT-5.2 | 新角色与新怪造型 | 2D 美术 | `art/chars/manyan.ts`、`yunxuan.ts`、monsters/bosses 追加 | **并行 agent** |
| BT-5.3 | 角色系统（选择/差异/远程普攻） | 主程 | `config/characters.json`、`battle/`、`game/damage`、弹幕池 | 主会话 |
| BT-5.4 | 难度系统（精英/噩梦） | 主程 | `config/difficulty.json`、刷怪缩放、选关 UI、存档 | 主会话 |
| BT-5.5 | 长关卡支持 + Boss 阶段演出 | 主程 | `game/levelUtils.ts`、`enemy/Boss.ts`、`vfx/battleFx.ts` | 主会话 |
| BT-5.6 | 内容专项测试 + 收尾 | 测试 QA | `scripts/content-test.ts` | 主会话 |

## 设计决策（冻结）

- **角色差异走配置**：`config/characters.json`（id/名称/baseMult 倍率/rangedBasic/技能表 charId 过滤）；`shared/types.ts` 的 `SkillDef` 增加可选 `charId?`，`LevelDef` 增加可选 `worldW?`（默认 2400）——均为**增量字段**，不改既有语义
- **蛮岩**：hp×1.6 / atk×1.35 / 速度×0.78 / def×1.3，近战重击（倍率高、硬直长）；**云璿**：hp×0.8 / atk×0.95 / 速度×1.12，**远程普攻**（弹幕，经 ProjectilePool.fireFree 新通道）
- **难度系数**：`config/difficulty.json` normal/elite/nightmare → 怪物 hp/atk/def/金币倍率 + 掉落品质加成；噩梦需先通该关精英（存档 `clearedDiff` 增量字段）
- **长关卡平台**：由 `game/levelUtils.genSolids(levelId, worldW)` 以关卡 id 为种子确定性生成（可 headless 测试），不在配置里手写物理
- **弹幕通用化**：ProjectilePool 增加 `fireFree(x,y,vx,vy,onHit,hitQuery)`——玩家/未来任何单位都能发射"对查询命中"的弹幕，敌方原通道不变

## 完成报告（待填）

### BT-5.1 完成报告（数值/关卡策划，2026-09-12）

**交付内容**
1. `src/config/levels.json`：新增 **1-5 花果山秘境**（Lv9，无 Boss，岩臂猿×2 精英收尾波）、**2-1 东海·龙宫外**（Lv11）、**2-2 东海·水晶宫**（Lv13，Boss dragon_king）；既有 1-1~1-4 一字未动，仅补 `worldW`（2400/3000/3600/3600/4200/4200/4800）；新波次 intervalMs 全部落在 700~1400。
2. `src/config/monsters.json`：新增龙宫系 5 小怪——shrimp_soldier（虾兵 Lv9 近战 leap）/ crab_guard（蟹将 Lv10 近战 shield）/ shark_guard（鲨卫 Lv11 近战 charge）/ turtle_prince（龟丞相 Lv11 远程 retreat+fanShot）/ jelly_fish（水母妖 Lv12 远程 fanShot）+ Boss **dragon_king**（东海龙王 Lv13，charge+summon，hp1400/atk20/def12，战力 1696 全游最强，比混世魔王 1014 高一档）；drops 全部引用 items.json 既有 43 件（龙王 100% 保底紫武魔王刀，35% 魔心珠）。
3. `src/config/skills.json`：既有 3 技能补 `"charId":"linghou"`；新增蛮岩 3 技能 quake_smash（崩山锤 2.0/5s/蓝12）、ground_quake（地裂 2.6/8s/蓝22）、berserk_charge（蛮牛冲 1.8/6s/蓝16，dashSpeed 650）与云璿 3 技能 fire_bolt（炎弹 1.6/3.5s/蓝10，w60/h60 远程判定）、ice_lance（冰锥 2.1/6s/蓝18）、meteor（陨石 2.8/9s/蓝28），均带 5 级 levels 数组、顶级倍率 ≈×1.7、`charId: manyan/yunxuan`。
4. `scripts/validate-config.ts`：**仅追加**两道校验——skills charId 白名单 [linghou/manyan/yunxuan]、levels worldW 范围 [2000,6000]，其余校验逻辑未动。
5. `docs/平衡报告.md` 追加 BT-5 章节（B0~B6）：7 关战力对照、龙宫怪物表、新技能轮转分析、精英/噩梦推荐等级（recLevel+2 蓝装+6 / +4 蓝装+10）。

**验收结果**
- `npm run check-data` **全绿**（怪物 17、装备 43，含新增两道校验与外键引用）。
- `npx tsc --noEmit` **零错误**（SkillDef.charId / LevelDef.worldW 均为增量可选字段，类型断言未破坏）。

**平衡结论摘要**：推荐等级 1→3→5→7→9→11→13 均匀步进；峰值玩家/怪物战力比 0.69→0.33 单调收窄；Boss 梯度 山魈 930 < 混世魔王 1014 < 东海龙王 1696；1-5 刻意做成低总战力（4102）刷级/刷装过渡关；技能三档差异化——蛮岩轮转贡献 ×1.39（高倍率低频）、灵猴 ×1.09 基准、云璿 ×1.06（高频远程安全）。风险登记：经验曲线仍落后推荐等级（需 BT-4 跟进）、长关卡实际时长依赖 BT-5.5 平台生成实测。

### BT-5.2 完成报告（2D 美术，2026-09-13）

**新增造型清单（8 个，id 与任务书/monsters.json 一致）**

| 文件 | id | 定位 | 造型要点 |
|---|---|---|---|
| chars/manyan.ts（新建） | `manyan` 蛮岩 | 玩家·牛魔重装 | 宽厚体型（58×80，比灵猴大一号）、双弯牛角+铜鼻环、铁灰重甲+暗铜饰+巨型护肩、焦红披风、**柱地巨斧**（idle 斧刃高过头顶）；慢重步态，attack 幅度大前倾明显，hurt 后仰沉重 |
| chars/yunxuan.ts（新建） | `yunxuan` 云璿 | 玩家·龙族法师 | 纤细悬浮长袍无腿（三层裙摆+金边垂饰+玉佩）、银白双飘带长发随相位摆动、珍珠金小龙角、白玉法杖（杖首龙珠）；attack1/2 为**抬手向前施法**（掌心法球），attack3 指天引雷，skill 拄杖蓄力龙珠胀光+释放扩散环 |
| chars/monsters.ts（追加） | `shrimp_soldier` 虾兵 | 龙宫近战 | 红虾弓身、六节蜷曲腹+尾扇、双长须、眼柄、额剑、持小三叉戟 |
| chars/monsters.ts（追加） | `crab_guard` 蟹将 | 龙宫近战 | 宽扁蟹壳+背缘壳刺、眼柄双目、六腿横行外撇、**双螯一大一小**（攻击开合横夹），倒地为翻壳朝天 |
| chars/monsters.ts（追加） | `shark_guard` 鲨卫 | 龙宫近战 | 流线鲨身站立化、大背鳍、尖吻巨口（攻击张颌露齿）、白腹、鳃裂、尾鳍 |
| chars/monsters.ts（追加） | `turtle_prince` 龟丞相 | 龙宫远程 | 方圆龟壳（背饰六甲纹）、皱纹老者面+白眉长须、拄地**龟头杖**（施法举起+杖头灵光） |
| chars/monsters.ts（追加） | `jelly_fish` 水母妖 | 龙宫远程 | 半透明伞盖（alpha 0.5~0.8 透明感）+内核发光+暗色脸部、4 触须+2 飘带口腕、攻击触须末端放电；悬空基线 |
| chars/bosses.ts（追加） | `dragon_king` 东海龙王 | Boss | **全游戏最大体型（102×128）**：白鹿角+金色虾须+鳞甲披风+蛇形长尾（尾鳍）+龙首权杖（吻前龙珠、蓄力胀光）；暗金+深海蓝；skill 地面潮汐冲击环，比混世魔王更高更宽更华丽 |

**实现方式**：与灵猴/既有怪物完全同范式——`draw(state, phase)` 纯函数、原点脚底中心、不处理翻转/闪白（交 compose.ts）。两个新玩家角色各带完整姿态求解，含 dodge 共 **11 clip**（idle/run/jump/fall/attack1~3/skill/dodge/hurt/dead）；5 新怪+龙王复用 monsters.ts 导出的 `stdClips/poseFor`（10 clip）与图元辅助；monsters/bosses 仅在导出数组**追加**、既有造型一字未动。全部 dead 帧保留标志特征（翻壳朝天/蜷虾/立背鳍/龟壳朝天/摊滩/鹿角虾须），避免退化成色块。

**自查结论**：临时脚本 `scripts/_art5.ts`（raster + composeCharacter + scaleShapes）渲染 8 角色×10 状态多宫格 PNG + 关键状态 4.2 倍放大图，逐格 Read 迭代 4 轮，修复：① 蛮岩斧刃误挂柄中部→移至柄顶；② 披风被重甲完全遮住→加宽下摆两侧外露；③ 云璿 idle 杖向反了（如拄拐杖）→修正杖角；④ 云璿发丝向头顶飘（如气泡）→改为向后下流；⑤ 龟丞相白须横前伸（如鸟喙）→改下垂；⑥ 龟杖悬空→杖身探到地面；⑦ 龙王头部与躯干糊团→鬃毛改深色衬亮脸部、权杖加大；⑧ dragon_king idle 87 形状超 check-art 上限 80→精简至 **79**。终版 8 角色全部可辨识、无穿模、无空状态；临时脚本与 PNG 已删除。

**验证**：`npm run art-coverage` 全绿——**17 种怪物（含 6 个新 id）全部有造型、18 个造型纯函数/状态齐全/输出非空/剪影各不相同**；`npm run sheet` 18 角色×7 状态 = **126/126 格无缺省**；本次新增/修改的 4 个文件 `npx tsc --noEmit` **零错误**（当前仓库仅剩 `scripts/content-test.ts` 两处 TS18048，属 BT-5.6 并行文件，非本任务产出）。

**遗留问题**：
1. `manyan`/`yunxuan` 尚未接入 `art/registry.ts`（任务边界：registry 接线归主会话 BT-5.3），接线后选人/战斗即可使用；
2. 蛮岩 idle 斧刃与右牛角有轻微前后层叠（可读；大斧框住头部的构图，如介意可外移握点）；
3. 蟹将/虾兵同属红系（龙宫族群色），靠剪影（横行宽壳 vs 蜷曲长须）区分，如需更强敌我区分可把蟹将调暗紫红；
4. 水母妖半透明在深色背景表现最佳，极亮背景会减弱（已按契约使用 alpha 通道）。

---

# 完成报告（2026-09-13）

**状态：✅ 已完成** — 内容体量、角色差异化、难度分层全部落地，全量回归通过。

## 子任务交付

| 编号 | 交付 | 执行 | 结果 |
|---|---|---|---|
| BT-5.1 | 7 关（一章 5 + 二章 2，worldW 2400~4800）、怪物 11→17（龙宫系 5 + 龙王）、技能 3→9（蛮岩/云璿各 3 套 5 级）、平衡报告 BT-5 章节 | 数值/关卡策划（并行 agent） | ✅ check-data 全绿 |
| BT-5.2 | 蛮岩/云璿玩家造型（11 clip）+ 龙宫 5 怪 + 龙王（全场最大 102×128） | 2D 美术（并行 agent） | ✅ 联络表 126→**140/140** 格无缺省 |
| BT-5.3 | 角色系统：`config/characters.json`（baseMult/rangedBasic）、`game/characterSystem.ts`、主城角色选择 UI、云璿远程普攻（`ProjectilePool.fireFree` 通用弹幕通道 + PlayerFighter.rangedBasic） | 主会话 | ✅ |
| BT-5.4 | 难度系统：`config/difficulty.json`（normal/elite/nightmare）、怪物数值/金币/掉落品质缩放、选关难度选择器、解锁链（普通→精英→噩梦）、存档 clearedDiff | 主会话 | ✅ |
| BT-5.5 | 长关卡：`game/levelUtils.genSolids`（确定性平台生成，种子=关卡 id）、刷怪/巡逻/Boss 出生随 worldW 自适应；Boss 阶段演出（`boss-phase` 事件 → 顿帧 320ms + 强震屏 + 白闪 + 大字播报） | 主会话 | ✅ |
| BT-5.6 | `scripts/content-test.ts` 内容专项测试 | 主会话 | ✅ 55 项 |

## 三个角色手感差异（配置驱动，数据经 e2e 验证）

| 角色 | HP | 攻击 | 移速 | 普攻 | 技能组 |
|---|---|---|---|---|---|
| 灵猴 | 100 | 10 | 320 | 近战三连 | 突刺/横扫/跳劈 |
| 蛮岩 | **160** | **14** | **250** | 近战重击 | 崩山锤/地裂/蛮牛冲 |
| 云璿 | 80 | 10 | 358 | **远程弹幕** | 炎弹/冰锥/陨石 |

## 验证结果

| 项目 | 结果 |
|---|---|
| `npx tsc --noEmit` | ✅ 零错误 |
| `npm run build` | ✅ 成功 |
| `npm run verify` | ✅ 全绿 8 套件：数据 + 装备 81 + 战斗 49 + 经济 53 + **内容 55** + 冒烟 78 + 压力 + 美术覆盖率 |
| `npm run sheet` | ✅ 20 角色 × 7 状态 = **140/140** 格无缺省 |
| 浏览器 e2e | ✅ 部分完成（见下） |

## e2e 实机验证发现并修复的 3 个 Bug（均已加回归锁）

| # | Bug | 修复 + 回归锁 |
|---|---|---|
| 1 | 蛮岩移速未吃到 0.78 倍率（applyCharMult 漏 moveSpeed） | 修复 + content-test 回归锁「蛮岩移速 = 250」 |
| 2 | resolvedSkills 返回全部 9 个技能（未按角色过滤），战斗与 HUD 都会装载错技能 | 修复（skillsForChar 过滤）+ 回归锁 |
| 3 | 养成面板技能页显示 9 个技能 | 修复（buildProgressionModel 按角色过滤）——由经济测试失败暴露 |

## e2e 已验证 / 未验证

- ✅ 已验证：蛮岩/云璿属性差异（160/80 HP）、2-1 长关卡进入（worldW 4200、4 段确定性地形）、噩梦未解锁自动回落精英、龙王 Boss 配置、云璿 3 技能装载
- ⚠️ 未走完（浏览器 guest 后期再度挂起，同 BT-4 模式）：云璿远程弹幕的实机手感、长关卡实机节奏、龙王三阶段演出的实机观感——**建议人工实机走查**：选云璿 → 2-1 → 打到关底

## 遗留问题（转 BT-6）

1. 剧情过场/章节开场演出未做（BT-6 可选）
2. 装备/怪物未按第二章扩展新词条池（龙宫掉落沿用第一章池）
3. 经验曲线仍落后推荐等级（平衡报告登记；BT-6 调参）
4. 长关卡平台为确定性生成，无手工设计的跳跃挑战段
