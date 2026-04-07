"use client";

/**
 * Bar chart comparing intra-deliberation statement similarity to cross-deliberation baseline.
 * Shows the top N deliberations by mean pairwise cosine similarity alongside the baseline.
 */

interface BarDatum {
  label: string;
  value: number;
  agents?: number;
  highlight?: boolean;
}

const data: BarDatum[] = [
  { label: "AI Alignment (53 agents)", value: 0.877, agents: 53, highlight: true },
  { label: "AI as Public Infra (52 agents)", value: 0.866, agents: 52, highlight: true },
  { label: "AI Agent Dependency (39 agents)", value: 0.852, agents: 39 },
  { label: "AI Values: Fixed vs Ongoing (52 agents)", value: 0.839, agents: 52 },
  { label: "Data as Public Good (44 agents)", value: 0.840, agents: 44 },
  { label: "Civic AI (43 agents)", value: 0.826, agents: 43 },
  { label: "Slow AI Adoption (43 agents)", value: 0.802, agents: 43 },
  { label: "ICML Desk Rejections (29 agents)", value: 0.725 },
  { label: "Does God Exist? (8 agents)", value: 0.624 },
];

const baseline = 0.359;

export default function SimilarityBarChart() {
  const accent = "#d97706";
  const red = "#dc3c3c";
  const muted = "#78716c";
  const border = "#e7e5e4";
  const surface = "#ffffff";
  const surfaceDim = "#f5f5f4";

  const chartLeft = 230;
  const chartRight = 690;
  const chartWidth = chartRight - chartLeft;
  const barH = 24;
  const gap = 6;
  const topPad = 50;

  const scale = (v: number) => chartLeft + (v / 1.0) * chartWidth;

  return (
    <svg viewBox="0 0 720 370" className="w-full" style={{ maxWidth: 720 }}>
      <rect width="720" height="370" fill={surfaceDim} rx="12" />

      {/* Title */}
      <text x="360" y="28" textAnchor="middle" fontSize="13" fontWeight="600" fill={muted} letterSpacing="0.08em">
        INTRA-DELIBERATION STATEMENT SIMILARITY
      </text>

      {/* Axis labels */}
      {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((v) => (
        <g key={v}>
          <line x1={scale(v)} y1={topPad - 4} x2={scale(v)} y2={topPad + (barH + gap) * data.length + 4} stroke={border} strokeWidth="0.5" />
          <text x={scale(v)} y={topPad - 10} textAnchor="middle" fontSize="9" fill={muted}>{v.toFixed(1)}</text>
        </g>
      ))}

      {/* Baseline line */}
      <line
        x1={scale(baseline)} y1={topPad - 4}
        x2={scale(baseline)} y2={topPad + (barH + gap) * data.length + 4}
        stroke={muted} strokeWidth="1.5" strokeDasharray="4 3"
      />
      <text x={scale(baseline) + 4} y={topPad + (barH + gap) * data.length + 18} fontSize="9" fill={muted}>
        Cross-deliberation baseline (0.36)
      </text>

      {/* Bars */}
      {data.map((d, i) => {
        const y = topPad + i * (barH + gap);
        const w = scale(d.value) - chartLeft;
        const color = d.highlight ? red : accent;
        return (
          <g key={i}>
            {/* Label */}
            <text x={chartLeft - 8} y={y + barH / 2 + 4} textAnchor="end" fontSize="9" fill="#1c1917">
              {d.label}
            </text>
            {/* Bar */}
            <rect x={chartLeft} y={y} width={w} height={barH} rx="4" fill={color} opacity={0.2} />
            <rect x={chartLeft} y={y} width={w} height={barH} rx="4" fill="none" stroke={color} strokeWidth="0.7" opacity={0.5} />
            {/* Value */}
            <text x={chartLeft + w + 6} y={y + barH / 2 + 4} fontSize="10" fontWeight="500" fill={color}>
              {d.value.toFixed(3)}
            </text>
          </g>
        );
      })}

      {/* Annotation */}
      <rect x="30" y="330" width="660" height="28" rx="6" fill={surface} stroke={border} strokeWidth="0.5" />
      <text x="360" y="349" textAnchor="middle" fontSize="10" fill={muted}>
        Mean pairwise cosine similarity between all active statement embeddings within each deliberation. Baseline = random cross-deliberation pairs.
      </text>
    </svg>
  );
}
