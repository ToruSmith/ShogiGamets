import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import kayaUrl from '../assets/kaya.svg';
import type { Move } from '../core/move.ts';
import { isDrop, moveDropType, moveFrom, movePromotes, moveTo } from '../core/move.ts';
import type { Position } from '../core/position.ts';
import type { Color } from '../core/types.ts';
import { CELLS, EMPTY, HAND_TYPES, colorOf, opponentOf, typeOf } from '../core/types.ts';
import { useT } from '../i18n/index.ts';
import { cn } from '../lib/utils.ts';
import {
  BOARD_H,
  BOARD_SIDE,
  BOARD_W,
  CELL_H,
  CELL_W,
  MARGIN_LEFT,
  MARGIN_TOP,
  centerOf,
  displayOf,
  squareAtPoint,
} from './geometry.ts';
import { Piece, PieceIcon, pieceLabel } from './Piece.tsx';

const WIDE = '１２３４５６７８９';
const KANJI = '一二三四五六七八九';

export interface BoardArrow {
  move: Move;
  tone?: 'best' | 'played';
}

interface ShogiBoardProps {
  position: Position;
  /** 盤面下方的一方 */
  bottom: Color;
  /** 目前可以走的合法手；空陣列代表不能操作 */
  legalMoves: readonly Move[];
  lastMove: Move | null;
  onMove?: (move: Move) => void;
  showLegal?: boolean;
  showCoordinates?: boolean;
  autoPromote?: boolean;
  arrows?: BoardArrow[];
  /** 駒台上的名牌 */
  labels?: [React.ReactNode, React.ReactNode];
  /** 用來判斷「這是新的一手」而播放動畫；通常傳手數 */
  ply: number;
}

type Selection = { kind: 'square'; square: number } | { kind: 'hand'; type: number } | null;

interface Drag {
  selection: NonNullable<Selection>;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
}

/* ───────────── 棋子身分：讓同一枚棋子移動時能滑過去 ───────────── */

interface Identity {
  board: Int8Array;
  ids: Int32Array;
  nextId: number;
  ply: number;
  dropped: number;
  flipped: number;
}

function trackIdentity(
  previous: Identity | null,
  board: Int8Array,
  lastMove: Move | null,
  ply: number,
): Identity {
  const ids = new Int32Array(CELLS);
  let nextId = previous?.nextId ?? 1;
  let dropped = 0;
  let flipped = 0;
  const forward = previous && ply === previous.ply + 1 && lastMove !== null;
  if (previous && forward) {
    ids.set(previous.ids);
    const to = moveTo(lastMove);
    if (isDrop(lastMove)) {
      ids[to] = nextId++;
      dropped = ids[to] as number;
    } else {
      const from = moveFrom(lastMove);
      ids[to] = previous.ids[from] as number;
      ids[from] = 0;
      if (movePromotes(lastMove)) flipped = ids[to] as number;
    }
  } else if (previous) {
    // 跳到別的局面（悔棋、復盤）：位置沒變的棋子保留身分
    for (let square = 0; square < CELLS; square++) {
      if (board[square] !== EMPTY && previous.board[square] === board[square]) {
        ids[square] = previous.ids[square] as number;
      }
    }
  }
  for (let square = 0; square < CELLS; square++) {
    if (board[square] === EMPTY) ids[square] = 0;
    else if (!ids[square]) ids[square] = nextId++;
  }
  return { board: board.slice(), ids, nextId, ply, dropped, flipped };
}

/* ───────────── 元件 ───────────── */

export function ShogiBoard({
  position,
  bottom,
  legalMoves,
  lastMove,
  onMove,
  showLegal = true,
  showCoordinates = true,
  autoPromote = false,
  arrows = [],
  labels,
  ply,
}: ShogiBoardProps) {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [promotion, setPromotion] = useState<{ promote: Move; plain: Move } | null>(null);
  const identity = useRef<Identity | null>(null);

  const board = position.board;
  const boardKey = position.repetitionKey;
  const ids = useMemo(() => {
    identity.current = trackIdentity(identity.current, board, lastMove, ply);
    return identity.current;
    // boardKey 代表局面內容；board 本身是同一個可變陣列
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, ply]);

  const mover = position.turn;
  const interactive = legalMoves.length > 0 && Boolean(onMove);

  // 局面變了就清掉選取
  useEffect(() => {
    setSelection(null);
    setPromotion(null);
    setDrag(null);
  }, [boardKey]);

  const targets = useMemo(() => {
    if (!selection) return [] as Move[];
    return legalMoves.filter((move) =>
      selection.kind === 'square'
        ? !isDrop(move) && moveFrom(move) === selection.square
        : isDrop(move) && moveDropType(move) === selection.type,
    );
  }, [selection, legalMoves]);
  const targetSquares = useMemo(() => new Set(targets.map(moveTo)), [targets]);

  const checkSquare = position.inCheck() ? position.kings[mover] : -1;

  function attempt(to: number, from: NonNullable<Selection>): boolean {
    const candidates = legalMoves.filter(
      (move) =>
        moveTo(move) === to &&
        (from.kind === 'square'
          ? !isDrop(move) && moveFrom(move) === from.square
          : isDrop(move) && moveDropType(move) === from.type),
    );
    if (candidates.length === 0) return false;
    const promote = candidates.find(movePromotes);
    const plain = candidates.find((move) => !movePromotes(move));
    setSelection(null);
    if (promote !== undefined && plain !== undefined && !autoPromote) {
      setPromotion({ promote, plain });
    } else {
      onMove?.(promote ?? plain ?? (candidates[0] as Move));
    }
    return true;
  }

  function ownsSquare(square: number): boolean {
    const piece = board[square] as number;
    return piece !== EMPTY && colorOf(piece) === mover;
  }

  function svgPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  function squareFromClient(clientX: number, clientY: number): number | null {
    const point = svgPoint(clientX, clientY);
    return point ? squareAtPoint(point.x, point.y, bottom) : null;
  }

  function handleBoardDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (!interactive || promotion) {
      setPromotion(null);
      return;
    }
    const square = squareFromClient(event.clientX, event.clientY);
    if (square === null) return;
    if (selection && targetSquares.has(square)) {
      attempt(square, selection);
      return;
    }
    if (selection?.kind === 'square' && selection.square === square) {
      setSelection(null);
      return;
    }
    if (ownsSquare(square)) {
      const next: Selection = { kind: 'square', square };
      setSelection(next);
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
      setDrag({
        selection: next,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        active: false,
      });
    } else {
      setSelection(null);
    }
  }

  function handleHandDown(event: ReactPointerEvent<HTMLButtonElement>, type: number) {
    if (!interactive) return;
    const next: Selection = { kind: 'hand', type };
    setSelection((current) => (current?.kind === 'hand' && current.type === type ? null : next));
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    setDrag({
      selection: next,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
    });
  }

  function handleMove(event: ReactPointerEvent) {
    if (!drag) return;
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6;
    setDrag({ ...drag, x: event.clientX, y: event.clientY, active: drag.active || moved });
  }

  function handleUp(event: ReactPointerEvent) {
    if (!drag) return;
    setDrag(null);
    if (!drag.active) return; // 單純點擊：保留選取
    const square = squareFromClient(event.clientX, event.clientY);
    if (square === null || !attempt(square, drag.selection)) {
      if (drag.selection.kind === 'hand') setSelection(null);
    }
  }

  const dragging = drag?.active ? drag.selection : null;
  const hiddenSquare = dragging?.kind === 'square' ? dragging.square : -1;

  /* ── 盤面 ── */
  const lines = [];
  for (let i = 0; i <= 9; i++) {
    const width = i === 0 || i === 9 ? 3.2 : 1.6;
    lines.push(
      <line
        key={`v${i}`}
        x1={MARGIN_LEFT + i * CELL_W}
        y1={MARGIN_TOP}
        x2={MARGIN_LEFT + i * CELL_W}
        y2={MARGIN_TOP + 9 * CELL_H}
        stroke="var(--kaya-line)"
        strokeWidth={width}
      />,
      <line
        key={`h${i}`}
        x1={MARGIN_LEFT}
        y1={MARGIN_TOP + i * CELL_H}
        x2={MARGIN_LEFT + 9 * CELL_W}
        y2={MARGIN_TOP + i * CELL_H}
        stroke="var(--kaya-line)"
        strokeWidth={width}
      />,
    );
  }
  const stars = [
    [3, 3],
    [6, 3],
    [3, 6],
    [6, 6],
  ].map(([c, r]) => (
    <circle
      key={`${c}-${r}`}
      cx={MARGIN_LEFT + (c as number) * CELL_W}
      cy={MARGIN_TOP + (r as number) * CELL_H}
      r="6"
      fill="var(--kaya-line)"
    />
  ));

  const cellRect = (square: number, fill: string, key: string, className?: string) => {
    const { column, row } = displayOf(square, bottom);
    return (
      <rect
        key={key}
        className={className}
        x={MARGIN_LEFT + column * CELL_W + 1}
        y={MARGIN_TOP + row * CELL_H + 1}
        width={CELL_W - 2}
        height={CELL_H - 2}
        fill={fill}
      />
    );
  };

  const highlights = [];
  if (lastMove !== null) {
    if (!isDrop(lastMove))
      highlights.push(cellRect(moveFrom(lastMove), 'rgb(120 70 10 / 0.14)', 'from'));
    highlights.push(cellRect(moveTo(lastMove), 'rgb(120 70 10 / 0.3)', 'to'));
  }
  if (selection?.kind === 'square')
    highlights.push(cellRect(selection.square, 'rgb(40 71 119 / 0.28)', 'sel'));
  if (checkSquare >= 0) {
    highlights.push(cellRect(checkSquare, 'rgb(190 40 30 / 0.4)', 'check', 'check-mark'));
  }

  const hints =
    showLegal && interactive
      ? [...targetSquares].map((square) => {
          const { x, y } = centerOf(square, bottom);
          const capture = board[square] !== EMPTY;
          return capture ? (
            <circle
              key={`h${square}`}
              cx={x}
              cy={y}
              r="44"
              fill="none"
              stroke="rgb(40 71 119 / 0.6)"
              strokeWidth="6"
            />
          ) : (
            <circle key={`h${square}`} cx={x} cy={y} r="13" fill="rgb(40 71 119 / 0.55)" />
          );
        })
      : [];

  const pieces = [];
  for (let square = 0; square < CELLS; square++) {
    const piece = board[square] as number;
    if (piece === EMPTY) continue;
    const id = ids.ids[square] as number;
    const { x, y } = centerOf(square, bottom);
    const type = typeOf(piece);
    const animation =
      id === ids.dropped ? 'koma-drop' : id === ids.flipped ? 'koma-flip' : undefined;
    pieces.push(
      <g
        key={id}
        className="piece-g"
        style={{
          transform: `translate(${x}px, ${y + 2}px)`,
          opacity: square === hiddenSquare ? 0.25 : 1,
        }}
        data-square={square}
        data-piece={`${colorOf(piece)}-${type}`}
      >
        <Piece
          key={`${id}-${type}`}
          type={type}
          color={colorOf(piece)}
          bottom={bottom}
          {...(animation ? { className: animation } : {})}
        />
      </g>,
    );
  }

  const arrowMarks = arrows.map(({ move, tone = 'best' }, index) => {
    const to = centerOf(moveTo(move), bottom);
    const color = tone === 'best' ? 'rgb(40 90 170 / 0.72)' : 'rgb(170 50 30 / 0.6)';
    if (isDrop(move)) {
      return (
        <g key={`a${index}`} transform={`translate(${to.x} ${to.y})`} opacity="0.75">
          <circle r="48" fill="none" stroke={color} strokeWidth="6" strokeDasharray="10 8" />
          <Piece type={moveDropType(move)} color={mover} bottom={bottom} ghost />
        </g>
      );
    }
    const from = centerOf(moveFrom(move), bottom);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const tipX = to.x - Math.cos(angle) * 18;
    const tipY = to.y - Math.sin(angle) * 18;
    return (
      <g key={`a${index}`} pointerEvents="none">
        <line
          x1={from.x}
          y1={from.y}
          x2={tipX}
          y2={tipY}
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
        />
        <polygon
          points="0,-22 34,0 0,22"
          fill={color}
          transform={`translate(${tipX} ${tipY}) rotate(${(angle * 180) / Math.PI})`}
        />
      </g>
    );
  });

  const coordinates = showCoordinates ? (
    <g fontFamily="var(--font-koma)" fontSize="26" fill="#4a3216">
      {Array.from({ length: 9 }, (_, column) => (
        <text
          key={`f${column}`}
          x={MARGIN_LEFT + (column + 0.5) * CELL_W}
          y={MARGIN_TOP - 13}
          textAnchor="middle"
        >
          {WIDE[bottom === 0 ? 8 - column : column]}
        </text>
      ))}
      {Array.from({ length: 9 }, (_, row) => (
        <text
          key={`r${row}`}
          x={MARGIN_LEFT + 9 * CELL_W + 23}
          y={MARGIN_TOP + (row + 0.5) * CELL_H + 9}
          textAnchor="middle"
        >
          {KANJI[bottom === 0 ? row : 8 - row]}
        </text>
      ))}
    </g>
  ) : null;

  /* ── 升變選擇（HTML 按鈕疊在目的格上） ── */
  let promotionPicker = null;
  if (promotion) {
    const to = moveTo(promotion.promote);
    const from = moveFrom(promotion.promote);
    const type = typeOf(board[from] as number);
    const { x, y } = centerOf(to, bottom);
    const left = (x / BOARD_W) * 100;
    const top = (y / (BOARD_H + BOARD_SIDE)) * 100;
    promotionPicker = (
      <div
        role="dialog"
        aria-label={t('play.promoteTitle')}
        className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 gap-1 rounded-[4px] border border-[#5e3a1d] bg-[#3a2716]/95 p-1.5 shadow-xl"
        style={{
          left: `${Math.min(84, Math.max(16, left))}%`,
          top: `${Math.min(88, Math.max(10, top))}%`,
        }}
      >
        {[
          { move: promotion.promote, pieceType: type + 8, label: t('play.promote') },
          { move: promotion.plain, pieceType: type, label: t('play.noPromote') },
        ].map(({ move, pieceType, label }) => (
          <button
            key={label}
            type="button"
            className="flex flex-col items-center gap-0.5 rounded-[3px] px-2 py-1 text-xs text-[#f6e7c8] outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#f6e7c8]"
            onClick={() => {
              setPromotion(null);
              onMove?.(move);
            }}
          >
            <PieceIcon type={pieceType} color={mover} size={44} />
            {label}
          </button>
        ))}
      </div>
    );
  }

  /* ── 駒台 ── */
  const hand = (color: Color, place: 'top' | 'bottom') => {
    const counts = position.hands[color];
    const mine = interactive && color === mover;
    const items = HAND_TYPES.filter((type) => (counts[type] as number) > 0);
    return (
      <div
        className={cn(
          'komadai flex min-h-[64px] flex-col gap-1 rounded-[3px] p-2 lg:min-h-[180px] lg:w-[150px]',
          place === 'top' ? 'lg:self-start' : 'lg:self-end',
        )}
        data-hand={color}
      >
        {labels && (
          <div className="flex items-center justify-between gap-2 text-xs text-[#f4e3c3]">
            {labels[color]}
          </div>
        )}
        <div
          className={cn(
            'flex flex-wrap gap-0.5',
            place === 'top' && 'flex-row-reverse lg:flex-row',
          )}
        >
          {items.length === 0 && (
            <span className="px-1 py-2 text-xs text-[#f4e3c3]/50">{t('play.none')}</span>
          )}
          {items.map((type) => {
            const count = counts[type] as number;
            const selected = selection?.kind === 'hand' && selection.type === type;
            return (
              <button
                key={type}
                type="button"
                disabled={!mine}
                aria-pressed={selected}
                aria-label={`${pieceLabel(type, color)} ×${count}`}
                data-hand-piece={type}
                onPointerDown={(event) => handleHandDown(event, type)}
                onPointerMove={handleMove}
                onPointerUp={handleUp}
                className={cn(
                  'relative flex touch-none items-center rounded-[3px] p-0.5 outline-none transition-colors disabled:cursor-default',
                  mine && 'hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#f4e3c3]',
                  selected && 'bg-[rgb(125_160_220/0.35)]',
                  drag?.active &&
                    dragging?.kind === 'hand' &&
                    dragging.type === type &&
                    'opacity-40',
                )}
              >
                <PieceIcon type={type} color={color} upright={color === bottom} size={36} />
                {count > 1 && (
                  <span className="num absolute -right-0.5 -bottom-0.5 rounded-[2px] bg-[#1d140b] px-1 text-[11px] leading-4 font-semibold text-[#f6e7c8]">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const top = opponentOf(bottom);
  return (
    <div className="board-area grid w-full grid-cols-1 gap-2 lg:grid-cols-[150px_minmax(0,1fr)_150px] lg:gap-3">
      {hand(top, 'top')}
      <div
        className="relative mx-auto w-full"
        style={{ maxWidth: 'min(100%, calc((100dvh - 210px) * 0.88))' }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${BOARD_W} ${BOARD_H + BOARD_SIDE}`}
          className="board-svg block w-full touch-none select-none"
          role="img"
          aria-label="shogi board"
          onPointerDown={handleBoardDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={() => setDrag(null)}
        >
          <defs>
            <linearGradient id="board-side" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--board-edge)" />
              <stop offset="1" stopColor="var(--board-side)" />
            </linearGradient>
          </defs>
          <rect
            x="4"
            y={BOARD_H - 6}
            width={BOARD_W - 8}
            height={BOARD_SIDE + 6}
            rx="4"
            fill="url(#board-side)"
          />
          <image
            href={kayaUrl}
            x="0"
            y="0"
            width={BOARD_W}
            height={BOARD_H}
            preserveAspectRatio="none"
          />
          <rect
            x="0.5"
            y="0.5"
            width={BOARD_W - 1}
            height={BOARD_H - 1}
            fill="none"
            stroke="rgb(90 55 15 / 0.35)"
          />
          {highlights}
          {lines}
          {stars}
          {coordinates}
          {pieces}
          {hints}
          {arrowMarks}
        </svg>
        {promotionPicker}
      </div>
      {hand(bottom, 'bottom')}
      {drag?.active && (
        <svg
          className="pointer-events-none fixed z-50"
          style={{ left: drag.x - 34, top: drag.y - 44, width: 68, height: 78 }}
          viewBox="-50 -56 100 112"
          aria-hidden="true"
        >
          <Piece
            type={
              drag.selection.kind === 'hand'
                ? drag.selection.type
                : typeOf(board[drag.selection.square] as number)
            }
            color={mover}
            bottom={bottom}
          />
        </svg>
      )}
    </div>
  );
}
