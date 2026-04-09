"use client";

/**
 * Two-timescale structure: inner episodes (Jarrett et al.'s MDP) and an outer
 * review loop. Episodes run left to right; the human reappears occasionally to
 * issue a correction, which updates the agent's representation θ̂.
 */
export default function TwoTimescaleDiagram() {
  const accent = "#d97706";
  const red = "#dc3c3c";
  const muted = "#78716c";
  const border = "#e7e5e4";
  const surface = "#ffffff";
  const surfaceDim = "#f5f5f4";
  const text = "#1c1917";

  // 8 episodes; reviews after E2 and E6
  const episodes = Array.from({ length: 8 }, (_, i) => i);
  const epW = 60;
  const epGap = 14;
  const startX = 60;
  const epY = 250;
  const reviewIdx = [1, 5]; // human reviews after these episode indices

  return (
    <svg viewBox="0 0 720 360" className="w-full" style={{ maxWidth: 720 }}>
      <rect width="720" height="360" fill={surfaceDim} rx="12" />

      <text x="360" y="28" textAnchor="middle" fontSize="13" fontWeight="600" fill={muted} letterSpacing="0.08em">
        TWO-TIMESCALE STRUCTURE
      </text>

      {/* Outer-loop band label */}
      <text x="20" y="62" fontSize="10" fontWeight="600" fill={muted} letterSpacing="0.08em">
        OUTER LOOP
      </text>
      <text x="20" y="76" fontSize="9" fill={muted}>
        between episodes
      </text>

      {/* Human icons + correction arrows at review points */}
      {reviewIdx.map((i) => {
        const cx = startX + i * (epW + epGap) + epW / 2 + (epW + epGap) / 2;
        return (
          <g key={`r-${i}`}>
            <circle cx={cx} cy={92} r={14} fill={surface} stroke={accent} strokeWidth={1.5} />
            <text x={cx} y={97} textAnchor="middle" fontSize="14">{"\u{1F464}"}</text>
            <text x={cx} y={128} textAnchor="middle" fontSize="9" fill={accent} fontWeight="600">
              review
            </text>
            <text x={cx} y={140} textAnchor="middle" fontSize="9" fill={muted}>
              correction c{i === 1 ? "₁" : "₂"}
            </text>
            {/* Arrow downward to θ̂ row */}
            <line
              x1={cx}
              y1={148}
              x2={cx}
              y2={196}
              stroke={accent}
              strokeWidth={1.5}
              markerEnd="url(#tsArrow)"
            />
          </g>
        );
      })}

      {/* True preference drift θ* — wavy line across the top */}
      <text x={startX} y={170} fontSize="10" fill={red} fontWeight="600">
        θ*ₖ (true preferences — random walk, σ²)
      </text>
      <path
        d={`M ${startX + 200} 178 q 20 -10 40 0 t 40 4 t 40 -8 t 40 6 t 40 -4 t 40 2 t 40 -6`}
        fill="none"
        stroke={red}
        strokeWidth={1.5}
        strokeDasharray="3 2"
      />

      {/* θ̂ piecewise-constant strip between episodes */}
      <text x={startX} y={216} fontSize="10" fill={accent} fontWeight="600">
        θ̂ₖ (agent's representation — frozen until review)
      </text>
      {/* Three flat segments for θ̂: ep0-1, ep2-5 (after c₁), ep6-7 (after c₂) */}
      {[
        { x1: startX, x2: startX + 2 * (epW + epGap), y: 226 },
        { x1: startX + 2 * (epW + epGap), x2: startX + 6 * (epW + epGap), y: 222 },
        { x1: startX + 6 * (epW + epGap), x2: startX + 8 * (epW + epGap) - epGap, y: 220 },
      ].map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y} x2={s.x2} y2={s.y} stroke={accent} strokeWidth={2} />
      ))}

      {/* Episode boxes */}
      {episodes.map((i) => {
        const x = startX + i * (epW + epGap);
        return (
          <g key={i}>
            <rect
              x={x}
              y={epY}
              width={epW}
              height={56}
              rx={8}
              fill={surface}
              stroke={border}
              strokeWidth={1.25}
            />
            <text x={x + epW / 2} y={epY + 22} textAnchor="middle" fontSize="11" fontWeight="600" fill={text}>
              E{i + 1}
            </text>
            <text x={x + epW / 2} y={epY + 38} textAnchor="middle" fontSize="8" fill={muted}>
              MDP
            </text>
            <text x={x + epW / 2} y={epY + 49} textAnchor="middle" fontSize="8" fill={muted}>
              π̃(·;θ̂)
            </text>
          </g>
        );
      })}

      {/* Inner-loop band label */}
      <text x="20" y={epY + 16} fontSize="10" fontWeight="600" fill={muted} letterSpacing="0.08em">
        INNER LOOP
      </text>
      <text x="20" y={epY + 30} fontSize="9" fill={muted}>
        Jarrett et al.
      </text>
      <text x="20" y={epY + 42} fontSize="9" fill={muted}>
        episode MDP
      </text>

      {/* Time axis arrow */}
      <line x1={startX} y1={epY + 70} x2={startX + 8 * (epW + epGap) - epGap + 10} y2={epY + 70} stroke={muted} strokeWidth={1} markerEnd="url(#tsArrowMuted)" />
      <text x={startX + 8 * (epW + epGap) / 2} y={epY + 84} textAnchor="middle" fontSize="9" fill={muted}>
        time (episodes)
      </text>

      <defs>
        <marker id="tsArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8" fill="none" stroke={accent} strokeWidth="1.5" />
        </marker>
        <marker id="tsArrowMuted" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8" fill="none" stroke={muted} strokeWidth="1.25" />
        </marker>
      </defs>
    </svg>
  );
}
