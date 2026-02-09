import ReactMarkdown from "react-markdown";
import type { HumanFeedback } from "@/lib/types";

interface HumanFeedbackDisplayProps {
  feedback: HumanFeedback[];
}

export default function HumanFeedbackDisplay({
  feedback,
}: HumanFeedbackDisplayProps) {
  if (feedback.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 p-8 text-center">
        <p className="text-gray-600">No human feedback submitted yet.</p>
      </div>
    );
  }

  const agreementLevelLabels: Record<number, string> = {
    1: "Strongly Disagree",
    2: "Disagree",
    3: "Neutral",
    4: "Agree",
    5: "Strongly Agree",
  };

  const agreementColors: Record<number, string> = {
    1: "text-red-600",
    2: "text-orange-600",
    3: "text-gray-600",
    4: "text-green-600",
    5: "text-green-700",
  };

  const averageAgreement =
    feedback.reduce((sum, f) => sum + f.agreement_level, 0) / feedback.length;

  return (
    <div>
      {/* Summary Stats */}
      <div className="mb-6 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 p-6">
        <h3 className="mb-2 text-lg font-semibold text-gray-900">
          Consensus Summary
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-gray-600">Responses</p>
            <p className="text-2xl font-bold text-gray-900">
              {feedback.length}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Average Agreement</p>
            <p className="text-2xl font-bold text-gray-900">
              {averageAgreement.toFixed(1)} / 5.0
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Consensus Level</p>
            <p className="text-2xl font-bold text-gray-900">
              {averageAgreement >= 4
                ? "High"
                : averageAgreement >= 3
                ? "Medium"
                : "Low"}
            </p>
          </div>
        </div>
      </div>

      {/* Individual Feedback */}
      <div className="space-y-4">
        {feedback.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {item.agent?.name || "Unknown Agent"}
                </h3>
                {item.agent?.human_name && (
                  <p className="text-sm text-gray-600">
                    Human: {item.agent.human_name}
                  </p>
                )}
              </div>
              <div className="text-right">
                <span
                  className={`text-sm font-semibold ${
                    agreementColors[item.agreement_level]
                  }`}
                >
                  {agreementLevelLabels[item.agreement_level]}
                </span>
                <br />
                <span className="text-xs text-gray-500">
                  {new Date(item.submitted_at).toLocaleString()}
                </span>
              </div>
            </div>

            {item.final_statement && (
              <div className="mb-3 rounded-lg bg-gray-50 p-3">
                <p className="text-sm font-medium text-gray-700">
                  Final statement:
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  {item.final_statement.statement_text}
                </p>
              </div>
            )}

            <div className="prose prose-sm max-w-none text-gray-800">
              <ReactMarkdown>{item.feedback_text}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
