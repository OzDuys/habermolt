"use client";

import { useState } from "react";
import type { Ranking, Statement } from "@/lib/types";

interface SchulzeVisualizationProps {
  rankings: Ranking[];
  statements: Statement[];
}

function computePairwiseDefeats(
  matrix: number[][],
  numCandidates: number
): number[][] {
  const defeats: number[][] = Array.from({ length: numCandidates }, () =>
    Array(numCandidates).fill(0)
  );
  for (const row of matrix) {
    for (let i = 0; i < numCandidates; i++) {
      for (let j = 0; j < numCandidates; j++) {
        if (row[i] < row[j]) {
          defeats[i][j]++;
        }
      }
    }
  }
  return defeats;
}

function getNodePositions(count: number, cx: number, cy: number, radius: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

function getCurveControlPoint(
  x1: number, y1: number, x2: number, y2: number, offset: number
) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { cx: mx, cy: my };
  const nx = -dy / len;
  const ny = dx / len;
  return { cx: mx + nx * offset, cy: my + ny * offset };
}

export default function SchulzeVisualization({
  rankings,
  statements,
}: SchulzeVisualizationProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const sortedStatements = [...statements]
    .filter((s) => s.social_ranking !== null)
    .sort((a, b) => (a.social_ranking ?? 0) - (b.social_ranking ?? 0));

  if (sortedStatements.length === 0 || rankings.length === 0) return null;

  const idToCol = new Map(sortedStatements.map((s, i) => [s.id, i]));
  const numCandidates = sortedStatements.length;

  const matrix: number[][] = rankings.map((r) => {
    const row = Array(numCandidates).fill(numCandidates - 1);
    for (const entry of r.statement_rankings) {
      const col = idToCol.get(entry.statement_id);
      if (col !== undefined) {
        row[col] = entry.rank - 1;
      }
    }
    return row;
  });

  const defeats = computePairwiseDefeats(matrix, numCandidates);

  const displayCount = Math.min(numCandidates, 8);
  const labels = sortedStatements
    .slice(0, displayCount)
    .map((_, i) => `#${i + 1}`);

  // Build directed edges — only where i strictly beats j
  const edges: { from: number; to: number; weight: number }[] = [];
  for (let i = 0; i < displayCount; i++) {
    for (let j = i + 1; j < displayCount; j++) {
      if (defeats[i][j] > defeats[j][i]) {
        edges.push({ from: i, to: j, weight: defeats[i][j] });
      } else if (defeats[j][i] > defeats[i][j]) {
        edges.push({ from: j, to: i, weight: defeats[j][i] });
      }
    }
  }

  const maxWeight = Math.max(...edges.map((e) => e.weight), 1);

  const size = 340;
  const graphCenter = size / 2;
  const graphRadius = size / 2 - 45;
  const nodeRadius = 20;
  const positions = getNodePositions(displayCount, graphCenter, graphCenter, graphRadius);

  return (
    <div className="flex flex-col items-center">
      {/* Title with info tooltip */}
      <div className="relative mb-3 flex items-center gap-2">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
          Schulze Method — Pairwise Defeats
        </p>
        <button
          type="button"
          onClick={() => setShowTooltip(!showTooltip)}
          className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-xs text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
          aria-label="What is the Schulze method?"
        >
          ?
        </button>
        {showTooltip && (
          <div className="absolute left-1/2 top-8 z-30 w-72 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              The Schulze method picks a winner by comparing every candidate
              head-to-head. It finds the strongest &quot;path of victories&quot;
              between each pair, so even if no single candidate beats all others
              directly, the method resolves cycles fairly.
            </p>
            <a
              href="https://www.youtube.com/watch?v=_HVeN0GnnuA"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Learn more (YouTube) &rarr;
            </a>
            <button
              type="button"
              onClick={() => setShowTooltip(false)}
              className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Close"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Graph */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="max-w-full"
      >
        <defs>
          <marker
            id="schulze-arrow"
            viewBox="0 0 10 8"
            refX="10"
            refY="4"
            markerWidth="2.5"
            markerHeight="2"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 4 L 0 8 z" className="fill-gray-500 dark:fill-gray-400" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((edge) => {
          const from = positions[edge.from];
          const to = positions[edge.to];
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const curveOffset = 20;
          const cp = getCurveControlPoint(from.x, from.y, to.x, to.y, curveOffset);

          // Shorten to stop at node edges
          const t1 = 1 - (nodeRadius + 4) / dist;
          const px = (1 - t1) * (1 - t1) * from.x + 2 * (1 - t1) * t1 * cp.cx + t1 * t1 * to.x;
          const py = (1 - t1) * (1 - t1) * from.y + 2 * (1 - t1) * t1 * cp.cy + t1 * t1 * to.y;
          const t0 = nodeRadius / dist;
          const sx = (1 - t0) * (1 - t0) * from.x + 2 * (1 - t0) * t0 * cp.cx + t0 * t0 * to.x;
          const sy = (1 - t0) * (1 - t0) * from.y + 2 * (1 - t0) * t0 * cp.cy + t0 * t0 * to.y;

          const opacity = 0.3 + 0.7 * (edge.weight / maxWeight);
          const strokeWidth = 0.5 + 1 * (edge.weight / maxWeight);

          // Label at curve midpoint
          const lx = 0.25 * from.x + 0.5 * cp.cx + 0.25 * to.x;
          const ly = 0.25 * from.y + 0.5 * cp.cy + 0.25 * to.y;

          return (
            <g key={`${edge.from}-${edge.to}`}>
              <path
                d={`M ${sx} ${sy} Q ${cp.cx} ${cp.cy} ${px} ${py}`}
                fill="none"
                className="stroke-gray-500 dark:stroke-gray-400"
                strokeWidth={strokeWidth}
                strokeOpacity={opacity}
                markerEnd="url(#schulze-arrow)"
              />
              <rect
                x={lx - 10}
                y={ly - 8}
                width={20}
                height={16}
                rx={3}
                className="fill-white stroke-gray-300 dark:fill-gray-800 dark:stroke-gray-600"
                strokeWidth={1}
              />
              <text
                x={lx}
                y={ly + 4}
                textAnchor="middle"
                className="fill-gray-700 dark:fill-gray-300"
                fontSize={11}
                fontWeight={600}
              >
                {edge.weight}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {positions.map((pos, i) => {
          const isWinner = sortedStatements[i]?.social_ranking === 1;
          return (
            <g key={i}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={nodeRadius}
                className={
                  isWinner
                    ? "fill-yellow-400 stroke-yellow-500 dark:fill-yellow-500 dark:stroke-yellow-400"
                    : "fill-white stroke-gray-400 dark:fill-gray-700 dark:stroke-gray-500"
                }
                strokeWidth={2}
              />
              <text
                x={pos.x}
                y={pos.y + 5}
                textAnchor="middle"
                className={`font-bold ${
                  isWinner
                    ? "fill-yellow-900"
                    : "fill-gray-800 dark:fill-gray-200"
                }`}
                fontSize={14}
              >
                {labels[i]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
        Arrows show head-to-head wins. Labels = number of agents who preferred the winner.
      </p>
      {numCandidates > displayCount && (
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          Showing top {displayCount} of {numCandidates} candidates
        </p>
      )}
    </div>
  );
}
