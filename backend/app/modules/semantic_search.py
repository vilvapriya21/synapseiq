from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.models.knowledge_base import KnowledgeBase


def rank_relevant_entries(
    question: str, entries: list[KnowledgeBase], top_k: int = 6
) -> list[KnowledgeBase]:
    if not entries:
        return []

    try:
        documents = [
            f"{entry.file_path or entry.entry_type} {entry.content}"
            for entry in entries
        ]

        vectorizer = TfidfVectorizer(stop_words="english", max_features=2000)
        vectors = vectorizer.fit_transform(documents + [question])
        document_vectors = vectors[:-1]
        question_vector = vectors[-1]

        similarities = cosine_similarity(question_vector, document_vectors).flatten()
        ranked_entries = sorted(
            zip(entries, similarities),
            key=lambda item: item[1],
            reverse=True,
        )

        return [entry for entry, _ in ranked_entries[:top_k]]
    except Exception:
        return entries[:top_k]
