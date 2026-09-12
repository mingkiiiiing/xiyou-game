# 并行任务演示场景约定

每个任务在自己模块外创建演示文件 `src/scenes/demos/taskX.ts`（X = 任务字母）：

```ts
import type { Game } from '../../core/Game';
import { Scene } from '../../core/Scene';

export const sceneKey = 'taskX';

export function createScene(game: Game): Scene {
  const scene = new MyDemoScene(game);
  return scene;
}
```

浏览器用 `?scene=taskX` 访问；`main.ts` 通过 `import.meta.glob` 自动发现，**不需要**修改任何中央登记文件。
