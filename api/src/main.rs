use std::{net::SocketAddr, sync::Arc};

use axum::{routing::get, routing::post, Router};
use tokio::net::TcpListener;
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};
use votechain_api::{
    api::{get_proposal, get_proposal_votes, get_voter_votes, ingest_event, list_proposals, openapi_json, AppState},
    Indexer,
};

async fn create_proposal() -> &'static str {
    "{\"status\":\"created\"}"
}

async fn cast_vote() -> &'static str {
    "{\"status\":\"voted\"}"
}

#[tokio::main]
async fn main() {
    // Read endpoints: 100 requests/minute per IP
    // 1 token replenished every 600 ms, burst of 100
    let read_conf = Arc::new(
        GovernorConfigBuilder::default()
            .per_millisecond(600)
            .burst_size(100)
            .use_headers()
            .finish()
            .unwrap(),
    );

    // Write endpoints: 10 requests/minute per IP
    // 1 token replenished every 6 s, burst of 10
    let write_conf = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(6)
            .burst_size(10)
            .use_headers()
            .finish()
            .unwrap(),
    );

    let shared_state = AppState {
        indexer: Arc::new(std::sync::RwLock::new(Indexer::new())),
    };

    let read_routes = Router::new()
        .route("/proposals", get(list_proposals))
        .route("/proposals/{id}", get(get_proposal))
        .route("/proposals/{id}/votes", get(get_proposal_votes))
        // Issue #37: expose voter vote history for the VoteHistory frontend component
        .route("/voters/{address}/votes", get(get_voter_votes))
        .route("/openapi.json", get(openapi_json))
        .layer(GovernorLayer::new(read_conf));

    let write_routes = Router::new()
        .route("/proposals", post(create_proposal))
        .route("/proposals/{id}/vote", post(cast_vote))
        .route("/events", post(ingest_event))
        .layer(GovernorLayer::new(write_conf));

    let app = Router::new()
        .merge(read_routes)
        .merge(write_routes)
        .with_state(shared_state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    let listener = TcpListener::bind(addr).await.unwrap();
    println!("VoteChain API listening on {addr}");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .unwrap();
}
