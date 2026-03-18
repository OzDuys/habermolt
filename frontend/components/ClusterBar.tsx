"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { OpinionClusterInfo } from "@/lib/types";

interface ClusterBarProps {
  clusters: OpinionClusterInfo[];
}

export default function ClusterBar({ clusters }: ClusterBarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null); // "top-0" or "sub-0-1"
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
        {sorted.map((c, i) => {
          const hasSubs = c.sub_clusters && c.sub_clusters.length > 1;
          const topKey = `top-${c.cluster_id}`;
          const isTopHovered = hoveredId === topKey;
          const isAnySubHovered = hasSubs && c.sub_clusters!.some(
            (s) => hoveredId === `sub-${c.cluster_id}-${s.sub_cluster_id}`
          );

          if (hasSubs) {
            // Render sub-cluster segments within this top-level cluster's space
            return c.sub_clusters!.map((s, si) => {
              const subKey = `sub-${c.cluster_id}-${s.sub_cluster_id}`;
              const isHovered = hoveredId === subKey || isTopHovered;
              return (
                <motion.div
                  key={subKey}
                  initial={{ width: 0 }}
                  animate={{ width: `${s.percentage}%` }}
                  transition={{ duration: 0.8, delay: i * 0.1 + si * 0.05, ease: "easeOut" }}
                  onMouseEnter={() => setHoveredId(subKey)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    height: "100%",
                    background: s.color,
                    opacity: hoveredId === null || isHovered ? 0.85 : 0.4,
                    transition: "opacity 0.2s",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: s.percentage > 5 ? undefined : 2,
                    // Add subtle border between sub-clusters of same parent
                    borderRight: si < c.sub_clusters!.length - 1 ? "1px solid rgba(255,255,255,0.3)" : "none",
                  }}
                >
                  {s.percentage >= 12 && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: "#fff",
                      whiteSpace: "nowrap", textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                    }}>
                      {Math.round(s.percentage)}%
                    </span>
                  )}
                </motion.div>
              );
            });
          }

          // No sub-clusters — render as single bar segment
          return (
            <motion.div
              key={topKey}
              initial={{ width: 0 }}
              animate={{ width: `${c.percentage}%` }}
              transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
              onMouseEnter={() => setHoveredId(topKey)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                height: "100%",
                background: c.color,
                opacity: hoveredId === null || hoveredId === topKey ? 0.85 : 0.4,
                transition: "opacity 0.2s",
                cursor: "pointer",
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
          );
        })}
      </div>

      {/* Labels below — top-level with optional sub-cluster expansion */}
      <div style={{
        display: "flex", flexWrap: "wrap", justifyContent: "center",
        gap: "6px 18px", marginTop: 10, fontSize: 11, color: "#777",
      }}>
        {sorted.map((c) => {
          const topKey = `top-${c.cluster_id}`;
          const hasSubs = c.sub_clusters && c.sub_clusters.length > 1;
          const isTopHovered = hoveredId === topKey;
          const isAnySubHovered = hasSubs && c.sub_clusters!.some(
            (s) => hoveredId === `sub-${c.cluster_id}-${s.sub_cluster_id}`
          );

          return (
            <div key={c.cluster_id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span
                onMouseEnter={() => setHoveredId(topKey)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  cursor: "pointer",
                  opacity: hoveredId === null || isTopHovered || isAnySubHovered ? 1 : 0.4,
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

              {/* Sub-cluster labels */}
              {hasSubs && (
                <div style={{
                  display: "flex", flexWrap: "wrap", gap: "2px 12px",
                  paddingLeft: 16, fontSize: 10,
                }}>
                  {c.sub_clusters!.map((s) => {
                    const subKey = `sub-${c.cluster_id}-${s.sub_cluster_id}`;
                    return (
                      <span
                        key={subKey}
                        onMouseEnter={() => setHoveredId(subKey)}
                        onMouseLeave={() => setHoveredId(null)}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          cursor: "pointer",
                          opacity: hoveredId === null || hoveredId === subKey || isTopHovered ? 1 : 0.35,
                          transition: "opacity 0.2s",
                        }}
                      >
                        <span style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: s.color, opacity: 0.85, flexShrink: 0,
                        }} />
                        <span style={{ color: "#888" }}>{s.label}</span>
                        <span style={{ color: "#bbb" }}>{s.count}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
