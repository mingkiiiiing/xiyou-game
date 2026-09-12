import type { WaveDef } from '../shared/types';

export interface SpawnerHost {
  spawnMonster(monsterId: string): void;
  isMonsterCleared(): boolean; // 场上无存活怪物
}

/**
 * 任务C：波次刷怪器（读 WaveDef[]，供任务F关卡流程复用）。
 * 同一波内按 intervalMs 逐个刷；一波全部死亡后才进入下一波。
 */
export class Spawner {
  private waveIdx = 0;
  private spawnedInWave = 0;
  private nextSpawnAt = 0;
  private waitingClear = false;
  private started = false;

  constructor(private waves: WaveDef[], private host: SpawnerHost) {}

  start(): void {
    this.started = true;
    this.nextSpawnAt = performance.now();
  }

  /** @returns 全部波次完成 */
  update(): boolean {
    if (!this.started || this.waveIdx >= this.waves.length) return true;
    const now = performance.now();
    const wave = this.waves[this.waveIdx];

    if (this.waitingClear) {
      if (this.host.isMonsterCleared()) {
        this.waitingClear = false;
        this.waveIdx++;
        this.spawnedInWave = 0;
        this.nextSpawnAt = now + 600;
      }
      return false;
    }

    if (this.spawnedInWave < wave.count && now >= this.nextSpawnAt) {
      this.host.spawnMonster(wave.monsterId);
      this.spawnedInWave++;
      this.nextSpawnAt = now + wave.intervalMs;
    }
    if (this.spawnedInWave >= wave.count) this.waitingClear = true;
    return false;
  }

  get progressText(): string {
    if (this.waveIdx >= this.waves.length) return '波次全部完成';
    const w = this.waves[this.waveIdx];
    return `第 ${this.waveIdx + 1}/${this.waves.length} 波 ${w.monsterId} × ${this.spawnedInWave}/${w.count}${this.waitingClear ? '（等待清场）' : ''}`;
  }
}
