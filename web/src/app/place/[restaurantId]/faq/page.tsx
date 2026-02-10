"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface FaqItem {
  id: string;
  question: string;
  answer: string | null;
  category: string;
  status: string;
  askCount: number;
  lastCallerPhone: string | null;
  lastAskedAt: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; bg: string }> = {
  pending: { label: "En attente", bg: "bg-warning" },
  answered: { label: "Répondu", bg: "bg-success" },
  ignored: { label: "Ignoré", bg: "bg-secondary" },
};

const CATEGORY_LABELS: Record<string, string> = {
  horaires: "Horaires",
  livraison: "Livraison",
  allergens: "Allergènes",
  paiement: "Paiement",
  parking: "Parking",
  reservation: "Réservation",
  promotion: "Promotion",
  ingredients: "Ingrédients",
  other: "Autre",
};

export default function FaqPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [newCategory, setNewCategory] = useState("other");

  const fetchFaqs = () => {
    const url = statusFilter === "all"
      ? `/api/faq?restaurantId=${restaurantId}`
      : `/api/faq?restaurantId=${restaurantId}&status=${statusFilter}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => { setFaqs(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchFaqs(); }, [restaurantId, statusFilter]);

  const handleAnswer = async (id: string) => {
    if (!answerDraft.trim()) return;
    await fetch("/api/faq", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, answer: answerDraft }),
    });
    setEditingId(null);
    setAnswerDraft("");
    fetchFaqs();
  };

  const handleIgnore = async (id: string) => {
    await fetch("/api/faq", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "ignored" }),
    });
    fetchFaqs();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/faq?id=${id}`, { method: "DELETE" });
    fetchFaqs();
  };

  const handleAdd = async () => {
    if (!newQuestion.trim()) return;
    await fetch("/api/faq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId,
        question: newQuestion,
        category: newCategory,
      }),
    });
    // If answer provided, patch it
    if (newAnswer.trim()) {
      const all = await fetch(`/api/faq?restaurantId=${restaurantId}`).then((r) => r.json());
      const newest = all.find((f: any) => f.question === newQuestion);
      if (newest) {
        await fetch("/api/faq", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: newest.id, answer: newAnswer }),
        });
      }
    }
    setShowAdd(false);
    setNewQuestion("");
    setNewAnswer("");
    setNewCategory("other");
    fetchFaqs();
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">FAQ</h4>
          <small className="text-muted">
            {faqs.length} question(s) · {faqs.filter((f) => f.status === "pending").length} en attente
          </small>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <i className="bi bi-plus-lg me-1"></i>Ajouter
        </button>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setShowAdd(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title">Ajouter une FAQ</h6>
                <button className="btn-close" onClick={() => setShowAdd(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Question</label>
                  <textarea className="form-control" rows={2} value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label">Réponse <small className="text-muted">(optionnel)</small></label>
                  <textarea className="form-control" rows={3} value={newAnswer} onChange={(e) => setNewAnswer(e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label">Catégorie</label>
                  <select className="form-select" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>Annuler</button>
                <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!newQuestion.trim()}>Ajouter</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="d-flex gap-2 mb-4 flex-wrap">
        {[{ key: "all", label: "Toutes" }, ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ key: k, label: v.label }))].map(
          ({ key, label }) => (
            <button
              key={key}
              className={`btn btn-sm ${statusFilter === key ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </button>
          )
        )}
      </div>

      {loading ? (
        <div className="text-center py-5"><span className="spinner-border text-primary"></span></div>
      ) : faqs.length === 0 ? (
        <div className="text-center py-5">
          <i className="bi bi-question-circle fs-1 text-muted d-block mb-2"></i>
          <p className="text-muted">Aucune FAQ</p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {faqs.map((faq) => {
            const st = STATUS_LABELS[faq.status] || { label: faq.status, bg: "bg-secondary" };
            const editing = editingId === faq.id;

            return (
              <div key={faq.id} className="card border">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div className="d-flex align-items-center gap-2">
                      <span className={`badge ${st.bg}`}>{st.label}</span>
                      <span className="badge bg-dark bg-opacity-25" style={{ fontSize: "0.65rem" }}>
                        {CATEGORY_LABELS[faq.category] || faq.category}
                      </span>
                      {faq.askCount > 1 && (
                        <small className="text-muted">
                          <i className="bi bi-arrow-repeat me-1"></i>{faq.askCount}x
                        </small>
                      )}
                    </div>
                    <button className="btn btn-sm btn-link text-danger p-0" onClick={() => handleDelete(faq.id)}>
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>

                  <div className="fw-medium mb-2">{faq.question}</div>

                  {faq.answer && !editing && (
                    <div className="bg-dark bg-opacity-10 rounded-3 p-2 mb-2">
                      <small className="text-muted d-block" style={{ fontSize: "0.7rem" }}>Réponse</small>
                      <span style={{ fontSize: "0.9rem" }}>{faq.answer}</span>
                    </div>
                  )}

                  {editing ? (
                    <div className="mt-2">
                      <textarea
                        className="form-control mb-2"
                        rows={3}
                        value={answerDraft}
                        onChange={(e) => setAnswerDraft(e.target.value)}
                        placeholder="Saisissez la réponse..."
                        autoFocus
                      />
                      <div className="d-flex gap-2">
                        <button className="btn btn-primary btn-sm" onClick={() => handleAnswer(faq.id)} disabled={!answerDraft.trim()}>
                          Enregistrer
                        </button>
                        <button className="btn btn-outline-secondary btn-sm" onClick={() => { setEditingId(null); setAnswerDraft(""); }}>
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => { setEditingId(faq.id); setAnswerDraft(faq.answer || ""); }}
                      >
                        <i className="bi bi-pencil me-1"></i>{faq.answer ? "Modifier" : "Répondre"}
                      </button>
                      {faq.status === "pending" && (
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => handleIgnore(faq.id)}>
                          Ignorer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
