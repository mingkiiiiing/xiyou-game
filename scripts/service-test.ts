/**
 * BT-6.2 长线服务专项测试（headless）：成就进度/领取、日常任务/跨天重置、配置合法性。
 * 运行：npx tsx scripts/service-test.ts
 */
import { ACHIEVEMENTS, AchievementTracker } from '../src/meta/achievements';
import { DAILY_QUESTS, DailyBoard, todayKey } from '../src/meta/daily';

let pass = 0, failCount = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log(`  ✓ ${name}`); }
  else { failCount++; console.error(`  ✗ ${name}: 期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}`); }
};
const ok = (name: string, cond: boolean) => eq(name, cond, true);
const section = (s: string) => console.log(`\n■ ${s}`);

/** 与 todayKey 同口径的本地日期串，offsetDays 可取昨天/明天 */
function dateKey(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const TODAY = dateKey(0);
const YESTERDAY = dateKey(-1);

// ───────── 1. 成就配置 ─────────
section('成就配置（≥10 个、口径合法、难度递进）');
{
  ok('成就 ≥ 10 个', ACHIEVEMENTS.length >= 10);
  eq('成就 id 唯一', new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  const VALID_STATS = ['kills', 'levelsCleared', 'goldEarned', 'strenghtens', 'gemsSocketed'];
  ok('stat 口径全部合法（存档 lifeStats 五种计数）', ACHIEVEMENTS.every((a) => VALID_STATS.includes(a.stat)));
  ok('覆盖全部 5 个统计口径', new Set(ACHIEVEMENTS.map((a) => a.stat)).size === 5);
  ok('目标 ≥ 1', ACHIEVEMENTS.every((a) => a.goal >= 1));
  ok('奖励金币在 100~1500 区间', ACHIEVEMENTS.every((a) => a.rewardGold >= 100 && a.rewardGold <= 1500));
  ok('技能点奖励为 0/1/2', ACHIEVEMENTS.every((a) => a.rewardSkillPoints >= 0 && a.rewardSkillPoints <= 2));
  ok('有成就给技能点（1~2）', ACHIEVEMENTS.some((a) => a.rewardSkillPoints >= 1));
  // 难度递进：同口径下后面的成就目标严格更大
  for (const stat of VALID_STATS) {
    const goals = ACHIEVEMENTS.filter((a) => a.stat === stat).map((a) => a.goal);
    if (goals.length > 1) {
      ok(`${stat} 目标递进 ${JSON.stringify(goals)}`, goals.every((g, i) => i === 0 || g > goals[i - 1]));
    }
  }
  // 描述文本完整（UI 展示用）
  ok('name/desc 非空', ACHIEVEMENTS.every((a) => a.name.length > 0 && a.desc.length > 0));
}

// ───────── 2. 成就进度与领取 ─────────
section('成就进度与领取（钳制/完成/防重复）');
{
  const t = new AchievementTracker({ kills: 25, levelsCleared: 5 }, []);
  eq('进度钳制到 goal（kills 25 → 20）', t.progressOf('first_blood'), 20);
  eq('进度钳制到 goal（levelsCleared 5 → rising_star 显示 3）', t.progressOf('rising_star'), 3);
  eq('未达目标显示真实进度（chapter_master 5/7）', t.progressOf('chapter_master'), 5);
  eq('缺失统计按 0 计', t.progressOf('hammer_time'), 0);
  eq('完成判定 true', t.isComplete('first_blood'), true);
  eq('完成判定 false（未达 7 关）', t.isComplete('chapter_master'), false);
  eq('claimableIds = 已完成未领取', [...t.claimableIds()].sort(), ['first_blood', 'rising_star'].sort());

  const r = t.claim('first_blood');
  eq('领取成功', r.ok, true);
  eq('奖励金币 = 配置值', r.gold, 100);
  eq('奖励技能点 = 配置值', r.skillPoints, 0);
  eq('重复领取失败', t.claim('first_blood').ok, false);
  eq('重复领取奖励为 0', t.claim('first_blood').gold, 0);
  eq('领取后移出 claimableIds', t.claimableIds(), ['rising_star']);

  eq('未完成不可领', t.claim('warlord').ok, false);
  eq('未完成领取奖励为 0', t.claim('warlord').gold, 0);

  // 高阶成就给技能点
  const t2 = new AchievementTracker({ kills: 300, gemsSocketed: 10 }, []);
  const w = t2.claim('warlord');
  eq('杀神奖励 1000 金 + 1 技能点', [w.gold, w.skillPoints], [1000, 1]);
  const j = t2.claim('jewel_king');
  eq('珠光宝气 1500 金 + 2 技能点', [j.gold, j.skillPoints], [1500, 2]);

  // 纯逻辑边界：claim 不改写外部传入对象（入账/落盘由外部负责）
  const stats = { kills: 20 };
  const claimed: string[] = [];
  const t3 = new AchievementTracker(stats, claimed);
  t3.claim('first_blood');
  eq('claim 不改写外部统计', stats.kills, 20);
  eq('claim 不改写外部已领列表（落盘由外部负责）', claimed, []);

  // 从存档 claimed 恢复后不再可领
  const t4 = new AchievementTracker({ kills: 20 }, ['first_blood']);
  eq('存档已领成就不在 claimableIds', t4.claimableIds(), []);
  eq('存档已领成就重复领取失败', t4.claim('first_blood').ok, false);
}

// ───────── 3. 日常任务 ─────────
section('日常任务（日期/进度/领取/跨天）');
{
  ok('todayKey 格式 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(todayKey()));
  eq('todayKey = 本地今天', todayKey(), TODAY);

  eq('3 个日常任务', DAILY_QUESTS.length, 3);
  eq('日常 id 唯一', new Set(DAILY_QUESTS.map((q) => q.id)).size, 3);
  const kills = DAILY_QUESTS.find((q) => q.id === 'today_kills')!;
  const levels = DAILY_QUESTS.find((q) => q.id === 'today_levels')!;
  const gold = DAILY_QUESTS.find((q) => q.id === 'today_gold')!;
  eq('today_kills = 30 杀 / 80 金', [kills.goal, kills.rewardGold], [30, 80]);
  eq('today_levels = 2 次 / 120 金', [levels.goal, levels.rewardGold], [2, 120]);
  eq('today_gold = 300 金 / 60 金', [gold.goal, gold.rewardGold], [300, 60]);
  ok('name 非空', DAILY_QUESTS.every((q) => q.name.length > 0));

  const board = new DailyBoard(TODAY, { today_kills: 45, today_levels: 1 }, []);
  eq('进度钳制到 goal（45 → 30）', board.progressOf('today_kills'), 30);
  eq('未完成显示真实进度', board.progressOf('today_levels'), 1);
  eq('缺失进度按 0 计', board.progressOf('today_gold'), 0);
  eq('完成判定 true', board.isComplete('today_kills'), true);
  eq('完成判定 false', board.isComplete('today_levels'), false);

  eq('未完成不可领', board.claim('today_levels').ok, false);
  const r = board.claim('today_kills');
  eq('领奖成功 80 金', [r.ok, r.gold], [true, 80]);
  eq('重复领取失败', board.claim('today_kills').ok, false);
  eq('重复领取奖励为 0', board.claim('today_kills').gold, 0);

  // 跨天判定
  ok('今天的面板未过期', !new DailyBoard(TODAY, {}, []).isExpired(TODAY));
  ok('昨天的面板已过期', new DailyBoard(YESTERDAY, {}, []).isExpired(TODAY));
  ok('空日期（新档默认）视为过期待重置', new DailyBoard('', {}, []).isExpired(TODAY));
  ok('面板日期与传入日期不一致即过期', new DailyBoard(TODAY, {}, []).isExpired(YESTERDAY));
}

console.log(`\n==========================================`);
if (failCount > 0) {
  console.error(`✗ ${failCount} 项失败 / ${pass} 项通过`);
  process.exit(1);
} else {
  console.log(`✓ 长线服务专项测试全部通过（${pass} 项）`);
}
