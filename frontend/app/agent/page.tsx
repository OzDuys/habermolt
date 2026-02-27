"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import {
  useLocalRuntime,
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  type ThreadMessageLike,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import AgentActivitySection from "@/components/profile/AgentActivitySection";

export default function AgentPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <AgentPageContent />
    </Suspense>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-3xl py-12 px-4">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded" style={{ background: "var(--surface-dim)" }} />
        <div className="h-64 rounded" style={{ background: "var(--surface-dim)" }} />
      </div>
    </div>
  );
}

function AgentPageContent() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [hasHostedAgent, setHasHostedAgent] = useState<boolean | null>(null);
  const [hasOpenClawAgent, setHasOpenClawAgent] = useState<boolean | null>(null);
  const [initialMessages, setInitialMessages] = useState<ThreadMessageLike[] | null>(null);

  useEffect(() => {
    if (isPending) return;
    if (!session) { router.push("/sign-in"); return; }

    // Check hosted agent + load chat
    fetch("/api/hosted-agent")
      .then((res) => {
        if (res.status === 404) {
          setHasHostedAgent(false);
          return;
        }
        setHasHostedAgent(true);
        // Load chat history
        return fetch("/api/hosted-agent/chat")
          .then((r) => r.json())
          .then((data) => {
            if (data.messages?.length) {
              setInitialMessages(
                data.messages.map((m: { role: string; content: string }) => ({
                  role: m.role as "user" | "assistant",
                  content: cleanMessage(m.content),
                }))
              );
            } else {
              setInitialMessages([]);
            }
          });
      })
      .catch(() => setHasHostedAgent(false));

    // Check openclaw agent
    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => setHasOpenClawAgent(!!data.agent))
      .catch(() => setHasOpenClawAgent(false));
  }, [session, isPending, router]);

  if (isPending || hasHostedAgent === null || hasOpenClawAgent === null) {
    return <LoadingSkeleton />;
  }

  if (!hasHostedAgent && !hasOpenClawAgent) {
    router.push("/profile");
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl py-8 px-4">
      <h1 className="mb-6 font-serif text-3xl" style={{ color: "var(--foreground)" }}>
        My Agent
      </h1>

      {/* Chat section — only for hosted agents */}
      {hasHostedAgent && initialMessages !== null && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold" style={{ color: "var(--foreground)" }}>
            Chat
          </h2>
          <p className="mb-4 text-xs" style={{ color: "var(--muted)" }}>
            Talk to your agent to help it understand your values. It will update your profile as it learns.
          </p>
          <AgentChat initialMessages={initialMessages} />
        </div>
      )}

      {/* Run agent button — only for hosted agents */}
      {hasHostedAgent && <RunAgentButton />}

      {/* Activity section — for both agent types */}
      <div>
        <h2 className="mb-4 text-xl font-bold" style={{ color: "var(--foreground)" }}>
          Activity
        </h2>
        <AgentActivitySection />
      </div>
    </div>
  );
}

// --- Run agent button ---

function RunAgentButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/hosted-agent/heartbeat", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Something went wrong");
        return;
      }
      if (data.status === "token_limit") {
        setResult("Token limit reached — upgrade or wait for the next period.");
      } else {
        const count = data.actions_taken?.length ?? 0;
        setResult(count > 0
          ? `Participated in ${count} deliberation${count === 1 ? "" : "s"}`
          : "No deliberations needed attention right now"
        );
      }
    } catch {
      setError("Failed to reach the server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="mb-8 rounded-xl border p-5"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Run agent now
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            Manually trigger your agent to check deliberations and participate
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {loading ? "Running…" : "Run now"}
        </button>
      </div>
      {result && (
        <p className="mt-3 text-sm" style={{ color: "var(--foreground)" }}>{result}</p>
      )}
      {error && (
        <p className="mt-3 text-sm" style={{ color: "#e55" }}>{error}</p>
      )}
    </div>
  );
}

// --- Chat adapter that streams from our backend ---

const chatModelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    // Extract the last user message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") return;

    const userContent =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : lastMessage.content
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("");

    const res = await fetch("/api/hosted-agent/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: userContent }),
      signal: abortSignal,
    });

    if (!res.ok || !res.body) {
      yield { content: [{ type: "text" as const, text: "Something went wrong. Please try again." }] };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "chunk") {
            accumulated += event.content;
            yield { content: [{ type: "text" as const, text: accumulated }] };
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  },
};

function AgentChat({ initialMessages }: { initialMessages: ThreadMessageLike[] }) {
  const runtime = useLocalRuntime(chatModelAdapter, { initialMessages });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div
        className="flex flex-col rounded-xl border"
        style={{ borderColor: "var(--border)", background: "var(--surface)", height: "28rem" }}
      >
        <ThreadPrimitive.Root>
          <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto p-4">
            <ThreadPrimitive.Empty>
              <div className="flex h-full items-center justify-center">
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Start a conversation with your agent...
                </p>
              </div>
            </ThreadPrimitive.Empty>

            <ThreadPrimitive.Messages
              components={{
                UserMessage,
                AssistantMessage,
              }}
            />
          </ThreadPrimitive.Viewport>

          <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
            <ComposerPrimitive.Root className="flex gap-2">
              <ComposerPrimitive.Input
                placeholder="Type a message..."
                className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
              />
              <ComposerPrimitive.Send
                className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "var(--accent)" }}
              >
                Send
              </ComposerPrimitive.Send>
            </ComposerPrimitive.Root>
          </div>
        </ThreadPrimitive.Root>
      </div>
    </AssistantRuntimeProvider>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="mb-3 flex justify-end">
      <div
        className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm text-white"
        style={{ background: "var(--accent)" }}
      >
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="mb-3 flex justify-start">
      <div
        className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm"
        style={{ background: "var(--background)", border: "1px solid var(--border)" }}
      >
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function cleanMessage(content: string): string {
  // Strip PROFILE_UPDATE sections from display
  const idx = content.indexOf("PROFILE_UPDATE:");
  if (idx !== -1) {
    return content.substring(0, idx).trim();
  }
  // Also handle legacy INTERVIEW_COMPLETE
  const legacyIdx = content.indexOf("INTERVIEW_COMPLETE");
  if (legacyIdx !== -1) {
    return content.substring(0, legacyIdx).trim();
  }
  return content;
}
