"use client";

/**
 * Two feedback loop spirals: convergence trap (inward, red) vs diversity momentum (outward, green).
 * Arrowheads are calculated using exact tangents to ensure perfect alignment with the path tips.
 */

export default function MomentumDiagram() {
  const red = "#ef4444";
  const green = "#22c55e";
  const muted = "#94a3b8";
  const border = "#e7e5e4";
  const surface = "#ffffff";
  const surfaceDim = "#f5f5f4";
  const textMain = "#1e293b";

  const panelW = 320;
  const panelH = 260;
  const panelY = 50;
  const leftX = 25;
  const rightX = 375;

  // Higher steps for mathematically smooth curves and exact final tangents
  const spiralPoints = (cx: number, cy: number, startR: number, endR: number, turns: number, steps: number) => {
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * turns * 2 * Math.PI - Math.PI / 2;
      const r = startR + (endR - startR) * t;
      points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
    return points;
  };

  const leftCenter = { x: leftX + panelW / 2, y: panelY + panelH / 2 - 10 };
  const rightCenter = { x: rightX + panelW / 2, y: panelY + panelH / 2 - 10 };

  // Generate paths
  const inSpiral = spiralPoints(leftCenter.x, leftCenter.y, 100, 12, 2.5, 200);
  const outSpiral = spiralPoints(rightCenter.x, rightCenter.y, 15, 105, 2.5, 200);

  const inwardPath = inSpiral.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const outwardPath = outSpiral.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  // Calculate precise tangent angles for the arrowheads
  const inP1 = inSpiral[inSpiral.length - 2];
  const inP2 = inSpiral[inSpiral.length - 1];
  const inAngle = Math.atan2(inP2.y - inP1.y, inP2.x - inP1.x) * (180 / Math.PI);

  const outP1 = outSpiral[outSpiral.length - 2];
  const outP2 = outSpiral[outSpiral.length - 1];
  const outAngle = Math.atan2(outP2.y - outP1.y, outP2.x - outP1.x) * (180 / Math.PI);

  const leftSteps = [
    { label: "Bland statement", y: -90 },
    { label: "Homogeneous pool", y: -38 },
    { label: "Agent sees one position", y: 22 },
    { label: "Produces another copy", y: 78 },
  ];
  
  const rightSteps = [
    { label: "Diverse statement", y: -90 },
    { label: "Diverse pool", y: -38 },
    { label: "Agent must differentiate", y: 22 },
    { label: "Explores new angle", y: 78 },
  ];

  return (
    <svg viewBox="0 0 720 370" className="w-full" style={{ maxWidth: 720, backgroundColor: surfaceDim, borderRadius: 12 }}>
      {/* Title */}
      <text x="360" y="28" textAnchor="middle" fontSize="13" fontWeight="600" fill={textMain} letterSpacing="0.08em">
        FEEDBACK DYNAMICS
      </text>

      {/* Panels */}
      <rect x={leftX} y={panelY} width={panelW} height={panelH} rx="10" fill={surface} stroke={border} strokeWidth="1" />
      <rect x={rightX} y={panelY} width={panelW} height={panelH} rx="10" fill={surface} stroke={border} strokeWidth="1" />

      <text x={leftCenter.x} y={panelY - 12} textAnchor="middle" fontSize="11" fontWeight="600" fill={red}>
        Convergence trap (production)
      </text>
      <text x={rightCenter.x} y={panelY - 12} textAnchor="middle" fontSize="11" fontWeight="600" fill={green}>
        Diversity momentum (pool-aware)
      </text>

      {/* LEFT: Inward spiral */}
      <path d={inwardPath} fill="none" stroke={red} strokeWidth="2.5" opacity="0.4" />
      <polygon points="0,-4 8,0 0,4" transform={`translate(${inP2.x}, ${inP2.y}) rotate(${inAngle})`} fill={red} opacity="0.8" />

      {[90, 65, 40].map((r, i) => (
        <circle key={i} cx={leftCenter.x} cy={leftCenter.y} r={r} fill="none" stroke={red} strokeWidth="0.8" opacity={0.15 + i * 0.05} strokeDasharray="3 4" />
      ))}
      <circle cx={leftCenter.x} cy={leftCenter.y} r="6" fill={red} opacity="0.4" />
      <circle cx={leftCenter.x} cy={leftCenter.y} r="2.5" fill={red} opacity="0.8" />

      {leftSteps.map((s, i) => (
        <text key={i} x={leftCenter.x} y={leftCenter.y + s.y} textAnchor="middle" fontSize="9" fontWeight="500" fill={textMain} opacity="0.9">
          {s.label}
        </text>
      ))}

      {/* RIGHT: Outward spiral */}
      <path d={outwardPath} fill="none" stroke={green} strokeWidth="2.5" opacity="0.4" />
      <polygon points="0,-4 8,0 0,4" transform={`translate(${outP2.x}, ${outP2.y}) rotate(${outAngle})`} fill={green} opacity="0.8" />

      {[35, 60, 85].map((r, i) => (
        <circle key={i} cx={rightCenter.x} cy={rightCenter.y} r={r} fill={green} opacity={0.04 - i * 0.01} stroke={green} strokeWidth="0.8" strokeDasharray="3 4" />
      ))}
      <circle cx={rightCenter.x} cy={rightCenter.y} r="4" fill={green} opacity="0.6" />

      {rightSteps.map((s, i) => (
        <text key={i} x={rightCenter.x} y={rightCenter.y + s.y} textAnchor="middle" fontSize="9" fontWeight="500" fill={textMain} opacity="0.9">
          {s.label}
        </text>
      ))}

      {/* Annotation */}
      <rect x="40" y="322" width="640" height="32" rx="6" fill={surface} stroke={border} strokeWidth="0.5" />
      <text x="360" y="337" textAnchor="middle" fontSize="9" fill={muted}>
        Left: each homogeneous statement makes the next one more homogeneous — the spiral tightens.
      </text>
      <text x="360" y="349" textAnchor="middle" fontSize="9" fill={muted}>
        Right: each diverse statement expands the repulsion field — the spiral widens.
      </text>
    </svg>
  );
}