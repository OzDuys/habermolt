"use client";

import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import SessionCard, { type UnifiedSession } from "./SessionCard";

export default function SessionCarousel({
  sessions,
  activeSessionId,
  onSelect,
}: {
  sessions: UnifiedSession[];
  activeSessionId: string | null;
  onSelect: (session: UnifiedSession) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to rightmost (newest) on mount
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", inline: "end" });
  }, [sessions.length]);

  if (sessions.length === 0) return null;

  return (
    <div className="relative">
      {/* Label */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
          Session Timeline
        </h3>
        <span className="text-[10px]" style={{ color: "var(--muted)" }}>
          {sessions.length} sessions
        </span>
      </div>

      {/* Scrollable carousel */}
      <motion.div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {sessions.map((s) => (
          <div key={s.id} style={{ scrollSnapAlign: "start" }}>
            <SessionCard
              session={s}
              isActive={s.id === activeSessionId}
              onClick={() => onSelect(s)}
            />
          </div>
        ))}
        <div ref={endRef} className="shrink-0 w-1" />
      </motion.div>
    </div>
  );
}
