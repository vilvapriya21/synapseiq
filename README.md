# SynapseIQ

SynapseIQ is an AI-powered code intelligence and knowledge transfer platform for engineering teams. It helps teams connect or upload repositories, analyze project knowledge, identify subject-matter experts, build KT checklists, run assessments, and answer repository questions through a chat-based workspace.

## Table of Contents

- [Features](#features)
- [User Roles and Usage Flow](#user-roles-and-usage-flow)
- [Tech Stack](#tech-stack)
- [Architecture Documentation](#architecture-documentation)
- [Project Documentation](#project-documentation)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Security Notes](#security-notes)
- [Backend Setup](#backend-setup)
- [Frontend Setup](#frontend-setup)
- [Docker Setup](#docker-setup)
- [Database Migrations](#database-migrations)
- [API Overview](#api-overview)
- [Testing and Validation](#testing-and-validation)
- [Useful Commands](#useful-commands)
- [Troubleshooting](#troubleshooting)

## Features

- Authentication with signup, login, logout, password reset, JWT sessions, and role-based access.
- Admin user management for creating users, updating roles, and removing users.
- Repository onboarding through connected Git providers or uploaded code archives.
- Repository intelligence including file inventory, knowledge base generation, contributor analysis, and refresh flows.
- Git provider integrations for GitHub, GitLab, Bitbucket, and Azure PAT-based access.
- KT topic management with SME recommendations, generated checklists, completion tracking, and regeneration.
- AI chat over repository knowledge with saved chat history.
- Assessment generation, assignment, active assessment views, submissions, results, and attempt detail pages.
- Dashboard and workspace screens for navigating projects, repositories, assessments, and results.

## User Roles and Usage Flow

### Administrator Flow

1. Login with an administrator account.
2. Connect a repository through GitHub, GitLab, Bitbucket, Azure DevOps PAT, or ZIP upload.
3. Start repository indexing so SynapseIQ can analyze files, contributors, and knowledge sources.
4. View the repository workspace, contributor insights, file inventory, and generated knowledge base.
5. Create KT topics, assign learners, and manage checklist items for repository knowledge transfer.
6. Create and assign assessments where applicable to validate learner understanding.

### Learner Flow

1. Login with a learner account.
2. Open the Project Workspace.
3. View only assigned repositories and assigned KT topics.
4. Complete KT checklist activities for assigned topics.
5. Use the repository AI chatbot to understand code, files, and domain context.
6. View assigned assessments and results where applicable.

## Tech Stack

### Frontend

- React 18
- TypeScript
- Vite
- React Router
- Zustand
- Axios
- CSS Modules

### Backend

- FastAPI
- SQLAlchemy
- Alembic
- Pydantic and pydantic-settings
- PostgreSQL-compatible database support
- JWT authentication with python-jose
- Passlib and bcrypt password hashing
- PyGithub, GitPython, httpx, chardet, and scikit-learn
- Groq or Ollama-backed LLM workflows

## Architecture Documentation

The technical architecture is documented in [docs/Technical_Architecture_Blueprint.docx](docs/Technical_Architecture_Blueprint.docx).

The architecture covers the React/Vite frontend, FastAPI backend, PostgreSQL/NeonDB persistence, repository analysis pipeline, TF-IDF semantic search, Ollama/Groq LLM integration, JWT authentication, and Docker deployment.

## Project Documentation

- [Product Requirements Document](docs/PRD.docx)
- [Technical Architecture Blueprint](docs/Technical_Architecture_Blueprint.docx)
- [Project Plan](docs/Project_Plan.docx)
- [AI Usage Summary and Metrics](docs/AI_Usage_Summary_and_Metrics.docx)
- [Testing and Validation Report](docs/Testing_and_Validation_Report.docx)

## Project Structure

```text
synapseiq/
  backend/
    alembic/                 Database migration environment and versions
    app/
      api/                   Top-level API router and health routes
      core/                  Configuration, constants, security, LLM dependencies
      db/                    SQLAlchemy database base, engine, and sessions
      middleware/            CORS configuration
      models/                SQLAlchemy models
      modules/               Repository analysis, RAG, search, LLM, checklist, questions
      repositories/          Data-access helpers
      routers/               Auth, admin, repository, KT, chat, assessment routes
      schemas/               Pydantic request and response schemas
      services/              Email and supporting services
      utils/                 Pagination and path matching utilities
    .env.example
    alembic.ini
    requirements.txt

  frontend/
    src/
      assets/                Images and brand assets
      components/            Shared and feature components
      constants/             Environment constants
      context/               React contexts
      hooks/                 Reusable hooks
      layouts/               Auth and dashboard layouts
      pages/                 Route-level screens
      routes/                App route configuration and guards
      services/              API client and domain services
      store/                 Zustand stores
      styles/                Global styles
      types/                 Shared TypeScript types
      utils/                 Formatting, role, and error helpers
    .env.example
    package.json
    tsconfig.json
    vite.config.ts
```

## Prerequisites

- Node.js 18 or newer
- npm
- Python 3.11 or newer
- PostgreSQL-compatible database connection string, such as NeonDB
- Optional: Ollama installed locally if using `LLM_PROVIDER=ollama`
- Optional: Groq API key if using `LLM_PROVIDER=groq`
- Optional: OAuth app credentials for GitHub, GitLab, or Bitbucket integrations

## Environment Setup

Create local environment files from the examples:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

### Backend Variables

`backend/.env`:

```env
APP_NAME=SynapseIQ
APP_ENV=development
API_V1_PREFIX=/api/v1
DATABASE_URL=postgresql+psycopg://user:password@host:5432/database?sslmode=require
JWT_SECRET_KEY=replace-with-a-long-random-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
BACKEND_CORS_ORIGINS=["http://localhost:5173"]

GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITLAB_CLIENT_ID=your-gitlab-client-id
GITLAB_CLIENT_SECRET=your-gitlab-client-secret
BITBUCKET_CLIENT_ID=your-bitbucket-client-id
BITBUCKET_CLIENT_SECRET=your-bitbucket-client-secret

LLM_PROVIDER=ollama
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5-coder:14b
OLLAMA_TIMEOUT_SECONDS=500
```

Important notes:

- `DATABASE_URL` is required. The backend will fail to start if it is empty.
- `JWT_SECRET_KEY` must be at least 8 characters. Use a strong value outside local development.
- Set `LLM_PROVIDER=groq` only when `GROQ_API_KEY` is configured.
- Keep real secrets out of source control.

### Frontend Variables

`frontend/.env`:

```env
VITE_APP_NAME=SynapseIQ
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

## Security Notes

- Never commit `.env` files, PATs, API keys, database URLs, OAuth client secrets, or other credentials.
- Use `.env.example` files as templates only.
- Production secrets must come from secure deployment settings or CI/CD secret storage.
- Azure DevOps PATs should use the minimum permissions required for repository access.

## Backend Setup

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

The backend runs at:

```text
http://localhost:8000
```

Interactive API documentation is available at:

```text
http://localhost:8000/docs
```

## Frontend Setup

From a second terminal at the repository root:

```powershell
cd frontend
npm install
npm run dev
```

The frontend runs at:

```text
http://localhost:5173
```

## Docker Setup

### Prerequisites

- Docker Desktop or Docker Engine with Docker Compose v2
- A configured `backend/.env` file
- A PostgreSQL-compatible `DATABASE_URL`, such as NeonDB, unless you use the optional local Postgres profile
- Optional: external Ollama reachable through `OLLAMA_BASE_URL`

### Environment setup

Create the backend environment file and fill in real values locally:

```powershell
Copy-Item backend\.env.example backend\.env
```

Do not commit `backend/.env`. The Docker images do not copy `.env` files; Compose injects backend settings at runtime through:

```yaml
env_file:
  - backend/.env
```

For the frontend image, only public `VITE_` values are accepted at build time. By default, Compose builds with:

```env
VITE_APP_NAME=SynapseIQ
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

### Build and start

From the project root:

```powershell
docker compose build
docker compose up -d
```

Open the app at:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:8000
Health:   http://localhost:8000/api/v1/health
```

View logs:

```powershell
docker compose logs -f backend
docker compose logs -f frontend
```

### Migrations

Run migrations after the backend container is running:

```powershell
docker compose exec backend alembic upgrade head
```

### Optional local Postgres

The default Compose setup expects `DATABASE_URL` to point at NeonDB or another external PostgreSQL-compatible database.

For local development with the bundled Postgres service:

```powershell
docker compose --profile local-db up -d postgres
```

Set `DATABASE_URL` in `backend/.env` to:

```env
DATABASE_URL=postgresql+psycopg://synapseiq:synapseiq@postgres:5432/synapseiq
```

Then start the app:

```powershell
docker compose --profile local-db up -d --build
docker compose exec backend alembic upgrade head
```

### Docker troubleshooting

- If the backend is unhealthy, check `DATABASE_URL`, `JWT_SECRET_KEY`, and `LLM_PROVIDER` in `backend/.env`.
- If `LLM_PROVIDER=groq`, set `GROQ_API_KEY`; otherwise use `LLM_PROVIDER=ollama` and a reachable `OLLAMA_BASE_URL`.
- If the frontend cannot call the API, confirm `VITE_API_BASE_URL` points to the browser-accessible backend URL and `BACKEND_CORS_ORIGINS` includes the frontend origin, such as `http://localhost:5173`.
- If repository indexing fails, check backend logs. The backend image includes `git` for repository analysis.
- If OAuth callbacks fail in Docker, make sure provider callback URLs match the backend URL exposed to your browser.

## Database Migrations

Alembic manages the database schema.

Apply all migrations:

```powershell
cd backend
alembic upgrade head
```

Create a new migration after model changes:

```powershell
cd backend
alembic revision --autogenerate -m "describe change"
```

Check the current migration:

```powershell
cd backend
alembic current
```

## API Overview

All backend routes are mounted under `/api/v1`.

| Area | Routes |
| --- | --- |
| Health | `GET /health` |
| Auth | `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/forgot-password`, `POST /auth/verify-reset-code`, `POST /auth/reset-password` |
| Admin | `GET /admin/users`, `POST /admin/users`, `PATCH /admin/users/{user_id}/role`, `DELETE /admin/users/{user_id}` |
| Dashboard | `GET /dashboard` |
| Git Auth | `/auth/github`, `/auth/gitlab`, `/auth/bitbucket`, `/auth/azure/pat` and related callback/status/delete routes |
| Repositories | `POST /repositories/connect`, `POST /repositories/upload`, `GET /repositories`, `GET /repositories/assigned`, `GET /repositories/assigned-to-me`, `GET /repositories/{repo_id}`, `POST /repositories/{repo_id}/refresh`, `DELETE /repositories/{repo_id}` |
| Repository Knowledge | `GET /repositories/{repo_id}/knowledge-base`, `GET /repositories/{repo_id}/files`, upload download/delete routes, contributor analysis, and assignments |
| Chat | `GET /repositories/{repo_id}/chat`, `POST /repositories/{repo_id}/chat` |
| KT Topics | `GET /repositories/{repo_id}/kt-topics`, `POST /repositories/{repo_id}/kt-topics`, checklist, recommendation, completion, regenerate, and delete routes |
| Assessments | `POST /assessment/generate-questions`, `POST /assessment/`, `GET /assessment/active`, topic lookup, assign, start, submit, results, and attempt detail routes |

Most application routes require a bearer token:

```http
Authorization: Bearer <token>
```

## Testing and Validation

Test evidence and validation notes are documented in [docs/Testing_and_Validation_Report.docx](docs/Testing_and_Validation_Report.docx).

Validation scenarios include:

- Authentication and role-based access.
- Repository onboarding for GitHub, GitLab, Bitbucket, Azure DevOps PAT, and ZIP upload.
- Repository indexing and knowledge-base generation.
- Admin and learner Project Workspace access.
- KT topic assignment and checklist completion.
- Contributor analysis.
- Repository AI chatbot.
- Docker Compose startup and health endpoint validation.

## Useful Commands

Run a frontend production build:

```powershell
cd frontend
npm run build
```

Preview the built frontend:

```powershell
cd frontend
npm run preview
```

Run a frontend type check:

```powershell
cd frontend
npx tsc --noEmit
```

Compile-check the backend:

```powershell
cd backend
python -m compileall app
```

Start the backend:

```powershell
cd backend
uvicorn app.main:app --reload
```

Start the frontend:

```powershell
cd frontend
npm run dev
```

Clear Vite cache:

```powershell
cd frontend
Remove-Item -Recurse -Force node_modules\.vite
npm run dev -- --force
```

## Troubleshooting

### Backend fails with `DATABASE_URL is not set`

Add a valid PostgreSQL-compatible connection string to `backend/.env`, then restart the backend.

### Frontend cannot reach the API

Confirm the backend is running on `http://localhost:8000`, then verify:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

Also confirm `BACKEND_CORS_ORIGINS` includes the frontend origin:

```env
BACKEND_CORS_ORIGINS=["http://localhost:5173"]
```

### Groq provider fails at startup

When using Groq, configure both values:

```env
LLM_PROVIDER=groq
GROQ_API_KEY=your-groq-api-key
```

### Ollama responses fail or time out

Make sure Ollama is running and the configured model is available:

```powershell
ollama pull qwen2.5-coder:14b
ollama serve
```

### Password reset email is not delivered

In non-production environments, the password reset verification code is returned in the API response for debugging. In production, configure the email service before relying on email delivery.

## License

No license file is currently included in this repository. Add one before distributing or open-sourcing the project.
