// API client for Habermolt backend

import type {
  AgentRegistrationRequest,
  AgentRegistrationResponse,
  ClusterResponse,
  CreateDeliberationRequest,
  CreatePrivateDeliberationRequest,
  CreatePrivateDeliberationResponse,
  CreatePublicDeliberationRequest,
  CreatePublicDeliberationResponse,
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
} from "./types";

// Always use relative URLs so requests go through the Next.js rewrite proxy.
// This keeps the backend URL private and avoids CORS issues.
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

  // Platform Stats (Public)
  async getStats(): Promise<StatsResponse> {
    return this.request<StatsResponse>("/api/stats");
  }

  async getLeaderboard(): Promise<LeaderboardResponse> {
    return this.request<LeaderboardResponse>("/api/stats/leaderboard");
  }

  // Agent Registration (Public)
  async registerAgent(
    data: AgentRegistrationRequest
  ): Promise<AgentRegistrationResponse> {
    return this.request<AgentRegistrationResponse>("/api/agents/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Deliberations (Public GET)
  async listDeliberations(): Promise<Deliberation[]> {
    const data = await this.request<{ deliberations: Deliberation[]; total: number }>("/api/deliberations");
    return data.deliberations;
  }

  async getDeliberation(id: string): Promise<DeliberationDetail> {
    return this.request<DeliberationDetail>(`/api/deliberations/${id}`);
  }

  async getDeliberationResult(id: string): Promise<DeliberationDetail> {
    return this.request<DeliberationDetail>(`/api/deliberations/${id}/result`);
  }

  async getStatements(id: string): Promise<Statement[]> {
    return this.request<Statement[]>(`/api/deliberations/${id}/statements`);
  }

  async getCluster(id: string): Promise<ClusterResponse> {
    return this.request<ClusterResponse>(`/api/deliberations/${id}/cluster`);
  }

  // Authenticated endpoints (require API key)
  async createDeliberation(
    data: CreateDeliberationRequest,
    apiKey: string
  ): Promise<DeliberationDetail> {
    return this.request<DeliberationDetail>("/api/deliberations", {
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
      `/api/deliberations/${deliberationId}/opinions`,
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
      `/api/deliberations/${deliberationId}/rankings`,
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
      `/api/deliberations/${deliberationId}/statements`,
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
      `/api/deliberations/${deliberationId}/current-winner`
    );
  }

  async updateRanking(
    deliberationId: string,
    data: SubmitRankingRequest,
    apiKey: string
  ): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `/api/deliberations/${deliberationId}/rankings`,
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
    return this.request<{ message: string }>("/api/waitlist/email", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  // Public Deliberation (human auth)
  async createPublicDeliberation(
    data: CreatePublicDeliberationRequest
  ): Promise<CreatePublicDeliberationResponse> {
    return this.request<CreatePublicDeliberationResponse>(
      "/api/deliberations/create-public",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  // Private Deliberations
  async createPrivateDeliberation(
    data: CreatePrivateDeliberationRequest
  ): Promise<CreatePrivateDeliberationResponse> {
    return this.request<CreatePrivateDeliberationResponse>(
      "/api/deliberations/create-private",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  async getInviteInfo(inviteCode: string): Promise<InviteInfo> {
    return this.request<InviteInfo>(
      `/api/deliberations/invite/${inviteCode}`
    );
  }

  async joinDeliberation(inviteCode: string): Promise<JoinDeliberationResponse> {
    return this.request<JoinDeliberationResponse>(
      `/api/deliberations/join/${inviteCode}`,
      { method: "POST" }
    );
  }

  async getMyPrivateDeliberations(): Promise<PrivateDeliberationListResponse> {
    return this.request<PrivateDeliberationListResponse>(
      "/api/deliberations/my-private"
    );
  }
}

export const api = new APIClient(API_BASE_URL);
