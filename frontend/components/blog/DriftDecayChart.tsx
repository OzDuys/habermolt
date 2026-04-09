"use client";

/**
 * Schematic chart of representativity gap δₖ over time, comparing two regimes:
 *   • no review:  δ grows roughly as √k (random-walk tracking error)
 *   • periodic review at rate ρ: δ resets toward 0 at each review (sawtooth)
 */
export default function DriftDecayChart() {
  const accent = "#d97706";
  const red = "#dc3c3c";
  const muted = "#78716c";
  const border = "#e7e5e4";
  const surfaceDim = "#f5f5f4";

  // Plot area
  const W = 720;
  const H = 360;
  const padL = 64;
  const padR = 30;
  const padT = 60;
  const padB = 56;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // x range: episodes 0..40
  const N = 40;
  const xAt = (k: number) => padL + (k / N) * plotW;
  // y range: 0..1 (normalized δ)
  const yAt = (v: number) => padT + plotH - v * plotH;

  // No-review trajectory: noisy random walk magnitude — schematic √k with jitter
  // Use a deterministic pseudo-random sequence so the SVG renders identically.
  const rand = (i: number) => {
    const x = Math.sin(i * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  const noReview: { x: number; y: number }[] = [];
  for (let k = 0; k <= N; k++) {
    const base = Math.sqrt(k / N) * 0.95;
    const jitter = (rand(k) - 0.5) * 0.06;
    noReview.push({ x: xAt(k), y: yAt(Math.max(0, Math.min(1, base + jitter))) });
  }

  // Sawtooth: reviews at k = 8, 16, 24, 32. Between reviews δ grows like √Δk.
  const reviewKs = [8, 16, 24, 32];
  const sawtooth: { x: number; y: number }[] = [];
  let lastReview = 0;
  for (let k = 0; k <= N; k++) {
    const dk = k - lastReview;
    const base = Math.sqrt(dk / N) * 0.55;
    const jitter = (rand(k + 100) - 0.5) * 0.04;
    sawtooth.push({ x: xAt(k), y: yAt(Math.max(0, base + jitter)) });
    if (reviewKs.includes(k)) {
      // Snap back to near 0 at the next sample
      lastReview = k;
    }
  }

  const pathFrom = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: W }}>
      <rect width={W} height={H} fill={surfaceDim} rx="12" />

      <text x={W / 2} y={28} textAnchor="middle" fontSize="13" fontWeight="600" fill={muted} letterSpacing="0.08em">
        REPRESENTATIVITY GAP δₖ OVER TIME
      </text>
      <text x={W / 2} y={44} textAnchor="middle" fontSize="10" fill={muted}>
        schematic — drift vs. drift-with-refresh
      </text>

      {/* Axes */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={border} strokeWidth={1.5} />
      <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke={border} strokeWidth={1.5} />

      {/* Y axis labels */}
      <text x={padL - 10} y={padT + plotH + 4} textAnchor="end" fontSize="10" fill={muted}>0</text>
      <text x={padL - 10} y={padT + 4} textAnchor="end" fontSize="10" fill={muted}>large</text>
      <text
        x={18}
        y={padT + plotH / 2}
        textAnchor="middle"
        fontSize="11"
        fill={muted}
        transform={`rotate(-90 18 ${padT + plotH / 2})`}
      >
        gap δₖ = ‖θ̂ₖ − θ*ₖ‖
      </text>

      {/* X axis label */}
      <text x={padL + plotW / 2} y={H - 16} textAnchor="middle" fontSize="11" fill={muted}>
        episodes k
      </text>

      {/* Review tick marks on the sawtooth line */}
      {reviewKs.map((k) => (
        <g key={k}>
          <line
            x1={xAt(k)}
            y1={padT}
            x2={xAt(k)}
            y2={padT + plotH}
            stroke={accent}
            strokeWidth={1}
            strokeDasharray="2 4"
            opacity={0.45}
          />
          <text x={xAt(k)} y={padT - 6} textAnchor="middle" fontSize="9" fill={accent}>
            review
          </text>
        </g>
      ))}

      {/* No-review curve */}
      <path d={pathFrom(noReview)} fill="none" stroke={red} strokeWidth={2} />
      {/* Sawtooth curve */}
      <path d={pathFrom(sawtooth)} fill="none" stroke={accent} strokeWidth={2} />

      {/* Legend */}
      <g transform={`translate(${padL + 12}, ${padT + 12})`}>
        <rect width={232} height={48} rx={6} fill="#ffffff" stroke={border} strokeWidth={1} />
        <line x1={12} y1={18} x2={36} y2={18} stroke={red} strokeWidth={2} />
        <text x={44} y={22} fontSize="10" fill={muted}>
          no review — unbounded growth
        </text>
        <line x1={12} y1={36} x2={36} y2={36} stroke={accent} strokeWidth={2} />
        <text x={44} y={40} fontSize="10" fill={muted}>
          review at rate ρ — bounded by σ²/ρ
        </text>
      </g>
    </svg>
  );
}
