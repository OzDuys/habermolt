import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY!;
const MODEL = "anthropic/claude-haiku-4-5";

async function openrouter(messages: { role: string; content: string }[]) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://habermolt.com",
      "X-Title": "Habermolt Consensus Game",
    },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.85 }),
  });
  if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}

// ─── Schulze method (server-side copy for cycle-breaking) ───────────────────

function runSchulzeN(agentRankings: number[][], n: number): {
  winner: number | null;
  pairwise: number[][];
} {
  const d = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const r of agentRankings) {
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (r[i] < r[j]) d[i][j]++;
  }
  const p = d.map((row) => [...row]);
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (i !== j) p[i][j] = Math.max(p[i][j], Math.min(p[i][k], p[k][j]));
  for (let i = 0; i < n; i++) {
    const others = Array.from({ length: n }, (_, j) => j).filter((j) => j !== i);
    if (others.every((j) => p[i][j] > p[j][i])) return { winner: i, pairwise: d };
  }
  return { winner: null, pairwise: d };
}

function ensureCondorcetWinner(rankings: number[][], n: number): number[][] {
  const result = rankings.map((r) => [...r]);
  for (let attempt = 0; attempt < 20; attempt++) {
    const { winner } = runSchulzeN(result, n);
    if (winner !== null) return result;
    // Nudge the last AI agent's ranking by swapping two adjacent items
    const lastAI = result.length - 1;
    const swapIdx = attempt % (n - 1);
    const tmp = result[lastAI][swapIdx];
    result[lastAI][swapIdx] = result[lastAI][swapIdx + 1];
    result[lastAI][swapIdx + 1] = tmp;
  }
  return result;
}

async function getAgentRanking(
  agentName: string,
  stance: string,
  opinion: string,
  stmts: { label: string; text: string }[],
  n: number
): Promise<number[]> {
  const stmtList = stmts.map((s, i) => `${i}: "${s.label}" — ${s.text}`).join("\n");
  const raw = await openrouter([
    {
      role: "system",
      content: `You are ${agentName}, a ${stance} lobster agent. Rank ${n} consensus statements (0=best, ${n - 1}=worst). Return ONLY {"ranking": [${Array.from({ length: n }, (_, i) => i).join(", ")}]}. No explanation.`,
    },
    {
      role: "user",
      content: `Your ${stance} opinion: "${opinion}"\nStatements:\n${stmtList}\nRank from your perspective.`,
    },
  ]);

  try {
    const parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]);
    if (Array.isArray(parsed.ranking) && parsed.ranking.length === n) return parsed.ranking;
  } catch { /* fallback below */ }
  return Array.from({ length: n }, (_, i) => i);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  try {
    if (action === "setup") {
      const { question } = body as { action: string; question: string };

      const setupRaw = await openrouter([
        {
          role: "system",
          content: `You are generating three AI debate agents with different views. Return ONLY a valid JSON object with these exact keys: "agent1Name", "agent1Opinion", "agent2Name", "agent2Opinion", "agent3Name", "agent3Opinion".

agent1 is PRO (strongly in favor). agent2 is CON (strongly against). agent3 is MODERATE (nuanced middle ground, sees both sides).
Names should be short and techy, like "PROTO-7", "DENY-BOT", "NOODLE-9", "AXIOM-X". Each name 6-8 chars max.
Opinions: 2-3 punchy sentences. Be opinionated and direct.
No preamble, no markdown — just the raw JSON object.`,
        },
        {
          role: "user",
          content: `The debate question is: "${question}"

Generate three AI agents with different views on this question.`,
        },
      ]);

      let agent1Name: string, agent1Opinion: string, agent2Name: string, agent2Opinion: string, agent3Name: string, agent3Opinion: string;
      try {
        const jsonMatch = setupRaw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : setupRaw);
        agent1Name = parsed.agent1Name;
        agent1Opinion = parsed.agent1Opinion;
        agent2Name = parsed.agent2Name;
        agent2Opinion = parsed.agent2Opinion;
        agent3Name = parsed.agent3Name;
        agent3Opinion = parsed.agent3Opinion;
        if (!agent1Name || !agent1Opinion || !agent2Name || !agent2Opinion || !agent3Name || !agent3Opinion) throw new Error("missing fields");
      } catch {
        agent1Name = "PROTO-7";
        agent1Opinion = `The answer is clearly yes. This is the only rational position. My analysis is conclusive.`;
        agent2Name = "DENY-BOT";
        agent2Opinion = `Objection. The premise is flawed. My client formally disputes this entire framing. Motion denied.`;
        agent3Name = "NUANCE-3";
        agent3Opinion = `Both sides have valid points. The real answer depends on context and how we define the terms. Let's dig deeper.`;
      }

      return NextResponse.json({ agent1Name, agent1Opinion, agent2Name, agent2Opinion, agent3Name, agent3Opinion });
    }

    if (action === "generate-statements") {
      const { question, playerOpinion, agent1Name, agent1Opinion, agent2Name, agent2Opinion, agent3Name, agent3Opinion, playerStatement } = body as {
        action: string;
        question: string;
        playerOpinion: string;
        agent1Name: string;
        agent1Opinion: string;
        agent2Name: string;
        agent2Opinion: string;
        agent3Name: string;
        agent3Opinion: string;
        playerStatement: string;
      };

      // Generate 3 consensus statements from the AI lobsters
      const statementsRaw = await openrouter([
        {
          role: "system",
          content: `You are generating consensus statements on behalf of three AI lobster agents in a deliberation. Each agent writes one consensus statement — a reframing that all participants could endorse. The statements should differ from the player's statement and from each other.

Return ONLY a valid JSON array of exactly 3 objects with keys "emoji", "label" (2-4 words), "text" (1-2 sentences), and "author" (the agent name who wrote it). No preamble, just the JSON array.`,
        },
        {
          role: "user",
          content: `Question: "${question}"

Opinions:
- Player: "${playerOpinion}"
- ${agent1Name} (PRO): "${agent1Opinion}"
- ${agent2Name} (CON): "${agent2Opinion}"
- ${agent3Name} (MODERATE): "${agent3Opinion}"

Player's consensus statement: "${playerStatement}"

Generate 3 different consensus statements, one from ${agent1Name}, one from ${agent2Name}, and one from ${agent3Name}. They should be reframings all parties could endorse.`,
        },
      ]);

      let statements: Array<{ emoji: string; label: string; text: string; author: string }>;
      try {
        const jsonMatch = statementsRaw.match(/\[[\s\S]*\]/);
        statements = JSON.parse(jsonMatch ? jsonMatch[0] : statementsRaw);
        if (!Array.isArray(statements) || statements.length < 3) throw new Error("bad statements");
        statements = statements.slice(0, 3);
      } catch {
        statements = [
          { emoji: "🔄", label: "The Practical View", text: "Rather than debating the principle, we should focus on what actually works best in practice for everyone involved.", author: agent1Name },
          { emoji: "🌊", label: "The Bigger Picture", text: "Both perspectives have merit. The real question is what framework gives us the best outcomes long-term.", author: agent2Name },
          { emoji: "🌱", label: "The Growth Angle", text: "This isn't a binary choice — the most interesting path forward combines elements both sides haven't considered yet.", author: agent3Name },
        ];
      }

      // Get rankings from all 3 agents for all 4 statements (player's + 3 AI)
      const allStmts = [
        { label: "Player Statement", text: playerStatement },
        { label: statements[0].label, text: statements[0].text },
        { label: statements[1].label, text: statements[1].text },
        { label: statements[2].label, text: statements[2].text },
      ];
      const n = allStmts.length;

      const [agent1Ranking, agent2Ranking, agent3Ranking] = await Promise.all([
        getAgentRanking(agent1Name, "PRO", agent1Opinion, allStmts, n),
        getAgentRanking(agent2Name, "CON", agent2Opinion, allStmts, n),
        getAgentRanking(agent3Name, "MODERATE", agent3Opinion, allStmts, n),
      ]);

      // Ensure no Schulze cycle — nudge if needed (user ranking not yet known, skip for now)
      return NextResponse.json({ statements, agent1Ranking, agent2Ranking, agent3Ranking });
    }

    if (action === "predict-ranking") {
      const { question, newStatement, agent1Opinion, agent2Opinion, agent3Opinion, numStatements,
        existingHumanRanking, existingAgent1Ranking, existingAgent2Ranking, existingAgent3Ranking } = body as {
        action: string;
        question: string;
        newStatement: string;
        agent1Opinion: string;
        agent2Opinion: string;
        agent3Opinion: string;
        numStatements: number;
        existingHumanRanking?: number[];
        existingAgent1Ranking?: number[];
        existingAgent2Ranking?: number[];
        existingAgent3Ranking?: number[];
      };

      const predictRaw = await openrouter([
        {
          role: "system",
          content: `Predict where three agents would rank a new statement among ${numStatements} total statements (0=best, ${numStatements - 1}=worst). Agent1 is PRO, Agent2 is CON, Agent3 is MODERATE. Return ONLY {"agent1Rank": N, "agent2Rank": N, "agent3Rank": N}. No explanation.`,
        },
        {
          role: "user",
          content: `Question: "${question}"
Agent1 (PRO) opinion: "${agent1Opinion}"
Agent2 (CON) opinion: "${agent2Opinion}"
Agent3 (MODERATE) opinion: "${agent3Opinion}"
New statement: "${newStatement}"
Predict ranking position (0-${numStatements - 1}).`,
        },
      ]);

      let agent1Rank = Math.floor(numStatements / 2);
      let agent2Rank = Math.floor(numStatements / 2);
      let agent3Rank = Math.floor(numStatements / 2);
      try {
        const parsed = JSON.parse((predictRaw.match(/\{[\s\S]*\}/) || ["{}"])[0]);
        if (typeof parsed.agent1Rank === "number") agent1Rank = Math.min(parsed.agent1Rank, numStatements - 1);
        if (typeof parsed.agent2Rank === "number") agent2Rank = Math.min(parsed.agent2Rank, numStatements - 1);
        if (typeof parsed.agent3Rank === "number") agent3Rank = Math.min(parsed.agent3Rank, numStatements - 1);
      } catch { /* use defaults */ }

      // If we have existing rankings, apply cycle-breaking
      if (existingHumanRanking && existingAgent1Ranking && existingAgent2Ranking && existingAgent3Ranking) {
        function insertRank(old: number[], newRank: number): number[] {
          return [...old.map((r) => (r >= newRank ? r + 1 : r)), newRank];
        }
        const allRankings = [
          insertRank(existingHumanRanking, 0), // placeholder — real user rank comes from frontend
          insertRank(existingAgent1Ranking, agent1Rank),
          insertRank(existingAgent2Ranking, agent2Rank),
          insertRank(existingAgent3Ranking, agent3Rank),
        ];
        const fixed = ensureCondorcetWinner(allRankings, numStatements);
        // Extract the nudged AI ranks (last element of each)
        agent1Rank = fixed[1][fixed[1].length - 1];
        agent2Rank = fixed[2][fixed[2].length - 1];
        agent3Rank = fixed[3][fixed[3].length - 1];
      }

      return NextResponse.json({ agent1Rank, agent2Rank, agent3Rank });
    }

    if (action === "rerank") {
      const { question, statements: stmtTexts, agent1Opinion, agent2Opinion, agent3Opinion,
        agent1Name, agent2Name, agent3Name, humanRanking } = body as {
        action: string;
        question: string;
        statements: { label: string; text: string }[];
        agent1Opinion: string;
        agent2Opinion: string;
        agent3Opinion: string;
        agent1Name: string;
        agent2Name: string;
        agent3Name: string;
        humanRanking: number[];
      };

      const n = stmtTexts.length;
      const [agent1Ranking, agent2Ranking, agent3Ranking] = await Promise.all([
        getAgentRanking(agent1Name, "PRO", agent1Opinion, stmtTexts, n),
        getAgentRanking(agent2Name, "CON", agent2Opinion, stmtTexts, n),
        getAgentRanking(agent3Name, "MODERATE", agent3Opinion, stmtTexts, n),
      ]);

      // Ensure no cycle with the user's ranking included
      const allRankings = [humanRanking, agent1Ranking, agent2Ranking, agent3Ranking];
      const fixed = ensureCondorcetWinner(allRankings, n);

      return NextResponse.json({
        agent1Ranking: fixed[1],
        agent2Ranking: fixed[2],
        agent3Ranking: fixed[3],
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
