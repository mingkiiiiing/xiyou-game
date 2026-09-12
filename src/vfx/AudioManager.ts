/**
 * 任务G：音频管理器——WebAudio 程序化合成（零素材文件）。
 * 三条音量总线：master → destination，sfx/bgm → master。
 * 浏览器策略：首次用户手势后才能出声，ensure() 在每次 play 时调用。
 */
export type SfxKey = 'hit' | 'jump' | 'skill' | 'hurt' | 'pickup';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private volumes = { master: 0.8, sfx: 0.8, bgm: 0.5 };

  private ensure(): boolean {
    if (!this.ctx) {
      type WinAudio = typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext ?? (window as WinAudio).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volumes.master;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.volumes.sfx;
      this.sfxBus.connect(this.master);
      this.bgmBus = this.ctx.createGain();
      this.bgmBus.gain.value = this.volumes.bgm;
      this.bgmBus.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return true;
  }

  setVolume(bus: 'master' | 'sfx' | 'bgm', v: number): void {
    this.volumes[bus] = Math.max(0, Math.min(1, v));
    const node = bus === 'master' ? this.master : bus === 'sfx' ? this.sfxBus : this.bgmBus;
    if (node) node.gain.value = this.volumes[bus];
  }
  getVolume(bus: 'master' | 'sfx' | 'bgm'): number { return this.volumes[bus]; }

  play(key: SfxKey): void {
    if (!this.ensure() || !this.ctx || !this.sfxBus) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this.sfxBus);

    const env = (peak: number, dur: number) => {
      gain.gain.setValueAtTime(peak, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    };
    switch (key) {
      case 'hit':
        osc.type = 'square';
        osc.frequency.setValueAtTime(190, t0);
        osc.frequency.exponentialRampToValueAtTime(60, t0 + 0.08);
        env(0.5, 0.09);
        break;
      case 'jump':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, t0);
        osc.frequency.exponentialRampToValueAtTime(640, t0 + 0.12);
        env(0.35, 0.13);
        break;
      case 'skill':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t0);
        osc.frequency.exponentialRampToValueAtTime(900, t0 + 0.18);
        env(0.3, 0.2);
        break;
      case 'hurt':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, t0);
        osc.frequency.exponentialRampToValueAtTime(70, t0 + 0.15);
        env(0.5, 0.16);
        break;
      case 'pickup': {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, t0);
        osc.frequency.setValueAtTime(990, t0 + 0.07);
        env(0.3, 0.15);
        break;
      }
    }
  }
}

/** 全局单例（集成时挂到 game 上） */
export const audio = new AudioManager();
