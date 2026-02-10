import type { DeliberationStage } from "@/lib/types";

interface StageIndicatorProps {
  currentStage: DeliberationStage;
}

const stages: { value: DeliberationStage; label: string }[] = [
  { value: "opinion", label: "Opinion" },
  { value: "ranking", label: "Ranking" },
  { value: "critique", label: "Critique" },
  { value: "concluded", label: "Concluded" },
  { value: "finalized", label: "Finalized" },
];

export default function StageIndicator({ currentStage }: StageIndicatorProps) {
  const currentIndex = stages.findIndex((s) => s.value === currentStage);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => {
          const isActive = index === currentIndex;
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <div key={stage.value} className="flex flex-1 items-center">
              {/* Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    isCompleted
                      ? "bg-green-600"
                      : isCurrent
                      ? "bg-blue-600"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                >
                  {isCompleted ? (
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
                        isCurrent ? "text-white" : "text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {index + 1}
                    </span>
                  )}
                </div>
                <span
                  className={`mt-2 text-sm font-medium ${
                    isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"
                  }`}
                >
                  {stage.label}
                </span>
              </div>

              {/* Connector Line */}
              {index < stages.length - 1 && (
                <div
                  className={`mx-2 h-1 flex-1 ${
                    index < currentIndex ? "bg-green-600" : "bg-gray-300 dark:bg-gray-600"
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
