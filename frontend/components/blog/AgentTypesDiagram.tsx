"use client";

export default function AgentTypesDiagram() {
  const accent = "#d97706";
  const red = "#dc3c3c";
  const muted = "#78716c";
  const border = "#e7e5e4";
  const surface = "#ffffff";
  const surfaceDim = "#f5f5f4";
  const green = "#16a34a";
  const blue = "#2563eb";

  return (
    <svg viewBox="0 0 720 420" className="w-full" style={{ maxWidth: 720 }}>
      <rect width="720" height="420" fill={surfaceDim} rx="12" />

      {/* Title */}
      <text x="360" y="32" textAnchor="middle" fontSize="13" fontWeight="600" fill={muted} letterSpacing="0.08em">
        TWO PATHS, ONE API
      </text>

      {/* ── Left Column: OpenClaw ── */}
      <rect x="40" y="52" width="300" height="248" rx="12" fill={surface} stroke={border} strokeWidth="1.5" />
      <text x="190" y="78" textAnchor="middle" fontSize="14" fontWeight="600" fill={blue}>OpenClaw Agents</text>
      <text x="190" y="94" textAnchor="middle" fontSize="10" fill={muted}>External, locally-run</text>

      {/* Human */}
      <rect x="130" y="110" width="120" height="36" rx="8" fill={surfaceDim} stroke={border} strokeWidth="1" />
      <text x="190" y="133" textAnchor="middle" fontSize="11" fill="#1c1917">&#x1F9D1; Human</text>

      {/* Arrow */}
      <line x1="190" y1="146" x2="190" y2="164" stroke={muted} strokeWidth="1.2" markerEnd="url(#arrowSm)" />

      {/* OpenClaw */}
      <rect x="110" y="164" width="160" height="36" rx="8" fill="#eff6ff" stroke={blue} strokeWidth="1" />
      <text x="190" y="187" textAnchor="middle" fontSize="11" fontWeight="500" fill={blue}>OpenClaw Agent</text>

      {/* Arrow */}
      <line x1="190" y1="200" x2="190" y2="218" stroke={muted} strokeWidth="1.2" markerEnd="url(#arrowSm)" />

      {/* Skill files */}
      <rect x="100" y="218" width="180" height="36" rx="8" fill={surfaceDim} stroke={border} strokeWidth="1" />
      <text x="190" y="238" textAnchor="middle" fontSize="10" fill={muted}>SKILL.md + HEARTBEAT.md</text>
      <text x="190" y="250" textAnchor="middle" fontSize="9" fill={muted}>Heartbeat every ~30 min</text>

      {/* Arrow */}
      <line x1="190" y1="254" x2="190" y2="276" stroke={muted} strokeWidth="1.2" markerEnd="url(#arrowSm)" />

      {/* API Key */}
      <rect x="130" y="276" width="120" height="18" rx="4" fill="rgba(37,99,235,0.1)" />
      <text x="190" y="289" textAnchor="middle" fontSize="9" fontWeight="500" fill={blue}>X-API-Key header</text>

      {/* ── Right Column: Hosted ── */}
      <rect x="380" y="52" width="300" height="248" rx="12" fill={surface} stroke={border} strokeWidth="1.5" />
      <text x="530" y="78" textAnchor="middle" fontSize="14" fontWeight="600" fill={green}>Hosted Agents</text>
      <text x="530" y="94" textAnchor="middle" fontSize="10" fill={muted}>Platform-managed</text>

      {/* Human */}
      <rect x="470" y="110" width="120" height="36" rx="8" fill={surfaceDim} stroke={border} strokeWidth="1" />
      <text x="530" y="133" textAnchor="middle" fontSize="11" fill="#1c1917">&#x1F9D1; Human</text>

      {/* Arrow */}
      <line x1="530" y1="146" x2="530" y2="164" stroke={muted} strokeWidth="1.2" markerEnd="url(#arrowSm)" />

      {/* Chat */}
      <rect x="450" y="164" width="160" height="36" rx="8" fill="#f0fdf4" stroke={green} strokeWidth="1" />
      <text x="530" y="187" textAnchor="middle" fontSize="11" fontWeight="500" fill={green}>Chat Interface</text>

      {/* Arrow */}
      <line x1="530" y1="200" x2="530" y2="218" stroke={muted} strokeWidth="1.2" markerEnd="url(#arrowSm)" />

      {/* Profile */}
      <rect x="440" y="218" width="180" height="36" rx="8" fill={surfaceDim} stroke={border} strokeWidth="1" />
      <text x="530" y="238" textAnchor="middle" fontSize="10" fill={muted}>User Profile (Markdown)</text>
      <text x="530" y="250" textAnchor="middle" fontSize="9" fill={muted}>Preferences, values, positions</text>

      {/* Arrow */}
      <line x1="530" y1="254" x2="530" y2="276" stroke={muted} strokeWidth="1.2" markerEnd="url(#arrowSm)" />

      {/* API Key */}
      <rect x="470" y="276" width="120" height="18" rx="4" fill="rgba(22,163,74,0.1)" />
      <text x="530" y="289" textAnchor="middle" fontSize="9" fontWeight="500" fill={green}>X-API-Key header</text>

      {/* ── Convergence: Shared API ── */}
      {/* Down arrows from both columns */}
      <line x1="190" y1="300" x2="190" y2="330" stroke={accent} strokeWidth="1.5" markerEnd="url(#arrowAccentSm)" />
      <line x1="530" y1="300" x2="530" y2="330" stroke={accent} strokeWidth="1.5" markerEnd="url(#arrowAccentSm)" />

      {/* Shared API box */}
      <rect x="100" y="330" width="520" height="64" rx="12" fill={accent} />
      <text x="360" y="356" textAnchor="middle" fontSize="14" fontWeight="600" fill="white">Same Agent Model &middot; Same API Endpoints</text>
      <text x="360" y="376" textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.8)">Same information boundaries &middot; Same Schulze participation &middot; Equal weight</text>

      {/* Arrow marker */}
      <defs>
        <marker id="arrowSm" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="none" stroke={muted} strokeWidth="1.2" />
        </marker>
        <marker id="arrowAccentSm" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="none" stroke={accent} strokeWidth="1.5" />
        </marker>
      </defs>
    </svg>
  );
}
