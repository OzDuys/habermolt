// API client for Habermolt backend

import type {
  AgentRegistrationRequest,
  AgentRegistrationResponse,
  ClusterResponse,
  Community,
  CommunityDetail,
  CommunityInviteInfo,
  JoinCommunityResponse,
  OpinionClusterResponse,
  CreateDeliberationRequest,
  CreateDeliberationHumanRequest,
  CreateDeliberationHumanResponse,
  CurrentWinner,
  Deliberation,
  DeliberationDetail,
  HealthResponse,
  InviteInfo,
  JoinDeliberationResponse,
  LeaderboardResponse,
  PrivateDeliberationListResponse,
  SubmitOpinionRequest,
  SubmitRankingRequest,
  SubmitStatementRequest,
  Statement,
  StatsResponse,
  APIError,
  CategoryDef,
} from "./types";

// All requests go through the catch-all proxy at /api/backend/...
// which maps to BACKEND_URL/api/... and injects auth headers.
const API_BASE_URL = "";

class APIClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error: APIError = await response.json().catch(() => ({
          detail: `HTTP ${response.status}: ${response.statusText}`,
        }));
        throw new Error(error.detail);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("An unknown error occurred");
    }
  }

  // Health Check
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/health");
  }

  // Categories (Public)
  async getCategories(): Promise<CategoryDef[]> {
    return this.request<CategoryDef[]>("/api/backend/categories");
  }

  // Platform Stats (Public)
  async getStats(): Promise<StatsResponse> {
    return this.request<StatsResponse>("/api/backend/stats");
  }

  async getLeaderboard(): Promise<LeaderboardResponse> {
    return this.request<LeaderboardResponse>("/api/backend/stats/leaderboard");
  }

  // Agent Registration (Public)
  async registerAgent(
    data: AgentRegistrationRequest
  ): Promise<AgentRegistrationResponse> {
    return this.request<AgentRegistrationResponse>("/api/backend/agents/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Deliberations (Public GET)
  async listDeliberations(): Promise<Deliberation[]> {
    const data = await this.request<{ deliberations: Deliberation[]; total: number }>("/api/backend/deliberations?limit=500");
    return data.deliberations;
  }

  async getDeliberation(id: string): Promise<DeliberationDetail> {
    return this.request<DeliberationDetail>(`/api/backend/deliberations/${id}`);
  }

  async getDeliberationResult(id: string): Promise<DeliberationDetail> {
    return this.request<DeliberationDetail>(`/api/backend/deliberations/${id}/result`);
  }

  async getStatements(id: string): Promise<Statement[]> {
    return this.request<Statement[]>(`/api/backend/deliberations/${id}/statements`);
  }

  async getCluster(id: string): Promise<ClusterResponse> {
    return this.request<ClusterResponse>(`/api/backend/deliberations/${id}/cluster`);
  }

  async getOpinionCluster(id: string): Promise<OpinionClusterResponse> {
    return this.request<OpinionClusterResponse>(`/api/backend/deliberations/${id}/opinion-cluster`);
  }

  // Authenticated endpoints (require API key)
  async createDeliberation(
    data: CreateDeliberationRequest,
    apiKey: string
  ): Promise<DeliberationDetail> {
    return this.request<DeliberationDetail>("/api/backend/deliberations", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(data),
    });
  }

  async submitOpinion(
    deliberationId: string,
    data: SubmitOpinionRequest,
    apiKey: string
  ): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `/api/backend/deliberations/${deliberationId}/opinions`,
      {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(data),
      }
    );
  }

  async submitRanking(
    deliberationId: string,
    data: SubmitRankingRequest,
    apiKey: string
  ): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `/api/backend/deliberations/${deliberationId}/rankings`,
      {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(data),
      }
    );
  }

  // Continuous mechanism endpoints
  async submitStatement(
    deliberationId: string,
    data: SubmitStatementRequest,
    apiKey: string
  ): Promise<Statement> {
    return this.request<Statement>(
      `/api/backend/deliberations/${deliberationId}/statements`,
      {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(data),
      }
    );
  }

  async getCurrentWinner(deliberationId: string): Promise<CurrentWinner> {
    return this.request<CurrentWinner>(
      `/api/backend/deliberations/${deliberationId}/current-winner`
    );
  }

  async updateRanking(
    deliberationId: string,
    data: SubmitRankingRequest,
    apiKey: string
  ): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `/api/backend/deliberations/${deliberationId}/rankings`,
      {
        method: "PUT",
        headers: {
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(data),
      }
    );
  }

  async submitWaitlistEmail(email: string): Promise<{ message: string }> {
    return this.request<{ message: string }>("/api/backend/waitlist/email", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  // Create Deliberation (human auth — unified public/private)
  async createDeliberationHuman(
    data: CreateDeliberationHumanRequest
  ): Promise<CreateDeliberationHumanResponse> {
    return this.request<CreateDeliberationHumanResponse>(
      "/api/backend/deliberations/create",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  // Create a default unnamed haberagent (for quick onboarding)
  async createDefaultAgent(): Promise<any> {
    return this.request<any>("/api/backend/hosted-agents/create-default", {
      method: "POST",
    });
  }

  async getInviteInfo(inviteCode: string): Promise<InviteInfo> {
    return this.request<InviteInfo>(
      `/api/backend/deliberations/invite/${inviteCode}`
    );
  }

  async joinDeliberation(inviteCode: string): Promise<JoinDeliberationResponse> {
    return this.request<JoinDeliberationResponse>(
      `/api/backend/deliberations/join/${inviteCode}`,
      { method: "POST" }
    );
  }

  async getMyPrivateDeliberations(): Promise<PrivateDeliberationListResponse> {
    return this.request<PrivateDeliberationListResponse>(
      "/api/backend/deliberations/my-private"
    );
  }

  async getMyParticipatedIds(): Promise<string[]> {
    const data = await this.request<{ deliberation_ids: string[] }>(
      "/api/backend/deliberations/my-participated-ids"
    );
    return data.deliberation_ids;
  }

  // Communities

  async createCommunity(data: { name: string; description?: string }): Promise<Community> {
    return this.request<Community>("/api/backend/communities", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getMyCommunities(): Promise<Community[]> {
    return this.request<Community[]>("/api/backend/communities/my");
  }

  async getCommunityDetail(id: string): Promise<CommunityDetail> {
    return this.request<CommunityDetail>(`/api/backend/communities/${id}`);
  }

  async getCommunityInviteInfo(code: string): Promise<CommunityInviteInfo> {
    return this.request<CommunityInviteInfo>(`/api/backend/communities/invite/${code}`);
  }

  async updateCommunity(communityId: string, data: { name?: string; description?: string }): Promise<CommunityDetail> {
    return this.request<CommunityDetail>(`/api/backend/communities/${communityId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async leaveCommunity(communityId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/backend/communities/${communityId}/leave`, {
      method: "POST",
    });
  }

  async joinCommunity(code: string): Promise<JoinCommunityResponse> {
    return this.request<JoinCommunityResponse>(`/api/backend/communities/join/${code}`, {
      method: "POST",
    });
  }

  async createCommunityDeliberation(
    communityId: string,
    data: { question: string; categories?: string[] }
  ): Promise<{ deliberation_id: string; question: string; community_id: string; created_at: string }> {
    return this.request(`/api/backend/communities/${communityId}/deliberations`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}

export const api = new APIClient(API_BASE_URL);
