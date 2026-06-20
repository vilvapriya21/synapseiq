import apiClient from "./api";

export interface GeneratedOption {
  label: string;
  is_correct: boolean;
}

export interface GeneratedQuestion {
  question_text: string;
  question_type: "single" | "multi";
  options: GeneratedOption[];
  explanation: string;
  difficulty: "Easy" | "Medium" | "Hard";
}

export interface AssessmentOptionResponse {
  id: string;
  label: string;
  is_correct: boolean;
  order: number;
}

export interface AssessmentQuestionResponse {
  id: string;
  question_text: string;
  question_type: "single" | "multi";
  options: AssessmentOptionResponse[];
  explanation: string | null;
  difficulty: "Easy" | "Medium" | "Hard";
  order: number;
}

export interface AssessmentFull {
  id: string;
  kt_topic_id: string;
  title: string;
  duration_minutes: number;
  created_at: string;
  assigned_to: string | null;
  questions: AssessmentQuestionResponse[];
}

export interface AssessmentOptionLearner {
  id: string;
  label: string;
  order: number;
}

export interface AssessmentQuestionLearner {
  id: string;
  question_text: string;
  question_type: "single" | "multi";
  options: AssessmentOptionLearner[];
  order: number;
}

export interface AssessmentLearner {
  id: string;
  kt_topic_id: string;
  title: string;
  duration_minutes: number;
  questions: AssessmentQuestionLearner[];
}

export interface AssessmentListItem {
  id: string;
  kt_topic_id: string;
  repository_id: string;
  title: string;
  duration_minutes: number;
  created_at: string;
  assigned_to: string | null;
  kt_topic_title: string;
  repository_name: string;
  has_submitted: boolean;
}

export interface PerQuestionResult {
  question_id: string;
  question_text: string;
  question_type: string;
  selected_option_ids: string[];
  correct_option_ids: string[];
  is_correct: boolean;
  explanation: string | null;
}

export interface AttemptResult {
  attempt_id: string;
  score_percentage: number;
  total_questions: number;
  correct_answers: number;
  wrong_answers: number;
  submitted_at: string;
  per_question: PerQuestionResult[];
}

export interface LearnerAttemptSummary {
  attempt_id: string;
  learner_id: string;
  learner_name: string;
  learner_email: string;
  submitted_at: string | null;
  score_percentage: number | null;
  correct_answers: number;
  total_questions: number;
}

export const assessmentService = {
  async generateQuestions(ktTopicId: string, numQuestions: number): Promise<{ questions: GeneratedQuestion[] }> {
    const { data } = await apiClient.post("/assessment/generate-questions", {
      kt_topic_id: ktTopicId,
      num_questions: numQuestions,
    }, {
      timeout: 300000,
    });
    return data;
  },

  async saveAssessment(payload: {
    kt_topic_id: string;
    title: string;
    duration_minutes: number;
    questions: GeneratedQuestion[];
    assigned_to?: string;
  }): Promise<AssessmentFull> {
    const { data } = await apiClient.post("/assessment/", payload);
    return data;
  },

  async assignAssessment(assessmentId: string, learnerId: string): Promise<AssessmentFull> {
    const { data } = await apiClient.patch(`/assessment/${assessmentId}/assign`, {
      assigned_to: learnerId,
    });
    return data;
  },

  async listActive(): Promise<AssessmentListItem[]> {
    const { data } = await apiClient.get("/assessment/active");
    return data;
  },

  async getByTopic(ktTopicId: string): Promise<AssessmentFull | AssessmentLearner | null> {
    try {
      const { data } = await apiClient.get(`/assessment/by-topic/${ktTopicId}`);
      return data;
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  },

  async startAttempt(assessmentId: string): Promise<{ attempt_id: string; assessment: AssessmentLearner }> {
    const { data } = await apiClient.post(`/assessment/${assessmentId}/start`);
    return data;
  },

  async submitAttempt(assessmentId: string, answers: Record<string, string[]>): Promise<AttemptResult> {
    const { data } = await apiClient.post(`/assessment/${assessmentId}/submit`, {
      assessment_id: assessmentId,
      answers,
    });
    return data;
  },

  async getMyResult(assessmentId: string): Promise<AttemptResult | null> {
    try {
      const { data } = await apiClient.get(`/assessment/${assessmentId}/my-result`);
      return data;
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  },

  async getAdminResults(assessmentId: string): Promise<LearnerAttemptSummary[]> {
    const { data } = await apiClient.get(`/assessment/${assessmentId}/results`);
    return data;
  },

  async getAttemptDetail(attemptId: string): Promise<AttemptResult> {
    const { data } = await apiClient.get(`/assessment/attempts/${attemptId}`);
    return data;
  },
};
