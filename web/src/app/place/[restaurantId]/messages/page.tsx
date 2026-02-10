"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  callback_request: { label: "Rappel demande", icon: "bi-telephone-forward" },
  complaint: { label: "Reclamation", icon: "bi-exclamation-triangle" },
  info_request: { label: "Demande d'info", icon: "bi-info-circle" },
  special_request: { label: "Demande speciale", icon: "bi-star" },
  other: { label: "Autre", icon: "bi-chat-dots" },
};

export default function MessagesPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("unread");

  const fetchMessages = () => {
    let url = `/api/messages?restaurantId=${restaurantId}`;
    if (filter === "unread") url += "&unreadOnly=true";
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setMessages(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchMessages();
  }, [restaurantId, filter]);

  const handleToggleRead = async (id: string, isRead: boolean) => {
    await fetch("/api/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isRead: !isRead }),
    });
    fetchMessages();
  };

  const handleToggleUrgent = async (id: string, isUrgent: boolean) => {
    await fetch("/api/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isUrgent: !isUrgent }),
    });
    fetchMessages();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce message ?")) return;
    await fetch(`/api/messages?id=${id}`, { method: "DELETE" });
    fetchMessages();
  };

  const handleMarkAllRead = async () => {
    const unread = messages.filter((m) => !m.isRead);
    for (const m of unread) {
      await fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, isRead: true }),
      });
    }
    fetchMessages();
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return (
      date.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      }) +
      " " +
      date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    );
  };

  const unreadCount = messages.filter((m) => !m.isRead).length;

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">
            <i className="bi bi-envelope me-2"></i>Messages
          </h4>
          <small className="text-muted">
            {messages.length} message(s){" "}
            {unreadCount > 0 && (
              <span className="badge bg-danger ms-1">{unreadCount} non lu(s)</span>
            )}
          </small>
        </div>
        <div className="d-flex gap-2">
          <div className="btn-group">
            <button
              className={`btn btn-sm ${filter === "unread" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setFilter("unread")}
            >
              Non lus
            </button>
            <button
              className={`btn btn-sm ${filter === "all" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setFilter("all")}
            >
              Tous
            </button>
          </div>
          {unreadCount > 0 && (
            <button
              className="btn btn-sm btn-outline-primary"
              onClick={handleMarkAllRead}
            >
              <i className="bi bi-check-all me-1"></i>Tout marquer lu
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <span className="spinner-border text-primary"></span>
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-5">
          <i className="bi bi-envelope-open fs-1 text-muted d-block mb-2"></i>
          <p className="text-muted">
            {filter === "unread" ? "Aucun message non lu" : "Aucun message"}
          </p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {messages.map((msg) => {
            const cat = CATEGORY_LABELS[msg.category] || CATEGORY_LABELS.other;

            return (
              <div
                key={msg.id}
                className={`card border ${!msg.isRead ? "border-primary" : ""} ${msg.isUrgent ? "border-danger" : ""}`}
                style={{
                  backgroundColor: !msg.isRead ? "rgba(13,110,253,0.03)" : undefined,
                }}
              >
                <div className="card-body py-3">
                  <div className="d-flex align-items-start gap-3">
                    {/* Status indicator */}
                    <div className="d-flex flex-column align-items-center gap-1" style={{ minWidth: 40 }}>
                      {!msg.isRead && (
                        <span
                          className="bg-primary rounded-circle"
                          style={{ width: 10, height: 10, display: "inline-block" }}
                        ></span>
                      )}
                      {msg.isUrgent && (
                        <i className="bi bi-exclamation-triangle-fill text-danger"></i>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-grow-1">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <span className="badge bg-light text-dark border">
                          <i className={`bi ${cat.icon} me-1`}></i>
                          {cat.label}
                        </span>
                        <small className="text-muted">
                          <i className="bi bi-clock me-1"></i>
                          {formatDate(msg.createdAt)}
                        </small>
                      </div>

                      <div className="d-flex align-items-center gap-2 mb-2">
                        {msg.callerName && (
                          <span className="fw-medium">
                            <i className="bi bi-person me-1"></i>
                            {msg.callerName}
                          </span>
                        )}
                        {msg.callerPhone && (
                          <span className="text-muted">
                            <i className="bi bi-telephone me-1"></i>
                            {msg.callerPhone}
                          </span>
                        )}
                      </div>

                      <p className="mb-0" style={{ whiteSpace: "pre-line" }}>
                        {msg.content}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="d-flex flex-column gap-1">
                      <button
                        className={`btn btn-sm ${msg.isRead ? "btn-outline-primary" : "btn-primary"}`}
                        title={msg.isRead ? "Marquer non lu" : "Marquer lu"}
                        onClick={() => handleToggleRead(msg.id, msg.isRead)}
                      >
                        <i className={`bi ${msg.isRead ? "bi-envelope" : "bi-envelope-open"}`}></i>
                      </button>
                      <button
                        className={`btn btn-sm ${msg.isUrgent ? "btn-danger" : "btn-outline-danger"}`}
                        title={msg.isUrgent ? "Retirer urgent" : "Marquer urgent"}
                        onClick={() => handleToggleUrgent(msg.id, msg.isUrgent)}
                      >
                        <i className="bi bi-exclamation-triangle"></i>
                      </button>
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        title="Supprimer"
                        onClick={() => handleDelete(msg.id)}
                      >
                        <i className="bi bi-trash"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
