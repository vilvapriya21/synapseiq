import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock, Play, Send } from "lucide-react";
import { useParams } from "react-router-dom";
import { Button, EmptyState, Loader, Modal, PageHero } from "../components/common";
import { assessmentService } from "../services/assessmentService";
import { useAssessmentStore } from "../store/assessmentStore";
import { Assessment, AssessmentQuestion } from "../types";
import styles from "./Assessment.module.css";

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getNextSelection(question: AssessmentQuestion, currentSelection: string[], optionId: string) {
  if (question.type === "single" || question.type === "scenario") {
    return [optionId];
  }

  return currentSelection.includes(optionId)
    ? currentSelection.filter((selectedOptionId) => selectedOptionId !== optionId)
    : [...currentSelection, optionId];
}

function AssessmentPage() {
  const { projectId = "alpha-payments" } = useParams();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasAutoSubmitted = useRef(false);

  const {
    answers,
    assessmentId,
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
    let isMounted = true;
    setIsLoading(true);
    assessmentService
      .getAssessments(projectId)
      .then((data) => {
        if (isMounted) {
          setAssessments(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("Assessments could not be loaded.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const activeAssessment = useMemo(
    () => assessments.find((assessment) => assessment.id === assessmentId) ?? null,
    [assessmentId, assessments],
  );
  const currentQuestion = activeAssessment?.questions[currentQuestionIndex] ?? null;
  const currentSelection = currentQuestion ? answers[currentQuestion.id] ?? [] : [];
  const isCurrentQuestionAnswered = currentSelection.length > 0;
  const isCurrentQuestionLocked = currentQuestion ? lockedQuestionIds.includes(currentQuestion.id) : false;
  const allQuestionsAnswered = activeAssessment
    ? activeAssessment.questions.every((question) => (answers[question.id] ?? []).length > 0)
    : false;
  const isLastQuestion = activeAssessment ? currentQuestionIndex === activeAssessment.questions.length - 1 : false;

  const submitAssessment = async () => {
    if (!activeAssessment || isSubmitting || submitted) {
      return;
    }

    setIsSubmitting(true);
    try {
      const score = await assessmentService.submitAssessment({
        projectId,
        assessmentId: activeAssessment.id,
        answers,
      });
      setResult(score);
      setIsConfirmOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!activeAssessment || submitted || remainingSeconds <= 0) {
      return;
    }

    const timerId = window.setInterval(() => tick(), 1000);
    return () => window.clearInterval(timerId);
  }, [activeAssessment, remainingSeconds, submitted, tick]);

  useEffect(() => {
    if (activeAssessment && remainingSeconds === 0 && !submitted && !hasAutoSubmitted.current) {
      hasAutoSubmitted.current = true;
      void submitAssessment();
    }
  }, [activeAssessment, remainingSeconds, submitted]);

  const handleStart = (assessment: Assessment) => {
    hasAutoSubmitted.current = false;
    startAttempt(projectId, assessment.id, assessment.durationMinutes * 60);
  };

  const handleSelect = (question: AssessmentQuestion, optionId: string) => {
    const nextSelection = getNextSelection(question, answers[question.id] ?? [], optionId);
    setAnswer(question.id, nextSelection);
  };

  const handleNext = () => {
    if (!activeAssessment || !currentQuestion || !isCurrentQuestionAnswered) {
      return;
    }

    lockAndAdvance(currentQuestion.id, Math.min(currentQuestionIndex + 1, activeAssessment.questions.length - 1));
  };

  const handleSubmitClick = () => {
    if (!allQuestionsAnswered) {
      return;
    }

    setIsConfirmOpen(true);
  };

  if (isLoading) {
    return <div className={styles.state}><Loader label="Loading assessments..." /></div>;
  }

  if (error) {
    return <EmptyState title="Unable to load assessments" description={error} />;
  }

  if (activeAssessment && result) {
    return (
      <div className={styles.page}>
        <PageHero
          eyebrow={`Project ${projectId}`}
          heading="Assessment Result"
          action={
            <Button type="button" variant="secondary" onClick={resetAttempt}>
              Back to Assessments
            </Button>
          }
        />
        <section className={styles.resultPanel}>
          <div className={styles.scoreRing}>
            <span>{result.scorePercentage}%</span>
            <small>Score</small>
          </div>
          <div className={styles.resultGrid}>
            <div className={styles.metric}>
              <span>Total Questions</span>
              <strong>{result.totalQuestions}</strong>
            </div>
            <div className={styles.metric}>
              <span>Correct Answers</span>
              <strong>{result.correctAnswers}</strong>
            </div>
            <div className={styles.metric}>
              <span>Wrong Answers</span>
              <strong>{result.wrongAnswers}</strong>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (activeAssessment && currentQuestion) {
    return (
      <div className={styles.page}>
        <PageHero
          eyebrow={activeAssessment.type === "manual" ? "Manual Assessment" : "AI Generated Assessment"}
          heading={activeAssessment.name}
          action={
            <div className={styles.timer}>
              <Clock size={16} />
              {formatTime(remainingSeconds)}
            </div>
          }
        />

        <section className={styles.attemptPanel}>
          <div className={styles.progressHeader}>
            <span>Question {currentQuestionIndex + 1} of {activeAssessment.questions.length}</span>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${((currentQuestionIndex + 1) / activeAssessment.questions.length) * 100}%` }} />
            </div>
          </div>

          <div className={styles.questionHeader}>
            <div>
              <span className={styles.questionCount}>{currentQuestion.topic} - {currentQuestion.difficulty}</span>
              <h2>{currentQuestion.question}</h2>
            </div>
            <span className={styles.typeBadge}>
              {currentQuestion.type === "multi" ? "Multi-select" : currentQuestion.type === "scenario" ? "Scenario" : "Single-select"}
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
                    type={currentQuestion.type === "multi" ? "checkbox" : "radio"}
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
              <Button type="button" onClick={handleSubmitClick} disabled={!allQuestionsAnswered || isSubmitting}>
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

  return (
    <div className={styles.page}>
      <PageHero eyebrow={`Project ${projectId}`} heading="Assessments" />

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Assigned Assessments</h2>
            <p>Strict forward-only assessments assigned to this learner.</p>
          </div>
        </div>
        {assessments.length === 0 ? (
          <EmptyState title="No questions available" description="No assessment has been assigned for this project yet." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Assessment Name</th>
                  <th>Number of Questions</th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((assessment) => (
                  <tr key={assessment.id}>
                    <td>
                      <div className={styles.assessmentName}>{assessment.name}</div>
                      <span className={styles.sourceBadge}>{assessment.type === "manual" ? "Manual Assessment" : "AI Generated Assessment"}</span>
                    </td>
                    <td>{assessment.questions.length}</td>
                    <td>{assessment.durationMinutes} min</td>
                    <td>
                      <Button type="button" onClick={() => handleStart(assessment)}>
                        <Play size={16} />
                        Start Assessment
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default AssessmentPage;
