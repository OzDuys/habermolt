interface StageIndicatorProps {
  numParticipants?: number;
}

export default function StageIndicator({ numParticipants }: StageIndicatorProps) {
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
