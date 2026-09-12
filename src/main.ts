import type { Scene } from './core/Scene';
import { Game } from './core/Game';
import { MainGameScene } from './scenes/MainGameScene';
import { createScene as createArtistReview } from './scenes/ArtistReviewScene';
import { Text } from 'pixi.js';

// 自动发现并行任务的演示场景：src/scenes/demos/taskX.ts 导出 sceneKey 与 createScene
const demoModules = import.meta.glob('./scenes/demos/*.ts', { eager: true });

async function boot(): Promise<void> {
  const game = new Game();
  await game.init(document.getElementById('app')!);
  game.input.attach(window);

  // ?scene=taskB 之类切换演示场景；默认进集成主场景（完整闭环）
  const which = new URLSearchParams(location.search).get('scene') ?? 'game';

  let factory: ((g: Game) => Scene) | null =
    which === 'game' ? (g) => new MainGameScene(g) :
    which === 'artreview' ? (g) => createArtistReview(g) :
    null;
  for (const mod of Object.values(demoModules)) {
    const m = mod as { sceneKey?: string; createScene?: (g: Game) => Scene };
    if (m.sceneKey === which && m.createScene) factory = m.createScene;
  }
  if (!factory) {
    console.warn(`未找到场景 "${which}"，回退到 game。`);
    factory = (g) => new MainGameScene(g);
  }

  await game.sceneManager.switchTo(factory);
  (window as unknown as { __game: Game }).__game = game; // 调试用

  // e2e 测试钩子：按可见文字触发按钮（Pixi 输入路径在无头自动化下不可靠，真实用户不受影响）
  (window as unknown as Record<string, unknown>).__pressButton = (text: string): number => {
    const want = text.replace(/\s+/g, '');
    const found: { emit: (e: string, p: unknown) => void }[] = [];
    const rec = (c: unknown): void => {
      const node = c as { children?: unknown[] } & Partial<Text>;
      if (node instanceof Text && typeof node.text === 'string' && node.text.replace(/\s+/g, '').includes(want)) {
        const parent = node.parent as unknown as { emit: (e: string, p: unknown) => void } | null;
        if (parent) found.push(parent);
      }
      node.children?.forEach(rec);
    };
    rec(game.app.stage);
    found[0]?.emit('pointertap', { stopPropagation() { /* e2e */ } });
    return found.length;
  };
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#f66;padding:16px">${String((err as Error)?.stack ?? err)}</pre>`;
});
