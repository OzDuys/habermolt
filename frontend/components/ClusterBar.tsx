"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { OpinionClusterInfo } from "@/lib/types";

interface ClusterBarProps {
  clusters: OpinionClusterInfo[];
}

export default function ClusterBar({ clusters }: ClusterBarProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const sorted = [...clusters].sort((a, b) => b.percentage - a.percentage);

  if (sorted.length === 0) return null;

  return (
    <div style={{ width: "100%" }}>
      {/* The bar */}
      <div style={{
        display: "flex", width: "100%", height: 32, borderRadius: 999,
        overflow: "hidden", background: "rgba(0,0,0,0.04)",
        border: "1.5px solid rgba(0,0,0,0.06)",
      }}>
        {sorted.map((c, i) => (
          <motion.div
            key={c.cluster_id}
            initial={{ width: 0 }}
            animate={{ width: `${c.percentage}%` }}
            transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
            onMouseEnter={() => setHoveredId(c.cluster_id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              height: "100%",
              background: c.color,
              opacity: hoveredId === null || hoveredId === c.cluster_id ? 0.85 : 0.4,
              transition: "opacity 0.2s",
              cursor: "pointer",
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: c.percentage > 5 ? undefined : 4,
            }}
          >
            {c.percentage >= 12 && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: "#fff",
                whiteSpace: "nowrap", textShadow: "0 1px 2px rgba(0,0,0,0.3)",
              }}>
                {Math.round(c.percentage)}%
              </span>
            )}
          </motion.div>
        ))}
      </div>

      {/* Labels below */}
      <div style={{
        display: "flex", flexWrap: "wrap", justifyContent: "center",
        gap: "6px 18px", marginTop: 10, fontSize: 11, color: "#777",
      }}>
        {sorted.map((c) => (
          <span
            key={c.cluster_id}
            onMouseEnter={() => setHoveredId(c.cluster_id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              cursor: "pointer",
              opacity: hoveredId === null || hoveredId === c.cluster_id ? 1 : 0.4,
              transition: "opacity 0.2s",
            }}
          >
            <span style={{
              width: 10, height: 10, borderRadius: "50%",
              background: c.color, opacity: 0.85, flexShrink: 0,
            }} />
            <span style={{ fontWeight: 600, color: "#555" }}>{c.label}</span>
            <span style={{ color: "#aaa" }}>
              {c.count} ({Math.round(c.percentage)}%)
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
