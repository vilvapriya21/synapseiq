import { ResultResponse, UserRole } from "../types";
import { delay, mockResultsByProject } from "./mockData";

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
    const result = mockResultsByProject[projectId] ?? emptyResult(projectId);
    return delay(role === "ADMIN" ? result : { ...result, teamResults: undefined });
  },
};
