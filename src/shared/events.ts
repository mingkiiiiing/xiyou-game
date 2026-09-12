import type { GameEvents } from './types';

type Handler<T> = (payload: T) => void;

/** 极简类型化事件总线：并行任务系统间解耦通信的唯一通道 */
export class EventBus {
  private map = new Map<string, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(key: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.map.get(key);
    if (!set) { set = new Set(); this.map.set(key, set); }
    set.add(fn as Handler<never>);
    return () => { set!.delete(fn as Handler<never>); };
  }

  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void {
    this.map.get(key)?.forEach(fn => fn(payload as never));
  }

  clear(): void { this.map.clear(); }
}
