"use client";

import { useState, useRef, useTransition } from "react";
import * as XLSX from "xlsx";
import { fetchFaqs, addFaq, updateFaq, deleteFaq, importFaqs } from "./actions";

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

interface FaqClientProps {
  restaurantId: string;
  initialFaqs: FaqItem[];
}

export default function FaqClient({ restaurantId, initialFaqs }: FaqClientProps) {
  const [faqs, setFaqs] = useState<FaqItem[]>(initialFaqs);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [newCategory, setNewCategory] = useState("other");
  const importRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const reload = (status?: string) => {
    startTransition(async () => {
      const data = await fetchFaqs(restaurantId, status || statusFilter);
      setFaqs(Array.isArray(data) ? data : []);
    });
  };

  const handleFilterChange = (filter: string) => {
    setStatusFilter(filter);
    reload(filter);
  };

  const handleAnswer = async (id: string) => {
    if (!answerDraft.trim()) return;
    await updateFaq(restaurantId, id, { answer: answerDraft });
    setEditingId(null);
    setAnswerDraft("");
    reload();
  };

  const handleIgnore = async (id: string) => {
    await updateFaq(restaurantId, id, { status: "ignored" });
    reload();
  };

  const handleDelete = async (id: string) => {
    await deleteFaq(restaurantId, id);
    reload();
  };

  const handleAdd = async () => {
    if (!newQuestion.trim()) return;
    await addFaq(restaurantId, newQuestion, newCategory, newAnswer || undefined);
    setShowAdd(false);
    setNewQuestion("");
    setNewAnswer("");
    setNewCategory("other");
    reload();
  };

  const handleImport = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

      const items = rows
        .map((row) => ({
          question: String(row.question || row.Question || row.QUESTION || "").trim(),
          answer: String(row.answer || row.Answer || row.ANSWER || row.réponse || row.Réponse || "").trim() || undefined,
          category: String(row.category || row.Category || row.catégorie || row.Catégorie || "other").trim(),
        }))
        .filter((item) => item.question);

      if (items.length === 0) {
        alert("Aucune ligne valide trouvée (colonne 'question' requise)");
        return;
      }

      const result = await importFaqs(restaurantId, items);
      alert(`Import : ${result.created} créées, ${result.updated} existantes`);
      reload();
    } catch {
      alert("Erreur lors de l'import");
    }
  };

  const sanitizeCell = (v: string) =>
    /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;

  const handleExport = () => {
    if (faqs.length === 0) {
      alert("Aucune FAQ à exporter");
      return;
    }

    const rows = faqs.map((f) => ({
      question: sanitizeCell(f.question),
      answer: sanitizeCell(f.answer || ""),
      category: f.category,
      status: f.status,
      askCount: f.askCount,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "FAQ");
    XLSX.writeFile(wb, "faq-export.xlsx");
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
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary btn-sm" onClick={handleExport} title="Exporter en XLS">
            <i className="bi bi-download me-1"></i>Export XLS
          </button>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => importRef.current?.click()} title="Importer CSV ou XLS">
            <i className="bi bi-upload me-1"></i>Import
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            className="d-none"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
              e.target.value = "";
            }}
          />
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            <i className="bi bi-plus-lg me-1"></i>Ajouter
          </button>
        </div>
      </div>

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

      <div className="d-flex gap-2 mb-4 flex-wrap">
        {[{ key: "all", label: "Toutes" }, ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ key: k, label: v.label }))].map(
          ({ key, label }) => (
            <button
              key={key}
              className={`btn btn-sm ${statusFilter === key ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => handleFilterChange(key)}
            >
              {label}
            </button>
          )
        )}
      </div>

      {isPending ? (
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
