import type { DeliberationStage, DisplayStage } from "@/lib/types";
import { toDisplayStage } from "@/lib/types";

interface StageIndicatorProps {
  currentStage: DeliberationStage;
  activeStage: DisplayStage;
  onStageClick: (stage: DisplayStage) => void;
}

const stages: { value: DisplayStage; label: string }[] = [
  { value: "opinion", label: "Opinion" },
  { value: "ranking", label: "Ranking" },
  { value: "critique", label: "Critique" },
  { value: "completed", label: "Completed" },
];

export default function StageIndicator({
  currentStage,
  activeStage,
  onStageClick,
}: StageIndicatorProps) {
  const displayStage = toDisplayStage(currentStage);
  const currentIndex = stages.findIndex((s) => s.value === displayStage);
  const activeIndex = stages.findIndex((s) => s.value === activeStage);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isActive = index === activeIndex;
          const isClickable = index <= currentIndex;

          return (
            <div key={stage.value} className="flex flex-1 items-center">
              {/* Circle + Label */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onStageClick(stage.value)}
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
                    isCompleted
                      ? "bg-green-600 hover:bg-green-500"
                      : isCurrent
                      ? "bg-blue-600 hover:bg-blue-500"
                      : "bg-gray-300 dark:bg-gray-600"
                  } ${
                    isActive
                      ? "ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-gray-900"
                      : ""
                  } ${
                    isClickable
                      ? "cursor-pointer"
                      : "cursor-default"
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
                        isCurrent
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
              </div>

              {/* Connector Line */}
              {index < stages.length - 1 && (
                <div
                  className={`mx-2 h-1 flex-1 ${
                    index < currentIndex
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
