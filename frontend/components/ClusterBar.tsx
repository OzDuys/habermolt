"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { OpinionClusterInfo } from "@/lib/types";

interface ClusterBarProps {
  clusters: OpinionClusterInfo[];
}

export default function ClusterBar({ clusters }: ClusterBarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
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

          if (hasSubs) {
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

      {/* Labels — each column width matches its bar segment */}
      <div style={{ display: "flex", width: "100%", marginTop: 8 }}>
        {sorted.map((c) => {
          const topKey = `top-${c.cluster_id}`;
          const hasSubs = c.sub_clusters && c.sub_clusters.length > 1;
          const isTopHovered = hoveredId === topKey;
          const isAnySubHovered = hasSubs && c.sub_clusters!.some(
            (s) => hoveredId === `sub-${c.cluster_id}-${s.sub_cluster_id}`
          );

          return (
            <div
              key={c.cluster_id}
              style={{
                width: `${c.percentage}%`,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "0 2px",
                overflow: "hidden",
              }}
            >
              {/* Top-level label */}
              <span
                onMouseEnter={() => setHoveredId(topKey)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  cursor: "pointer",
                  opacity: hoveredId === null || isTopHovered || isAnySubHovered ? 1 : 0.4,
                  transition: "opacity 0.2s",
                  textAlign: "center",
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: c.color, opacity: 0.85, flexShrink: 0,
                }} />
                <span style={{
                  fontWeight: 600, color: "#555", fontSize: 11,
                  overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {c.label}
                </span>
                <span style={{ color: "#aaa", fontSize: 10, whiteSpace: "nowrap" }}>
                  {c.count} ({Math.round(c.percentage)}%)
                </span>
              </span>

              {/* Sub-cluster labels — constrained to parent width */}
              {hasSubs && (
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  gap: 1, marginTop: 4, width: "100%", fontSize: 10,
                }}>
                  {c.sub_clusters!.map((s) => {
                    const subKey = `sub-${c.cluster_id}-${s.sub_cluster_id}`;
                    return (
                      <span
                        key={subKey}
                        onMouseEnter={() => setHoveredId(subKey)}
                        onMouseLeave={() => setHoveredId(null)}
                        style={{
                          display: "flex", alignItems: "center", gap: 3,
                          cursor: "pointer",
                          opacity: hoveredId === null || hoveredId === subKey || isTopHovered ? 1 : 0.35,
                          transition: "opacity 0.2s",
                          textAlign: "center",
                          flexWrap: "wrap",
                          justifyContent: "center",
                          maxWidth: "100%",
                        }}
                      >
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: s.color, opacity: 0.85, flexShrink: 0,
                        }} />
                        <span style={{
                          color: "#888",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>
                          {s.label}
                        </span>
                        <span style={{ color: "#bbb", whiteSpace: "nowrap" }}>{s.count}</span>
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
