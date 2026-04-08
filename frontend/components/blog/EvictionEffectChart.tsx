"use client";

/**
 * Paired bar chart showing active pool vs full pool (active + evicted) similarity.
 * Demonstrates that eviction makes the pool slightly blander, but 96% of the
 * homogeneity is already present at proposal time.
 */

interface RowDatum {
  label: string;
  activeSim: number;
  fullSim: number;
}

const data: RowDatum[] = [
  { label: "AI Alignment (53 agents)", activeSim: 0.847, fullSim: 0.830 },
  { label: "AI as Public Infra (52 agents)", activeSim: 0.866, fullSim: 0.842 },
  { label: "AI Values: Fixed vs Ongoing (52 agents)", activeSim: 0.839, fullSim: 0.823 },
  { label: "Identity Verification (51 agents)", activeSim: 0.836, fullSim: 0.813 },
  { label: "Data as Public Good (44 agents)", activeSim: 0.840, fullSim: 0.822 },
  { label: "Civic AI (43 agents)", activeSim: 0.826, fullSim: 0.812 },
  { label: "Slow AI Adoption (43 agents)", activeSim: 0.802, fullSim: 0.789 },
  { label: "AI Agent Dependency (39 agents)", activeSim: 0.852, fullSim: 0.835 },
  { label: "Employee AI IP Rights (24 agents)", activeSim: 0.835, fullSim: 0.817 },
  { label: "Preferences as Weapons (22 agents)", activeSim: 0.762, fullSim: 0.746 },
];

const baseline = 0.359;
const meanActive = 0.833;
const meanFull = 0.815;

export default function EvictionEffectChart() {
  const teal = "#0891b2";
  const red = "#dc3c3c";
  const muted = "#78716c";
  const border = "#e7e5e4";
  const surface = "#ffffff";
  const surfaceDim = "#f5f5f4";

  const chartLeft = 230;
  const chartRight = 690;
  const chartWidth = chartRight - chartLeft;
  const barH = 10;
  const pairGap = 3;
  const rowGap = 8;
  const rowHeight = barH * 2 + pairGap + rowGap;
  const topPad = 60;

  const minVal = 0.65;
  const maxVal = 0.90;
  const scale = (v: number) => chartLeft + ((v - minVal) / (maxVal - minVal)) * chartWidth;

  const svgHeight = topPad + rowHeight * data.length + 90;

  return (
    <svg viewBox={`0 0 720 ${svgHeight}`} className="w-full" style={{ maxWidth: 720 }}>
      <rect width="720" height={svgHeight} fill={surfaceDim} rx="12" />

      {/* Title */}
      <text x="360" y="24" textAnchor="middle" fontSize="13" fontWeight="600" fill={muted} letterSpacing="0.08em">
        EVICTION EFFECT ON POOL SIMILARITY
      </text>

      {/* Legend */}
      <rect x="240" y="34" width="10" height="10" rx="2" fill={teal} opacity={0.5} />
      <text x="254" y="43" fontSize="9" fill={muted}>All statements (active + evicted)</text>
      <rect x="420" y="34" width="10" height="10" rx="2" fill={red} opacity={0.5} />
      <text x="434" y="43" fontSize="9" fill={muted}>Active pool only (after eviction)</text>

      {/* Axis labels */}
      {[0.65, 0.70, 0.75, 0.80, 0.85, 0.90].map((v) => (
        <g key={v}>
          <line
            x1={scale(v)} y1={topPad - 4}
            x2={scale(v)} y2={topPad + rowHeight * data.length + 4}
            stroke={border} strokeWidth="0.5"
          />
          <text x={scale(v)} y={topPad - 10} textAnchor="middle" fontSize="9" fill={muted}>
            {v.toFixed(2)}
          </text>
        </g>
      ))}

      {/* Bars */}
      {data.map((d, i) => {
        const rowY = topPad + i * rowHeight;
        const fullW = scale(d.fullSim) - chartLeft;
        const activeW = scale(d.activeSim) - chartLeft;

        return (
          <g key={i}>
            {/* Row label */}
            <text x={chartLeft - 8} y={rowY + barH + pairGap / 2 + 2} textAnchor="end" fontSize="9" fill="#1c1917">
              {d.label}
            </text>

            {/* Full pool bar (teal) */}
            <rect x={chartLeft} y={rowY} width={Math.max(0, fullW)} height={barH} rx="3" fill={teal} opacity={0.3} />
            <rect x={chartLeft} y={rowY} width={Math.max(0, fullW)} height={barH} rx="3" fill="none" stroke={teal} strokeWidth="0.5" opacity={0.5} />

            {/* Active pool bar (red) */}
            <rect x={chartLeft} y={rowY + barH + pairGap} width={Math.max(0, activeW)} height={barH} rx="3" fill={red} opacity={0.3} />
            <rect x={chartLeft} y={rowY + barH + pairGap} width={Math.max(0, activeW)} height={barH} rx="3" fill="none" stroke={red} strokeWidth="0.5" opacity={0.5} />

            {/* Delta annotation — small arrow between bar ends */}
            {d.activeSim > d.fullSim && (
              <g>
                <line
                  x1={scale(d.fullSim)} y1={rowY + barH + pairGap / 2 + 1}
                  x2={scale(d.activeSim)} y2={rowY + barH + pairGap / 2 + 1}
                  stroke={red} strokeWidth="1" opacity={0.6}
                />
                <text
                  x={scale(d.activeSim) + 4} y={rowY + barH + pairGap / 2 + 4}
                  fontSize="8" fill={red} opacity={0.7}
                >
                  +{(d.activeSim - d.fullSim).toFixed(3)}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Summary annotation */}
      {(() => {
        const annY = topPad + rowHeight * data.length + 20;
        const proposalExcess = meanFull - baseline;
        const evictionExcess = meanActive - meanFull;
        const totalExcess = meanActive - baseline;
        const proposalPct = Math.round((proposalExcess / totalExcess) * 100);
        const evictionPct = 100 - proposalPct;

        return (
          <g>
            <rect x="30" y={annY} width="660" height="52" rx="6" fill={surface} stroke={border} strokeWidth="0.5" />
            <text x="360" y={annY + 18} textAnchor="middle" fontSize="10" fill="#1c1917" fontWeight="500">
              Of the total similarity excess above baseline (0.833 − 0.359 = 0.474):
            </text>
            <text x="250" y={annY + 38} textAnchor="middle" fontSize="11" fill={teal} fontWeight="600">
              {proposalPct}% generated at proposal time
            </text>
            <text x="480" y={annY + 38} textAnchor="middle" fontSize="11" fill={red} fontWeight="600">
              {evictionPct}% added by eviction
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
