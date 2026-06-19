import { useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { ROUTES } from "../routes/routePaths";
import { getUsers, type AdminUser } from "../services/adminService";
import {
  assessmentService,
  type AssessmentFull,
  type AssessmentQuestionResponse,
  type GeneratedQuestion,
} from "../services/assessmentService";
import styles from "./AssessmentBuilder.module.css";

const blankQuestion = (): GeneratedQuestion => ({
  question_text: "",
  question_type: "single",
  options: [
    { label: "", is_correct: true },
    { label: "", is_correct: false },
    { label: "", is_correct: false },
    { label: "", is_correct: false },
  ],
  explanation: "",
  difficulty: "Easy",
});

function nextDifficulty(value: GeneratedQuestion["difficulty"]) {
  if (value === "Easy") return "Medium";
  if (value === "Medium") return "Hard";
  return "Easy";
}

function validateQuestions(questions: GeneratedQuestion[]) {
  return questions.reduce<Record<number, string>>((errors, question, index) => {
    if (!question.question_text.trim()) {
      errors[index] = "Question text is required.";
    } else if (question.options.length !== 4 || question.options.some((option) => !option.label.trim())) {
      errors[index] = "Each question needs exactly 4 non-empty options.";
    } else if (!question.options.some((option) => option.is_correct)) {
      errors[index] = "Mark at least one correct option.";
    }
    return errors;
  }, {});
}

function isAssessmentFull(value: unknown): value is AssessmentFull {
  return Boolean(value && typeof value === "object" && "created_at" in value);
}

function toGeneratedQuestion(question: AssessmentQuestionResponse): GeneratedQuestion {
  return {
    question_text: question.question_text,
    question_type: question.question_type,
    options: question.options.map((option) => ({
      label: option.label,
      is_correct: option.is_correct,
    })),
    explanation: question.explanation || "",
    difficulty: question.difficulty,
  };
}

function AssessmentBuilder() {
  const { repoId, topicId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<"config" | "review" | "done">("config");
  const [title, setTitle] = useState("");
  const [numQuestions, setNumQuestions] = useState(10);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [questionErrors, setQuestionErrors] = useState<Record<number, string>>({});
  const [learners, setLearners] = useState<{ id: string; name: string; email: string }[]>([]);
  const [selectedLearnerId, setSelectedLearnerId] = useState("");
  const [savedAssessment, setSavedAssessment] = useState<AssessmentFull | null>(null);

  useEffect(() => {
    getUsers()
      .then((users) => {
        setLearners(
          users
            .filter((candidate: AdminUser) => ["learner", "user"].includes(candidate.role.toLowerCase()))
            .map((candidate) => ({ id: candidate.id, name: candidate.name, email: candidate.email })),
        );
      })
      .catch(() => setError("Unable to load learners."));
  }, []);

  useEffect(() => {
    if (!topicId) return;

    let isMounted = true;
    assessmentService
      .getByTopic(topicId)
      .then((assessment) => {
        if (!isMounted || !assessment || !isAssessmentFull(assessment)) return;
        setTitle(assessment.title);
        setDurationMinutes(assessment.duration_minutes);
        setSelectedLearnerId(assessment.assigned_to || "");
        setQuestions(assessment.questions.map(toGeneratedQuestion));
        setSavedAssessment(assessment);
        setStep("review");
      })
      .catch(() => {
        if (isMounted) setError("Unable to load saved assessment.");
      });

    return () => {
      isMounted = false;
    };
  }, [topicId]);

  const selectedLearner = useMemo(
    () => learners.find((learner) => learner.id === selectedLearnerId),
    [learners, selectedLearnerId],
  );

  const generate = async (force = false) => {
    if (!topicId || !title.trim()) {
      setError("Title is required before generating questions.");
      return;
    }
    if (force && questions.length > 0 && !window.confirm("Regenerate questions? Current edits will be replaced.")) {
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const response = await assessmentService.generateQuestions(topicId, numQuestions);
      setQuestions(response.questions);
      setQuestionErrors({});
      setStep("review");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Question generation failed. Please retry.");
    } finally {
      setGenerating(false);
    }
  };

  const updateQuestion = (index: number, next: Partial<GeneratedQuestion>) => {
    setQuestions((current) => current.map((question, itemIndex) => (itemIndex === index ? { ...question, ...next } : question)));
  };

  const updateOption = (questionIndex: number, optionIndex: number, label: string) => {
    setQuestions((current) =>
      current.map((question, itemIndex) =>
        itemIndex === questionIndex
          ? {
              ...question,
              options: question.options.map((option, index) => (index === optionIndex ? { ...option, label } : option)),
            }
          : question,
      ),
    );
  };

  const toggleCorrect = (questionIndex: number, optionIndex: number) => {
    setQuestions((current) =>
      current.map((question, itemIndex) => {
        if (itemIndex !== questionIndex) return question;
        return {
          ...question,
          options: question.options.map((option, index) => ({
            ...option,
            is_correct: question.question_type === "single" ? index === optionIndex : index === optionIndex ? !option.is_correct : option.is_correct,
          })),
        };
      }),
    );
  };

  const toggleType = (index: number) => {
    setQuestions((current) =>
      current.map((question, itemIndex) => {
        if (itemIndex !== index) return question;
        const nextType = question.question_type === "single" ? "multi" : "single";
        return {
          ...question,
          question_type: nextType,
          options: nextType === "single"
            ? question.options.map((option, optionIndex) => ({ ...option, is_correct: optionIndex === 0 }))
            : question.options,
        };
      }),
    );
  };

  const save = async () => {
    if (!topicId) return;
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    const errors = validateQuestions(questions);
    setQuestionErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError("Fix the highlighted questions before saving.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await assessmentService.saveAssessment({
        kt_topic_id: topicId,
        title,
        duration_minutes: durationMinutes,
        questions,
        assigned_to: selectedLearnerId || undefined,
      });
      setSavedAssessment(saved);
      setStep("done");
    } catch {
      setError("Assessment could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Assessment Builder</p>
          <h1 className={styles.heading}>Manage Assessment</h1>
        </div>
      </section>

      {error ? <div className={styles.state}>{error}</div> : null}

      {step === "config" ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Configuration</h2>
              <p>Set up the assessment before generating questions.</p>
            </div>
          </div>
          <div className={styles.configForm}>
            <label>
              Assessment title
              <input value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <label>
              Number of questions
              <input min={1} max={30} type="number" value={numQuestions} onChange={(event) => setNumQuestions(Number(event.target.value))} />
            </label>
            <label>
              Duration in minutes
              <input min={1} max={180} type="number" value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} />
            </label>
            <label>
              Assign to learner
              <select value={selectedLearnerId} onChange={(event) => setSelectedLearnerId(event.target.value)}>
                <option value="">Unassigned</option>
                {learners.map((learner) => (
                  <option key={learner.id} value={learner.id}>{learner.name} ({learner.email})</option>
                ))}
              </select>
            </label>
            <button className={styles.primaryButton} type="button" onClick={() => generate()} disabled={generating}>
              {generating ? "Generating..." : "Generate Questions"}
            </button>
          </div>
        </section>
      ) : null}

      {step === "review" ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>{questions.length} questions generated</h2>
              <p>Review and edit before saving.</p>
            </div>
          </div>
          <div className={styles.reviewList}>
            {questions.map((question, index) => (
              <article className={styles.questionCard} key={`${index}-${question.question_text}`}>
                <div className={styles.questionHeader}>
                  <strong>Question {index + 1}</strong>
                  <div className={styles.cardActions}>
                    <button className={styles.difficultyBadge} type="button" onClick={() => updateQuestion(index, { difficulty: nextDifficulty(question.difficulty) })}>
                      {question.difficulty}
                    </button>
                    <button className={styles.typeBadge} type="button" onClick={() => toggleType(index)}>
                      {question.question_type === "multi" ? "Multi" : "Single"}
                    </button>
                    <button className={styles.iconButton} type="button" onClick={() => setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index))} title="Delete question">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {questionErrors[index] ? <p className={styles.error}>{questionErrors[index]}</p> : null}
                <textarea value={question.question_text} onChange={(event) => updateQuestion(index, { question_text: event.target.value })} rows={3} />
                <div className={styles.options}>
                  {question.options.map((option, optionIndex) => (
                    <label className={styles.optionRow} key={optionIndex}>
                      <input type="checkbox" checked={option.is_correct} onChange={() => toggleCorrect(index, optionIndex)} />
                      <input value={option.label} onChange={(event) => updateOption(index, optionIndex, event.target.value)} placeholder={`Option ${optionIndex + 1}`} />
                    </label>
                  ))}
                </div>
                <textarea value={question.explanation} onChange={(event) => updateQuestion(index, { explanation: event.target.value })} rows={2} placeholder="Explanation" />
              </article>
            ))}
          </div>
          <div className={styles.footerActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setQuestions((current) => [...current, blankQuestion()])}>
              <Plus size={16} />
              Add Question
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => generate(true)} disabled={generating}>
              <RotateCcw size={16} />
              Regenerate
            </button>
            <button className={styles.primaryButton} type="button" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save & Assign Assessment"}
            </button>
          </div>
        </section>
      ) : null}

      {step === "done" && savedAssessment ? (
        <section className={styles.panel}>
          <div className={styles.donePanel}>
            <h2>Assessment saved{selectedLearner ? ` and assigned to ${selectedLearner.name}` : ""}</h2>
            <div className={styles.footerActions}>
              <button className={styles.primaryButton} type="button" onClick={() => navigate(ROUTES.assessmentResults.replace(":assessmentId", savedAssessment.id))}>
                View Results
              </button>
              <button className={styles.secondaryButton} type="button" onClick={() => navigate(ROUTES.repository.replace(":repoId", repoId || ""))}>
                Back to Topic
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default AssessmentBuilder;
