# SynapseIQ CI/CD Deployment

This repo deploys from GitHub to the Docker Compose application on:

- Server: `62.72.30.227`
- App path: `/home/amisha/synapseiq`
- Frontend: `http://62.72.30.227:5173`
- Backend: `http://62.72.30.227:8000`
- Health: `http://62.72.30.227:8000/api/v1/health`

The workflow file is `.github/workflows/deploy.yml`. It runs on every push to `main` and can also be started manually from GitHub Actions.

## What the pipeline does

1. Connects to the Linux server over SSH with password authentication.
2. Updates `/home/amisha/synapseiq` from `origin/main`.
3. Writes `backend/.env` from the GitHub secret named `BACKEND_ENV`.
4. Writes root `.env` for Docker Compose frontend build args.
5. Runs `docker compose build --pull`.
6. Runs `docker compose up -d --remove-orphans`.
7. Runs `docker compose exec -T backend alembic upgrade head`.
8. Verifies the backend health endpoint and frontend URL.

## Server prerequisites

Run these once on the server:

```bash
cd /home/amisha/synapseiq
git remote -v
docker compose version
docker ps
```

The workflow defaults to `root`, so Docker should already be available. If you change `DEPLOY_USER` to `amisha`, that user must be able to run Docker without an interactive password. If needed:

```bash
sudo usermod -aG docker amisha
```

Then log out and back in before testing:

```bash
docker ps
```

Open the required ports if a firewall is enabled:

```bash
sudo ufw allow 5173/tcp
sudo ufw allow 8000/tcp
```

## GitHub secrets and variables

Create these in GitHub:

`Settings > Secrets and variables > Actions > Secrets`

Required secrets:

```text
DEPLOY_SSH_PASSWORD
BACKEND_ENV
```

Optional variables:

```text
DEPLOY_HOST=62.72.30.227
DEPLOY_PORT=22
DEPLOY_USER=root
DEPLOY_PATH=/home/amisha/synapseiq
VITE_APP_NAME=SynapseIQ
VITE_API_BASE_URL=http://62.72.30.227:8000/api/v1
```

The workflow already has defaults for the optional variables above.

## SSH password setup

Add the server SSH password to GitHub as the secret `DEPLOY_SSH_PASSWORD`.

The workflow connects as:

```text
root@62.72.30.227
```

If the server disables SSH password login for root, either enable password authentication or set `DEPLOY_USER` to another Linux user that can run Docker and access `/home/amisha/synapseiq`.

## Backend env secret

Add the full backend env file contents to GitHub as the multiline secret `BACKEND_ENV`.

Use the values from your private environment, but make sure these server-facing values are included:

```env
APP_NAME=SynapseIQ
APP_ENV=development
API_V1_PREFIX=/api/v1
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
BACKEND_CORS_ORIGINS=["http://localhost:5173","http://62.72.30.227:5173"]
LLM_PROVIDER=groq
GROQ_MODEL=llama-3.3-70b-versatile
OLLAMA_BASE_URL=http://192.168.1.81:11434
OLLAMA_MODEL=qwen2.5-coder:14b
```

Also include your private values for:

```text
DATABASE_URL
JWT_SECRET_KEY
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITLAB_CLIENT_ID
GITLAB_CLIENT_SECRET
BITBUCKET_CLIENT_ID
BITBUCKET_CLIENT_SECRET
GROQ_API_KEY
```

Do not commit `backend/.env`; it is intentionally ignored by Git.

## Local Docker run

For localhost testing, create `backend/.env` locally and set CORS for localhost:

```env
BACKEND_CORS_ORIGINS=["http://localhost:5173"]
```

Then run:

```bash
docker compose up -d --build
docker compose exec backend alembic upgrade head
```

Open:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:8000
Health:   http://localhost:8000/api/v1/health
```

## Server Docker run

For manual server testing:

```bash
cd /home/amisha/synapseiq
cat > .env <<'EOF'
VITE_APP_NAME=SynapseIQ
VITE_API_BASE_URL=http://62.72.30.227:8000/api/v1
EOF

docker compose up -d --build
docker compose exec backend alembic upgrade head
```

Open:

```text
Frontend: http://62.72.30.227:5173
Backend:  http://62.72.30.227:8000
Health:   http://62.72.30.227:8000/api/v1/health
```

## Important security note

If credentials were pasted into chat, rotate them before production use. Put the new values only in GitHub Actions secrets or another secret manager.
