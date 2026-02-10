"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface DiningTable {
  id: string;
  tableNumber: string;
  seats: number;
  isActive: boolean;
}

interface DiningRoom {
  id: string;
  name: string;
  description: string | null;
  tables: DiningTable[];
}

export default function SallesPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [rooms, setRooms] = useState<DiningRoom[]>([]);
  const [loading, setLoading] = useState(true);

  // New room form
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDesc, setNewRoomDesc] = useState("");

  // New table form (per room)
  const [addingTableRoomId, setAddingTableRoomId] = useState<string | null>(null);
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableSeats, setNewTableSeats] = useState(4);

  // Edit room
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoomName, setEditRoomName] = useState("");

  const fetchRooms = () => {
    fetch(`/api/rooms?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((data) => {
        setRooms(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchRooms();
  }, [restaurantId]);

  const totalSeats = rooms.reduce(
    (sum, r) => sum + r.tables.filter((t) => t.isActive).reduce((s, t) => s + t.seats, 0),
    0
  );

  const totalTables = rooms.reduce(
    (sum, r) => sum + r.tables.filter((t) => t.isActive).length,
    0
  );

  // ── Room CRUD ──
  const addRoom = async () => {
    if (!newRoomName.trim()) return;
    await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId,
        name: newRoomName.trim(),
        description: newRoomDesc.trim() || null,
      }),
    });
    setNewRoomName("");
    setNewRoomDesc("");
    fetchRooms();
  };

  const updateRoom = async (id: string) => {
    await fetch("/api/rooms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: editRoomName }),
    });
    setEditingRoomId(null);
    fetchRooms();
  };

  const deleteRoom = async (id: string) => {
    await fetch(`/api/rooms?id=${id}`, { method: "DELETE" });
    fetchRooms();
  };

  // ── Table CRUD ──
  const addTable = async (roomId: string) => {
    if (!newTableNumber.trim() || newTableSeats < 1) return;
    await fetch("/api/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId,
        diningRoomId: roomId,
        tableNumber: newTableNumber.trim(),
        seats: newTableSeats,
      }),
    });
    setAddingTableRoomId(null);
    setNewTableNumber("");
    setNewTableSeats(4);
    fetchRooms();
  };

  const toggleTable = async (tableId: string, isActive: boolean) => {
    await fetch("/api/tables", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tableId, isActive: !isActive }),
    });
    fetchRooms();
  };

  const deleteTable = async (tableId: string) => {
    await fetch(`/api/tables?id=${tableId}`, { method: "DELETE" });
    fetchRooms();
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Salles & Tables</h4>
          <small className="text-muted">
            {rooms.length} salle(s) · {totalTables} table(s) · {totalSeats} places
          </small>
        </div>
      </div>

      {/* Ajouter une salle */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="row g-2 align-items-end">
            <div className="col-md-4">
              <label className="form-label">Nom de la salle</label>
              <input
                className="form-control"
                placeholder="Ex: Salle principale, Terrasse..."
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addRoom()}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">Description (optionnel)</label>
              <input
                className="form-control"
                placeholder="Ex: RDC, interieur climatise..."
                value={newRoomDesc}
                onChange={(e) => setNewRoomDesc(e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <button
                className="btn btn-primary w-100"
                disabled={!newRoomName.trim()}
                onClick={addRoom}
              >
                <i className="bi bi-plus-lg me-1"></i>Ajouter une salle
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <span className="spinner-border text-primary"></span>
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-5">
          <i className="bi bi-door-open fs-1 text-muted d-block mb-2"></i>
          <p className="text-muted">Aucune salle configuree</p>
          <p className="text-muted small">Ajoutez une salle puis des tables pour gerer vos reservations.</p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-4">
          {rooms.map((room) => (
            <div key={room.id} className="card">
              <div className="card-header d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-2">
                  <i className="bi bi-door-open"></i>
                  {editingRoomId === room.id ? (
                    <div className="d-flex gap-2">
                      <input
                        className="form-control form-control-sm"
                        value={editRoomName}
                        onChange={(e) => setEditRoomName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && updateRoom(room.id)}
                        autoFocus
                      />
                      <button className="btn btn-sm btn-primary" onClick={() => updateRoom(room.id)}>
                        <i className="bi bi-check"></i>
                      </button>
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingRoomId(null)}>
                        <i className="bi bi-x"></i>
                      </button>
                    </div>
                  ) : (
                    <>
                      <strong>{room.name}</strong>
                      {room.description && (
                        <small className="text-muted">— {room.description}</small>
                      )}
                    </>
                  )}
                </div>
                <div className="d-flex gap-1">
                  <small className="text-muted me-2">
                    {room.tables.length} table(s) ·{" "}
                    {room.tables.filter((t) => t.isActive).reduce((s, t) => s + t.seats, 0)} places
                  </small>
                  {editingRoomId !== room.id && (
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => {
                        setEditingRoomId(room.id);
                        setEditRoomName(room.name);
                      }}
                    >
                      <i className="bi bi-pencil"></i>
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => deleteRoom(room.id)}
                    title="Supprimer la salle"
                  >
                    <i className="bi bi-trash"></i>
                  </button>
                </div>
              </div>

              <div className="card-body">
                {/* Tables list */}
                {room.tables.length > 0 ? (
                  <div className="table-responsive">
                    <table className="table table-sm mb-0">
                      <thead>
                        <tr>
                          <th>Table</th>
                          <th>Places</th>
                          <th>Statut</th>
                          <th style={{ width: 100 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {room.tables.map((table) => (
                          <tr key={table.id} className={table.isActive ? "" : "text-muted"}>
                            <td>
                              <i className="bi bi-grid-3x3 me-1"></i>
                              Table {table.tableNumber}
                            </td>
                            <td>
                              <i className="bi bi-people me-1"></i>
                              {table.seats}
                            </td>
                            <td>
                              <span
                                className={`badge ${table.isActive ? "bg-success" : "bg-secondary"}`}
                                style={{ cursor: "pointer" }}
                                onClick={() => toggleTable(table.id, table.isActive)}
                              >
                                {table.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td className="text-end">
                              <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => deleteTable(table.id)}
                              >
                                <i className="bi bi-trash"></i>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-muted mb-3 small">Aucune table dans cette salle</p>
                )}

                {/* Add table form */}
                {addingTableRoomId === room.id ? (
                  <div className="d-flex gap-2 mt-2 align-items-end">
                    <div>
                      <label className="form-label small">Numero</label>
                      <input
                        className="form-control form-control-sm"
                        placeholder="Ex: 1, A1..."
                        value={newTableNumber}
                        onChange={(e) => setNewTableNumber(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="form-label small">Places</label>
                      <input
                        className="form-control form-control-sm"
                        type="number"
                        min={1}
                        value={newTableSeats}
                        onChange={(e) => setNewTableSeats(parseInt(e.target.value) || 1)}
                        style={{ width: 80 }}
                      />
                    </div>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={!newTableNumber.trim()}
                      onClick={() => addTable(room.id)}
                    >
                      <i className="bi bi-check me-1"></i>Ajouter
                    </button>
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => setAddingTableRoomId(null)}
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-sm btn-outline-primary mt-2"
                    onClick={() => {
                      setAddingTableRoomId(room.id);
                      setNewTableNumber("");
                      setNewTableSeats(4);
                    }}
                  >
                    <i className="bi bi-plus me-1"></i>Ajouter une table
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
