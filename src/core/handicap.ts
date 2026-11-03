/**
 * 駒落ち。上手（後手、畫面上方）拿掉棋子，並由上手先走。
 * name 是 KIF 檔「手合割」欄位的寫法，匯入匯出都靠它對應。
 */
export interface Handicap {
  id: HandicapId;
  name: string;
  sfen: string;
}

export type HandicapId =
  | 'even'
  | 'lance'
  | 'right-lance'
  | 'bishop'
  | 'rook'
  | 'rook-lance'
  | 'two'
  | 'four'
  | 'six'
  | 'eight'
  | 'ten';

const BOTTOM = 'ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL';

export const HANDICAPS: readonly Handicap[] = [
  { id: 'even', name: '平手', sfen: `lnsgkgsnl/1r5b1/${BOTTOM} b - 1` },
  { id: 'lance', name: '香落ち', sfen: `lnsgkgsn1/1r5b1/${BOTTOM} w - 1` },
  { id: 'right-lance', name: '右香落ち', sfen: `1nsgkgsnl/1r5b1/${BOTTOM} w - 1` },
  { id: 'bishop', name: '角落ち', sfen: `lnsgkgsnl/1r7/${BOTTOM} w - 1` },
  { id: 'rook', name: '飛車落ち', sfen: `lnsgkgsnl/7b1/${BOTTOM} w - 1` },
  { id: 'rook-lance', name: '飛香落ち', sfen: `lnsgkgsn1/7b1/${BOTTOM} w - 1` },
  { id: 'two', name: '二枚落ち', sfen: `lnsgkgsnl/9/${BOTTOM} w - 1` },
  { id: 'four', name: '四枚落ち', sfen: `1nsgkgsn1/9/${BOTTOM} w - 1` },
  { id: 'six', name: '六枚落ち', sfen: `2sgkgs2/9/${BOTTOM} w - 1` },
  { id: 'eight', name: '八枚落ち', sfen: `3gkg3/9/${BOTTOM} w - 1` },
  { id: 'ten', name: '十枚落ち', sfen: `4k4/9/${BOTTOM} w - 1` },
];

export const handicapById = (id: HandicapId): Handicap =>
  HANDICAPS.find((handicap) => handicap.id === id) ?? (HANDICAPS[0] as Handicap);

/** 比對 SFEN 的局面部分（不看手數），找出是哪一種手合 */
export function handicapOfSfen(sfen: string): Handicap | null {
  const key = sfen.trim().split(/\s+/).slice(0, 3).join(' ');
  return HANDICAPS.find((handicap) => handicap.sfen.startsWith(key)) ?? null;
}
