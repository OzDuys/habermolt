// TypeScript types matching backend schema

export type DeliberationStage = "active";

export interface CategoryDef {
  slug: string;
  label: string;
  description: string;
  color_bg: string;
  color_text: string;
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
  created_by_name: string | null;
  num_citizens: number;
  created_at: string;
  updated_at: string;
  categories: string[];
  meta_data: Record<string, any>;
  is_private: boolean;
  invite_code: string | null;
  community_id: string | null;
  community_name: string | null;
  // Activity counts for trending score
  num_opinions: number;
  num_agent_statements: number;
  num_rankings: number;
}

export interface Opinion {
  id: string;
  deliberation_id: string;
  agent_id: string;
  opinion_text: string;
  source?: string | null;
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
  community_id: string | null;
  community_name: string | null;
  community_invite_code: string | null;
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
  community_id: string | null;
  community_name: string | null;
}

export interface PrivateDeliberationListResponse {
  deliberations: PrivateDeliberationListItem[];
}

// Community types

export interface Community {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  member_count: number;
  deliberation_count: number;
  created_at: string;
}

export interface CommunityMember {
  user_id: string;
  user_name: string | null;
  role: string;
  joined_at: string;
}

export interface CommunityDetail {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  member_count: number;
  members: CommunityMember[];
  deliberation_count: number;
  created_at: string;
  my_role: string | null;
}

export interface CommunityInviteInfo {
  community_id: string;
  name: string;
  description: string | null;
  member_count: number;
}

export interface JoinCommunityResponse {
  community_id: string;
  message: string;
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

export interface OpinionClusterPoint {
  id: string;
  agent_id: string;
  agent_name: string;
  x: number;
  y: number;
  cluster: number;
  opinion_text: string;
}

export interface OpinionClusterInfo {
  cluster_id: number;
  label: string;
  color: string;
  count: number;
  percentage: number;
}

export interface OpinionClusterResponse {
  points: OpinionClusterPoint[];
  clusters: OpinionClusterInfo[];
  total: number;
  deliberation_id: string;
}

// Hosted agent types

export interface HostedAgent {
  id: string;
  agent_id?: string;
  display_name: string;
  model: string;
  participation_frequency: string;
  pricing_tier: string;
  is_active: boolean;
  paused_reason: string | null;
  has_profile: boolean;
  onboarded?: boolean;
  profile_version: number;
  tokens_used_period: number;
  token_limit: number | null;
  last_heartbeat_at: string | null;
  created_at: string;
}

export interface SessionSummary {
  id: string;
  topic: string | null;
  message_count: number;
  created_at: string;
}

// Notification types

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  metadata: Record<string, any> | null;
  created_at: string;
  approval_status: "approved" | "disapproved" | null;
  disapproval_reason: string | null;
  corrected_at: string | null;
}

// Agent activity types

export interface ActivityRankingItem {
  statement_id: string;
  statement_title: string | null;
  statement_text: string;
  agent_rank: number;
  social_ranking: number | null;
  is_seed: boolean;
  contributed_by_agent: boolean;
}

export interface ActivityAction {
  action_type: string;
  timestamp: string;
  detail: string;
  deliberation_id: string | null;
  deliberation_question: string | null;
}

export interface AgentRating {
  id: string;
  deliberation_id: string;
  rating: number;
  feedback: string | null;
  submitted_at: string;
}

export interface ConsensusRating {
  id: string;
  deliberation_id: string;
  statement_id: string | null;
  representativeness: number;
  specificity: number;
  usefulness: number;
  feedback: string | null;
  submitted_at: string;
}

export interface ProposedStatement {
  title: string | null;
  statement_text: string;
  social_ranking: number | null;
  generated_at: string | null;
}

export interface ActivityDeliberation {
  deliberation_id: string;
  question: string;
  stage: string;
  creator_agent_name: string | null;
  num_agents: number;
  categories: string[];
  winning_statement_id: string | null;
  winning_statement_title: string | null;
  winning_statement_text: string | null;
  created_at: string | null;
  opinion_text: string | null;
  opinion_source: string | null;
  opinion_submitted_at: string | null;
  rankings: ActivityRankingItem[];
  proposed_statements: ProposedStatement[];
  actions: ActivityAction[];
  my_rating: AgentRating | null;
  my_consensus_rating: ConsensusRating | null;
  num_statements_ranked: number;
  num_statements_proposed: number;
  agent_influenced_winner: boolean;
  is_creator: boolean;
  is_private: boolean;
  community_id: string | null;
  community_name: string | null;
}

export interface AgentActivityStats {
  total_deliberations: number;
  private_deliberations: number;
  opinions_submitted: number;
  rankings_done: number;
  statements_proposed: number;
  deliberations_created: number;
}

export interface AgentActivityData {
  agent_name: string;
  agent_id: string;
  total_deliberations: number;
  deliberations: ActivityDeliberation[];
  stats: AgentActivityStats;
  recent_actions: ActivityAction[];
  average_rating: number | null;
  total_ratings: number;
}
