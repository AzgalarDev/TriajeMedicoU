# Local development defaults

`docker-compose.yml` reads database settings from environment variables and falls back to safe local-only values:

```bash
POSTGRES_DB=triajemedicou
POSTGRES_USER=triajemedicou_local
POSTGRES_PASSWORD=triajemedicou_local_password
```

These defaults are only for local development. Production and shared environments must provide their own secrets through their deployment environment and must not reuse the documented local password.

The matching local `DATABASE_URL` is shown in `backend/.env.example`.

Password recovery throttling is an in-memory MVP safeguard controlled by `PASSWORD_RECOVERY_LIMIT` and `PASSWORD_RECOVERY_WINDOW_MINUTES`. It resets when the backend process restarts and does not coordinate across multiple backend instances.

The local clinical question provider uses Ollama. Copy the values from `backend/.env.example`; `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, and `OLLAMA_TIMEOUT_MS` are local configuration only. Automated tests mock the provider and never call Ollama.
