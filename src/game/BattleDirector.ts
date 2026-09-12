/**
 * IT-1.1 战斗编排器：波次推进 → Boss → 通关判定，与渲染完全解耦。
 * 场景（或 headless 压力测试）通过 host 回调驱动实际的敌人生成与存活查询。
 */
import type { WaveDef } from '../shared/types';
import { Spawner } from '../enemy/Spawner';

export type BattleStatus = 'waves' | 'boss' | 'cleared' | 'failed';

export interface BattleDirectorHost {
  /** 生成一只小怪（同波次内按 intervalMs 间隔调用） */
  spawnMonster(monsterId: string): void;
  /** 当前存活的小怪数量 */
  aliveMonsterCount(): number;
  /** 生成 Boss */
  spawnBoss(bossId: string): void;
  /** Boss 是否仍存活 */
  isBossAlive(): boolean;
}

export class BattleDirector {
  status: BattleStatus = 'waves';

  private spawner: Spawner;
  private bossSpawned = false;

  constructor(
    private waves: WaveDef[],
    private bossId: string | null,
    private host: BattleDirectorHost,
  ) {
    this.spawner = new Spawner(waves, {
      spawnMonster: (id) => this.host.spawnMonster(id),
      isMonsterCleared: () => this.host.aliveMonsterCount() === 0,
    });
    this.spawner.start();
  }

  update(): void {
    if (this.status !== 'waves') return;
    const wavesDone = this.spawner.update();
    if (!wavesDone || this.host.aliveMonsterCount() > 0) return;

    if (!this.bossId) {
      this.status = 'cleared';
      return;
    }
    if (!this.bossSpawned) {
      this.bossSpawned = true;
      this.status = 'boss';
      this.host.spawnBoss(this.bossId);
    }
  }

  /** Boss 死后由场景调用 */
  notifyBossDefeated(): void {
    if (this.status === 'boss') this.status = 'cleared';
  }

  fail(): void { this.status = 'failed'; }

  get progressText(): string {
    if (this.status === 'boss') return 'BOSS 战！';
    if (this.status === 'cleared') return '已通关';
    return this.spawner.progressText;
  }
}
