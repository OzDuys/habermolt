"use client";

/**
 * Circular feedback loop diagram showing the 6-step recency bias cycle
 * created by the ranking predictor's optimism bias.
 */
export default function RecencyBiasLoopDiagram() {
  const accent = "#d97706";
  const red = "#dc3c3c";
  const muted = "#78716c";
  const surface = "#ffffff";
  const surfaceDim = "#f5f5f4";

  const cx = 360;
  const cy = 210;
  const rx = 240;
  const ry = 130;

  const steps = [
    { label: "New statement\narrives", detail: "Agent proposes consensus", angle: -90, color: accent },
    { label: "Predictor places\nit near the top", detail: "Systematic optimism bias", angle: -30, color: red },
    { label: "Schulze recomputes\n→ appears to win", detail: "Inflated ranking propagates", angle: 30, color: red },
    { label: "Other agents see\n\"winning\" statement", detail: "On their next heartbeat", angle: 90, color: "#92400e" },
    { label: "They write slight\nvariations of it", detail: "Consensus-signalling language", angle: 150, color: "#92400e" },
    { label: "Their statement gets\nsame inflated prediction", detail: "Cycle restarts", angle: 210, color: red },
  ];

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const pos = steps.map((s) => ({
    x: cx + rx * Math.cos(toRad(s.angle)),
    y: cy + ry * Math.sin(toRad(s.angle)),
  }));

  const boxW = 140;
  const boxH = 44;

  // Build curved arrow paths between consecutive steps
  const arrows = steps.map((_, i) => {
    const next = (i + 1) % steps.length;
    const a1 = toRad(steps[i].angle);
    const a2 = toRad(steps[next].angle);

    // Start/end offsets from box center along the ellipse
    const startX = pos[i].x + (boxW / 2 + 4) * Math.cos(a1 + 0.25);
    const startY = pos[i].y + (boxH / 2 + 4) * Math.sin(a1 + 0.25);
    const endX = pos[next].x - (boxW / 2 + 4) * Math.cos(a2 - 0.25);
    const endY = pos[next].y - (boxH / 2 + 4) * Math.sin(a2 - 0.25);

    const midAngle = (a1 + a2) / 2;
    const cpX = cx + rx * 0.45 * Math.cos(midAngle);
    const cpY = cy + ry * 0.45 * Math.sin(midAngle);

    return { startX, startY, endX, endY, cpX, cpY };
  });

  return (
    <svg viewBox="0 0 720 430" className="w-full" style={{ maxWidth: 720 }}>
      <rect width="720" height="430" fill={surfaceDim} rx="12" />

      <text x="360" y="30" textAnchor="middle" fontSize="13" fontWeight="600" fill={muted} letterSpacing="0.08em">
        THE RECENCY BIAS LOOP
      </text>

      {/* Center label */}
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize="15" fontWeight="700" fill={red} opacity={0.15}>
        RECENCY
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="15" fontWeight="700" fill={red} opacity={0.15}>
        BIAS
      </text>

      {/* Arrows */}
      {arrows.map((a, i) => (
        <path
          key={`arrow-${i}`}
          d={`M ${a.startX} ${a.startY} Q ${a.cpX} ${a.cpY} ${a.endX} ${a.endY}`}
          fill="none"
          stroke={red}
          strokeWidth="1.5"
          opacity={0.35}
          markerEnd="url(#biasArrow)"
        />
      ))}

      {/* Step boxes */}
      {steps.map((s, i) => {
        const lines = s.label.split("\n");
        return (
          <g key={i}>
            <rect
              x={pos[i].x - boxW / 2}
              y={pos[i].y - boxH / 2}
              width={boxW}
              height={boxH}
              rx="8"
              fill={surface}
              stroke={s.color}
              strokeWidth="1.5"
            />
            {/* Step number */}
            <circle cx={pos[i].x - boxW / 2 + 12} cy={pos[i].y - boxH / 2 + 12} r="8" fill={s.color} opacity={0.15} />
            <text
              x={pos[i].x - boxW / 2 + 12}
              y={pos[i].y - boxH / 2 + 16}
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill={s.color}
            >
              {i + 1}
            </text>
            {/* Label */}
            {lines.map((line, li) => (
              <text
                key={li}
                x={pos[i].x + 4}
                y={pos[i].y - 4 + li * 13}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="600"
                fill={s.color}
              >
                {line}
              </text>
            ))}
            {/* Detail */}
            <text
              x={pos[i].x}
              y={pos[i].y + boxH / 2 + 13}
              textAnchor="middle"
              fontSize="8"
              fill={muted}
            >
              {s.detail}
            </text>
          </g>
        );
      })}

      {/* Bottom annotation */}
      <text x="360" y="414" textAnchor="middle" fontSize="9.5" fill={muted}>
        Each new statement inherits the same optimistic prediction, creating a self-reinforcing recency advantage.
      </text>

      <defs>
        <marker id="biasArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8" fill="none" stroke={red} strokeWidth="1.5" opacity={0.35} />
        </marker>
      </defs>
    </svg>
  );
}
