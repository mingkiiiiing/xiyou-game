/**
 * BT-5.3 角色系统：角色定义加载 + 按角色过滤技能 + 存档字段。
 * 纯数据层，不依赖 pixi。
 */
import charactersJson from '../config/characters.json';
import type { SkillDef } from '../shared/types';

export interface CharacterDef {
  id: string;
  name: string;
  role: string;
  baseMult: { hp: number; mp: number; atk: number; def: number; speed: number };
  rangedBasic: boolean;
  artId: string;
  blurb: string;
}

export const CHARACTERS: readonly CharacterDef[] = (charactersJson as unknown as { characters: CharacterDef[] }).characters;

export function getCharacter(id: string): CharacterDef {
  const c = CHARACTERS.find((x) => x.id === id);
  if (!c) throw new Error(`[characters] 未知角色 ${id}`);
  return c;
}

/** 按角色过滤技能（charId 缺省视为 linghou 兼容旧表） */
export function skillsForChar(skills: readonly SkillDef[], charId: string): SkillDef[] {
  return skills.filter((s) => (s.charId ?? 'linghou') === charId);
}

/** 角色倍率应用到裸身属性（玩家等级成长后；moveSpeed 同样受倍率） */
export function applyCharMult(
  base: { maxHp: number; maxMp: number; atk: number; def: number; moveSpeed?: number },
  mult: CharacterDef['baseMult'],
): { maxHp: number; maxMp: number; atk: number; def: number; moveSpeed: number } {
  return {
    maxHp: Math.round(base.maxHp * mult.hp),
    maxMp: Math.round(base.maxMp * mult.mp),
    atk: Math.round(base.atk * mult.atk),
    def: Math.round(base.def * mult.def),
    moveSpeed: Math.round((base.moveSpeed ?? 320) * mult.speed),
  };
}
