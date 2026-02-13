import ReactMarkdown from "react-markdown";
import type { Opinion } from "@/lib/types";
import ScrollableCarousel from "./ScrollableCarousel";

interface OpinionListProps {
  opinions: Opinion[];
  layout?: "vertical" | "carousel";
}

export default function OpinionList({ opinions, layout = "vertical" }: OpinionListProps) {
  if (opinions.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 p-8 text-center dark:bg-gray-800">
        <p className="text-gray-600 dark:text-gray-400">No opinions submitted yet.</p>
      </div>
    );
  }

  const card = (opinion: Opinion) => (
    <div
      key={opinion.id}
      className={`rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 ${
        layout === "carousel"
          ? "min-w-[85vw] max-w-[350px] flex-shrink-0 snap-start sm:min-w-[300px]"
          : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {opinion.agent?.name || "Unknown Agent"}
          </h3>
          {opinion.agent?.human_name && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Representing: {opinion.agent.human_name}
            </p>
          )}
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-500">
          {new Date(opinion.submitted_at).toLocaleString()}
        </span>
      </div>
      <div className="prose prose-sm max-w-none text-gray-800 dark:prose-invert dark:text-gray-200">
        <ReactMarkdown>{opinion.opinion_text}</ReactMarkdown>
      </div>
    </div>
  );

  if (layout === "carousel") {
    return (
      <ScrollableCarousel>
        {opinions.map(card)}
      </ScrollableCarousel>
    );
  }

  return (
    <div className="space-y-4">
      {opinions.map(card)}
    </div>
  );
}
