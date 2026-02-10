import type { DeliberationStage, ActiveView } from "@/lib/types";
import { activeViewKey } from "@/lib/types";

interface StageIndicatorProps {
  currentStage: DeliberationStage;
  currentCritiqueRound: number;
  numCritiqueRounds: number;
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
}

type StageEntry = {
  key: string;
  label: string;
  sublabel?: string;
  view: ActiveView;
};

function getStageStatus(
  entry: StageEntry,
  currentStage: DeliberationStage,
  currentCritiqueRound: number
): "completed" | "current" | "future" {
  if (entry.key === "opinion") {
    return currentStage === "opinion" ? "current" : "completed";
  }

  if (entry.key === "completed") {
    if (currentStage === "concluded" || currentStage === "finalized")
      return "current";
    return "future";
  }

  // Round entries
  const round = (entry.view as { type: "round"; round: number }).round;

  if (currentStage === "opinion") return "future";
  if (currentStage === "concluded" || currentStage === "finalized")
    return "completed";

  // We're in ranking or critique stage
  if (currentCritiqueRound === round) return "current";
  if (currentCritiqueRound > round) return "completed";
  return "future";
}

export default function StageIndicator({
  currentStage,
  currentCritiqueRound,
  numCritiqueRounds,
  activeView,
  onViewChange,
}: StageIndicatorProps) {
  // Build dynamic stages: Opinion → Round 1 → Round 2 → ... → Completed
  const stages: StageEntry[] = [
    { key: "opinion", label: "Opinions", view: { type: "opinion" } },
    ...Array.from({ length: numCritiqueRounds }, (_, i) => {
      // Show sub-phase for the current round
      let sublabel: string | undefined;
      if (
        (currentStage === "ranking" || currentStage === "critique") &&
        currentCritiqueRound === i
      ) {
        sublabel = currentStage === "ranking" ? "Ranking" : "Critiquing";
      }
      return {
        key: `round-${i}`,
        label: numCritiqueRounds === 1 ? "Deliberation" : `Round ${i + 1}`,
        sublabel,
        view: { type: "round" as const, round: i },
      };
    }),
    { key: "completed", label: "Completed", view: { type: "completed" } },
  ];

  const activeKey = activeViewKey(activeView);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => {
          const status = getStageStatus(
            stage,
            currentStage,
            currentCritiqueRound
          );
          const isActive = stage.key === activeKey;
          const isClickable = status === "completed" || status === "current";

          return (
            <div key={stage.key} className="flex flex-1 items-center">
              {/* Circle + Label */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onViewChange(stage.view)}
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
                    status === "completed"
                      ? "bg-green-600 hover:bg-green-500"
                      : status === "current"
                        ? "bg-blue-600 hover:bg-blue-500"
                        : "bg-gray-300 dark:bg-gray-600"
                  } ${
                    isActive
                      ? "ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-gray-900"
                      : ""
                  } ${
                    isClickable ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  {status === "completed" ? (
                    <svg
                      className="h-6 w-6 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <span
                      className={`text-sm font-semibold ${
                        status === "current"
                          ? "text-white"
                          : "text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {index + 1}
                    </span>
                  )}
                </button>
                <span
                  className={`mt-2 text-sm font-medium ${
                    isActive
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-600 dark:text-gray-400"
                  }`}
                >
                  {stage.label}
                </span>
                {stage.sublabel && (
                  <span className="text-xs text-blue-500 dark:text-blue-400">
                    {stage.sublabel}
                  </span>
                )}
              </div>

              {/* Connector Line */}
              {index < stages.length - 1 && (
                <div
                  className={`mx-2 h-1 flex-1 ${
                    status === "completed"
                      ? "bg-green-600"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
