# TASK-G 特效 · 音频 · 打击感表现

**状态：🚧 进行中（2026-09-12 领取）**

负责目录：`src/vfx/` + 演示 `src/scenes/demos/taskG.ts`（sceneKey='taskG'）
前置：TASK-A 已完成

## 目标

做"打击感放大器"：M1 战斗在接入本模块后，观感接近造梦西游的技能华丽度（灰盒素材阶段先用几何粒子表达）。

## 任务清单

1. 特效框架：特效定义为纯数据（粒子发射器参数：数量/速度/角度/重力/颜色/生命周期/形状）+ `VfxPlayer.play(key, x, y)`；预置 3 个特效：突刺残影 / 横扫剑气弧 / 跳劈落点冲击波
2. 飘字系统（从 BattleScene 升级）：伤害数字（暴击大号金色弹跳、普通白色、玩家受伤红色、治疗绿色），可合并连击数字
3. 相机表现：震屏（强度/时长/频率参数化，叠加到 Camera 位移上）、全屏打击白闪 0.05s
4. 音频管理器 `AudioManager`：**WebAudio 程序化合成**音效（打击/跳跃/技能/受击/拾取 5 种），master/bgm/sfx 三条音量总线——禁止引入音频文件
5. 简单粒子池：同一特效高频播放不产生 GC 卡顿

## 使用契约

`DamageInfo / Box`；`VfxDef / ShakeConfig / AudioBus` 等新类型本模块定义。对外只暴露：`VfxPlayer.play`、`FloatingText.spawn`、`CameraFx.shake`、`AudioManager.play(key)`，供集成时挂进战斗流程。

## 验收标准

- `?scene=taskG`：演示面板可手动触发全部特效/飘字/震屏/5 种音效；连按 20 次不掉帧
- `npx tsc --noEmit` 对本目录零错误
- 禁止事项：改 core/ shared/ enemy/ item/ config/；禁止引入任何二进制素材；禁止 npm install

## 完成报告（2026-09-12，主会话执行）
- 新增 `src/vfx/`：VfxPlayer(数据驱动发射器+对象池，预置突刺残影/横扫剑气弧/跳劈冲击波)、FloatingText(暴击金色弹跳/白/红/绿)、CameraFx(参数化震屏叠加层+全屏白闪)、AudioManager(WebAudio 合成 5 音效，master/bgm/sfx 三总线)
- 新增 `src/scenes/demos/taskG.ts`（?scene=taskG 一站式试炼场，H 键 20 连发压力测试）
- 验收：tsc 零错误；零二进制素材
