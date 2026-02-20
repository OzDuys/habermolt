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

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  try {
    if (action === "setup") {
      const { question } = body as { action: string; question: string };

      const setupRaw = await openrouter([
        {
          role: "system",
          content: `You are generating two AI debate agents with strongly opposing views. Return ONLY a valid JSON object with these exact keys: "agent1Name", "agent1Opinion", "agent2Name", "agent2Opinion".

agent1 is PRO (strongly in favor). agent2 is CON (strongly against).
Names should be short and techy, like "PROTO-7", "DENY-BOT", "NOODLE-9", "AXIOM-X". Each name 6-8 chars max.
Opinions: 2-3 punchy sentences. Be opinionated and direct.
No preamble, no markdown — just the raw JSON object.`,
        },
        {
          role: "user",
          content: `The debate question is: "${question}"

Generate two AI agents with opposing views on this question.`,
        },
      ]);

      let agent1Name: string, agent1Opinion: string, agent2Name: string, agent2Opinion: string;
      try {
        const jsonMatch = setupRaw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : setupRaw);
        agent1Name = parsed.agent1Name;
        agent1Opinion = parsed.agent1Opinion;
        agent2Name = parsed.agent2Name;
        agent2Opinion = parsed.agent2Opinion;
        if (!agent1Name || !agent1Opinion || !agent2Name || !agent2Opinion) throw new Error("missing fields");
      } catch {
        agent1Name = "PROTO-7";
        agent1Opinion = `The answer is clearly yes. This is the only rational position. My analysis is conclusive.`;
        agent2Name = "DENY-BOT";
        agent2Opinion = `Objection. The premise is flawed. My client formally disputes this entire framing. Motion denied.`;
      }

      return NextResponse.json({ agent1Name, agent1Opinion, agent2Name, agent2Opinion });
    }

    if (action === "debate") {
      const { question, playerOpinion, agent1Opinion, agent2Opinion } = body as {
        action: string;
        question: string;
        playerOpinion: string;
        agent1Opinion: string;
        agent2Opinion: string;
      };

      // Generate 3 consensus candidate statements
      const statementsRaw = await openrouter([
        {
          role: "system",
          content: `You are a neutral deliberation facilitator generating consensus candidate statements. A consensus statement isn't a compromise where everyone gives something up — it's a reframing that multiple people with different views can all genuinely endorse. Generate 3 creative reframings that transcend the original positions.

Return ONLY a valid JSON array of exactly 3 objects with keys "emoji", "label" (2-4 words, witty title), and "text" (1 sentence). The statements should be REFRAMINGS, not compromises — statements all parties could genuinely endorse even though none of them proposed it. No preamble, just the JSON array.`,
        },
        {
          role: "user",
          content: `Question: "${question}"
PRO position: "${agent1Opinion}"
CON position: "${agent2Opinion}"
Player position: "${playerOpinion}"

Generate 3 creative consensus reframings that all three could genuinely endorse.`,
        },
      ]);

      let statements: Array<{ emoji: string; label: string; text: string }>;
      try {
        const jsonMatch = statementsRaw.match(/\[[\s\S]*\]/);
        statements = JSON.parse(jsonMatch ? jsonMatch[0] : statementsRaw);
        if (!Array.isArray(statements) || statements.length < 3) throw new Error("bad statements");
      } catch {
        statements = [
          { emoji: "🌭", label: "The Canonical Object", text: "A hot dog is its own category — a canonical food object that resists and transcends all classification systems." },
          { emoji: "🔄", label: "The Structural Argument", text: "The relevant question isn't sandwich status but handheld protein delivery — on which hot dogs excel unconditionally." },
          { emoji: "🕊️", label: "The Ontological Truce", text: "Definitional disputes about food categories are category errors — what matters is the eating experience, not the taxonomy." },
        ];
      }

      // Get agent1's ranking (PRO perspective)
      const agent1RankingRaw = await openrouter([
        {
          role: "system",
          content: `You are an AI agent with a PRO position. You will rank 3 consensus statements from your perspective (0=best, 2=worst). Return ONLY a JSON object like {"ranking": [0, 2, 1]} where the array index is the statement index and the value is its rank. No explanation.`,
        },
        {
          role: "user",
          content: `Your PRO position: "${agent1Opinion}"
The 3 statements to rank:
0: "${statements[0].label}" — ${statements[0].text}
1: "${statements[1].label}" — ${statements[1].text}
2: "${statements[2].label}" — ${statements[2].text}

Rank them from your PRO perspective. Return JSON.`,
        },
      ]);

      let agent1Ranking: number[];
      try {
        const jsonMatch = agent1RankingRaw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : agent1RankingRaw);
        agent1Ranking = parsed.ranking;
        if (!Array.isArray(agent1Ranking) || agent1Ranking.length !== 3) throw new Error("bad ranking");
      } catch {
        agent1Ranking = [0, 1, 2];
      }

      // Get agent2's ranking (CON perspective)
      const agent2RankingRaw = await openrouter([
        {
          role: "system",
          content: `You are an AI agent with a CON position. You will rank 3 consensus statements from your perspective (0=best, 2=worst). Return ONLY a JSON object like {"ranking": [0, 2, 1]} where the array index is the statement index and the value is its rank. No explanation.`,
        },
        {
          role: "user",
          content: `Your CON position: "${agent2Opinion}"
The 3 statements to rank:
0: "${statements[0].label}" — ${statements[0].text}
1: "${statements[1].label}" — ${statements[1].text}
2: "${statements[2].label}" — ${statements[2].text}

Rank them from your CON perspective. Return JSON.`,
        },
      ]);

      let agent2Ranking: number[];
      try {
        const jsonMatch = agent2RankingRaw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : agent2RankingRaw);
        agent2Ranking = parsed.ranking;
        if (!Array.isArray(agent2Ranking) || agent2Ranking.length !== 3) throw new Error("bad ranking");
      } catch {
        agent2Ranking = [2, 1, 0];
      }

      return NextResponse.json({ statements, agent1Ranking, agent2Ranking });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
