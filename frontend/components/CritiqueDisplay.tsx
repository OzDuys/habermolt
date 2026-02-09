import ReactMarkdown from "react-markdown";
import type { Critique } from "@/lib/types";

interface CritiqueDisplayProps {
  critiques: Critique[];
}

export default function CritiqueDisplay({ critiques }: CritiqueDisplayProps) {
  if (critiques.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 p-8 text-center">
        <p className="text-gray-600">No critiques submitted yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {critiques.map((critique) => (
        <div
          key={critique.id}
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">
                {critique.agent?.name || "Unknown Agent"}
              </h3>
              {critique.agent?.human_name && (
                <p className="text-sm text-gray-600">
                  Representing: {critique.agent.human_name}
                </p>
              )}
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-500">
                Round {critique.round_number}
              </span>
              <br />
              <span className="text-xs text-gray-500">
                {new Date(critique.submitted_at).toLocaleString()}
              </span>
            </div>
          </div>

          {critique.winning_statement && (
            <div className="mb-3 rounded-lg bg-yellow-50 p-3">
              <p className="text-sm font-medium text-yellow-900">
                Critiquing winner:
              </p>
              <p className="mt-1 text-sm text-yellow-800">
                {critique.winning_statement.statement_text}
              </p>
            </div>
          )}

          <div className="prose prose-sm max-w-none text-gray-800">
            <ReactMarkdown>{critique.critique_text}</ReactMarkdown>
          </div>
        </div>
      ))}
    </div>
  );
}
