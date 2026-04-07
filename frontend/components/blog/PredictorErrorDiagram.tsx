"use client";

/**
 * Visualizes the ranking predictor's optimism bias across pool sizes.
 * Three panels showing error bars that grow longer and redder.
 */
export default function PredictorErrorDiagram() {
  const accent = "#d97706";
  const red = "#dc3c3c";
  const muted = "#78716c";
  const border = "#e7e5e4";
  const surface = "#ffffff";
  const surfaceDim = "#f5f5f4";
  const green = "#16a34a";

  const pools = [
    { size: 15, mae: 1.5, bias: "~0", within2: 87, color: green, label: "~15 statements" },
    { size: 16, mae: 3.6, bias: "-2.1", within2: 60, color: accent, label: "~16 statements" },
    { size: 29, mae: 8.3, bias: "-7.1", within2: 13, color: red, label: "~29 statements" },
  ];

  const panelWidth = 200;
  const panelGap = 20;
  const totalWidth = pools.length * panelWidth + (pools.length - 1) * panelGap;
  const startX = (720 - totalWidth) / 2;

  // Scale: max bar width for the largest MAE
  const maxMAE = 10;
  const barMaxWidth = 160;
  const barScale = (mae: number) => (mae / maxMAE) * barMaxWidth;

  return (
    <svg viewBox="0 0 720 300" className="w-full" style={{ maxWidth: 720 }}>
      <rect width="720" height="300" fill={surfaceDim} rx="12" />

      <text x="360" y="30" textAnchor="middle" fontSize="13" fontWeight="600" fill={muted} letterSpacing="0.08em">
        RANKING PREDICTOR ERROR BY POOL SIZE
      </text>

      {pools.map((pool, i) => {
        const px = startX + i * (panelWidth + panelGap);
        const cx = px + panelWidth / 2;
        const barW = barScale(pool.mae);
        const barY = 148;
        const barH = 28;

        return (
          <g key={pool.size}>
            {/* Panel background */}
            <rect x={px} y={52} width={panelWidth} height={220} rx="10" fill={surface} stroke={border} strokeWidth="1" />

            {/* Pool size label */}
            <text x={cx} y={78} textAnchor="middle" fontSize="12" fontWeight="600" fill="#1c1917">
              {pool.label}
            </text>

            {/* Big MAE number */}
            <text x={cx} y={124} textAnchor="middle" fontSize="36" fontWeight="700" fill={pool.color}>
              {pool.mae}
            </text>
            <text x={cx} y={140} textAnchor="middle" fontSize="9" fill={muted}>
              positions off (MAE)
            </text>

            {/* Error bar */}
            <rect
              x={cx - barW / 2}
              y={barY}
              width={barW}
              height={barH}
              rx="4"
              fill={pool.color}
              opacity={0.15}
            />
            <rect
              x={cx - barW / 2}
              y={barY}
              width={barW}
              height={barH}
              rx="4"
              fill="none"
              stroke={pool.color}
              strokeWidth="1.5"
            />
            {/* Center tick = correct position */}
            <line x1={cx} y1={barY - 4} x2={cx} y2={barY + barH + 4} stroke={border} strokeWidth="1" strokeDasharray="3 2" />

            {/* Arrow showing bias direction (left = predicted too high) */}
            {pool.mae > 1.5 && (
              <>
                <line
                  x1={cx}
                  y1={barY + barH / 2}
                  x2={cx - barW / 2 + 8}
                  y2={barY + barH / 2}
                  stroke={pool.color}
                  strokeWidth="2"
                  markerEnd={`url(#errArrow${i})`}
                />
                <text x={cx - barW / 2 - 4} y={barY + barH / 2 + 3} textAnchor="end" fontSize="7.5" fontWeight="600" fill={pool.color}>
                  predicted
                </text>
              </>
            )}

            {/* Bias label */}
            <text x={cx} y={barY + barH + 20} textAnchor="middle" fontSize="9" fill={muted}>
              bias: {pool.bias} positions
            </text>

            {/* Within ±2 stat */}
            <rect
              x={cx - 40}
              y={208}
              width={80}
              height={24}
              rx="12"
              fill={pool.color}
              opacity={0.1}
            />
            <text x={cx} y={224} textAnchor="middle" fontSize="10" fontWeight="600" fill={pool.color}>
              {pool.within2}% within ±2
            </text>

            {/* Severity label */}
            <text x={cx} y={252} textAnchor="middle" fontSize="9" fill={pool.color} fontWeight="500">
              {pool.mae <= 2 ? "Acceptable" : pool.mae <= 5 ? "Unreliable" : "Broken"}
            </text>

            {/* Arrow marker per panel (unique IDs) */}
            <defs>
              <marker id={`errArrow${i}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M6,0 L0,3 L6,6" fill="none" stroke={pool.color} strokeWidth="1.5" />
              </marker>
            </defs>
          </g>
        );
      })}
    </svg>
  );
}
