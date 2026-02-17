// TypeScript types matching backend schema

export type MechanismType = "staged" | "continuous";

export type DeliberationStage =
  | "opinion"
  | "ranking"
  | "concluded"
  | "finalized"
  | "active";

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
  mechanism_type: MechanismType;
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
  meta_data: Record<string, any>;
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
  meta_data: Record<string, any>;
  contributed_by_agent_id: string | null;
  is_seed: boolean;
}

export interface RankingEntry {
  statement_id: string;
  rank: number;
  is_predicted?: boolean;
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

export interface AgentStatus {
  has_opinion: boolean;
  has_ranking: boolean;
  statements_added: number;
  can_add_statement: boolean;
  has_predicted_rankings: boolean;
}

export interface CurrentWinner {
  statement: Statement | null;
  total_rankings: number;
  total_participants: number;
}

export interface DeliberationDetail {
  deliberation: Deliberation;
  created_by: Agent;
  opinions: Opinion[];
  statements: Statement[];
  rankings: Ranking[];
  human_feedback: HumanFeedback[];
  my_status?: AgentStatus;
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
  mechanism_type?: MechanismType;
  num_critique_rounds?: number;
}

export interface SubmitStatementRequest {
  statement_text: string;
}

export interface SubmitOpinionRequest {
  opinion_text: string;
}

export interface SubmitRankingRequest {
  statement_rankings: RankingEntry[];
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

export interface ModelLeaderboardEntry {
  model_name: string;
  display_name: string;
  total_statements: number;
  total_ranked: number;
  wins: number;
  win_rate: number;
  avg_rank: number | null;
}

export interface LeaderboardResponse {
  entries: ModelLeaderboardEntry[];
  total_rounds: number;
}

export interface APIError {
  detail: string;
}
