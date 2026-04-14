"use client";

import React, { useMemo } from 'react';

/**
 * A side-by-side conceptual diagram showing two search behaviours over the same
 * consensus-quality landscape.
 *
 * Metaphor: height = statement quality. The centroid (bland average of all opinions)
 * is a shallow basin — a local minimum that's easy to find but not actually good.
 * The real peaks (specific, substantive consensus positions) require exploring through
 * regions of disagreement to reach.
 *
 * Left: Production — all 32 dots converge to the basin (local minimum).
 * Right: Pool-aware — repulsion pushes agents outward to discover the real peaks.
 */

export default function OptimizationMetaphorDiagram() {
  const red = "#ef4444";
  const green = "#10b981";
  const muted = "#64748b";
  const textMain = "#334155";
  const border = "#e2e8f0";
  const surfaceDim = "#f8fafc";
  const surface = "#ffffff";

  // Basin colors — fading inward to indicate flatness/shallowness
  const basinColors = ["#e2e8f0", "#eef1f5", "#f5f7fa", "#fafbfd"];
  // Peak colors — deepening inward to indicate height/quality
  const peakColors = ["#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399"];

  const panelW = 330;
  const panelH = 280;
  const panelY = 50;
  const leftX = 20;
  const rightX = 370;

  // The central basin (bland centroid — local minimum)
  const basin = { cx: 140, cy: 145, r: 70 };

  // The 4 peaks (good consensus positions — higher quality, harder to find)
  const peaks = [
    { id: "peak1", cx: 255, cy: 65, r: 32, rings: 3 },
    { id: "peak2", cx: 265, cy: 210, r: 35, rings: 3 },
    { id: "peak3", cx: 55, cy: 50, r: 28, rings: 2 },
    { id: "peak4", cx: 155, cy: 240, r: 28, rings: 2 },
  ];

  // Deterministic seeded random
  const seededRandom = (seed: number) => {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  const randomNormal = (seed: number, mean: number, stdDev: number) => {
    const u1 = seededRandom(seed);
    const u2 = seededRandom(seed + 1000);
    const z0 = Math.sqrt(-2.0 * Math.log(u1 === 0 ? 0.001 : u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
  };

  const { leftDots, rightDots } = useMemo(() => {
    const lDots: { x: number; y: number }[] = [];
    const rDots: { x: number; y: number }[] = [];

    // LEFT: All 32 dots clustered in the basin
    for (let i = 0; i < 32; i++) {
      lDots.push({
        x: randomNormal(i * 2, basin.cx, 9),
        y: randomNormal(i * 2 + 1, basin.cy, 9)
      });
    }

    // RIGHT: Distributed across the 4 peaks + a few in the basin
    const distributions = [
      { cx: basin.cx, cy: basin.cy, count: 6, stdDev: 16 },
      { cx: peaks[0].cx, cy: peaks[0].cy, count: 8, stdDev: 10 },
      { cx: peaks[1].cx, cy: peaks[1].cy, count: 7, stdDev: 10 },
      { cx: peaks[2].cx, cy: peaks[2].cy, count: 6, stdDev: 9 },
      { cx: peaks[3].cx, cy: peaks[3].cy, count: 5, stdDev: 9 },
    ];

    let seedOffset = 100;
    distributions.forEach(dist => {
      for (let i = 0; i < dist.count; i++) {
        rDots.push({
          x: randomNormal(seedOffset, dist.cx, dist.stdDev),
          y: randomNormal(seedOffset + 1, dist.cy, dist.stdDev)
        });
        seedOffset += 2;
      }
    });

    return { leftDots: lDots, rightDots: rDots };
  }, []);

  // Shared landscape: basin in center, peaks around it
  const SharedLandscape = () => (
    <g>
      {/* Base connecting shape */}
      <path d="M 30,145 C 30,35 180,10 260,50 C 330,80 310,245 225,265 C 135,285 30,250 30,145 Z" fill="#f1f5f9" opacity="0.5" />

      {/* Basin — concentric rings that get LIGHTER inward (shallow, flat) */}
      {basinColors.map((color, level) => {
        const r = basin.r * (1 - level * 0.22);
        return (
          <circle
            key={`basin-${level}`}
            cx={basin.cx}
            cy={basin.cy}
            r={r}
            fill={color}
            stroke="#cbd5e1"
            strokeWidth="0.5"
            strokeOpacity="0.4"
            strokeDasharray={level > 0 ? "3 2" : "none"}
          />
        );
      })}

      {/* Peaks — concentric rings that get DARKER inward (height = quality) */}
      {peaks.map((peak, i) => (
        <g key={`peak-${i}`}>
          {Array.from({ length: peak.rings }).map((_, level) => {
            const r = peak.r * (1 - level * 0.28);
            return (
              <circle
                key={`peak-ring-${i}-${level}`}
                cx={peak.cx}
                cy={peak.cy}
                r={r}
                fill={peakColors[level + 1]}
                opacity={0.35 + level * 0.15}
                stroke={peakColors[3]}
                strokeWidth="0.5"
                strokeOpacity="0.4"
              />
            );
          })}
        </g>
      ))}
    </g>
  );

  return (
    <svg viewBox="0 0 720 400" className="w-full" style={{ maxWidth: 720, backgroundColor: surfaceDim, borderRadius: 12 }}>
      <defs>
        <clipPath id="clipLeft"><rect x={leftX} y={panelY} width={panelW} height={panelH} rx="10" /></clipPath>
        <clipPath id="clipRight"><rect x={rightX} y={panelY} width={panelW} height={panelH} rx="10" /></clipPath>

        <marker id="arrowRed" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="none" stroke={red} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
        <marker id="arrowGreen" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="none" stroke={green} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {/* Title */}
      <text x="360" y="28" textAnchor="middle" fontSize="13" fontWeight="600" fill={textMain} letterSpacing="0.08em">
        OPTIMISATION ANALOGY
      </text>

      {/* Panels */}
      <rect x={leftX} y={panelY} width={panelW} height={panelH} rx="10" fill={surface} stroke={border} strokeWidth="1" />
      <rect x={rightX} y={panelY} width={panelW} height={panelH} rx="10" fill={surface} stroke={border} strokeWidth="1" />

      {/* Panel Headers */}
      <text x={leftX + panelW / 2} y={panelY + 22} textAnchor="middle" fontSize="12" fontWeight="600" fill={red}>
        Production
      </text>
      <text x={leftX + panelW / 2} y={panelY + 36} textAnchor="middle" fontSize="10" fill={muted}>
        32 statements, all in the local minimum
      </text>

      <text x={rightX + panelW / 2} y={panelY + 22} textAnchor="middle" fontSize="12" fontWeight="600" fill={green}>
        With pool awareness
      </text>
      <text x={rightX + panelW / 2} y={panelY + 36} textAnchor="middle" fontSize="10" fill={muted}>
        32 statements, exploring the real peaks
      </text>

      {/* ── LEFT PANEL ── */}
      <g clipPath="url(#clipLeft)">
        <g transform={`translate(${leftX}, ${panelY})`}>
          <SharedLandscape />

          {/* Basin label */}
          <text x={basin.cx} y={basin.cy - 28} textAnchor="middle" fontSize="8" fontWeight="700" fill={red} opacity="0.8">
            LOCAL MINIMUM
          </text>
          <text x={basin.cx} y={basin.cy - 18} textAnchor="middle" fontSize="7" fill={muted} opacity="0.7">
            (bland centroid)
          </text>

          {/* Gradient arrows from peaks DOWN to basin */}
          {peaks.map((peak, i) => {
            const dx = basin.cx - peak.cx;
            const dy = basin.cy - peak.cy;
            const len = Math.sqrt(dx * dx + dy * dy);
            const startX = peak.cx + (dx / len) * 20;
            const startY = peak.cy + (dy / len) * 20;
            const endX = basin.cx - (dx / len) * 35;
            const endY = basin.cy - (dy / len) * 35;

            return (
              <g key={`l-arrow-${i}`}>
                {/* Undiscovered peak indicator */}
                <circle cx={peak.cx} cy={peak.cy} r="14" fill="none" stroke={muted} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.5" />
                <text x={peak.cx} y={peak.cy + 3} textAnchor="middle" fontSize="7" fill={muted} fontWeight="600" opacity="0.6">
                  peak
                </text>
                {/* Arrow pointing downhill to basin */}
                <line x1={startX} y1={startY} x2={endX} y2={endY} stroke={red} strokeWidth="1.5" strokeDasharray="2 3" opacity="0.35" markerEnd="url(#arrowRed)" />
              </g>
            );
          })}

          {/* 32 clustered dots in the basin */}
          {leftDots.map((dot, i) => (
            <circle key={`l-dot-${i}`} cx={dot.x} cy={dot.y} r="3.5" fill={red} stroke={surface} strokeWidth="0.5" opacity="0.9" />
          ))}
        </g>
      </g>

      {/* ── RIGHT PANEL ── */}
      <g clipPath="url(#clipRight)">
        <g transform={`translate(${rightX}, ${panelY})`}>
          <SharedLandscape />

          {/* Repulsion radii */}
          {rightDots.map((dot, i) => (
            <circle key={`r-rad-${i}`} cx={dot.x} cy={dot.y} r="16" fill={green} opacity="0.10" />
          ))}

          {/* Distributed dots */}
          {rightDots.map((dot, i) => (
            <circle key={`r-dot-${i}`} cx={dot.x} cy={dot.y} r="3.5" fill={green} stroke={surface} strokeWidth="0.5" opacity="0.9" />
          ))}

          {/* Deflection mechanic: agent headed for basin gets redirected to a peak */}
          <g>
            {/* Initial path toward basin */}
            <path d="M 190,70 Q 165,95 155,110" fill="none" stroke={muted} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.5" />
            {/* Repulsion curve deflecting to peak 1 */}
            <path d="M 155,110 Q 150,135 200,110 T 240,75" fill="none" stroke={green} strokeWidth="2" markerEnd="url(#arrowGreen)" />
            {/* The new agent dot */}
            <circle cx={155} cy={110} r="4.5" fill={surface} stroke={green} strokeWidth="2" />
            <circle cx={155} cy={110} r="1.5" fill={green} />

            <rect x={122} y={80} width="66" height="14" rx="3" fill={surface} opacity="0.85" />
            <text x={155} y={90} textAnchor="middle" fontSize="8" fontWeight="600" fill={green}>
              deflected to peak
            </text>
          </g>
        </g>
      </g>

      {/* Bottom Annotations */}
      <rect x="40" y={panelY + panelH + 15} width="640" height="34" rx="6" fill={surface} stroke={border} strokeWidth="1" />
      <text x="360" y={panelY + panelH + 29} textAnchor="middle" fontSize="9" fill={muted}>
        Left: every agent follows the same gradient into the basin — the bland centroid — ignoring the quality peaks around it.
      </text>
      <text x="360" y={panelY + panelH + 41} textAnchor="middle" fontSize="9" fill={muted}>
        Right: repulsion fields push new agents outward past the local minimum, discovering the specific, substantive consensus positions.
      </text>
    </svg>
  );
}
