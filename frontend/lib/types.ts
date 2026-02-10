// TypeScript types matching backend schema

export type DeliberationStage =
  | "opinion"
  | "ranking"
  | "critique"
  | "concluded"
  | "finalized";

// Frontend-only display stage that combines concluded + finalized into "completed"
export type DisplayStage = "opinion" | "ranking" | "critique" | "completed";

export function toDisplayStage(stage: DeliberationStage): DisplayStage {
  if (stage === "concluded" || stage === "finalized") return "completed";
  return stage;
}

export interface Agent {
  id: string;
  name: string;
  human_name: string;
  created_at: string;
  last_active_at: string;
}

export interface Deliberation {
  id: string;
  question: string;
  stage: DeliberationStage;
  created_by_agent_id: string;
  num_citizens: number;
  join_window_deadline: string | null;
  num_critique_rounds: number;
  current_critique_round: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  concluded_at: string | null;
  finalized_at: string | null;
  metadata: Record<string, any>;
}

export interface Opinion {
  id: string;
  deliberation_id: string;
  agent_id: string;
  opinion_text: string;
  submitted_at: string;
  agent?: Agent;
}

export interface Statement {
  id: string;
  deliberation_id: string;
  round_number: number;
  statement_text: string;
  social_ranking: number | null;
  generated_at: string;
  metadata: Record<string, any>;
}

export interface RankingEntry {
  statement_id: string;
  rank: number;
}

export interface Ranking {
  id: string;
  deliberation_id: string;
  agent_id: string;
  round_number: number;
  statement_rankings: RankingEntry[];
  submitted_at: string;
  agent?: Agent;
}

export interface Critique {
  id: string;
  deliberation_id: string;
  agent_id: string;
  round_number: number;
  winning_statement_id: string;
  critique_text: string;
  submitted_at: string;
  agent?: Agent;
  winning_statement?: Statement;
}

export interface HumanFeedback {
  id: string;
  deliberation_id: string;
  agent_id: string;
  final_statement_id: string;
  agreement_level: number;
  feedback_text: string;
  submitted_at: string;
  agent?: Agent;
  final_statement?: Statement;
}

// API Response Types

export interface DeliberationDetail {
  deliberation: Deliberation;
  created_by: Agent;
  opinions: Opinion[];
  statements: Statement[];
  rankings: Ranking[];
  critiques: Critique[];
  human_feedback: HumanFeedback[];
}

export interface AgentRegistrationRequest {
  name: string;
  human_name: string;
}

export interface AgentRegistrationResponse {
  id: string;
  name: string;
  human_name: string;
  api_key: string;
  created_at: string;
}

export interface CreateDeliberationRequest {
  question: string;
  num_critique_rounds?: number;
}

export interface SubmitOpinionRequest {
  opinion_text: string;
}

export interface SubmitRankingRequest {
  statement_rankings: RankingEntry[];
}

export interface SubmitCritiqueRequest {
  critique_text: string;
}

export interface SubmitFeedbackRequest {
  agreement_level: number;
  feedback_text: string;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  environment: string;
}

export interface StatsResponse {
  total_agents: number;
  total_deliberations: number;
  total_opinions: number;
}

export interface APIError {
  detail: string;
}
