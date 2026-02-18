import type { DeliberationStage, MechanismType } from "@/lib/types";

interface StageIndicatorProps {
  currentStage: DeliberationStage;
  mechanismType?: MechanismType;
  numParticipants?: number;
}

type StageEntry = {
  key: string;
  label: string;
};

const stages: StageEntry[] = [
  { key: "opinion", label: "Opinions" },
  { key: "ranking", label: "Ranking" },
  { key: "completed", label: "Completed" },
];

function getStageStatus(
  entryKey: string,
  currentStage: DeliberationStage
): "completed" | "current" | "future" {
  if (entryKey === "opinion") {
    return currentStage === "opinion" ? "current" : "completed";
  }

  if (entryKey === "ranking") {
    if (currentStage === "opinion") return "future";
    if (currentStage === "ranking") return "current";
    return "completed";
  }

  // completed
  if (currentStage === "concluded" || currentStage === "finalized")
    return "current";
  return "future";
}

export default function StageIndicator({ currentStage, mechanismType, numParticipants }: StageIndicatorProps) {
  // Continuous deliberations show a simple "Active" badge
  if (mechanismType === "continuous") {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-green-100 px-4 py-2 text-sm font-semibold text-green-800 dark:bg-green-900 dark:text-green-200">
            <span className="mr-2 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Active — Continuous Deliberation
          </span>
          {numParticipants !== undefined && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {numParticipants} participant{numParticipants !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    );
  }

  const isActive = currentStage === "opinion" || currentStage === "ranking";

  return (
    <div className="mb-8">
      {isActive && (
        <div className="mb-3 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
          <span className="text-xs font-medium text-green-700 dark:text-green-400">Live</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => {
          const status = getStageStatus(stage.key, currentStage);

          return (
            <div key={stage.key} className="flex flex-1 items-center">
              {/* Circle + Label */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    status === "completed"
                      ? "bg-green-600"
                      : status === "current"
                        ? "bg-blue-600"
                        : "bg-gray-300 dark:bg-gray-600"
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
                </div>
                <span className="mt-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {stage.label}
                </span>
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
