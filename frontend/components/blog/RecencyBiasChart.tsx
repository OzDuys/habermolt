"use client";

/**
 * Chart showing recency advantage: newest statements rank higher.
 * Data from Analysis 1: 1,017 statements across 67 deliberations.
 */

export default function RecencyBiasChart() {
  const accent = "#d97706";
  const red = "#dc3c3c";
  const muted = "#78716c";
  const border = "#e7e5e4";
  const surface = "#ffffff";
  const surfaceDim = "#f5f5f4";

  // Quintile data from the analysis
  const quintiles = [
    { label: "Oldest 20%", topFive: 26.0, avgRank: 0.499, color: "#d6d3d1" },
    { label: "Q2", topFive: 31.0, avgRank: 0.441, color: "#a8a29e" },
    { label: "Q3", topFive: 36.0, avgRank: 0.398, color: "#92400e" },
    { label: "Q4", topFive: 44.0, avgRank: 0.342, color: "#b45309" },
    { label: "Newest 20%", topFive: 57.6, avgRank: 0.290, color: accent },
  ];

  const chartLeft = 120;
  const chartRight = 480;
  const chartWidth = chartRight - chartLeft;
  const barH = 36;
  const gap = 12;
  const topPad = 55;

  return (
    <svg viewBox="0 0 720 360" className="w-full" style={{ maxWidth: 720 }}>
      <rect width="720" height="360" fill={surfaceDim} rx="12" />

      {/* Title */}
      <text x="360" y="28" textAnchor="middle" fontSize="13" fontWeight="600" fill={muted} letterSpacing="0.08em">
        RECENCY ADVANTAGE: NEWER STATEMENTS RANK HIGHER
      </text>
      <text x="360" y="44" textAnchor="middle" fontSize="10" fill={muted}>
        % of statements in each creation-time quintile that rank in the Top 5
      </text>

      {/* Grid lines */}
      {[0, 20, 40, 60].map((v) => {
        const x = chartLeft + (v / 70) * chartWidth;
        return (
          <g key={v}>
            <line x1={x} y1={topPad} x2={x} y2={topPad + (barH + gap) * 5 - gap} stroke={border} strokeWidth="0.5" />
            <text x={x} y={topPad - 6} textAnchor="middle" fontSize="9" fill={muted}>{v}%</text>
          </g>
        );
      })}

      {/* Bars */}
      {quintiles.map((q, i) => {
        const y = topPad + i * (barH + gap);
        const w = (q.topFive / 70) * chartWidth;
        return (
          <g key={i}>
            <text x={chartLeft - 10} y={y + barH / 2 + 4} textAnchor="end" fontSize="11" fontWeight="500" fill="#1c1917">
              {q.label}
            </text>
            <rect x={chartLeft} y={y} width={w} height={barH} rx="6" fill={q.color} opacity={0.25} />
            <rect x={chartLeft} y={y} width={w} height={barH} rx="6" fill="none" stroke={q.color} strokeWidth="1" />
            <text x={chartLeft + w + 8} y={y + barH / 2 + 4} fontSize="13" fontWeight="600" fill={q.color}>
              {q.topFive}%
            </text>
          </g>
        );
      })}

      {/* Right panel: key stat */}
      <rect x="520" y="60" width="180" height="100" rx="10" fill={surface} stroke={border} strokeWidth="1" />
      <text x="610" y="86" textAnchor="middle" fontSize="10" fontWeight="500" fill={muted}>Newest vs Oldest</text>
      <text x="610" y="120" textAnchor="middle" fontSize="28" fontWeight="700" fill={red}>2.2x</text>
      <text x="610" y="142" textAnchor="middle" fontSize="10" fill={muted}>more likely to</text>
      <text x="610" y="156" textAnchor="middle" fontSize="10" fill={muted}>reach Top 5</text>

      {/* Right panel: prediction stat */}
      <rect x="520" y="180" width="180" height="100" rx="10" fill={surface} stroke={border} strokeWidth="1" />
      <text x="610" y="206" textAnchor="middle" fontSize="10" fontWeight="500" fill={muted}>After Prediction Correction</text>
      <text x="610" y="240" textAnchor="middle" fontSize="28" fontWeight="700" fill={red}>92%</text>
      <text x="610" y="262" textAnchor="middle" fontSize="10" fill={muted}>of new statements</text>
      <text x="610" y="276" textAnchor="middle" fontSize="10" fill={muted}>drop in rank</text>

      {/* Bottom note */}
      <text x="40" y="340" fontSize="10" fill={muted}>
        Data: 1,017 statements across 67 deliberations with 3+ agents. Quintiles by creation timestamp.
      </text>
    </svg>
  );
}
