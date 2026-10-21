# Logging, Rotation, and Retention

The `indexer` (Rust, `tracing`/`tracing_subscriber`) and the backend API (`backend/`, structured
JSON via `console.*`) both log to stdout/stderr, following container best practice of not writing
to files inside the container. Without a rotation policy, an unbounded stdout stream can fill the
Docker host's disk over time, so rotation and retention are handled at two layers.

## Local / Docker Compose

`docker-compose.yml` defines a shared logging driver used by every service:

```yaml
x-logging: &default-logging
  driver: json-file
  options:
    max-size: "100m"
    max-file: "5"
```

This caps each service's log storage at `5 × 100MB = 500MB` on the Docker host — once a log file
hits `100m`, Docker rotates it and drops the oldest of the 5 files. This bounds disk usage for
local development and any Compose-based deployment without touching application code.

Inspect current log file sizes for a running service:

```bash
docker inspect --format='{{.LogPath}}' <container_id>
du -sh $(docker inspect --format='{{.LogPath}}' <container_id>)
```

## Production and Staging

`json-file` rotation only bounds local disk usage — it does not give you searchable history once a
container is recreated or a node is replaced. Production and staging deployments should ship
container stdout/stderr to a centralised logging backend instead of relying solely on the local
driver:

- **Recommended:** [Grafana Loki](https://grafana.com/oss/loki/) via the Docker `loki` logging
  driver or the Loki Docker plugin, consistent with this repo's existing Grafana/Prometheus
  observability stack.
- **Alternative:** AWS CloudWatch Logs via the `awslogs` logging driver, for deployments running
  on ECS/EC2.

Example (Loki driver, production host):

```yaml
backend:
  logging:
    driver: loki
    options:
      loki-url: "https://<loki-host>:3100/loki/api/v1/push"
      loki-retries: "5"
      loki-batch-size: "400"
```

### Retention Policy

| Environment | Retention | Enforced by |
|-------------|-----------|-------------|
| Production  | 30 days   | Loki/CloudWatch Logs retention policy on the log group/tenant used by the `mainnet` deployment |
| Staging     | 7 days    | Loki/CloudWatch Logs retention policy on the log group/tenant used by the `staging` deployment |
| Local (Compose) | Bounded to 500MB per service (`max-size` × `max-file`), no time-based retention | `docker-compose.yml` `json-file` driver |

When configuring the centralised backend, set the retention period explicitly on the
log group/tenant rather than relying on defaults:

- **CloudWatch Logs:** `aws logs put-retention-policy --log-group-name <name> --retention-in-days 30` (production) or `7` (staging).
- **Loki:** set `limits_config.retention_period` (or a per-tenant override) to `720h` (30d) for the
  production tenant and `168h` (7d) for the staging tenant in `loki-config.yaml`.

See [mainnet-runbook.md](mainnet-runbook.md#logging-and-log-rotation) and
[STAGING.md](STAGING.md#logging-and-log-rotation) for where this fits into each environment's
deployment steps.
