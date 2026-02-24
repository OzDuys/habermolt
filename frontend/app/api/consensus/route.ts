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
      const { question, playerOpinion } = body as { action: string; question: string; playerOpinion?: string };

      const playerContext = playerOpinion ? `\nOne participant has already shared this opinion: "${playerOpinion}"\nMake sure the three agents respond to the SPECIFIC topic and framing of this question, not generic debate positions.` : "";

      const setupRaw = await openrouter([
        {
          role: "system",
          content: `You are generating three AI debate agents with different views on a SPECIFIC topic. Return ONLY a valid JSON object with these exact keys: "agent1Name", "agent1Opinion", "agent2Name", "agent2Opinion", "agent3Name", "agent3Opinion".

agent1 is PRO (strongly in favor). agent2 is CON (strongly against). agent3 is MODERATE (nuanced middle ground, sees both sides).
Names should be fun lobster-themed names inspired by real names, like "AkashBot", "VanClaw", "OmerJr", "PramodPincer", "MarianaMolt", "BhavyeshShrimp", "YvesCrab". Pick 3 different ones.
Opinions: 2-3 punchy sentences that directly address the SPECIFIC question asked. Be opinionated and direct. Reference the actual topic, not generic debate language.
No preamble, no markdown, no code fences — just the raw JSON object.`,
        },
        {
          role: "user",
          content: `The debate question is: "${question}"${playerContext}

Generate three AI agents with different views on this SPECIFIC question. Their opinions must clearly be about "${question}".`,
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
      } catch (parseErr) {
        console.error("Setup parse error:", parseErr, "Raw response:", setupRaw?.slice(0, 500));
        agent1Name = "AkashBot";
        agent1Opinion = `Regarding "${question}" — absolutely yes. The logic is clear and the benefits far outweigh any concerns.`;
        agent2Name = "VanClaw";
        agent2Opinion = `On "${question}" — strong objection. The premise is flawed and the downsides are being ignored entirely.`;
        agent3Name = "OmerJr";
        agent3Opinion = `"${question}" — both sides have valid points. The real answer depends on context and how we define the terms.`;
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

    if (action === "simulate-lobster") {
      const { question, statements: stmts, existingOpinions } = body as {
        action: string;
        question: string;
        statements: { label: string; text: string }[];
        existingOpinions: string[];
      };

      const n = stmts.length + 1; // includes the new statement this lobster will add

      const raw = await openrouter([
        {
          role: "system",
          content: `You are generating a NEW AI lobster agent that joins an ongoing deliberation. This agent has a unique perspective different from existing participants.

Return ONLY a valid JSON object with these keys:
- "name": fun lobster-themed name inspired by a real name (like "PramodPincer", "MarianaMolt", "BhavyeshShrimp", "YvesCrab")
- "opinion": 2-3 punchy sentences with a fresh take on the question
- "statementEmoji": a single emoji for the consensus statement
- "statementLabel": 2-4 word title for a consensus statement
- "statementText": 1-2 sentence consensus statement that offers a new angle
- "ranking": array of ${n} numbers (0=best, ${n - 1}=worst) ranking ALL statements including the new one (new statement is index ${n - 1})

No preamble, no markdown — just the raw JSON object.`,
        },
        {
          role: "user",
          content: `Question: "${question}"

Existing statements:
${stmts.map((s, i) => `${i}: "${s.label}" — ${s.text}`).join("\n")}

Existing opinions from other lobsters:
${existingOpinions.map((o, i) => `- Lobster ${i}: "${o}"`).join("\n")}

Generate a new lobster with a DIFFERENT perspective. Their consensus statement should be index ${n - 1} in the ranking.`,
        },
      ]);

      try {
        const parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]);
        let ranking = parsed.ranking;
        if (!Array.isArray(ranking) || ranking.length !== n) {
          ranking = Array.from({ length: n }, (_, i) => i);
        }
        return NextResponse.json({
          name: parsed.name || "PramodPincer",
          opinion: parsed.opinion || `On "${question}" — there's an angle nobody has considered yet.`,
          statementEmoji: parsed.statementEmoji || "🦞",
          statementLabel: parsed.statementLabel || "Fresh Take",
          statementText: parsed.statementText || "The best consensus emerges when we question our core assumptions.",
          ranking,
        });
      } catch {
        return NextResponse.json({
          name: "PramodPincer",
          opinion: `On "${question}" — there's an angle nobody has considered yet.`,
          statementEmoji: "🦞",
          statementLabel: "Fresh Take",
          statementText: "The best consensus emerges when we question our core assumptions.",
          ranking: Array.from({ length: n }, (_, i) => i),
        });
      }
    }

    if (action === "auto-generate") {
      const { type, question, playerOpinion, agents } = body as {
        action: string;
        type: "opinion" | "statement" | "ranking";
        question: string;
        playerOpinion?: string;
        agents?: Array<{ name: string; opinion: string }>;
      };

      if (type === "opinion") {
        const raw = await openrouter([
          {
            role: "system",
            content: `You are helping a user quickly draft their opinion for a group deliberation. Generate a concise, authentic-sounding opinion (2-3 sentences) that a real person might hold. Be opinionated and direct. Return ONLY a JSON object: {"opinion": "..."}. No preamble.`,
          },
          {
            role: "user",
            content: `The debate question is: "${question}"\nGenerate a plausible human opinion on this topic.`,
          },
        ]);
        try {
          const parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]);
          return NextResponse.json({ result: parsed.opinion });
        } catch {
          return NextResponse.json({ result: `I think "${question}" is a nuanced topic with valid points on both sides, but I lean towards supporting it with reasonable guardrails.` });
        }
      }

      if (type === "statement") {
        const agentContext = agents?.map((a) => `- ${a.name}: "${a.opinion}"`).join("\n") || "";
        const raw = await openrouter([
          {
            role: "system",
            content: `You are helping a user draft a consensus statement for a group deliberation. A consensus statement is a reframing that all participants could endorse. Return ONLY a JSON object: {"label": "2-4 word title", "text": "1-2 sentence statement"}. No preamble.`,
          },
          {
            role: "user",
            content: `Question: "${question}"\nUser's opinion: "${playerOpinion}"\nOther participants:\n${agentContext}\n\nGenerate a consensus statement that bridges these perspectives.`,
          },
        ]);
        try {
          const parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]);
          return NextResponse.json({ label: parsed.label, text: parsed.text });
        } catch {
          return NextResponse.json({ label: "Common Ground", text: "The key insight is finding a framework that respects all perspectives while moving toward practical outcomes." });
        }
      }

      if (type === "ranking") {
        const { statements: stmts } = body as { statements: Array<{ label: string; text: string }> };
        const n = stmts.length;
        const stmtList = stmts.map((s, i) => `${i}: "${s.label}" — ${s.text}`).join("\n");
        const raw = await openrouter([
          {
            role: "system",
            content: `You are helping a user rank ${n} consensus statements based on their opinion. Rank from best (0) to worst (${n - 1}). Return ONLY {"ranking": [${Array.from({ length: n }, (_, i) => i).join(", ")}]}. No explanation.`,
          },
          {
            role: "user",
            content: `Question: "${question}"\nUser's opinion: "${playerOpinion}"\nStatements:\n${stmtList}\nRank these statements based on how well they align with the user's perspective.`,
          },
        ]);
        try {
          const parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]);
          if (Array.isArray(parsed.ranking) && parsed.ranking.length === n) {
            return NextResponse.json({ ranking: parsed.ranking });
          }
        } catch { /* fallback */ }
        return NextResponse.json({ ranking: Array.from({ length: n }, (_, i) => i) });
      }

      return NextResponse.json({ error: "Unknown auto-generate type" }, { status: 400 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
