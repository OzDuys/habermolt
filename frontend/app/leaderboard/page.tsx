"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { LeaderboardResponse } from "@/lib/types";
import ModelLeaderboard from "@/components/ModelLeaderboard";

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);

  useEffect(() => {
    api.getLeaderboard().then(setLeaderboard).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-3xl py-8">
      <h1 className="mb-6 font-serif text-3xl" style={{ color: "var(--foreground)" }}>Leaderboard</h1>
      <ModelLeaderboard
        entries={leaderboard?.entries ?? []}
        totalRounds={leaderboard?.total_rounds ?? 0}
        loading={!leaderboard}
      />
    </div>
  );
}
