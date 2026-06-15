import {
  Assessment,
  DashboardResponse,
  KTAssignment,
  ProjectSummary,
  ResultResponse,
  User,
  WorkspaceResponse,
} from "../types";

export const mockProjects: ProjectSummary[] = [
  {
    id: "alpha-payments",
    name: "Alpha Payments",
    repository: "github.com/acme/alpha-payments",
    status: "Active",
    ktProgress: 72,
    assessmentCompletion: 64,
    assessmentScore: 82,
    nextAssessment: "2026-06-18",
  },
  {
    id: "data-lake",
    name: "Data Lake Modernization",
    repository: "github.com/acme/data-lake",
    status: "Review",
    ktProgress: 48,
    assessmentCompletion: 28,
    assessmentScore: null,
    nextAssessment: "2026-06-20",
  },
  {
    id: "customer-portal",
    name: "Customer Portal",
    repository: "github.com/acme/customer-portal",
    status: "Pending",
    ktProgress: 18,
    assessmentCompletion: 0,
    assessmentScore: null,
    nextAssessment: "2026-06-24",
  },
];

export const mockDashboardByRole: Record<"ADMIN" | "LEARNER", DashboardResponse> = {
  ADMIN: {
    stats: {
      totalProjects: mockProjects.length,
      activeProjects: 2,
      pendingAssessments: 7,
      completedAssessments: 14,
    },
    projects: mockProjects,
  },
  LEARNER: {
    stats: {
      assignedProjects: 2,
      pendingAssessments: 2,
      completedAssessments: 5,
      averageScore: 78,
    },
    projects: mockProjects.slice(0, 2),
  },
};

export const mockWorkspaceByProject: Record<string, WorkspaceResponse> = {
  "alpha-payments": {
    overview: {
      summary: "Payment orchestration service handling merchant onboarding, transaction routing, settlement events, and audit exports.",
      architectureOverview: "React admin surfaces call FastAPI services backed by PostgreSQL, Redis queues, and provider-specific adapters.",
      technologyStack: ["React", "TypeScript", "FastAPI", "PostgreSQL", "Redis", "Docker"],
      integrations: ["Stripe", "Razorpay", "SendGrid", "Datadog"],
      repositoryStatistics: [
        { label: "Mock contributors", value: "12" },
        { label: "Mock modules", value: "18" },
        { label: "Mock test coverage", value: "78%" },
        { label: "Mock critical paths", value: "6" },
      ],
    },
    checklist: [
      {
        id: "setup",
        title: "Local environment setup",
        description: "Install dependencies, configure environment variables, and run smoke tests.",
        status: "Completed",
        completionPercentage: 100,
      },
      {
        id: "domain",
        title: "Payment domain walkthrough",
        description: "Review transaction states, settlement flows, refunds, and reconciliation.",
        status: "In Progress",
        completionPercentage: 65,
      },
      {
        id: "release",
        title: "Release and rollback practice",
        description: "Understand deployment gates, alerts, and rollback procedures.",
        status: "Not Started",
        completionPercentage: 0,
      },
    ],
    smeRecommendations: [
      {
        id: "sme-1",
        name: "Priya Menon",
        expertiseAreas: ["Payments", "Provider Adapters", "Incident Response"],
        contributionScore: 94,
        confidenceScore: 88,
      },
      {
        id: "sme-2",
        name: "Daniel Cho",
        expertiseAreas: ["Settlement", "Database", "Observability"],
        contributionScore: 86,
        confidenceScore: 82,
      },
    ],
    assignments: [
      { id: "assign-1", sme: "Priya Menon", learner: "Aarav Mehta", dueDate: "2026-06-19", status: "In Progress" },
      { id: "assign-2", sme: "Daniel Cho", learner: "Mira Shah", dueDate: "2026-06-22", status: "Assigned" },
    ],
    knowledgeBase: [
      {
        id: "doc-overview",
        section: "Overview",
        title: "Service Purpose",
        content: "Alpha Payments coordinates merchant onboarding, payment authorization, settlement status, and finance audit exports.",
      },
      {
        id: "doc-architecture",
        section: "Architecture",
        title: "Runtime Architecture",
        content: "The application uses route-level React views, FastAPI domain services, PostgreSQL persistence, and Redis-backed background jobs.",
      },
      {
        id: "doc-modules",
        section: "Modules",
        title: "Core Modules",
        content: "Provider adapters, reconciliation workers, merchant settings, webhook processing, and export generation are the highest-risk modules.",
      },
      {
        id: "doc-api",
        section: "API Layer",
        title: "API Contracts",
        content: "Public endpoints validate provider events, normalize transaction payloads, and expose settlement state to internal dashboards.",
      },
      {
        id: "doc-db",
        section: "Database Layer",
        title: "Persistence Model",
        content: "Transactions, settlement batches, provider events, merchants, and audit snapshots are stored with immutable event references.",
      },
    ],
  },
};

export const fallbackWorkspace = mockWorkspaceByProject["alpha-payments"];

export const mockAssessments: Assessment[] = [
  {
    id: "alpha-kt-check",
    projectId: "alpha-payments",
    name: "Alpha Payments KT Assessment",
    durationMinutes: 12,
    type: "manual",
    questions: [
      {
        id: "q1",
        question: "Which flow should a learner understand before modifying payment provider adapters?",
        type: "single",
        options: [
          { id: "a", label: "Only the login screen flow" },
          { id: "b", label: "Authorization, capture, webhook, and settlement state transitions" },
          { id: "c", label: "The color system used by the dashboard" },
          { id: "d", label: "Only local package installation" },
        ],
        correctAnswers: ["b"],
        explanation: "Provider adapters affect the full transaction lifecycle and downstream settlement behavior.",
        difficulty: "Easy",
        topic: "Backend",
      },
      {
        id: "q2",
        question: "Select the production readiness items that must be verified before release.",
        type: "multi",
        options: [
          { id: "a", label: "Rollback plan" },
          { id: "b", label: "Monitoring and alert ownership" },
          { id: "c", label: "Temporary credentials committed locally" },
          { id: "d", label: "Provider webhook replay procedure" },
        ],
        correctAnswers: ["a", "b", "d"],
        explanation: "Rollback, observability, and replay procedures are release-critical; temporary credentials are a risk.",
        difficulty: "Medium",
        topic: "Infrastructure",
      },
      {
        id: "q3",
        question: "A settlement job fails halfway through a batch. What is the safest first response?",
        type: "scenario",
        options: [
          { id: "a", label: "Rerun the job without checking idempotency" },
          { id: "b", label: "Delete the failed records and wait for support tickets" },
          { id: "c", label: "Check idempotency keys, job logs, and provider event state before replaying" },
          { id: "d", label: "Disable monitoring for the job" },
        ],
        correctAnswers: ["c"],
        explanation: "Settlement replay must preserve idempotency and source-of-truth event state.",
        difficulty: "Hard",
        topic: "Database",
      },
    ],
  },
  {
    id: "ai-context-check",
    projectId: "alpha-payments",
    name: "AI Generated Context Check",
    durationMinutes: 10,
    type: "ai-generated",
    questions: [
      {
        id: "ai-q1",
        question: "What should generated assessment questions be anchored to before assignment?",
        type: "single",
        options: [
          { id: "a", label: "A source topic or project concept" },
          { id: "b", label: "Random vocabulary" },
          { id: "c", label: "Only the length of the answer" },
          { id: "d", label: "CSS class names" },
        ],
        correctAnswers: ["a"],
        explanation: "Generated questions need source grounding before they are used for evaluation.",
        difficulty: "Easy",
        topic: "Knowledge Base",
      },
      {
        id: "ai-q2",
        question: "Which safeguards support generated assessment reliability?",
        type: "multi",
        options: [
          { id: "a", label: "Store prompt version" },
          { id: "b", label: "Track confidence score" },
          { id: "c", label: "Skip human review for low confidence output" },
          { id: "d", label: "Keep correct answers separate from user responses" },
        ],
        correctAnswers: ["a", "b", "d"],
        explanation: "Prompt traceability, confidence tracking, and answer separation support auditability.",
        difficulty: "Medium",
        topic: "AI Generated Assessment",
      },
    ],
  },
];

export const mockResultsByProject: Record<string, ResultResponse> = {
  "alpha-payments": {
    projectId: "alpha-payments",
    overallScore: 82,
    categoryScores: [
      { category: "Backend", score: 86 },
      { category: "Frontend", score: 74 },
      { category: "Database", score: 80 },
      { category: "Infrastructure", score: 78 },
      { category: "Security", score: 88 },
    ],
    strengths: ["Understands provider adapter flow", "Strong grasp of rollback planning"],
    knowledgeGaps: ["Settlement replay edge cases", "Alert ownership during incidents"],
    recommendedLearningPath: ["Review settlement worker docs", "Pair on webhook replay drill", "Complete observability checklist"],
    assessmentHistory: [
      { id: "hist-1", date: "2026-06-01", assessmentName: "Repository Knowledge Foundations", score: 74 },
      { id: "hist-2", date: "2026-06-10", assessmentName: "Alpha Payments KT Assessment", score: 82 },
    ],
    teamResults: [
      { learner: "Aarav Mehta", project: "Alpha Payments", score: 82, status: "Completed" },
      { learner: "Mira Shah", project: "Alpha Payments", score: 76, status: "Completed" },
      { learner: "Noah Singh", project: "Data Lake Modernization", score: 0, status: "Pending" },
    ],
  },
};

export const mockUsers: User[] = [
  { id: "admin-1", name: "Admin User", email: "admin@synapseiq.local", roles: ["ADMIN"] },
  { id: "learner-1", name: "Learner User", email: "learner@synapseiq.local", roles: ["LEARNER"] },
];

export let mockAssignments: KTAssignment[] = [...fallbackWorkspace.assignments];

export function setMockAssignments(assignments: KTAssignment[]) {
  mockAssignments = assignments;
  mockWorkspaceByProject["alpha-payments"].assignments = assignments;
}

export function delay<T>(data: T, duration = 450): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(data), duration);
  });
}
