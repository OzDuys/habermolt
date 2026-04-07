"use client";

/**
 * Feedback loop diagram showing how mode collapse, prediction bias,
 * recency advantage, and eviction reinforce each other.
 */

export default function ConvergenceLoopDiagram() {
  const accent = "#d97706";
  const red = "#dc3c3c";
  const muted = "#78716c";
  const border = "#e7e5e4";
  const surface = "#ffffff";
  const surfaceDim = "#f5f5f4";

  // Box positions (center points for a circular layout)
  const cx = 360;
  const cy = 190;
  const rx = 220;
  const ry = 120;

  const boxes = [
    { label: "Agent proposes\nnew statement", detail: "Can't see existing pool", angle: -90, color: accent },
    { label: "Statement is\nbland duplicate", detail: "\"Common ground\" prompt", angle: -20, color: red },
    { label: "Predictor inflates\nnew statement", detail: "Systematic optimism bias", angle: 50, color: red },
    { label: "Old statements\nevicted", detail: "Minority views lost", angle: 130, color: "#92400e" },
    { label: "Pool becomes\nmore homogeneous", detail: "Less diversity to rank", angle: 200, color: "#92400e" },
  ];

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const pos = boxes.map((b) => ({
    x: cx + rx * Math.cos(toRad(b.angle)),
    y: cy + ry * Math.sin(toRad(b.angle)),
  }));

  const boxW = 140;
  const boxH = 50;

  return (
    <svg viewBox="0 0 720 390" className="w-full" style={{ maxWidth: 720 }}>
      <rect width="720" height="390" fill={surfaceDim} rx="12" />

      {/* Title */}
      <text x="360" y="28" textAnchor="middle" fontSize="13" fontWeight="600" fill={muted} letterSpacing="0.08em">
        THE CONVERGENCE FEEDBACK LOOP
      </text>

      {/* Curved arrows between boxes */}
      {boxes.map((_, i) => {
        const next = (i + 1) % boxes.length;
        const fromAngle = toRad(boxes[i].angle);
        const toAngle = toRad(boxes[next].angle);
        const midAngle = (fromAngle + toAngle) / 2;

        // Offset start/end from box edges
        const startX = pos[i].x + 40 * Math.cos(fromAngle + 0.4);
        const startY = pos[i].y + 30 * Math.sin(fromAngle + 0.4);
        const endX = pos[next].x - 40 * Math.cos(toAngle - 0.4);
        const endY = pos[next].y - 30 * Math.sin(toAngle - 0.4);

        // Control point pulled toward center
        const cpX = cx + (rx * 0.5) * Math.cos(midAngle);
        const cpY = cy + (ry * 0.5) * Math.sin(midAngle);

        return (
          <path
            key={i}
            d={`M ${startX} ${startY} Q ${cpX} ${cpY} ${endX} ${endY}`}
            fill="none"
            stroke={red}
            strokeWidth="1.5"
            opacity={0.4}
            markerEnd="url(#loopArrow)"
          />
        );
      })}

      {/* Boxes */}
      {boxes.map((b, i) => {
        const lines = b.label.split("\n");
        return (
          <g key={i}>
            <rect
              x={pos[i].x - boxW / 2}
              y={pos[i].y - boxH / 2}
              width={boxW}
              height={boxH}
              rx="8"
              fill={surface}
              stroke={b.color}
              strokeWidth="1.5"
            />
            {lines.map((line, li) => (
              <text
                key={li}
                x={pos[i].x}
                y={pos[i].y - 6 + li * 14}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill={b.color}
              >
                {line}
              </text>
            ))}
            <text
              x={pos[i].x}
              y={pos[i].y + boxH / 2 + 14}
              textAnchor="middle"
              fontSize="8.5"
              fill={muted}
            >
              {b.detail}
            </text>
          </g>
        );
      })}

      {/* Center label */}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="16" fontWeight="700" fill={red} opacity={0.2}>
        CONVERGENCE
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="16" fontWeight="700" fill={red} opacity={0.2}>
        ATTRACTOR
      </text>

      {/* Bottom annotation */}
      <text x="360" y="370" textAnchor="middle" fontSize="10" fill={muted}>
        Each mechanism independently pushes toward homogeneity. Together they form a self-reinforcing cycle.
      </text>

      <defs>
        <marker id="loopArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8" fill="none" stroke={red} strokeWidth="1.5" opacity={0.4} />
        </marker>
      </defs>
    </svg>
  );
}
