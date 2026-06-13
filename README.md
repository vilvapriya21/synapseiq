# SynapseIQ

SynapseIQ is an AI-powered Code Intelligence and Knowledge Transfer platform. It helps teams onboard repositories, manage KT workflows, track assessments, and access workspace intelligence through a modern enterprise dashboard.

## Features

- User signup and login
- JWT-based authentication
- Token persistence with Zustand
- Protected dashboard routes
- Logout flow
- Forgot password with verification code
- Reset password with confirm password
- Responsive login UI
- Dashboard with project search, statistics, and project table
- Mock dashboard API integration
- SQLite-backed local database for authentication

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- React Router
- Zustand
- Axios
- CSS Modules

### Backend

- FastAPI
- SQLAlchemy
- SQLite
- JWT authentication
- Passlib password hashing
- Pydantic schemas

## Project Structure

```text
synapseiq/
  backend/
    app/
      api/
      core/
      db/
      models/
      routers/
      schemas/
    requirements.txt
    .env.example

  frontend/
    public/
    src/
      components/
      layouts/
      pages/
      routes/
      services/
      store/
      styles/
      types/
    package.json
    tsconfig.json
    vite.config.ts
```

## Backend Setup

From the repository root:

```powershell
cd backend
..\venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs at:

```text
http://localhost:8000
```

API documentation:

```text
http://localhost:8000/docs
```

## Frontend Setup

From the repository root:

```powershell
cd frontend
npm install
npm run dev
```

Frontend runs at:

```text
http://localhost:5173
```

## Environment Variables

### Backend

Create `backend/.env` from `backend/.env.example` if you need local overrides.

```env
APP_NAME=SynapseIQ
APP_ENV=development
API_V1_PREFIX=/api/v1
DATABASE_URL=sqlite:///./synapseiq.db
JWT_SECRET_KEY=change-me
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
BACKEND_CORS_ORIGINS=http://localhost:5173
```

### Frontend

Create `frontend/.env` from `frontend/.env.example` if you need local overrides.

```env
VITE_APP_NAME=SynapseIQ
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

## Authentication Flow

### Signup

```http
POST /api/v1/auth/signup
```

```json
{
  "name": "User Name",
  "email": "user@example.com",
  "password": "Password123",
  "role": "admin"
}
```

### Login

```http
POST /api/v1/auth/login
```

```json
{
  "email": "user@example.com",
  "password": "Password123"
}
```

### Forgot Password

```http
POST /api/v1/auth/forgot-password
```

```json
{
  "email": "user@example.com"
}
```

### Reset Password

```http
POST /api/v1/auth/reset-password
```

```json
{
  "email": "user@example.com",
  "code": "123456",
  "password": "Password123",
  "confirm_password": "Password123"
}
```

## Password Rules

Passwords must include:

- 8 to 72 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

Example:

```text
Password123
```

## Dashboard API

```http
GET /api/v1/dashboard
```

This endpoint requires bearer token authentication.

## Useful Commands

Run frontend type check:

```powershell
cd frontend
npx.cmd tsc --noEmit
```

Run backend compile check:

```powershell
cd backend
python -m compileall app
```

Clear Vite cache and restart dev server:

```powershell
cd frontend
Remove-Item -Recurse -Force node_modules\.vite
npm run dev -- --force
```
