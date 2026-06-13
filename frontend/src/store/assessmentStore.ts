import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ScoreSummary } from "../types";

interface AssessmentAttemptState {
  answers: Record<string, string[]>;
  assessmentId: string | null;
  currentQuestionIndex: number;
  lockedQuestionIds: string[];
  projectId: string | null;
  remainingSeconds: number;
  result: ScoreSummary | null;
  submitted: boolean;
  startAttempt: (projectId: string, assessmentId: string, durationSeconds: number) => void;
  setAnswer: (questionId: string, answers: string[]) => void;
  lockAndAdvance: (questionId: string, nextIndex: number) => void;
  tick: () => void;
  setResult: (result: ScoreSummary) => void;
  resetAttempt: () => void;
}

const initialAttempt = {
  answers: {},
  assessmentId: null,
  currentQuestionIndex: 0,
  lockedQuestionIds: [],
  projectId: null,
  remainingSeconds: 0,
  result: null,
  submitted: false,
};

export const useAssessmentStore = create<AssessmentAttemptState>()(
  persist(
    (set) => ({
      ...initialAttempt,
      startAttempt: (projectId, assessmentId, durationSeconds) =>
        set((state) => {
          const sameActiveAttempt =
            state.projectId === projectId &&
            state.assessmentId === assessmentId &&
            !state.submitted &&
            state.remainingSeconds > 0;

          if (sameActiveAttempt) {
            return state;
          }

          return {
            ...initialAttempt,
            projectId,
            assessmentId,
            remainingSeconds: durationSeconds,
          };
        }),
      setAnswer: (questionId, answers) =>
        set((state) => {
          if (state.lockedQuestionIds.includes(questionId) || state.submitted) {
            return state;
          }

          return {
            answers: {
              ...state.answers,
              [questionId]: answers,
            },
          };
        }),
      lockAndAdvance: (questionId, nextIndex) =>
        set((state) => ({
          currentQuestionIndex: nextIndex,
          lockedQuestionIds: state.lockedQuestionIds.includes(questionId)
            ? state.lockedQuestionIds
            : [...state.lockedQuestionIds, questionId],
        })),
      tick: () =>
        set((state) => ({
          remainingSeconds: Math.max(0, state.remainingSeconds - 1),
        })),
      setResult: (result) =>
        set({
          result,
          submitted: true,
          remainingSeconds: 0,
        }),
      resetAttempt: () => set(initialAttempt),
    }),
    {
      name: "synapseiq.assessmentAttempt",
    },
  ),
);
