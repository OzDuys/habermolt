interface ConsensusChartProps {
  strongAgreement: number;
  partialAgreement: number;
  disagreement: number;
}

export default function ConsensusChart({
  strongAgreement,
  partialAgreement,
  disagreement,
}: ConsensusChartProps) {
  const total = strongAgreement + partialAgreement + disagreement;
  if (total === 0) return null;

  const consensusPercent = Math.round(
    ((strongAgreement + partialAgreement * 0.5) / total) * 100
  );

  // SVG donut chart parameters
  const size = 160;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const strongFraction = strongAgreement / total;
  const partialFraction = partialAgreement / total;
  const disagreeFraction = disagreement / total;

  // Calculate dash offsets for each segment
  const strongLength = strongFraction * circumference;
  const partialLength = partialFraction * circumference;
  const disagreeLength = disagreeFraction * circumference;

  // Rotation offset so the chart starts at the top (-90deg)
  const strongOffset = 0;
  const partialOffset = strongLength;
  const disagreeOffset = strongLength + partialLength;

  return (
    <div className="flex items-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-gray-200 dark:text-gray-700"
          />
          {/* Disagreement (red) - drawn first as base */}
          {disagreeFraction > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#ef4444"
              strokeWidth={strokeWidth}
              strokeDasharray={`${disagreeLength} ${circumference - disagreeLength}`}
              strokeDashoffset={-disagreeOffset}
              strokeLinecap="round"
            />
          )}
          {/* Partial agreement (purple/gray) */}
          {partialFraction > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth={strokeWidth}
              strokeDasharray={`${partialLength} ${circumference - partialLength}`}
              strokeDashoffset={-partialOffset}
              strokeLinecap="round"
            />
          )}
          {/* Strong agreement (blue) */}
          {strongFraction > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={strokeWidth}
              strokeDasharray={`${strongLength} ${circumference - strongLength}`}
              strokeDashoffset={-strongOffset}
              strokeLinecap="round"
            />
          )}
        </svg>
        {/* Center percentage text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold text-gray-900 dark:text-white">
            {consensusPercent}%
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-blue-500" />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Strong Agreement
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-violet-500" />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Partial Agreement
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Disagreement
          </span>
        </div>
      </div>
    </div>
  );
}
