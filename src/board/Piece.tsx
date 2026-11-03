import type { Color } from '../core/types.ts';
import {
  BISHOP,
  DRAGON,
  GOLD,
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
} from '../core/types.ts';

/** 棋子上的字：王將分上下手，成香、成桂、成銀用兩字直排 */
export function pieceLabel(type: number, color: Color): string {
  switch (type) {
    case KING:
      return color === SENTE ? '玉将' : '王将';
    case ROOK:
      return '飛';
    case BISHOP:
      return '角';
    case GOLD:
      return '金';
    case SILVER:
      return '銀';
    case KNIGHT:
      return '桂';
    case LANCE:
      return '香';
    case PAWN:
      return '歩';
    case TOKIN:
      return 'と';
    case NARIKYO:
      return '成香';
    case NARIKEI:
      return '成桂';
    case NARIGIN:
      return '成銀';
    case HORSE:
      return '馬';
    case DRAGON:
      return '龍';
    default:
      return '';
  }
}

/** 真實的駒大小不一：王最大、步最小 */
const SCALE: Record<number, number> = {
  [KING]: 1,
  [ROOK]: 0.97,
  [BISHOP]: 0.97,
  [DRAGON]: 0.97,
  [HORSE]: 0.97,
  [GOLD]: 0.93,
  [SILVER]: 0.93,
  [NARIGIN]: 0.93,
  [KNIGHT]: 0.9,
  [NARIKEI]: 0.9,
  [LANCE]: 0.87,
  [NARIKYO]: 0.87,
  [PAWN]: 0.84,
  [TOKIN]: 0.84,
};

const W = 84;
const H = 96;
/** 五角形：尖頂、肩、略寬的底 */
const OUTLINE = `M0 ${-H / 2} L${W * 0.4} ${-H * 0.33} L${W * 0.5} ${H / 2} L${-W * 0.5} ${H / 2} L${-W * 0.4} ${-H * 0.33} Z`;
const BEVEL = `M0 ${-H / 2 + 6} L${W * 0.4 - 6} ${-H * 0.33 + 4} L${W * 0.5 - 7} ${H / 2 - 5} L${-W * 0.5 + 7} ${H / 2 - 5} L${-W * 0.4 + 6} ${-H * 0.33 + 4} Z`;

/** 整份文件只需要一份的漸層定義；放在 App 最外層 */
export function KomaDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="koma-wood" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#f7e3ae" />
          <stop offset="0.5" stopColor="#ecc983" />
          <stop offset="1" stopColor="#d7a95f" />
        </linearGradient>
        <linearGradient id="koma-bevel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6d8" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff6d8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="komadai-wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a8703f" />
          <stop offset="1" stopColor="#7b4b25" />
        </linearGradient>
      </defs>
    </svg>
  );
}

interface PieceProps {
  type: number;
  color: Color;
  /** 盤面下方是哪一方；對方的棋子倒著放 */
  bottom: Color;
  className?: string;
  ghost?: boolean;
}

/** 以 (0,0) 為中心、約 84 × 96 的棋子 */
export function Piece({ type, color, bottom, className, ghost }: PieceProps) {
  const scale = SCALE[type] ?? 0.9;
  const label = pieceLabel(type, color);
  const chars = [...label];
  const promoted = type > KING;
  const ink = promoted ? '#b4231a' : '#1d140b';
  const rotate = color === bottom ? 0 : 180;
  return (
    <g transform={`rotate(${rotate}) scale(${scale})`} opacity={ghost ? 0.5 : 1}>
      <g className={className}>
        <path d={OUTLINE} transform="translate(3 5)" fill="#2b1a08" opacity="0.32" />
        <path
          d={OUTLINE}
          fill="url(#koma-wood)"
          stroke="#8a6331"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d={BEVEL}
          fill="none"
          stroke="url(#koma-bevel)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {chars.length === 1 ? (
          <text
            x="0"
            y="17"
            textAnchor="middle"
            fontFamily="var(--font-koma)"
            fontWeight="800"
            fontSize="52"
            fill={ink}
          >
            {label}
          </text>
        ) : (
          chars.map((char, index) => (
            <text
              key={index}
              x="0"
              y={index === 0 ? -6 : 31}
              textAnchor="middle"
              fontFamily="var(--font-koma)"
              fontWeight="800"
              fontSize="35"
              fill={ink}
            >
              {char}
            </text>
          ))
        )}
      </g>
    </g>
  );
}

/** 單獨一枚棋子的小 SVG（駒台、升變選擇、說明文字裡用） */
export function PieceIcon({
  type,
  color = SENTE,
  size = 40,
  upright = true,
}: {
  type: number;
  color?: Color;
  size?: number;
  upright?: boolean;
}) {
  return (
    <svg viewBox="-50 -56 100 112" width={size} height={size * 1.12} aria-hidden="true">
      <Piece type={type} color={color} bottom={upright ? color : ((1 - color) as Color)} />
    </svg>
  );
}
