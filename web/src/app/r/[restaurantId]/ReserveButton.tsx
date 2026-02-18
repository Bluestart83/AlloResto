"use client";

export default function ReserveButton() {
  function handleClick() {
    const msg = "Je souhaite réserver une table";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SASChat = (window as any).SASChat;
    if (!SASChat) return;
    try {
      if (typeof SASChat.send === "function") {
        SASChat.send(msg);
      } else {
        SASChat.open();
        window.dispatchEvent(new CustomEvent("sas-chat-send", { detail: { message: msg } }));
      }
    } catch {
      // Widget audio error — fallback: just open
      try { SASChat.open(); } catch { /* ignore */ }
    }
  }

  return (
    <button className="public-reserve-btn w-100 mt-2" onClick={handleClick}>
      <i className="bi bi-calendar-check me-2" />
      Réserver une table
    </button>
  );
}
