"use client";

/**
 * Horizontal bar chart comparing consistency (tau) of heartbeat ranking methods.
 * Shows the dramatic gap between incremental insertion and full re-ranking.
 */
export default function HeartbeatResultsChart() {
  const accent = "#d97706";
  const red = "#dc3c3c";
  const muted = "#78716c";
  const surface = "#ffffff";
  const surfaceDim = "#f5f5f4";
  const border = "#e7e5e4";

  const methods = [
    { name: "incremental_insertion", label: "Incremental insertion", tau: 0.93, tokens: "4K", production: true },
    { name: "incremental_pairwise", label: "Incremental pairwise", tau: 0.85, tokens: "18K", production: false },
    { name: "full_rerank_pairwise", label: "Full re-rank (pairwise)", tau: 0.52, tokens: "86K", production: false },
    { name: "full_rerank_unordered", label: "Full re-rank (unordered)", tau: 0.47, tokens: "17K", production: false },
  ];

  const chartLeft = 190;
  const chartRight = 620;
  const chartWidth = chartRight - chartLeft;
  const barHeight = 32;
  const barGap = 16;
  const topY = 65;

  const scale = (v: number) => chartLeft + (v / 1.0) * chartWidth;

  return (
    <svg viewBox="0 0 720 290" className="w-full" style={{ maxWidth: 720 }}>
      <rect width="720" height="290" fill={surfaceDim} rx="12" />

      <text x="360" y="30" textAnchor="middle" fontSize="13" fontWeight="600" fill={muted} letterSpacing="0.08em">
        HEARTBEAT RANKING CONSISTENCY
      </text>
      <text x="360" y="48" textAnchor="middle" fontSize="10" fill={muted}>
        Kendall tau-b (higher = more consistent across 5 repetitions)
      </text>

      {/* Grid lines */}
      {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((v) => (
        <g key={v}>
          <line
            x1={scale(v)}
            y1={topY - 8}
            x2={scale(v)}
            y2={topY + methods.length * (barHeight + barGap) - barGap + 8}
            stroke={border}
            strokeWidth="1"
            strokeDasharray={v === 0 ? "0" : "4 3"}
          />
          <text x={scale(v)} y={topY - 14} textAnchor="middle" fontSize="9" fill={muted}>
            {v.toFixed(1)}
          </text>
        </g>
      ))}

      {/* Bars */}
      {methods.map((m, i) => {
        const y = topY + i * (barHeight + barGap);
        const barW = (m.tau / 1.0) * chartWidth;
        const color = m.production ? accent : m.tau >= 0.8 ? "#78716c" : red;

        return (
          <g key={m.name}>
            {/* Method label */}
            <text x={chartLeft - 8} y={y + barHeight / 2 + 4} textAnchor="end" fontSize="10" fontWeight="500" fill="#1c1917">
              {m.label}
            </text>

            {/* Bar */}
            <rect x={chartLeft} y={y} width={barW} height={barHeight} rx="4" fill={color} opacity={0.2} />
            <rect x={chartLeft} y={y} width={barW} height={barHeight} rx="4" fill="none" stroke={color} strokeWidth="1.5" />

            {/* Value */}
            <text x={chartLeft + barW + 8} y={y + barHeight / 2 + 4} fontSize="11" fontWeight="700" fill={color}>
              {m.tau.toFixed(2)}
            </text>

            {/* Token cost */}
            <text x={chartRight + 30} y={y + barHeight / 2 + 4} textAnchor="start" fontSize="9" fill={muted}>
              {m.tokens}
            </text>

            {/* Production badge */}
            {m.production && (
              <g>
                <rect x={chartLeft + barW + 38} y={y + barHeight / 2 - 8} width={58} height={16} rx="8" fill={accent} opacity={0.12} />
                <text x={chartLeft + barW + 67} y={y + barHeight / 2 + 2} textAnchor="middle" fontSize="8" fontWeight="600" fill={accent}>
                  production
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Token cost header */}
      <text x={chartRight + 30} y={topY - 14} textAnchor="start" fontSize="9" fontWeight="500" fill={muted}>
        tokens
      </text>

      {/* Annotation */}
      <text x="360" y="266" textAnchor="middle" fontSize="9.5" fill={muted}>
        Full re-ranking throws away the agent&apos;s previous confirmed ranking, reintroducing all initial-ranking noise.
      </text>
    </svg>
  );
}
