import { ResultResponse, UserRole } from "../types";
import { assessmentService, type AssessmentListItem } from "./assessmentService";

const emptyResult = (projectId: string): ResultResponse => ({
  projectId,
  overallScore: null,
  categoryScores: [],
  strengths: [],
  knowledgeGaps: [],
  recommendedLearningPath: [],
  assessmentHistory: [],
  teamResults: [],
});

export const resultService = {
  async getResults(projectId: string, role: UserRole): Promise<ResultResponse> {
    const assessments = (await assessmentService.listActive()).filter(
      (assessment) => assessment.repository_id === projectId,
    );

    if (role === "ADMIN") {
      return getAdminResults(projectId, assessments);
    }

    return getLearnerResults(projectId, assessments);
  },
};

async function getLearnerResults(
  projectId: string,
  assessments: AssessmentListItem[],
): Promise<ResultResponse> {
  const completed = await Promise.all(
    assessments.map(async (assessment) => ({
      assessment,
      result: await assessmentService.getMyResult(assessment.id),
    })),
  );
  const submitted = completed.filter((item) => item.result !== null);
  if (submitted.length === 0) return emptyResult(projectId);

  const scores = submitted.map((item) => item.result!.score_percentage);
  return {
    ...emptyResult(projectId),
    overallScore: average(scores),
    categoryScores: submitted.map(({ assessment, result }) => ({
      category: assessment.kt_topic_title || assessment.title,
      score: result!.score_percentage,
    })),
    assessmentHistory: submitted.map(({ assessment, result }) => ({
      id: result!.attempt_id,
      date: result!.submitted_at,
      assessmentName: assessment.title,
      score: result!.score_percentage,
    })),
    teamResults: undefined,
  };
}

async function getAdminResults(
  projectId: string,
  assessments: AssessmentListItem[],
): Promise<ResultResponse> {
  const attemptsByAssessment = await Promise.all(
    assessments.map(async (assessment) => ({
      assessment,
      attempts: await assessmentService.getAdminResults(assessment.id),
    })),
  );
  const submitted = attemptsByAssessment.flatMap(({ assessment, attempts }) =>
    attempts
      .filter((attempt) => attempt.submitted_at && attempt.score_percentage !== null)
      .map((attempt) => ({ assessment, attempt })),
  );
  if (submitted.length === 0) return emptyResult(projectId);

  const scores = submitted.map(({ attempt }) => attempt.score_percentage!);
  return {
    ...emptyResult(projectId),
    overallScore: average(scores),
    categoryScores: assessments
      .map((assessment) => {
        const categoryScores = submitted
          .filter((item) => item.assessment.id === assessment.id)
          .map((item) => item.attempt.score_percentage!);
        return categoryScores.length > 0
          ? { category: assessment.kt_topic_title || assessment.title, score: average(categoryScores) }
          : null;
      })
      .filter((item): item is { category: string; score: number } => item !== null),
    assessmentHistory: submitted.map(({ assessment, attempt }) => ({
      id: attempt.attempt_id,
      date: attempt.submitted_at!,
      assessmentName: assessment.title,
      score: attempt.score_percentage!,
    })),
    teamResults: submitted.map(({ assessment, attempt }) => ({
      learner: `${attempt.learner_name} (${attempt.learner_email})`,
      project: assessment.repository_name,
      score: attempt.score_percentage!,
      status: "Completed",
    })),
  };
}

function average(values: number[]): number {
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}
