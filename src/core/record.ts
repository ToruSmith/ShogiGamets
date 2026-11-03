import { Game } from './game.ts';
import { HANDICAPS, handicapOfSfen } from './handicap.ts';
import type { Move } from './move.ts';
import {
  isDrop,
  makeDrop,
  makeMove,
  moveDropType,
  moveFrom,
  movePromotes,
  moveTo,
} from './move.ts';
import { moveToKifu, moveToUsi, PIECE_NAMES, usiToMove } from './notation.ts';
import { Position, START_SFEN } from './position.ts';
import type { Color, GameResult } from './types.ts';
import {
  BISHOP,
  DRAGON,
  EMPTY,
  GOLD,
  GOTE,
  HAND_TYPES,
  HORSE,
  KING,
  KNIGHT,
  LANCE,
  NARIGIN,
  NARIKEI,
  NARIKYO,
  PAWN,
  ROOK,
  SENTE,
  SILVER,
  TOKIN,
  colorOf,
  makePiece,
  opponentOf,
  squareOf,
  typeOf,
} from './types.ts';

/** 一份棋譜：起始局面、棋步，以及可有可無的對局資訊。 */
export interface GameRecord {
  startSfen: string;
  moves: Move[];
  /** 棋步之外才知道的結局（認輸、超時）。千日手與詰み由重演得出，不必寫在這裡。 */
  result?: GameResult | null;
  sente?: string;
  gote?: string;
  /** 開始時間（毫秒時間戳） */
  startedAt?: number;
  /** 每手消費時間（毫秒），長度與 moves 相同 */
  times?: number[];
}

export class RecordError extends Error {}

/** 重演棋譜得到終局狀態；認輸、超時等外部結局也會套用。 */
export function replayRecord(record: GameRecord): Game {
  const game = Game.fromMoves(record.startSfen, record.moves);
  if (!game.result && record.result?.winner !== undefined && record.result.winner !== null) {
    const reason = record.result.reason;
    if (reason === 'resign' || reason === 'timeout') {
      game.conclude(opponentOf(record.result.winner), reason);
    }
  }
  return game;
}

/* ───────────── SFEN / USI ───────────── */

/** USI 的 position 指令形式：sfen <局面> moves 7g7f ... */
export function exportSfen(record: GameRecord): string {
  const moves = record.moves.map(moveToUsi).join(' ');
  const start = record.startSfen === START_SFEN ? 'startpos' : `sfen ${record.startSfen}`;
  return moves ? `${start} moves ${moves}` : start;
}

/**
 * 接受下列寫法：
 *   position startpos moves 7g7f 3c3d
 *   sfen lnsgkgsnl/... b - 1 moves 7g7f
 *   lnsgkgsnl/... b - 1
 *   7g7f 3c3d（從平手開始）
 */
export function importSfen(text: string): GameRecord {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens[0] === 'position') tokens.shift();
  let startSfen = START_SFEN;
  let index = 0;
  if (tokens[0] === 'startpos') {
    index = 1;
  } else if (tokens[0] === 'sfen' || /\//.test(tokens[0] ?? '')) {
    const from = tokens[0] === 'sfen' ? 1 : 0;
    const parts = tokens.slice(from, from + 4);
    if (parts.length < 3) throw new RecordError('SFEN 不完整');
    // 手數可以省略
    const hasNumber = /^\d+$/.test(parts[3] ?? '');
    startSfen = `${parts.slice(0, 3).join(' ')} ${hasNumber ? parts[3] : '1'}`;
    index = from + (hasNumber ? 4 : 3);
    try {
      Position.fromSfen(startSfen);
    } catch (error) {
      throw new RecordError((error as Error).message);
    }
  }
  if (tokens[index] === 'moves') index++;
  const moves: Move[] = [];
  for (const token of tokens.slice(index)) {
    const move = usiToMove(token);
    if (move === null) throw new RecordError(`無法辨識的棋步：${token}`);
    moves.push(move);
  }
  if (tokens.length === 0) throw new RecordError('內容是空的');
  return validated({ startSfen, moves });
}

function validated(record: GameRecord): GameRecord {
  const game = new Game(record.startSfen);
  record.moves.forEach((move, ply) => {
    if (!game.play(move)) throw new RecordError(`第 ${ply + 1} 手不合法：${moveToUsi(move)}`);
  });
  return record;
}

/* ───────────── KIF ───────────── */

const KANJI_DIGITS = '〇一二三四五六七八九';
const WIDE_DIGITS = '０１２３４５６７８９';

const two = (n: number): string => String(n).padStart(2, '0');

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}/${two(d.getMonth() + 1)}/${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

function formatKifTime(moveMs: number, totalMs: number): string {
  const m = Math.floor(moveMs / 60000);
  const s = Math.floor((moveMs % 60000) / 1000);
  const total = Math.floor(totalMs / 1000);
  return `(${String(m).padStart(2)}:${two(s)}/${two(Math.floor(total / 3600))}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)})`;
}

const RESULT_WORDS: Record<string, string> = {
  resign: '投了',
  timeout: '切れ負け',
  repetition: '千日手',
  'perpetual-check': '反則負け',
  checkmate: '詰み',
  declaration: '入玉勝ち',
};

/** 半形寬度：全形字算 2，對齊棋步欄位用 */
const displayWidth = (text: string): number =>
  [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 0xff ? 2 : 1), 0);

export function exportKif(record: GameRecord): string {
  const game = new Game(record.startSfen);
  const handicap = handicapOfSfen(record.startSfen);
  const lines: string[] = ['# ---- ShogiGamets 棋譜ファイル ----'];
  if (record.startedAt) lines.push(`開始日時：${formatDate(record.startedAt)}`);
  if (handicap) {
    lines.push(`手合割：${handicap.name}`);
  } else {
    lines.push(...positionToBod(game.position));
  }
  const upper = handicap && handicap.id !== 'even';
  lines.push(`${upper ? '下手' : '先手'}：${record.sente ?? ''}`);
  lines.push(`${upper ? '上手' : '後手'}：${record.gote ?? ''}`);
  lines.push('手数----指手---------消費時間--');

  const totals: [number, number] = [0, 0];
  let previousTo: number | null = null;
  record.moves.forEach((move, ply) => {
    const mover = game.turn;
    const text = moveToKifu(move, game.position, previousTo).slice(1);
    const spent = record.times?.[ply] ?? 0;
    totals[mover] += spent;
    const padded = text + ' '.repeat(Math.max(1, 14 - displayWidth(text)));
    lines.push(`${String(ply + 1).padStart(4)} ${padded}${formatKifTime(spent, totals[mover])}`);
    previousTo = moveTo(move);
    game.play(move);
  });

  const final = replayRecord(record);
  const result = final.result;
  const plies = record.moves.length;
  if (result && result.reason !== 'checkmate') {
    const word = RESULT_WORDS[result.reason] ?? '中断';
    lines.push(`${String(plies + 1).padStart(4)} ${word}`);
  }
  if (result) {
    if (result.winner === null) lines.push(`まで${plies}手で千日手`);
    else {
      const side = result.winner === SENTE ? (upper ? '下手' : '先手') : upper ? '上手' : '後手';
      const suffix = result.reason === 'perpetual-check' ? '（連続王手の千日手）' : '';
      lines.push(`まで${plies}手で${side}の勝ち${suffix}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

const BOD_NAMES: Record<number, string> = {
  [PAWN]: '歩',
  [LANCE]: '香',
  [KNIGHT]: '桂',
  [SILVER]: '銀',
  [GOLD]: '金',
  [BISHOP]: '角',
  [ROOK]: '飛',
  [KING]: '玉',
  [TOKIN]: 'と',
  [NARIKYO]: '杏',
  [NARIKEI]: '圭',
  [NARIGIN]: '全',
  [HORSE]: '馬',
  [DRAGON]: '龍',
};

const kanjiCount = (n: number): string =>
  n <= 1 ? '' : n < 10 ? (KANJI_DIGITS[n] as string) : `十${n > 10 ? KANJI_DIGITS[n - 10] : ''}`;

function handText(position: Position, color: Color): string {
  const parts = HAND_TYPES.filter((type) => (position.hands[color][type] as number) > 0).map(
    (type) => `${BOD_NAMES[type]}${kanjiCount(position.hands[color][type] as number)}`,
  );
  return parts.length ? parts.join('　') : 'なし';
}

/** 柿木形式的盤面圖（BOD），讓非標準開局（例如詰將棋）也能寫進 KIF。 */
export function positionToBod(position: Position): string[] {
  const lines = [`後手の持駒：${handText(position, GOTE)}`, '  ９ ８ ７ ６ ５ ４ ３ ２ １'];
  lines.push('+---------------------------+');
  for (let rank = 0; rank < 9; rank++) {
    let row = '|';
    for (let column = 0; column < 9; column++) {
      const piece = position.board[squareOf(rank, column)] as number;
      if (piece === EMPTY) row += ' ・';
      else row += (colorOf(piece) === GOTE ? 'v' : ' ') + BOD_NAMES[typeOf(piece)];
    }
    lines.push(`${row}|${KANJI_DIGITS[rank + 1]}`);
  }
  lines.push('+---------------------------+');
  lines.push(`先手の持駒：${handText(position, SENTE)}`);
  if (position.turn === GOTE) lines.push('後手番');
  return lines;
}

const NAME_TO_TYPE: [string, number][] = [
  ['成香', NARIKYO],
  ['成桂', NARIKEI],
  ['成銀', NARIGIN],
  ['杏', NARIKYO],
  ['圭', NARIKEI],
  ['全', NARIGIN],
  ['歩', PAWN],
  ['香', LANCE],
  ['桂', KNIGHT],
  ['銀', SILVER],
  ['金', GOLD],
  ['角', BISHOP],
  ['飛', ROOK],
  ['玉', KING],
  ['王', KING],
  ['と', TOKIN],
  ['馬', HORSE],
  ['龍', DRAGON],
  ['竜', DRAGON],
];

function readName(text: string): [number, string] | null {
  for (const [name, type] of NAME_TO_TYPE) {
    if (text.startsWith(name)) return [type, text.slice(name.length)];
  }
  return null;
}

function parseCount(text: string): number {
  if (!text) return 1;
  if (/^\d+$/.test(text)) return Number(text);
  let value = 0;
  if (text.startsWith('十')) {
    value = 10;
    text = text.slice(1);
  }
  return value + Math.max(0, KANJI_DIGITS.indexOf(text));
}

function parseHand(text: string, color: Color, hands: number[][]): void {
  if (!text || text.startsWith('なし')) return;
  for (const part of text.split(/[\s　]+/).filter(Boolean)) {
    const read = readName(part);
    if (!read) throw new RecordError(`無法辨識的持駒：${part}`);
    const [type, rest] = read;
    (hands[color] as number[])[type] = parseCount(rest);
  }
}

/** 把 BOD 盤面圖轉成 SFEN */
function bodToSfen(lines: string[]): string | null {
  const rows = lines.filter((line) => /^\|.*\|/.test(line.trim()));
  if (rows.length !== 9) return null;
  const hands: number[][] = [[], []];
  for (const line of lines) {
    const hand = /^(先手|後手|下手|上手)の持駒[:：](.*)$/.exec(line.trim());
    if (hand) {
      const color = hand[1] === '先手' || hand[1] === '下手' ? SENTE : GOTE;
      parseHand((hand[2] as string).trim(), color, hands);
    }
  }
  const cells: string[] = [];
  rows.forEach((line, rank) => {
    const body = line.trim().slice(1, line.trim().lastIndexOf('|'));
    const chars = [...body];
    let column = 0;
    for (let i = 0; i < chars.length && column < 9; i += 2) {
      const mark = chars[i] as string;
      const name = chars[i + 1] as string;
      if (name === '・' || name === undefined) {
        column++;
        continue;
      }
      const read = readName(name);
      if (!read) throw new RecordError(`無法辨識的棋子：${name}`);
      const color = mark === 'v' || mark === 'V' ? GOTE : SENTE;
      cells[squareOf(rank, column)] = String(makePiece(read[0], color));
      column++;
    }
  });
  // 用 SFEN 字串組回去，交給 Position 的解析器檢查
  const letters = ' PLNSGBRK';
  const ranks: string[] = [];
  for (let rank = 0; rank < 9; rank++) {
    let text = '';
    let gap = 0;
    for (let column = 0; column < 9; column++) {
      const value = cells[squareOf(rank, column)];
      if (value === undefined) {
        gap++;
        continue;
      }
      if (gap) text += gap;
      gap = 0;
      const piece = Number(value);
      const type = typeOf(piece);
      const promoted = type > KING;
      const letter = letters[promoted ? type - 8 : type] as string;
      const cased = colorOf(piece) === SENTE ? letter : letter.toLowerCase();
      text += promoted ? `+${cased}` : cased;
    }
    if (gap) text += gap;
    ranks.push(text);
  }
  let hand = '';
  for (const color of [SENTE, GOTE] as const) {
    for (const type of HAND_TYPES) {
      const count = (hands[color] as number[])[type] ?? 0;
      if (!count) continue;
      const letter = letters[type] as string;
      hand += (count > 1 ? count : '') + (color === SENTE ? letter : letter.toLowerCase());
    }
  }
  const turn = lines.some((line) => /^(後手|上手)番/.test(line.trim())) ? 'w' : 'b';
  return `${ranks.join('/')} ${turn} ${hand || '-'} 1`;
}

/** KIF 一手：「７六歩(77)」「同　銀成(48)」「５五角打」 */
function parseKifMove(text: string, position: Position, previousTo: number | null): Move | null {
  let rest = text.replace(/^[▲△☗☖]/, '');
  let to: number;
  if (rest.startsWith('同')) {
    if (previousTo === null) return null;
    to = previousTo;
    rest = rest.slice(1).replace(/^[\s　]+/, '');
  } else {
    const file = WIDE_DIGITS.indexOf(rest[0] ?? '');
    const fileAscii = Number(rest[0]);
    const rank = KANJI_DIGITS.indexOf(rest[1] ?? '');
    const f = file > 0 ? file : fileAscii;
    if (!(f >= 1 && f <= 9) || rank < 1) return null;
    to = squareOf(rank - 1, 9 - f);
    rest = rest.slice(2);
  }
  const read = readName(rest);
  if (!read) return null;
  const [type, after] = read;
  if (after.startsWith('打')) return makeDrop(type, to);
  const origin = /\((\d)(\d)\)/.exec(after);
  const promote = /^成/.test(after);
  if (origin) {
    const from = squareOf(Number(origin[2]) - 1, 9 - Number(origin[1]));
    return makeMove(from, to, promote);
  }
  // 沒有寫出發點（KI2 風格）：從合法手中找唯一符合的
  const candidates = position.legalMoves().filter(
    (move) =>
      !isDrop(move) &&
      moveTo(move) === to &&
      typeOf(position.board[moveFrom(move)] as number) === type &&
      movePromotes(move) === promote,
  );
  if (candidates.length === 1) return candidates[0] as Move;
  // 只有打入能到達時，省略「打」也接受
  const drops = position.legalMoves().filter(
    (move) => isDrop(move) && moveTo(move) === to && moveDropType(move) === type,
  );
  return candidates.length === 0 && drops.length === 1 ? (drops[0] as Move) : null;
}

const HANDICAP_ALIASES: Record<string, string> = {
  香落: '香落ち',
  角落: '角落ち',
  飛落: '飛車落ち',
  飛車落: '飛車落ち',
  二枚落: '二枚落ち',
  四枚落: '四枚落ち',
  六枚落: '六枚落ち',
  八枚落: '八枚落ち',
  十枚落: '十枚落ち',
};

function parseKifTime(text: string): number | null {
  const match = /\(\s*(\d+):(\d+)/.exec(text);
  return match ? (Number(match[1]) * 60 + Number(match[2])) * 1000 : null;
}

export function importKif(source: string): GameRecord {
  const lines = source.replace(/^﻿/, '').split(/\r?\n/);
  const record: GameRecord = { startSfen: START_SFEN, moves: [], times: [] };
  const bod = bodToSfen(lines);
  if (bod) record.startSfen = bod;
  let game: Game | null = null;
  let previousTo: number | null = null;
  let sawMove = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('*') || line.startsWith('&')) continue;
    if (/^変化[:：]/.test(line)) break; // 只讀主線
    const header = /^([^:：\s]+)[:：](.*)$/.exec(line);
    if (header && !/^\d/.test(line)) {
      const [, key, value] = header as unknown as [string, string, string];
      const trimmed = value.trim();
      if (key === '手合割') {
        const name = HANDICAP_ALIASES[trimmed] ?? trimmed;
        const handicap = HANDICAPS.find((h) => h.name === name);
        if (!handicap && name !== '平手' && !bod) {
          throw new RecordError(`不支援的手合割：${trimmed}`);
        }
        if (handicap && !bod) record.startSfen = handicap.sfen;
      } else if (key === '先手' || key === '下手') {
        if (trimmed) record.sente = trimmed;
      } else if (key === '後手' || key === '上手') {
        if (trimmed) record.gote = trimmed;
      } else if (key === '開始日時') {
        const parsed = Date.parse(trimmed.replace(/\//g, '-').replace(' ', 'T'));
        if (!Number.isNaN(parsed)) record.startedAt = parsed;
      }
      continue;
    }
    const moveLine = /^(\d+)\s+(\S+(?:\s+\S+)?)/.exec(line);
    if (!moveLine) continue;
    game ??= new Game(record.startSfen);
    sawMove = true;
    const body = line.slice((moveLine[1] as string).length).trim();
    const text = body.replace(/^同[\s　]+/, '同');
    const mover = game.turn;
    if (/^(投了)/.test(text)) {
      record.result = { winner: opponentOf(mover), reason: 'resign' };
      break;
    }
    if (/^(切れ負け|時間切れ)/.test(text)) {
      record.result = { winner: opponentOf(mover), reason: 'timeout' };
      break;
    }
    if (/^(中断|千日手|詰み|持将棋|反則|入玉|不詰|封じ手)/.test(text)) break;
    const move = parseKifMove(text, game.position, previousTo);
    if (move === null || !game.play(move)) {
      throw new RecordError(`第 ${moveLine[1]} 手無法解讀或不合法：${body}`);
    }
    record.moves.push(move);
    const spent = parseKifTime(body);
    record.times?.push(spent ?? 0);
    previousTo = moveTo(move);
  }
  if (!sawMove && !bod && !lines.some((line) => line.startsWith('手合割'))) {
    throw new RecordError('看不出是 KIF 棋譜');
  }
  if (record.times?.every((t) => t === 0)) delete record.times;
  return record;
}

/** 自動判斷格式 */
export function importRecord(text: string): GameRecord {
  const trimmed = text.trim();
  if (!trimmed) throw new RecordError('內容是空的');
  const looksUsi =
    /^(position|startpos|sfen)\b/.test(trimmed) ||
    /^[1-9lnsgkrbpLNSGKRBP+/]+\s+[bw]\s/.test(trimmed) ||
    /^([1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])(\s|$)/.test(trimmed);
  return looksUsi ? importSfen(trimmed) : importKif(trimmed);
}

/** 棋譜畫面用的簡短寫法：▲７六歩、△同　銀成、▲５五角打（不含出發點） */
export function kifuLabels(startSfen: string, moves: readonly Move[]): string[] {
  const position = Position.fromSfen(startSfen);
  let previousTo: number | null = null;
  return moves.map((move) => {
    const text = moveToKifu(move, position, previousTo).replace(/\(\d\d\)$/, '');
    previousTo = moveTo(move);
    position.make(move);
    return text;
  });
}

export { PIECE_NAMES };
