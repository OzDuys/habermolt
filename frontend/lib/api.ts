// API client for Habermolt backend

import type {
  AgentRegistrationRequest,
  AgentRegistrationResponse,
  CreateDeliberationRequest,
  Deliberation,
  DeliberationDetail,
  HealthResponse,
  LeaderboardResponse,
  SubmitOpinionRequest,
  SubmitRankingRequest,
  SubmitFeedbackRequest,
  Statement,
  StatsResponse,
  APIError,
} from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

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

  async submitFeedback(
    deliberationId: string,
    data: SubmitFeedbackRequest,
    apiKey: string
  ): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `/api/deliberations/${deliberationId}/feedback`,
      {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(data),
      }
    );
  }
}

export const api = new APIClient(API_BASE_URL);
