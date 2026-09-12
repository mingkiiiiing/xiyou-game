/** 键盘输入：动作映射，避免各处散落 key code */
export class Input {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private keyToAction = new Map<string, string>([
    ['KeyA', 'left'], ['ArrowLeft', 'left'],
    ['KeyD', 'right'], ['ArrowRight', 'right'],
    ['KeyS', 'down'], ['ArrowDown', 'down'],
    ['KeyW', 'jump'], ['ArrowUp', 'jump'], ['KeyK', 'jump'],
    ['KeyJ', 'attack'],
    ['KeyU', 'skill1'], ['KeyI', 'skill2'], ['KeyO', 'skill3'],
    ['KeyL', 'dodge'], ['ShiftLeft', 'dodge'], ['ShiftRight', 'dodge'],
    ['KeyQ', 'potionHp'], ['KeyE', 'potionMp'],
    ['KeyB', 'bag'], ['KeyV', 'shop'], ['KeyN', 'service'],
    ['Escape', 'pause'],
  ]);

  attach(target: Window): void {
    target.addEventListener('keydown', (e) => {
      const action = this.keyToAction.get(e.code);
      if (!action) return;
      if (!this.down.has(action)) this.pressedThisFrame.add(action);
      this.down.add(action);
    });
    target.addEventListener('keyup', (e) => {
      const action = this.keyToAction.get(e.code);
      if (action) this.down.delete(action);
    });
  }

  isDown(action: string): boolean { return this.down.has(action); }
  wasPressed(action: string): boolean { return this.pressedThisFrame.has(action); }
  endFrame(): void { this.pressedThisFrame.clear(); }
}
