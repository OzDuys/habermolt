"""
Pydantic schemas for monitoring/debug endpoints.
"""

from datetime import datetime
from typing import Dict, List, Optional, Any
from uuid import UUID

from pydantic import BaseModel


class LLMTraceResponse(BaseModel):
    id: UUID
    trace_type: str
    status: str
    model: str
    provider: Optional[str] = None
    temperature: Optional[float] = None
    input_messages: List[Dict[str, str]]
    output_text: Optional[str] = None
    reasoning_text: Optional[str] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    latency_ms: Optional[int] = None
    cost_total: Optional[float] = None
    error_message: Optional[str] = None
    deliberation_id: Optional[UUID] = None
    agent_id: Optional[UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True


class LLMTraceListResponse(BaseModel):
    traces: List[LLMTraceResponse]
    total: int
    page: int
    page_size: int


class MonitoringStatsResponse(BaseModel):
    # Platform totals
    total_agents: int
    total_deliberations: int
    total_opinions: int
    total_statements: int
    total_rankings: int
    # LLM trace totals
    total_traces: int
    total_errors: int
    error_rate: float
    total_tokens_in: int
    total_tokens_out: int
    avg_latency_ms: float
    traces_by_type: Dict[str, int]
    traces_by_model: Dict[str, int]
    traces_24h: int
    # Cost tracking
    total_cost: float
    cost_by_model: Dict[str, float]
    cost_24h: float
    # Deliberation breakdowns
    deliberations_by_stage: Dict[str, int]
    deliberations_by_mechanism: Dict[str, int]


class SystemConfigResponse(BaseModel):
    habermas_num_candidates: int
    habermas_llm_model: str
    habermas_llm_models: List[str]
    habermas_llm_temperature: float
    habermas_num_retries: int
    continuous_num_seed_statements: int
    continuous_num_seed_opinions: int
    continuous_max_statements: int
    continuous_max_statements_per_agent: int
    embedding_model: str
    similarity_threshold: float
    llm_base_url: str
    environment: str


class PromptEntry(BaseModel):
    name: str
    description: str
    content: str


class SystemPromptsResponse(BaseModel):
    prompts: List[PromptEntry]


class SkillFilesResponse(BaseModel):
    skill_md: str
    heartbeat_md: str


class TableInfoResponse(BaseModel):
    name: str
    row_count: int


class TableListResponse(BaseModel):
    tables: List[TableInfoResponse]


class BulkActionResponse(BaseModel):
    deleted_count: int
    message: str


class AgentRequestLogResponse(BaseModel):
    id: UUID
    agent_id: UUID
    agent_name: Optional[str] = None
    deliberation_id: Optional[UUID] = None
    method: str
    endpoint: str
    request_body: Optional[Any] = None
    response_status: int
    response_body: Optional[Any] = None
    latency_ms: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AgentRequestLogListResponse(BaseModel):
    logs: List[AgentRequestLogResponse]
    total: int
    page: int
    page_size: int
