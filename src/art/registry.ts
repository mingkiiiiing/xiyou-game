/**
 * 角色美术注册表：聚合全部 CharacterArtDef，按 id 查询。
 * 未知 id 返回 undefined → 渲染层回退到色块（保证新增怪物不会因为缺美术而崩溃）。
 */
import type { CharacterArtDef } from './types';
import { linghou } from './chars/linghou';
import { manyan } from './chars/manyan';
import { yunxuan } from './chars/yunxuan';
import { MONSTER_ART } from './chars/monsters';
import { BOSS_ART } from './chars/bosses';

export const ALL_CHARACTER_ART: readonly CharacterArtDef[] = [linghou, manyan, yunxuan, ...MONSTER_ART, ...BOSS_ART];

const ART_BY_ID = new Map<string, CharacterArtDef>(ALL_CHARACTER_ART.map((a) => [a.id, a]));

export function getCharacterArt(id: string): CharacterArtDef | undefined {
  return ART_BY_ID.get(id);
}

/** 有美术定义的 id 列表（审查与测试用） */
export function artIds(): string[] {
  return [...ART_BY_ID.keys()];
}
