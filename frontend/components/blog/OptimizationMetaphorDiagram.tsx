"use client";

import React, { useMemo } from 'react';

/**
 * A side-by-side conceptual diagram showing two search behaviours over the exact 
 * same opinion landscape. 
 * Left: Production (single-point convergence, 32 dots piled on one hill).
 * Right: Pool-aware (exploration with repulsion, 32 dots spread across 5 hills).
 */

export default function OptimizationMetaphorDiagram() {
  // Light theme palette
  const red = "#ef4444";
  const green = "#10b981";
  const muted = "#64748b";
  const textMain = "#334155";
  const border = "#e2e8f0";
  const surfaceDim = "#f8fafc";
  const surface = "#ffffff";
  
  // Landscape colors (subtle warm/neutral topographic tones)
  const topoColors = ["#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8"];

  const panelW = 330;
  const panelH = 280;
  const panelY = 50;
  const leftX = 20;
  const rightX = 370;

  // The 5 viable opinion hills (1 dominant, 4 minority)
  const hills = [
    { id: "main", cx: 100, cy: 140, r: 65, peak: 4 },     // Dominant cluster (Center-Left)
    { id: "min1", cx: 250, cy: 70, r: 35, peak: 3 },      // Minority 1 (Top-Right)
    { id: "min2", cx: 260, cy: 210, r: 40, peak: 3 },     // Minority 2 (Bottom-Right)
    { id: "min3", cx: 70, cy: 40, r: 30, peak: 2 },       // Minority 3 (Top-Left)
    { id: "min4", cx: 160, cy: 230, r: 30, peak: 2 },     // Minority 4 (Bottom-Center)
  ];

  // Deterministic random number generator for stable point placement
  const seededRandom = (seed: number) => {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  // Box-Muller transform for normal distribution clustering
  const randomNormal = (seed: number, mean: number, stdDev: number) => {
    const u1 = seededRandom(seed);
    const u2 = seededRandom(seed + 1000);
    const z0 = Math.sqrt(-2.0 * Math.log(u1 === 0 ? 0.001 : u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
  };

  // Generate the 32 dots for each panel
  const { leftDots, rightDots } = useMemo(() => {
    const lDots: { x: number; y: number }[] = [];
    const rDots: { x: number; y: number }[] = [];

    // LEFT: All 32 dots piled tightly on the main hill
    for (let i = 0; i < 32; i++) {
      lDots.push({
        x: randomNormal(i * 2, hills[0].cx, 8), // Tight cluster
        y: randomNormal(i * 2 + 1, hills[0].cy, 8)
      });
    }

    // RIGHT: Distributed across all 5 hills
    // Distribution: Main(10), Min1(6), Min2(6), Min3(5), Min4(5)
    const distributions = [
      { hill: 0, count: 10, stdDev: 18 },
      { hill: 1, count: 6, stdDev: 12 },
      { hill: 2, count: 6, stdDev: 12 },
      { hill: 3, count: 5, stdDev: 10 },
      { hill: 4, count: 5, stdDev: 10 },
    ];

    let seedOffset = 0;
    distributions.forEach(dist => {
      for (let i = 0; i < dist.count; i++) {
        rDots.push({
          x: randomNormal(seedOffset, hills[dist.hill].cx, dist.stdDev),
          y: randomNormal(seedOffset + 1, hills[dist.hill].cy, dist.stdDev)
        });
        seedOffset += 2;
      }
    });

    return { leftDots: lDots, rightDots: rDots };
  }, []);

  // Shared component: The Topographic Landscape
  const SharedLandscape = () => (
    <g>
      {/* Level 0: Base connecting shape */}
      <path d="M 40,140 C 40,40 180,20 250,50 C 320,80 300,240 220,260 C 140,280 40,240 40,140 Z" fill={topoColors[0]} opacity="0.6" />
      
      {/* Generate concentric contour rings for each hill */}
      {hills.map((hill, i) => (
        <g key={`hill-${i}`}>
          {Array.from({ length: hill.peak }).map((_, level) => {
            const currentR = hill.r * (1 - level * 0.25);
            return (
              <circle 
                key={`contour-${i}-${level}`} 
                cx={hill.cx} 
                cy={hill.cy} 
                r={currentR} 
                fill={topoColors[level + 1]} 
                opacity={0.3 + level * 0.1}
                stroke={topoColors[3]}
                strokeWidth="0.5"
                strokeOpacity="0.3"
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

      {/* Main Titles */}
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
        32 statements, 1 position explored
      </text>

      <text x={rightX + panelW / 2} y={panelY + 22} textAnchor="middle" fontSize="12" fontWeight="600" fill={green}>
        With pool awareness
      </text>
      <text x={rightX + panelW / 2} y={panelY + 36} textAnchor="middle" fontSize="10" fill={muted}>
        32 statements, 5 positions explored
      </text>

      {/* LEFT PANEL */}
      <g clipPath="url(#clipLeft)">
        <g transform={`translate(${leftX}, ${panelY})`}>
          <SharedLandscape />

          {/* Minority Hills: Unexplored indicators & Gradient Arrows */}
          {hills.slice(1).map((hill, i) => {
            // Calculate arrow from minority hill to main hill
            const dx = hills[0].cx - hill.cx;
            const dy = hills[0].cy - hill.cy;
            const len = Math.sqrt(dx * dx + dy * dy);
            const startX = hill.cx + (dx / len) * 20;
            const startY = hill.cy + (dy / len) * 20;
            const endX = hills[0].cx - (dx / len) * 35;
            const endY = hills[0].cy - (dy / len) * 35;

            return (
              <g key={`l-min-${i}`}>
                {/* Unexplored dashed circle */}
                <circle cx={hill.cx} cy={hill.cy} r="14" fill="none" stroke={muted} strokeWidth="1.5" strokeDasharray="3 4" opacity="0.6" />
                <text x={hill.cx} y={hill.cy + 3} textAnchor="middle" fontSize="8" fill={muted} fontWeight="600" opacity="0.7">
                  unexplored
                </text>
                {/* Gradient Arrow to Center */}
                <line x1={startX} y1={startY} x2={endX} y2={endY} stroke={red} strokeWidth="1.5" strokeDasharray="2 3" opacity="0.4" markerEnd="url(#arrowRed)" />
              </g>
            );
          })}

          {/* 32 Clustered Dots */}
          {leftDots.map((dot, i) => (
            <circle key={`l-dot-${i}`} cx={dot.x} cy={dot.y} r="3.5" fill={red} stroke={surface} strokeWidth="0.5" opacity="0.9" />
          ))}
        </g>
      </g>

      {/* RIGHT PANEL */}
      <g clipPath="url(#clipRight)">
        <g transform={`translate(${rightX}, ${panelY})`}>
          <SharedLandscape />

          {/* Repulsion Radii (rendering first so they sit under the dots) */}
          {rightDots.map((dot, i) => (
            <circle key={`r-rad-${i}`} cx={dot.x} cy={dot.y} r="16" fill={green} opacity="0.12" />
          ))}

          {/* 32 Distributed Dots */}
          {rightDots.map((dot, i) => (
            <circle key={`r-dot-${i}`} cx={dot.x} cy={dot.y} r="3.5" fill={green} stroke={surface} strokeWidth="0.5" opacity="0.9" />
          ))}

          {/* New Agent Deflection Mechanic */}
          <g>
            {/* The incoming path (intent to go to main hill) */}
            <path d="M 180,70 Q 150,90 145,100" fill="none" stroke={muted} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
            
            {/* The repulsion curve deflecting to Minority Hill 1 */}
            <path d="M 145,100 Q 135,130 190,110 T 235,80" fill="none" stroke={green} strokeWidth="2" markerEnd="url(#arrowGreen)" />
            
            {/* The incoming new agent dot */}
            <circle cx={145} cy={100} r="4.5" fill={surface} stroke={green} strokeWidth="2" />
            <circle cx={145} cy={100} r="1.5" fill={green} />
            
            <rect x={115} y={75} width="60" height="14" rx="3" fill={surface} opacity="0.8" />
            <text x={145} y={85} textAnchor="middle" fontSize="8" fontWeight="600" fill={green}>
              deflected by pool
            </text>
          </g>
        </g>
      </g>

      {/* Bottom Annotations */}
      <rect x="40" y={panelY + panelH + 15} width="640" height="34" rx="6" fill={surface} stroke={border} strokeWidth="1" />
      <text x="360" y={panelY + panelH + 29} textAnchor="middle" fontSize="9" fill={muted}>
        Left: every agent climbs the same gradient, piling into a single dominant consensus and leaving valid sub-positions empty.
      </text>
      <text x="360" y={panelY + panelH + 41} textAnchor="middle" fontSize="9" fill={muted}>
        Right: repulsion fields from existing statements deflect new agents outward, naturally discovering all valid minority positions.
      </text>
    </svg>
  );
}