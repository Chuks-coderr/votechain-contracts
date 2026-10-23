use crate::{
    ApiDoc, ApiError, Event, Indexer, ProposalDetail, ProposalListParams, ProposalSummary,
    VoteRecord,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use std::sync::{Arc, RwLock};
use utoipa::OpenApi as _;

#[derive(Clone)]
pub struct AppState {
    pub indexer: Arc<RwLock<Indexer>>,
}

// ---------------------------------------------------------------------------
// Error mapping helpers
// ---------------------------------------------------------------------------

/// Canonical error envelope returned by every error path in this API.
///
/// Shape: `{ "error": { "code": "...", "message": "...", "details": [] } }`
fn error_response(
    status: StatusCode,
    code: &str,
    message: &str,
) -> (StatusCode, Json<serde_json::Value>) {
    (
        status,
        Json(json!({
            "error": {
                "code": code,
                "message": message,
                "details": []
            }
        })),
    )
}

/// Map a well-known `ApiError` code string to the appropriate HTTP status and
/// return the full error envelope.
pub fn map_api_error(e: ApiError) -> (StatusCode, Json<serde_json::Value>) {
    let status = match e.code.as_str() {
        // 404 — resource not found
        "ProposalNotFound" | "NotFound" => StatusCode::NOT_FOUND,
        // 400 — caller supplied invalid input
        "InvalidQuorum"
        | "InvalidDuration"
        | "InvalidTitle"
        | "InvalidDescription"
        | "InvalidAmount"
        | "InvalidDurationRange"
        | "BadRequest" => StatusCode::BAD_REQUEST,
        // 403 — access / authorisation denied
        "NotAdmin" | "AdminVoteRestricted" | "Forbidden" => StatusCode::FORBIDDEN,
        // 401 — not authenticated
        "Unauthorized" | "Unauthenticated" => StatusCode::UNAUTHORIZED,
        // 429 — rate limiting
        "ProposalCooldown" | "RateLimited" => StatusCode::TOO_MANY_REQUESTS,
        // everything else is an internal error
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };

    error_response(status, &e.code, &e.message)
}

/// Convenience constructor for a 404 "not found" envelope.
fn not_found(resource: &str, id: impl std::fmt::Display) -> (StatusCode, Json<serde_json::Value>) {
    error_response(
        StatusCode::NOT_FOUND,
        "NOT_FOUND",
        &format!("{} {} not found", resource, id),
    )
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/// List all proposals with optional state filter and pagination.
#[utoipa::path(
    get,
    path = "/proposals",
    params(ProposalListParams),
    responses(
        (status = 200, description = "List of proposals", body = Vec<ProposalSummary>)
    )
)]
pub async fn list_proposals(
    State(state): State<AppState>,
    Query(params): Query<ProposalListParams>,
) -> Json<Vec<ProposalSummary>> {
    let offset = params.offset.unwrap_or(0);
    let limit = params.limit.unwrap_or(50).min(50);
    let state_filter = params.state.clone();
    let indexer = state.indexer.read().unwrap();
    Json(indexer.list_proposals(state_filter, offset, limit))
}

/// Get a single proposal by ID.
#[utoipa::path(
    get,
    path = "/proposals/{id}",
    params(
        ("id" = u64, Path, description = "Proposal ID")
    ),
    responses(
        (status = 200, description = "Proposal detail", body = ProposalDetail),
        (status = 404, description = "Proposal not found", body = ApiError)
    )
)]
pub async fn get_proposal(
    State(state): State<AppState>,
    Path(id): Path<u64>,
) -> Result<Json<ProposalDetail>, (StatusCode, Json<serde_json::Value>)> {
    let indexer = state.indexer.read().unwrap();
    match indexer.get_proposal(id) {
        Some(proposal) => Ok(Json(proposal)),
        None => Err(not_found("Proposal", id)),
    }
}

/// Get all votes for a given proposal.
#[utoipa::path(
    get,
    path = "/proposals/{id}/votes",
    params(
        ("id" = u64, Path, description = "Proposal ID")
    ),
    responses(
        (status = 200, description = "List of votes", body = Vec<VoteRecord>),
        (status = 404, description = "Proposal not found", body = ApiError)
    )
)]
pub async fn get_proposal_votes(
    State(state): State<AppState>,
    Path(id): Path<u64>,
) -> Result<Json<Vec<VoteRecord>>, (StatusCode, Json<serde_json::Value>)> {
    let indexer = state.indexer.read().unwrap();
    if indexer.get_proposal(id).is_none() {
        return Err(not_found("Proposal", id));
    }
    Ok(Json(indexer.get_proposal_votes(id)))
}

/// Get all votes cast by a specific voter address.
#[utoipa::path(
    get,
    path = "/voters/{address}/votes",
    params(
        ("address" = String, Path, description = "Stellar address of the voter")
    ),
    responses(
        (status = 200, description = "List of vote records", body = Vec<VoteRecord>)
    )
)]
pub async fn get_voter_votes(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Json<Vec<VoteRecord>> {
    let indexer = state.indexer.read().unwrap();
    Json(indexer.get_voter_votes(&address))
}

pub async fn ingest_event(
    State(state): State<AppState>,
    Json(event): Json<Event>,
) -> impl IntoResponse {
    let mut indexer = state.indexer.write().unwrap();
    indexer.ingest(event);
    StatusCode::NO_CONTENT
}

/// Serve the OpenAPI JSON spec.
#[utoipa::path(
    get,
    path = "/openapi.json",
    responses(
        (status = 200, description = "OpenAPI spec")
    )
)]
pub async fn openapi_json() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}
