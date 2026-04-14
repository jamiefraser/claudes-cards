/**
 * CribbageBoard — pure React + SVG cribbage scoring board.
 * SPEC.md §19 Story 8.5
 *
 * ViewBox: 720×160 (landscape orientation)
 * 121 holes per lane, grouped in sets of 5
 * Skunk line at hole 91 (vertical red line, "S" label)
 * Double-skunk line at hole 61 ("SS" label, orange)
 * Wood grain background via feTurbulence filter
 * Goal hole at 121 with gold border
 */
import React from 'react';
import type { CribbageBoardState } from '@shared/gameState';
import { CribbagePeg } from './CribbagePeg';
import en from '@/i18n/en.json';

export interface CribbageBoardProps {
  boardState: CribbageBoardState;
  /** Map of playerId → display name */
  playerNames: Record<string, string>;
}

// Board dimensions
const VIEWBOX_WIDTH = 720;
const VIEWBOX_HEIGHT = 160;

// Layout constants
const BOARD_MARGIN_LEFT = 30;
const BOARD_MARGIN_RIGHT = 20;
const LANE_HEIGHT = 18;
const LANE_TOP = 28;
const HOLE_RADIUS = 5;
const GOAL_HOLE_RADIUS = 7;
const GROUP_GAP = 4; // extra gap between groups of 5 holes
const HOLE_SPACING = 5.2; // px per hole within a group

// Hole count
const TOTAL_HOLES = 121;
const HOLES_PER_GROUP = 5;

/**
 * Compute the x-coordinate for a given hole number (1-indexed, 0 = start).
 * Holes run left to right. Grouped in sets of 5 with a small gap between groups.
 */
function holeX(holeNumber: number): number {
  if (holeNumber === 0) return BOARD_MARGIN_LEFT;

  // hole 121 (goal) sits slightly separate at the far right
  if (holeNumber === 121) {
    return VIEWBOX_WIDTH - BOARD_MARGIN_RIGHT - 4;
  }

  const idx = holeNumber - 1; // 0-indexed
  const groupIndex = Math.floor(idx / HOLES_PER_GROUP);
  const posInGroup = idx % HOLES_PER_GROUP;

  // Available width for holes 1-120
  const availableWidth =
    VIEWBOX_WIDTH - BOARD_MARGIN_LEFT - BOARD_MARGIN_RIGHT - 20; // leave room for goal hole

  // Total groups for holes 1-120
  const numGroups = Math.ceil(120 / HOLES_PER_GROUP); // 24
  const groupWidth = HOLE_SPACING * HOLES_PER_GROUP;
  const totalGroupsWidth = numGroups * groupWidth + (numGroups - 1) * GROUP_GAP;
  const startX = BOARD_MARGIN_LEFT + 12;
  const scaleFactor = availableWidth / totalGroupsWidth;

  return (
    startX +
    (groupIndex * (groupWidth + GROUP_GAP) + posInGroup * HOLE_SPACING) *
      scaleFactor
  );
}

/**
 * Compute the y-coordinate (center) of a lane by lane index.
 */
function laneY(laneIndex: number): number {
  return LANE_TOP + laneIndex * (LANE_HEIGHT + 6);
}

const LANE_COLORS: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
};

const LANE_EMPTY_FILL = '#D4C5A9';

const SKUNK_HOLE = 91;
const DOUBLE_SKUNK_HOLE = 61;

export function CribbageBoard({ boardState, playerNames }: CribbageBoardProps) {
  const { pegs } = boardState;
  const laneCount = pegs.length;

  const skunkX = holeX(SKUNK_HOLE);
  const doubleSkunkX = holeX(DOUBLE_SKUNK_HOLE);

  const boardHeight = LANE_TOP + laneCount * (LANE_HEIGHT + 6) + 16;

  return (
    <div className="w-full">
      {/* The board's viewBox is 720 wide with a 4.5:1 aspect ratio. At a
          375px-wide viewport the board would render ~83px tall and the holes
          become unreadable, so below `sm` we allow horizontal scrolling with
          a readable minimum width. */}
      <div className="overflow-x-auto -mx-1 sm:mx-0">
        {/* SVG Board */}
        <svg
          role="img"
          aria-label={en.table.cribbageBoardAriaLabel}
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${boardHeight}`}
          xmlns="http://www.w3.org/2000/svg"
          className="w-full min-w-[520px] sm:min-w-0"
          style={{ maxHeight: '200px' }}
        >
        <defs>
          {/* Wood grain filter */}
          <filter id="wood-grain" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.65"
              numOctaves="3"
              stitchTiles="stitch"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="3"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>

        {/* Board background — wood walnut */}
        <rect
          x="0"
          y="0"
          width={VIEWBOX_WIDTH}
          height={boardHeight}
          rx="10"
          ry="10"
          fill="#8B6914"
          filter="url(#wood-grain)"
        />

        {/* Darker inner board surface */}
        <rect
          x="8"
          y="8"
          width={VIEWBOX_WIDTH - 16}
          height={boardHeight - 16}
          rx="6"
          ry="6"
          fill="#6B4F0E"
        />

        {/* Lanes and holes */}
        {pegs.map((pegSet, laneIdx) => {
          const cy = laneY(laneIdx);
          const laneColor = LANE_COLORS[pegSet.color] ?? '#888';

          return (
            <g key={pegSet.playerId} data-lane={pegSet.playerId}>
              {/* Lane label */}
              <circle cx={BOARD_MARGIN_LEFT - 10} cy={cy} r={5} fill={laneColor} />

              {/* Holes 1–120 */}
              {Array.from({ length: 120 }, (_, i) => {
                const holeNum = i + 1;
                const hx = holeX(holeNum);
                return (
                  <circle
                    key={holeNum}
                    data-hole={`${pegSet.playerId}-${holeNum}`}
                    cx={hx}
                    cy={cy}
                    r={HOLE_RADIUS}
                    fill={LANE_EMPTY_FILL}
                    stroke="#5a4008"
                    strokeWidth="0.5"
                  />
                );
              })}

              {/* Goal hole at 121 */}
              <circle
                data-hole={`${pegSet.playerId}-121`}
                data-goal-hole="true"
                cx={holeX(121)}
                cy={cy}
                r={GOAL_HOLE_RADIUS}
                fill={LANE_EMPTY_FILL}
                stroke="#FFD700"
                strokeWidth="2"
              />
            </g>
          );
        })}

        {/* Double-skunk line at hole 61 */}
        <line
          data-double-skunk-line="true"
          x1={doubleSkunkX}
          y1={LANE_TOP - 8}
          x2={doubleSkunkX}
          y2={LANE_TOP + laneCount * (LANE_HEIGHT + 6) + 4}
          stroke="#f97316"
          strokeWidth="1.5"
          strokeDasharray="3,2"
        />
        <text
          x={doubleSkunkX - 2}
          y={LANE_TOP - 10}
          fill="#f97316"
          fontSize="7"
          fontWeight="bold"
          textAnchor="middle"
        >
          {en.table.doubleSkunkLabel}
        </text>

        {/* Skunk line at hole 91 */}
        <line
          data-skunk-line="true"
          x1={skunkX}
          y1={LANE_TOP - 8}
          x2={skunkX}
          y2={LANE_TOP + laneCount * (LANE_HEIGHT + 6) + 4}
          stroke="#ef4444"
          strokeWidth="1.5"
          strokeDasharray="3,2"
        />
        <text
          x={skunkX + 4}
          y={LANE_TOP - 10}
          fill="#ef4444"
          fontSize="7"
          fontWeight="bold"
          textAnchor="middle"
        >
          {en.table.skunkLabel}
        </text>

        {/* Pegs (rendered on top of holes) */}
        {pegs.map((pegSet, laneIdx) => {
          const cy = laneY(laneIdx);
          const frontX = holeX(pegSet.frontPeg);
          const backX = holeX(pegSet.backPeg);

          return (
            <g key={`pegs-${pegSet.playerId}`}>
              {/* Back peg first so front renders on top */}
              <CribbagePeg
                playerId={pegSet.playerId}
                pegType="back"
                x={backX}
                y={cy}
                color={pegSet.color}
                position={pegSet.backPeg}
              />
              <CribbagePeg
                playerId={pegSet.playerId}
                pegType="front"
                x={frontX}
                y={cy}
                color={pegSet.color}
                position={pegSet.frontPeg}
              />
            </g>
          );
        })}
        </svg>
      </div>

      {/* Text scores below the board — required for screen readers (SPEC.md §19 Story 8.5) */}
      <div className="flex flex-row flex-wrap gap-x-4 gap-y-1 mt-1 px-2">
        {pegs.map(pegSet => {
          const name = playerNames[pegSet.playerId] ?? pegSet.playerId;
          return (
            <span
              key={pegSet.playerId}
              className="text-sm text-slate-300"
              style={{ color: LANE_COLORS[pegSet.color] }}
            >
              {en.table.scorePoints
                .replace('{name}', name)
                .replace('{score}', String(pegSet.frontPeg))}
            </span>
          );
        })}
      </div>
    </div>
  );
}
