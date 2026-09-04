import { useEffect, useRef, useState } from "react";
import { Clock, Send } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import AttemptResultView from "../components/AttemptResultView";
import { BackLink, Button, EmptyState, Modal, PageHero } from "../components/common";
import { ROUTES } from "../routes/routePaths";
import {
  assessmentService,
  type AssessmentLearner,
  type AssessmentQuestionLearner,
} from "../services/assessmentService";
import { useAssessmentStore } from "../store/assessmentStore";
import styles from "./Assessment.module.css";

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getNextSelection(question: AssessmentQuestionLearner, currentSelection: string[], optionId: string) {
  if (question.question_type === "single") {
    return [optionId];
  }
  return currentSelection.includes(optionId)
    ? currentSelection.filter((selectedOptionId) => selectedOptionId !== optionId)
    : [...currentSelection, optionId];
}

function AssessmentPage() {
  const { assessmentId = "" } = useParams();
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState<AssessmentLearner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasAutoSubmitted = useRef(false);

  const {
    answers,
    currentQuestionIndex,
    lockedQuestionIds,
    remainingSeconds,
    result,
    submitted,
    lockAndAdvance,
    resetAttempt,
    setAnswer,
    setResult,
    startAttempt,
    tick,
  } = useAssessmentStore();

  useEffect(() => {
    if (!assessmentId) return;
    let isMounted = true;
    setIsLoading(true);
    setError("");
    assessmentService
      .startAttempt(assessmentId)
      .then(({ attempt_id, assessment: nextAssessment }) => {
        if (!isMounted) return;
        setAssessment(nextAssessment);
        startAttempt(attempt_id, assessmentId, nextAssessment.duration_minutes * 60);
        hasAutoSubmitted.current = false;
      })
      .catch(() => {
        if (isMounted) setError("Assessment could not be started.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [assessmentId, startAttempt]);

  const currentQuestion = assessment?.questions[currentQuestionIndex] ?? null;
  const currentSelection = currentQuestion ? answers[currentQuestion.id] ?? [] : [];
  const isCurrentQuestionAnswered = currentSelection.length > 0;
  const isCurrentQuestionLocked = currentQuestion ? lockedQuestionIds.includes(currentQuestion.id) : false;
  const allQuestionsAnswered = assessment
    ? assessment.questions.every((question) => (answers[question.id] ?? []).length > 0)
    : false;
  const isLastQuestion = assessment ? currentQuestionIndex === assessment.questions.length - 1 : false;

  const submitAssessment = async () => {
    if (!assessment || !assessmentId || isSubmitting || submitted) {
      return;
    }

    setIsSubmitting(true);
    try {
      const score = await assessmentService.submitAttempt(assessmentId, answers);
      setResult(score);
      setIsConfirmOpen(false);
    } catch {
      setError("Assessment could not be submitted.");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!assessment || submitted || remainingSeconds <= 0) {
      return;
    }
    const timerId = window.setInterval(() => tick(), 1000);
    return () => window.clearInterval(timerId);
  }, [assessment, remainingSeconds, submitted, tick]);

  useEffect(() => {
    if (assessment && remainingSeconds === 0 && !submitted && !hasAutoSubmitted.current) {
      hasAutoSubmitted.current = true;
      void submitAssessment();
    }
  }, [assessment, remainingSeconds, submitted]);

  const handleSelect = (question: AssessmentQuestionLearner, optionId: string) => {
    const nextSelection = getNextSelection(question, answers[question.id] ?? [], optionId);
    setAnswer(question.id, nextSelection);
  };

  const handleNext = () => {
    if (!assessment || !currentQuestion || !isCurrentQuestionAnswered) return;
    lockAndAdvance(currentQuestion.id, Math.min(currentQuestionIndex + 1, assessment.questions.length - 1));
  };

  if (isLoading) {
    return <div className={styles.state}>Loading assessment...</div>;
  }

  if (error) {
    return <EmptyState title="Unable to load assessments" description={error} />;
  }

  if (assessment && result) {
    return (
      <div className={styles.page}>
        <PageHero
          eyebrowContent={<BackLink label="Back to Assessments" onClick={() => { resetAttempt(); navigate(ROUTES.assessments); }} />}
          heading="Assessment Result"
          action={
            <Button type="button" variant="secondary" onClick={() => { resetAttempt(); navigate(ROUTES.assessments); }}>
              Back to Assessments
            </Button>
          }
        />
        <AttemptResultView result={result} />
      </div>
    );
  }

  if (!assessment || !currentQuestion) {
    return <div className={styles.state}>No questions available.</div>;
  }

  return (
    <div className={styles.page}>
      <PageHero
        eyebrowContent={<BackLink label="Back to Assessments" onClick={() => navigate(ROUTES.assessments)} />}
        heading={assessment.title}
        action={
          <div className={styles.timer}>
            <Clock size={16} />
            {formatTime(remainingSeconds)}
          </div>
        }
      />

      <section className={styles.attemptPanel}>
        <div className={styles.progressHeader}>
          <span>Question {currentQuestionIndex + 1} of {assessment.questions.length}</span>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${((currentQuestionIndex + 1) / assessment.questions.length) * 100}%` }} />
          </div>
        </div>

        <div className={styles.questionHeader}>
          <div>
            <span className={styles.questionCount}>{currentQuestion.question_type === "multi" ? "Select all that apply" : "Choose one answer"}</span>
            <h2>{currentQuestion.question_text}</h2>
          </div>
          <span className={styles.typeBadge}>
            {currentQuestion.question_type === "multi" ? "Multi-select" : "Single-select"}
          </span>
        </div>

        <div className={styles.options}>
          {currentQuestion.options.map((option) => {
            const inputId = `${currentQuestion.id}-${option.id}`;
            const isChecked = currentSelection.includes(option.id);
            return (
              <label key={option.id} className={`${styles.option} ${isChecked ? styles.selectedOption : ""}`} htmlFor={inputId}>
                <input
                  id={inputId}
                  type={currentQuestion.question_type === "multi" ? "checkbox" : "radio"}
                  name={currentQuestion.id}
                  checked={isChecked}
                  disabled={isCurrentQuestionLocked || submitted}
                  onChange={() => handleSelect(currentQuestion, option.id)}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>

        <div className={styles.navigation}>
          {isLastQuestion ? (
            <Button type="button" onClick={() => setIsConfirmOpen(true)} disabled={!allQuestionsAnswered || isSubmitting}>
              <Send size={16} />
              Submit
            </Button>
          ) : (
            <Button type="button" onClick={handleNext} disabled={!isCurrentQuestionAnswered}>
              Next
            </Button>
          )}
        </div>
      </section>

      <Modal isOpen={isConfirmOpen} onClose={() => setIsConfirmOpen(false)} title="Submit assessment">
        <div className={styles.confirmBody}>
          <p>Are you sure you want to submit? You cannot modify answers after submission.</p>
          <div className={styles.confirmActions}>
            <Button type="button" variant="secondary" onClick={() => setIsConfirmOpen(false)}>Review</Button>
            <Button type="button" isLoading={isSubmitting} onClick={submitAssessment}>Submit Assessment</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default AssessmentPage;
