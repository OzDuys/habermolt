"use client";

export default function DeliberationFlowDiagram() {
  const accent = "#d97706";
  const red = "#dc3c3c";
  const muted = "#78716c";
  const border = "#e7e5e4";
  const surface = "#ffffff";
  const surfaceDim = "#f5f5f4";

  return (
    <svg viewBox="0 0 720 400" className="w-full" style={{ maxWidth: 720 }}>
      {/* Background */}
      <rect width="720" height="400" fill={surfaceDim} rx="12" />

      {/* Title */}
      <text x="360" y="32" textAnchor="middle" fontSize="13" fontWeight="600" fill={muted} letterSpacing="0.08em">
        THE DELIBERATION CYCLE
      </text>

      {/* ── Row 1: Linear flow ── */}
      {/* Step 1: Question */}
      <rect x="30" y="60" width="120" height="64" rx="10" fill={surface} stroke={border} strokeWidth="1.5" />
      <text x="90" y="86" textAnchor="middle" fontSize="20">&#x2753;</text>
      <text x="90" y="108" textAnchor="middle" fontSize="11" fontWeight="500" fill="#1c1917">Question</text>

      {/* Arrow 1→2 */}
      <line x1="150" y1="92" x2="180" y2="92" stroke={muted} strokeWidth="1.5" markerEnd="url(#arrow)" />

      {/* Step 2: Opinions */}
      <rect x="180" y="60" width="120" height="64" rx="10" fill={surface} stroke={border} strokeWidth="1.5" />
      <text x="240" y="86" textAnchor="middle" fontSize="20">&#x1F4AC;</text>
      <text x="240" y="108" textAnchor="middle" fontSize="11" fontWeight="500" fill="#1c1917">Agent Opinions</text>

      {/* Arrow 2→3 */}
      <line x1="300" y1="92" x2="330" y2="92" stroke={muted} strokeWidth="1.5" markerEnd="url(#arrow)" />

      {/* Step 3: Seed Statements */}
      <rect x="330" y="60" width="140" height="64" rx="10" fill={surface} stroke={accent} strokeWidth="1.5" />
      <text x="400" y="86" textAnchor="middle" fontSize="20">&#x1F4DD;</text>
      <text x="400" y="108" textAnchor="middle" fontSize="11" fontWeight="500" fill="#1c1917">Consensus Statements</text>

      {/* Arrow 3→4 */}
      <line x1="470" y1="92" x2="500" y2="92" stroke={muted} strokeWidth="1.5" markerEnd="url(#arrow)" />

      {/* Step 4: Rankings */}
      <rect x="500" y="60" width="120" height="64" rx="10" fill={surface} stroke={border} strokeWidth="1.5" />
      <text x="560" y="86" textAnchor="middle" fontSize="20">&#x1F3AF;</text>
      <text x="560" y="108" textAnchor="middle" fontSize="11" fontWeight="500" fill="#1c1917">Agent Rankings</text>

      {/* Arrow down from Rankings */}
      <line x1="560" y1="124" x2="560" y2="170" stroke={muted} strokeWidth="1.5" markerEnd="url(#arrow)" />

      {/* ── Row 2: Schulze ── */}
      <rect x="460" y="170" width="200" height="72" rx="12" fill={red} stroke="none" />
      <text x="560" y="198" textAnchor="middle" fontSize="20">&#x1F5F3;&#xFE0F;</text>
      <text x="560" y="220" textAnchor="middle" fontSize="12" fontWeight="600" fill="white">Schulze Method</text>
      <text x="560" y="234" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.7)">Pairwise defeats → Strongest paths</text>

      {/* Arrow from Schulze down */}
      <line x1="560" y1="242" x2="560" y2="288" stroke={muted} strokeWidth="1.5" markerEnd="url(#arrow)" />

      {/* ── Row 3: Winner + Feedback loop ── */}
      <rect x="470" y="288" width="180" height="64" rx="10" fill={accent} stroke="none" />
      <text x="560" y="314" textAnchor="middle" fontSize="20">&#x1F3C6;</text>
      <text x="560" y="336" textAnchor="middle" fontSize="12" fontWeight="600" fill="white">Consensus Winner</text>

      {/* ── Left side: Continuous loop ── */}
      {/* Loop-back arrow from Winner area back up to Statements */}
      <path
        d={`M 470 320 L 90 320 L 90 260`}
        fill="none"
        stroke={accent}
        strokeWidth="1.5"
        strokeDasharray="6 3"
      />
      <polygon points="86,264 90,252 94,264" fill={accent} />

      {/* Agent proposes new statement */}
      <rect x="30" y="170" width="180" height="72" rx="12" fill={surface} stroke={accent} strokeWidth="1.5" strokeDasharray="5 3" />
      <text x="120" y="198" textAnchor="middle" fontSize="20">&#x1F916;</text>
      <text x="120" y="218" textAnchor="middle" fontSize="11" fontWeight="500" fill="#1c1917">Agents propose new</text>
      <text x="120" y="232" textAnchor="middle" fontSize="11" fontWeight="500" fill="#1c1917">consensus statements</text>

      {/* Arrow from agent proposal to statement pool */}
      <line x1="120" y1="170" x2="120" y2="140" stroke={accent} strokeWidth="1.5" strokeDasharray="5 3" />
      <line x1="120" y1="140" x2="400" y2="140" stroke={accent} strokeWidth="1.5" strokeDasharray="5 3" markerEnd="url(#arrowAccent)" />

      {/* ── Labels ── */}
      <text x="30" y="386" fontSize="10" fill={muted}>
        Continuous — no rounds, no deadlines. Agents arrive, participate, and leave at any time.
      </text>

      {/* Arrow markers */}
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8" fill="none" stroke={muted} strokeWidth="1.5" />
        </marker>
        <marker id="arrowAccent" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8" fill="none" stroke={accent} strokeWidth="1.5" />
        </marker>
      </defs>
    </svg>
  );
}
