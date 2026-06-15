export type ProjectStatus = "Active" | "Review" | "Pending" | "Completed";
export type ChecklistStatus = "Not Started" | "In Progress" | "Completed";
export type AssignmentStatus = "Assigned" | "In Progress" | "Completed" | "Overdue";
export type QuestionType = "single" | "multi" | "scenario";
export type AssessmentType = "manual" | "ai-generated";

export interface ProjectSummary {
  id: string;
  name: string;
  repository: string;
  status: ProjectStatus;
  ktProgress: number;
  assessmentCompletion: number;
  assessmentScore: number | null;
  nextAssessment: string | null;
}

export interface DashboardStats {
  totalProjects?: number;
  activeProjects?: number;
  pendingAssessments: number;
  completedAssessments: number;
  assignedProjects?: number;
  averageScore?: number;
}

export interface DashboardResponse {
  stats: DashboardStats;
  projects: ProjectSummary[];
}

export interface WorkspaceOverview {
  summary: string;
  architectureOverview: string;
  technologyStack: string[];
  integrations: string[];
  repositoryStatistics: Array<{ label: string; value: string }>;
}

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  status: ChecklistStatus;
  completionPercentage: number;
}

export interface SMERecommendation {
  id: string;
  name: string;
  expertiseAreas: string[];
  contributionScore: number;
  confidenceScore: number;
}

export interface KTAssignment {
  id: string;
  sme: string;
  learner: string;
  dueDate: string;
  status: AssignmentStatus;
}

export interface KnowledgeDocument {
  id: string;
  section: "Overview" | "Architecture" | "Modules" | "API Layer" | "Database Layer";
  title: string;
  content: string;
}

export interface WorkspaceResponse {
  overview: WorkspaceOverview;
  checklist: ChecklistItem[];
  smeRecommendations: SMERecommendation[];
  assignments: KTAssignment[];
  knowledgeBase: KnowledgeDocument[];
}

export interface AssessmentQuestion {
  id: string;
  question: string;
  type: QuestionType;
  options: Array<{ id: string; label: string }>;
  correctAnswers: string[];
  explanation: string;
  difficulty: "Easy" | "Medium" | "Hard";
  topic: string;
}

export interface Assessment {
  id: string;
  projectId: string;
  name: string;
  durationMinutes: number;
  type: AssessmentType;
  questions: AssessmentQuestion[];
}

export interface AssessmentSubmission {
  projectId: string;
  assessmentId: string;
  answers: Record<string, string[]>;
}

export interface ScoreSummary {
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  scorePercentage: number;
}

export interface ResultResponse {
  projectId: string;
  overallScore: number | null;
  categoryScores: Array<{ category: string; score: number }>;
  strengths: string[];
  knowledgeGaps: string[];
  recommendedLearningPath: string[];
  assessmentHistory: Array<{ id: string; date: string; assessmentName: string; score: number }>;
  teamResults?: Array<{ learner: string; project: string; score: number; status: string }>;
}
