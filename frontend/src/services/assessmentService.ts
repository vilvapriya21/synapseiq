import { Assessment, AssessmentSubmission, ScoreSummary } from "../types";
import { delay, mockAssessments } from "./mockData";

function haveExactSameAnswers(selectedAnswers: string[], correctAnswers: string[]) {
  if (selectedAnswers.length !== correctAnswers.length) {
    return false;
  }

  return correctAnswers.every((answerId) => selectedAnswers.includes(answerId));
}

export function calculateAssessmentScore(assessment: Assessment, answers: Record<string, string[]>): ScoreSummary {
  const correctAnswers = assessment.questions.reduce((total, question) => {
    const selectedAnswers = answers[question.id] ?? [];
    return total + (haveExactSameAnswers(selectedAnswers, question.correctAnswers) ? 1 : 0);
  }, 0);

  return {
    totalQuestions: assessment.questions.length,
    correctAnswers,
    wrongAnswers: assessment.questions.length - correctAnswers,
    scorePercentage: assessment.questions.length === 0 ? 0 : Math.round((correctAnswers / assessment.questions.length) * 100),
  };
}

export const assessmentService = {
  async getAssessments(projectId: string): Promise<Assessment[]> {
    return delay(mockAssessments.filter((assessment) => assessment.projectId === projectId));
  },

  async submitAssessment(submission: AssessmentSubmission): Promise<ScoreSummary> {
    const assessment = mockAssessments.find((item) => item.id === submission.assessmentId);
    if (!assessment) {
      return delay({ totalQuestions: 0, correctAnswers: 0, wrongAnswers: 0, scorePercentage: 0 });
    }

    return delay(calculateAssessmentScore(assessment, submission.answers), 600);
  },
};
