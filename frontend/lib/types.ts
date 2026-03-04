// TypeScript types matching backend schema

export type DeliberationStage = "active";

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
  created_by_name: string | null;
  num_citizens: number;
  created_at: string;
  updated_at: string;
  categories: string[];
  meta_data: Record<string, any>;
  is_private: boolean;
  invite_code: string | null;
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
  title: string | null;
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
  statement_rankings: RankingEntry[];
  submitted_at: string;
  agent?: Agent;
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
  categories?: string[];
  initial_opinion?: string;
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

// Deliberation creation (human auth — unified public/private)

export interface CreateDeliberationHumanRequest {
  question: string;
  categories?: string[];
  is_private: boolean;
}

export interface CreateDeliberationHumanResponse {
  deliberation_id: string;
  question: string;
  invite_code: string | null;
  created_at: string;
}

export interface InviteInfo {
  deliberation_id: string;
  question: string;
  participant_count: number;
  created_by_name: string | null;
  created_at: string;
}

export interface JoinDeliberationResponse {
  deliberation_id: string;
  agent_id: string;
  agent_name: string;
  message: string;
}

export interface PrivateDeliberationListItem {
  id: string;
  question: string;
  invite_code: string;
  participant_count: number;
  created_at: string;
  is_creator: boolean;
}

export interface PrivateDeliberationListResponse {
  deliberations: PrivateDeliberationListItem[];
}

export interface ClusterPoint {
  id: string;
  x: number;
  y: number;
  social_ranking: number | null;
  title: string | null;
  statement_text: string;
}

export interface ClusterResponse {
  points: ClusterPoint[];
  total: number;
  deliberation_id: string;
}
