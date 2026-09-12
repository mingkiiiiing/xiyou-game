import { Container, Graphics, Text } from 'pixi.js';
import type { Game } from '../../core/Game';
import { Scene } from '../../core/Scene';
import { VfxPlayer } from '../../vfx/VfxPlayer';
import { FloatingText } from '../../vfx/FloatingText';
import { CameraFx } from '../../vfx/CameraFx';
import { audio } from '../../vfx/AudioManager';

export const sceneKey = 'taskG';

const HUD_BASE =
  '任务G 演示\n' +
  '1 突刺残影   2 横扫剑气弧   3 跳劈冲击波\n' +
  '4 暴击飘字   5 受伤飘字     6 治疗飘字\n' +
  'Q 打击音  W 跳跃音  E 技能音  R 受击音  T 拾取音\n' +
  '7 震屏+白闪   H 压力测试（20 连发）   +/- 调节音量';

/**
 * 任务G演示：特效 / 飘字 / 震屏白闪 / 程序化音效 一站式试炼场。
 */
export function createScene(game: Game): Scene {
  return new TaskGDemo(game);
}

class TaskGDemo extends Scene {
  private world = new Container();
  private screen = new Container();
  private vfx = new VfxPlayer();
  private floats = new FloatingText();
  private camFx = new CameraFx();
  private hud!: Text;
  private keysDown = new Set<string>();
  private seen = new Set<string>();
  private listeners: (() => void)[] = [];

  constructor(game: Game) { super(game); }

  init(): void {
    const bg = new Graphics();
    bg.rect(0, 0, 1280, 720).fill(0x0f1216);
    bg.rect(0, 620, 1280, 100).fill(0x24321f);
    this.world.addChild(bg);
    const target = new Graphics();
    target.rect(-26, -68, 52, 68).fill(0x8a5a3a);
    target.position.set(640, 620);
    this.world.addChild(target);

    this.view.addChild(this.world);
    this.view.addChild(this.vfx.view);
    this.view.addChild(this.screen);
    this.camFx.attachScreenLayer(this.screen);
    this.floats.attach(this.world);

    this.hud = new Text({ text: HUD_BASE, style: { fill: 0xe6edf3, fontSize: 16, fontFamily: 'Consolas, monospace', lineHeight: 26 } });
    this.hud.position.set(24, 20);
    this.view.addChild(this.hud);

    // 非动作映射键的原始监听（数字键/音量键）
    const dn = (e: KeyboardEvent) => this.keysDown.add(e.code);
    const up = (e: KeyboardEvent) => { this.keysDown.delete(e.code); this.seen.delete(e.code); };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    this.listeners.push(() => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup', up);
    });
  }

  /** 原始按键的一次性按下检测 */
  private tapped(code: string): boolean {
    if (this.keysDown.has(code) && !this.seen.has(code)) {
      this.seen.add(code);
      return true;
    }
    return false;
  }

  update(dtMs: number): void {
    const input = this.game.input;

    if (input.wasPressed('skill1')) { this.vfx.play('thrust_afterimage', 560, 580); audio.play('skill'); }
    if (input.wasPressed('skill2')) { this.vfx.play('sweep_arc', 680, 580); audio.play('hit'); }
    if (input.wasPressed('skill3')) {
      this.vfx.play('leap_slash_shockwave', 640, 618);
      this.camFx.shake(10, 200);
      audio.play('hit');
    }

    if (this.tapped('Digit4')) this.floats.spawn(640, 520, '888!', 'crit');
    if (this.tapped('Digit5')) this.floats.spawn(640, 520, '-15', 'hurt');
    if (this.tapped('Digit6')) this.floats.spawn(640, 520, '+30', 'heal');

    if (this.tapped('KeyQ')) audio.play('hit');
    if (this.tapped('KeyW')) audio.play('jump');
    if (this.tapped('KeyE')) audio.play('skill');
    if (this.tapped('KeyR')) audio.play('hurt');
    if (this.tapped('KeyT')) audio.play('pickup');

    if (this.tapped('Digit7')) { this.camFx.shake(12, 250, 40); this.camFx.flash(60); audio.play('hurt'); }
    if (this.tapped('KeyH')) {
      for (let i = 0; i < 20; i++) {
        setTimeout(() => this.vfx.play('sweep_arc', 300 + Math.random() * 680, 560 + Math.random() * 40), i * 30);
      }
    }
    if (this.tapped('Equal')) audio.setVolume('sfx', Math.min(1, audio.getVolume('sfx') + 0.1));
    if (this.tapped('Minus')) audio.setVolume('sfx', Math.max(0, audio.getVolume('sfx') - 0.1));

    this.vfx.update(dtMs);
    this.floats.update(dtMs);
    this.camFx.update(dtMs, this.world);
    this.hud.text = `${HUD_BASE}\n粒子 ${this.vfx.activeCount}   音量 sfx=${audio.getVolume('sfx').toFixed(1)}`;
  }

  destroy(): void {
    this.listeners.forEach((f) => f());
    this.floats.clear();
    super.destroy();
  }
}
