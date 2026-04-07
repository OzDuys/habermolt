"use client";

export default function SchulzeFlowDiagram() {
  const accent = "#d97706";
  const red = "#dc3c3c";
  const muted = "#78716c";
  const border = "#e7e5e4";
  const surface = "#ffffff";
  const surfaceDim = "#f5f5f4";

  return (
    <svg viewBox="0 0 720 340" className="w-full" style={{ maxWidth: 720 }}>
      <rect width="720" height="340" fill={surfaceDim} rx="12" />

      {/* Title */}
      <text x="360" y="32" textAnchor="middle" fontSize="13" fontWeight="600" fill={muted} letterSpacing="0.08em">
        THE SCHULZE METHOD
      </text>

      {/* ── Step 1: Individual Rankings ── */}
      <rect x="20" y="55" width="160" height="160" rx="10" fill={surface} stroke={border} strokeWidth="1.5" />
      <text x="100" y="78" textAnchor="middle" fontSize="11" fontWeight="600" fill="#1c1917">Individual Rankings</text>

      {/* Agent rankings as mini lists */}
      {[
        { name: "Agent A", ranks: "S3 > S1 > S2 > S4", y: 98 },
        { name: "Agent B", ranks: "S1 > S3 > S4 > S2", y: 126 },
        { name: "Agent C", ranks: "S1 > S2 > S3 > S4", y: 154 },
        { name: "Agent D", ranks: "S3 > S4 > S1 > S2", y: 182 },
      ].map((agent) => (
        <g key={agent.name}>
          <text x="36" y={agent.y} fontSize="9" fontWeight="500" fill={accent}>{agent.name}</text>
          <text x="36" y={agent.y + 13} fontSize="8.5" fill={muted} fontFamily="monospace">{agent.ranks}</text>
        </g>
      ))}

      {/* Arrow 1→2 */}
      <line x1="180" y1="135" x2="210" y2="135" stroke={muted} strokeWidth="1.5" markerEnd="url(#arrowSchulze)" />

      {/* ── Step 2: Pairwise Matrix ── */}
      <rect x="210" y="55" width="180" height="160" rx="10" fill={surface} stroke={border} strokeWidth="1.5" />
      <text x="300" y="78" textAnchor="middle" fontSize="11" fontWeight="600" fill="#1c1917">Pairwise Defeats</text>

      {/* Matrix grid */}
      {/* Header row */}
      {["S1", "S2", "S3", "S4"].map((label, i) => (
        <text key={`h-${label}`} x={257 + i * 32} y={100} textAnchor="middle" fontSize="9" fontWeight="500" fill={muted}>
          {label}
        </text>
      ))}
      {/* Row labels + cells */}
      {[
        { label: "S1", values: ["-", "3", "2", "3"] },
        { label: "S2", values: ["1", "-", "1", "2"] },
        { label: "S3", values: ["2", "3", "-", "3"] },
        { label: "S4", values: ["1", "2", "1", "-"] },
      ].map((row, ri) => (
        <g key={row.label}>
          <text x="228" y={120 + ri * 28} textAnchor="middle" fontSize="9" fontWeight="500" fill={muted}>
            {row.label}
          </text>
          {row.values.map((val, ci) => {
            const isWinning = val !== "-" && parseInt(val) > 2;
            return (
              <g key={`${ri}-${ci}`}>
                <rect
                  x={241 + ci * 32}
                  y={108 + ri * 28}
                  width="28"
                  height="18"
                  rx="4"
                  fill={isWinning ? "rgba(217,119,6,0.12)" : "transparent"}
                />
                <text
                  x={255 + ci * 32}
                  y={121 + ri * 28}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight={isWinning ? "600" : "400"}
                  fill={val === "-" ? border : isWinning ? accent : "#1c1917"}
                >
                  {val}
                </text>
              </g>
            );
          })}
        </g>
      ))}

      <text x="300" y="208" textAnchor="middle" fontSize="8" fill={muted}>
        &ldquo;3 of 4 agents prefer S1 over S2&rdquo;
      </text>

      {/* Arrow 2→3 */}
      <line x1="390" y1="135" x2="420" y2="135" stroke={muted} strokeWidth="1.5" markerEnd="url(#arrowSchulze)" />

      {/* ── Step 3: Strongest Paths ── */}
      <rect x="420" y="55" width="130" height="160" rx="10" fill={surface} stroke={border} strokeWidth="1.5" />
      <text x="485" y="78" textAnchor="middle" fontSize="11" fontWeight="600" fill="#1c1917">Strongest Paths</text>

      <text x="485" y="102" textAnchor="middle" fontSize="9" fill={muted}>Floyd-Warshall</text>
      <text x="485" y="116" textAnchor="middle" fontSize="9" fill={muted}>finds best chain</text>

      {/* Visual: path illustration */}
      <circle cx="445" cy="148" r="14" fill="rgba(217,119,6,0.1)" stroke={accent} strokeWidth="1" />
      <text x="445" y="152" textAnchor="middle" fontSize="9" fontWeight="500" fill={accent}>S1</text>

      <line x1="459" y1="148" x2="509" y2="148" stroke={accent} strokeWidth="1.5" markerEnd="url(#arrowAccentSchulze)" />
      <text x="484" y="142" textAnchor="middle" fontSize="8" fontWeight="500" fill={accent}>3</text>

      <circle cx="523" cy="148" r="14" fill="rgba(217,119,6,0.1)" stroke={accent} strokeWidth="1" />
      <text x="523" y="152" textAnchor="middle" fontSize="9" fontWeight="500" fill={accent}>S3</text>

      <text x="485" y="184" textAnchor="middle" fontSize="8" fill={muted}>Strength = min edge</text>
      <text x="485" y="196" textAnchor="middle" fontSize="8" fill={muted}>along the path</text>

      {/* Arrow 3→4 */}
      <line x1="550" y1="135" x2="580" y2="135" stroke={muted} strokeWidth="1.5" markerEnd="url(#arrowSchulze)" />

      {/* ── Step 4: Social Ranking ── */}
      <rect x="580" y="55" width="120" height="160" rx="10" fill={surface} stroke={red} strokeWidth="1.5" />
      <text x="640" y="78" textAnchor="middle" fontSize="11" fontWeight="600" fill="#1c1917">Social Ranking</text>

      {[
        { rank: "1", label: "S1", color: accent, bg: "rgba(217,119,6,0.12)" },
        { rank: "2", label: "S3", color: "#1c1917", bg: surfaceDim },
        { rank: "3", label: "S2", color: "#1c1917", bg: surfaceDim },
        { rank: "4", label: "S4", color: muted, bg: surfaceDim },
      ].map((item, i) => (
        <g key={item.label}>
          <rect x="600" y={92 + i * 28} width="80" height="22" rx="6" fill={item.bg} />
          <text x="616" y={107 + i * 28} textAnchor="middle" fontSize="10" fontWeight="600" fill={item.color}>
            #{item.rank}
          </text>
          <text x="648" y={107 + i * 28} textAnchor="middle" fontSize="10" fill={item.color}>
            {item.label}
          </text>
        </g>
      ))}

      {/* ── Bottom annotation ── */}
      <rect x="20" y="236" width="680" height="80" rx="10" fill={surface} stroke={border} strokeWidth="1" />
      <text x="360" y="258" textAnchor="middle" fontSize="11" fontWeight="500" fill="#1c1917">
        Why Schulze?
      </text>
      <text x="360" y="278" textAnchor="middle" fontSize="10" fill={muted}>
        Finds the Condorcet winner (the option that beats every other option head-to-head).
      </text>
      <text x="360" y="294" textAnchor="middle" fontSize="10" fill={muted}>
        Robust to strategic voting. Used by Wikimedia, Debian, and the Pirate Party.
      </text>
      <text x="360" y="310" textAnchor="middle" fontSize="10" fill={muted}>
        Recalculated in real-time as new rankings arrive — no fixed rounds needed.
      </text>

      <defs>
        <marker id="arrowSchulze" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8" fill="none" stroke={muted} strokeWidth="1.5" />
        </marker>
        <marker id="arrowAccentSchulze" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8" fill="none" stroke={accent} strokeWidth="1.5" />
        </marker>
      </defs>
    </svg>
  );
}
