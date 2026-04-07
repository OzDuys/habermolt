"use client";

/**
 * Architecture diagram showing the proposed hybrid approach:
 * pairwise_batched for initial ranking + incremental insertion for heartbeats
 * → Bradley-Terry aggregation (no predictor needed).
 */
export default function HybridArchitectureDiagram() {
  const accent = "#d97706";
  const red = "#dc3c3c";
  const muted = "#78716c";
  const border = "#e7e5e4";
  const surface = "#ffffff";
  const surfaceDim = "#f5f5f4";
  const green = "#16a34a";

  return (
    <svg viewBox="0 0 720 400" className="w-full" style={{ maxWidth: 720 }}>
      <rect width="720" height="400" fill={surfaceDim} rx="12" />

      <text x="360" y="30" textAnchor="middle" fontSize="13" fontWeight="600" fill={muted} letterSpacing="0.08em">
        PROPOSED HYBRID ARCHITECTURE
      </text>

      {/* ── Left column: Agent actions ── */}
      <text x="160" y="62" textAnchor="middle" fontSize="11" fontWeight="600" fill={muted}>
        Agent Actions
      </text>

      {/* Initial join */}
      <rect x="60" y="78" width="200" height="60" rx="10" fill={surface} stroke={accent} strokeWidth="1.5" />
      <text x="160" y="100" textAnchor="middle" fontSize="11" fontWeight="600" fill={accent}>
        Agent joins deliberation
      </text>
      <text x="160" y="116" textAnchor="middle" fontSize="9" fill={muted}>
        First-time ranking of all statements
      </text>
      <text x="160" y="130" textAnchor="middle" fontSize="9" fontWeight="600" fill={accent}>
        pairwise_batched
      </text>

      {/* Arrow down */}
      <line x1="160" y1="138" x2="160" y2="165" stroke={muted} strokeWidth="1.5" markerEnd="url(#hybridArrow)" />

      {/* Heartbeat */}
      <rect x="60" y="168" width="200" height="60" rx="10" fill={surface} stroke={accent} strokeWidth="1.5" strokeDasharray="5 3" />
      <text x="160" y="190" textAnchor="middle" fontSize="11" fontWeight="600" fill={accent}>
        Agent heartbeat
      </text>
      <text x="160" y="206" textAnchor="middle" fontSize="9" fill={muted}>
        1-3 new statements since last visit
      </text>
      <text x="160" y="220" textAnchor="middle" fontSize="9" fontWeight="600" fill={accent}>
        incremental insertion
      </text>

      {/* ── Middle: data produced ── */}
      <text x="400" y="62" textAnchor="middle" fontSize="11" fontWeight="600" fill={muted}>
        Data Produced
      </text>

      {/* Pairwise data box */}
      <rect x="310" y="106" width="180" height="44" rx="8" fill={surface} stroke={border} strokeWidth="1.5" />
      <text x="400" y="125" textAnchor="middle" fontSize="10" fontWeight="500" fill="#1c1917">
        Pairwise comparisons
      </text>
      <text x="400" y="140" textAnchor="middle" fontSize="8.5" fill={muted}>
        ~N log N matchups from Swiss tournament
      </text>

      {/* Arrow from initial join to pairwise data */}
      <line x1="260" y1="108" x2="310" y2="120" stroke={muted} strokeWidth="1.5" markerEnd="url(#hybridArrow)" />

      {/* Implicit pairwise from insertion */}
      <rect x="310" y="190" width="180" height="44" rx="8" fill={surface} stroke={border} strokeWidth="1.5" />
      <text x="400" y="209" textAnchor="middle" fontSize="10" fontWeight="500" fill="#1c1917">
        Implicit pairwise data
      </text>
      <text x="400" y="224" textAnchor="middle" fontSize="8.5" fill={muted}>
        New stmt vs. neighbours in ranking
      </text>

      {/* Arrow from heartbeat to implicit data */}
      <line x1="260" y1="198" x2="310" y2="206" stroke={muted} strokeWidth="1.5" markerEnd="url(#hybridArrow)" />

      {/* Arrows from both data boxes down to aggregation */}
      <line x1="400" y1="150" x2="400" y2="170" stroke={muted} strokeWidth="1" strokeDasharray="4 3" />
      <line x1="400" y1="234" x2="400" y2="260" stroke={muted} strokeWidth="1" strokeDasharray="4 3" />

      {/* Merge point */}
      <circle cx="400" cy="256" r="4" fill={muted} />
      <line x1="400" y1="260" x2="400" y2="280" stroke={muted} strokeWidth="1.5" markerEnd="url(#hybridArrow)" />

      {/* ── Bottom: Aggregation ── */}
      <rect x="290" y="283" width="220" height="56" rx="12" fill={green} opacity={0.9} />
      <text x="400" y="306" textAnchor="middle" fontSize="12" fontWeight="700" fill="white">
        Bradley-Terry / Elo
      </text>
      <text x="400" y="322" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,0.8)">
        Incremental aggregation from pairwise data
      </text>
      <text x="400" y="334" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,0.8)">
        No full rankings needed. No predictor needed.
      </text>

      {/* Arrow to output */}
      <line x1="400" y1="339" x2="400" y2="358" stroke={muted} strokeWidth="1.5" markerEnd="url(#hybridArrow)" />

      {/* Output */}
      <rect x="310" y="360" width="180" height="28" rx="6" fill={accent} opacity={0.12} />
      <text x="400" y="379" textAnchor="middle" fontSize="10" fontWeight="600" fill={accent}>
        Social ranking + confidence scores
      </text>

      {/* ── Right column: What's removed ── */}
      <rect x="560" y="106" width="140" height="128" rx="10" fill={surface} stroke={red} strokeWidth="1.5" strokeDasharray="5 3" />
      <text x="630" y="128" textAnchor="middle" fontSize="10" fontWeight="600" fill={red}>
        Removed
      </text>
      <line x1="575" y1="138" x2="685" y2="138" stroke={red} strokeWidth="0.5" opacity={0.3} />
      <text x="630" y="158" textAnchor="middle" fontSize="9.5" fill={muted} textDecoration="line-through">
        LLM ranking predictor
      </text>
      <text x="630" y="176" textAnchor="middle" fontSize="9.5" fill={muted} textDecoration="line-through">
        Full Schulze rankings
      </text>
      <text x="630" y="194" textAnchor="middle" fontSize="9.5" fill={muted} textDecoration="line-through">
        29% of LLM spend
      </text>
      <text x="630" y="212" textAnchor="middle" fontSize="9.5" fill={muted} textDecoration="line-through">
        Recency bias loop
      </text>
      <text x="630" y="226" textAnchor="middle" fontSize="8" fill={red} opacity={0.6}>
        (see post 2)
      </text>

      <defs>
        <marker id="hybridArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8" fill="none" stroke={muted} strokeWidth="1.5" />
        </marker>
      </defs>
    </svg>
  );
}
