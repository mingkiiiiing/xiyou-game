import type { Game } from './Game';
import type { Scene } from './Scene';

export class SceneManager {
  private current: Scene | null = null;

  constructor(private game: Game) {}

  async switchTo(create: (game: Game) => Scene): Promise<void> {
    this.current?.destroy();
    const scene = create(this.game);
    this.current = scene;
    await scene.init();
    this.game.app.stage.addChild(scene.view);
  }

  update(dtMs: number): void {
    this.current?.update(dtMs);
  }

  get active(): Scene | null { return this.current; }
}
