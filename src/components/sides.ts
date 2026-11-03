import type { Color } from '../core/types.ts';
import { SENTE } from '../core/types.ts';
import type { Translate } from '../i18n/index.ts';

/** 平手稱先手／後手，駒落ち稱下手／上手 */
export function sideName(t: Translate, color: Color, handicapped: boolean): string {
  if (handicapped) return t(color === SENTE ? 'common.shitate' : 'common.uwate');
  return t(color === SENTE ? 'common.sente' : 'common.gote');
}

export const sideMark = (color: Color): string => (color === SENTE ? '☗' : '☖');

export const isHandicapSfen = (sfen: string): boolean =>
  sfen.split(' ')[1] === 'w' && !sfen.startsWith('lnsgkgsnl/1r5b1/');
