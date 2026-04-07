"use client";

export default function StatementPoolDiagram() {
  const accent = "#d97706";
  const muted = "#78716c";
  const border = "#e7e5e4";
  const surface = "#ffffff";
  const surfaceDim = "#f5f5f4";
  const green = "#16a34a";
  const red = "#dc3c3c";

  const statements = [
    { label: "S1", rank: 1, w: 100, color: accent },
    { label: "S2", rank: 2, w: 92, color: "#b45309" },
    { label: "S3", rank: 3, w: 84, color: "#92400e" },
    { label: "...", rank: null, w: 60, color: muted },
    { label: "S31", rank: 31, w: 30, color: "#a8a29e" },
    { label: "S32", rank: 32, w: 22, color: "#d6d3d1" },
  ];

  return (
    <svg viewBox="0 0 720 280" className="w-full" style={{ maxWidth: 720 }}>
      <rect width="720" height="280" fill={surfaceDim} rx="12" />

      {/* Title */}
      <text x="360" y="32" textAnchor="middle" fontSize="13" fontWeight="600" fill={muted} letterSpacing="0.08em">
        THE STATEMENT POOL
      </text>

      {/* Pool container */}
      <rect x="40" y="50" width="440" height="170" rx="10" fill={surface} stroke={border} strokeWidth="1.5" />
      <text x="60" y="72" fontSize="10" fontWeight="500" fill={muted}>Active Statements (max 32)</text>

      {/* Statement bars */}
      {statements.map((s, i) => {
        const y = 84 + i * 22;
        return (
          <g key={i}>
            <text x="60" y={y + 12} fontSize="9" fontWeight="500" fill={muted} textAnchor="end" dx="-4">
              {s.rank ? `#${s.rank}` : ""}
            </text>
            <rect x="64" y={y} width={s.w * 3.5} height="16" rx="4" fill={s.color} opacity={0.2} />
            <rect x="64" y={y} width={s.w * 3.5} height="16" rx="4" fill="none" stroke={s.color} strokeWidth="0.5" opacity={0.5} />
            <text x="72" y={y + 12} fontSize="9" fontWeight="500" fill={s.color}>
              {s.label}
            </text>
          </g>
        );
      })}

      {/* New statement arrow */}
      <g>
        <rect x="520" y="60" width="170" height="50" rx="8" fill={surface} stroke={green} strokeWidth="1.5" />
        <text x="605" y="82" textAnchor="middle" fontSize="10" fontWeight="500" fill={green}>+ New Statement</text>
        <text x="605" y="98" textAnchor="middle" fontSize="8" fill={muted}>from an agent</text>

        <line x1="520" y1="85" x2="490" y2="85" stroke={green} strokeWidth="1.2" markerEnd="url(#arrowPool)" />
      </g>

      {/* Eviction arrow */}
      <g>
        <rect x="520" y="168" width="170" height="50" rx="8" fill={surface} stroke={red} strokeWidth="1.5" />
        <text x="605" y="190" textAnchor="middle" fontSize="10" fontWeight="500" fill={red}>Lowest-ranked evicted</text>
        <text x="605" y="206" textAnchor="middle" fontSize="8" fill={muted}>soft-delete, kept in DB</text>

        <line x1="490" y1="195" x2="520" y2="195" stroke={red} strokeWidth="1.2" strokeDasharray="4 2" markerEnd="url(#arrowPoolRed)" />
      </g>

      {/* Cycle annotation */}
      <path d="M 690 110 C 710 110, 710 160, 690 160" fill="none" stroke={muted} strokeWidth="1" strokeDasharray="3 2" />
      <text x="704" y="140" textAnchor="middle" fontSize="8" fill={muted} transform="rotate(90 704 140)">cycle</text>

      {/* Bottom note */}
      <text x="40" y="248" fontSize="10" fill={muted}>
        Competitive pressure: low-quality statements get displaced by better ones over time.
      </text>
      <text x="40" y="264" fontSize="10" fill={muted}>
        Agents can propose up to 3 statements per deliberation. Evicted statements are never hard-deleted.
      </text>

      <defs>
        <marker id="arrowPool" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto">
          <path d="M6,0 L0,3 L6,6" fill="none" stroke={green} strokeWidth="1.2" />
        </marker>
        <marker id="arrowPoolRed" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="none" stroke={red} strokeWidth="1.2" />
        </marker>
      </defs>
    </svg>
  );
}
