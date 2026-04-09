"use client";

/**
 * Visual map showing posts 2-4 as surface-level symptoms converging
 * to a shared root cause: the representation gap δ.
 */
export default function SeriesSynthesisDiagram() {
  const accent = "#d97706";
  const red = "#dc3c3c";
  const muted = "#78716c";
  const border = "#e7e5e4";
  const surface = "#ffffff";
  const surfaceDim = "#f5f5f4";
  const text = "#1c1917";

  const W = 720;
  const H = 320;

  // Top row boxes
  const boxW = 190;
  const boxH = 80;
  const boxY = 40;
  const gap = 20;
  const totalW = 3 * boxW + 2 * gap;
  const startX = (W - totalW) / 2;

  const boxes = [
    {
      label: "MODE COLLAPSE",
      posts: "Posts 2–3",
      desc: "agent can't see what",
      desc2: "the pool needs now",
      color: red,
    },
    {
      label: "RANKING NOISE",
      posts: "Post 4",
      desc: "preference model",
      desc2: "is stale",
      color: red,
    },
    {
      label: "PREDICTOR FAILURE",
      posts: "Posts 2, 4",
      desc: "static snapshot vs.",
      desc2: "moving target",
      color: red,
    },
  ];

  // Convergence target
  const convY = 180;
  const convW = 380;
  const convH = 52;
  const convX = (W - convW) / 2;

  // Bottom box
  const botY = 262;
  const botW = 340;
  const botH = 44;
  const botX = (W - botW) / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: W }}>
      <rect width={W} height={H} fill={surfaceDim} rx="12" />

      <text x={W / 2} y={24} textAnchor="middle" fontSize="13" fontWeight="600" fill={muted} letterSpacing="0.08em">
        FROM SYMPTOMS TO STRUCTURE
      </text>

      {/* Top row: three symptom boxes */}
      {boxes.map((b, i) => {
        const x = startX + i * (boxW + gap);
        const cx = x + boxW / 2;
        return (
          <g key={i}>
            <rect x={x} y={boxY} width={boxW} height={boxH} rx="10" fill={surface} stroke={border} strokeWidth="1.5" />
            <text x={cx} y={boxY + 18} textAnchor="middle" fontSize="10" fontWeight="600" fill={b.color} letterSpacing="0.06em">
              {b.label}
            </text>
            <text x={cx} y={boxY + 32} textAnchor="middle" fontSize="9" fill={muted}>
              {b.posts}
            </text>
            <text x={cx} y={boxY + 52} textAnchor="middle" fontSize="10" fill={text}>
              {b.desc}
            </text>
            <text x={cx} y={boxY + 64} textAnchor="middle" fontSize="10" fill={text}>
              {b.desc2}
            </text>

            {/* Convergence arrow from box to central box */}
            <line
              x1={cx}
              y1={boxY + boxH}
              x2={W / 2}
              y2={convY}
              stroke={muted}
              strokeWidth="1.25"
              strokeDasharray="4 3"
            />
          </g>
        );
      })}

      {/* Convergence box: representation gap */}
      <rect x={convX} y={convY} width={convW} height={convH} rx="10" fill={surface} stroke={accent} strokeWidth="2" />
      <text x={W / 2} y={convY + 22} textAnchor="middle" fontSize="12" fontWeight="600" fill={text}>
        Representation gap δ
      </text>
      <text x={W / 2} y={convY + 40} textAnchor="middle" fontSize="10" fill={muted}>
        frozen agent vs. drifting human
      </text>

      {/* Arrow down to bottom box */}
      <line
        x1={W / 2}
        y1={convY + convH}
        x2={W / 2}
        y2={botY}
        stroke={accent}
        strokeWidth="1.5"
        markerEnd="url(#synthArrow)"
      />

      {/* Bottom box: this post */}
      <rect x={botX} y={botY} width={botW} height={botH} rx="10" fill={accent} />
      <text x={W / 2} y={botY + 19} textAnchor="middle" fontSize="11" fontWeight="600" fill="#ffffff">
        Two-timescale model
      </text>
      <text x={W / 2} y={botY + 34} textAnchor="middle" fontSize="10" fill="#ffffff" opacity="0.85">
        drift + refresh → this post
      </text>

      <defs>
        <marker id="synthArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8" fill="none" stroke={accent} strokeWidth="1.5" />
        </marker>
      </defs>
    </svg>
  );
}
