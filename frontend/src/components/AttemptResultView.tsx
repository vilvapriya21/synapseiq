import { AttemptResult } from "../services/assessmentService";
import styles from "./AttemptResultView.module.css";

interface AttemptResultViewProps {
  result: AttemptResult;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function AttemptResultView({ result }: AttemptResultViewProps) {
  return (
    <div className={styles.wrap}>
      <section className={styles.resultPanel}>
        <div className={styles.scoreRing}>
          <span>{Math.round(result.score_percentage)}%</span>
          <small>Score</small>
        </div>
        <div className={styles.resultGrid}>
          <div className={styles.metric}>
            <span>Total Questions</span>
            <strong>{result.total_questions}</strong>
          </div>
          <div className={styles.metric}>
            <span>Correct Answers</span>
            <strong>{result.correct_answers}</strong>
          </div>
          <div className={styles.metric}>
            <span>Wrong Answers</span>
            <strong>{result.wrong_answers}</strong>
          </div>
          <div className={styles.metric}>
            <span>Submitted</span>
            <strong className={styles.dateText}>{formatDate(result.submitted_at)}</strong>
          </div>
        </div>
      </section>

      <section className={styles.breakdown}>
        {result.per_question.map((question, index) => (
          <article className={styles.questionCard} key={question.question_id}>
            <div className={styles.questionHeader}>
              <div>
                <span>Question {index + 1}</span>
                <h3>{question.question_text}</h3>
              </div>
              <strong className={question.is_correct ? styles.passBadge : styles.failBadge}>
                {question.is_correct ? "Correct" : "Incorrect"}
              </strong>
            </div>
            <div className={styles.answerGrid}>
              <div>
                <span>Selected Options</span>
                <p>{question.selected_option_labels.length ? question.selected_option_labels.join(", ") : "No answer selected"}</p>
              </div>
              <div>
                <span>Correct Options</span>
                <p>{question.correct_option_labels.join(", ")}</p>
              </div>
            </div>
            {question.explanation ? <p className={styles.explanation}>{question.explanation}</p> : null}
          </article>
        ))}
      </section>
    </div>
  );
}

export default AttemptResultView;
