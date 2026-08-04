"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  backgroundColor: "rgba(26, 26, 26, 0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
};

const modalStyle: CSSProperties = {
  maxWidth: "540px",
  width: "100%",
  maxHeight: "85vh",
  display: "flex",
  flexDirection: "column",
};

const bodyStyle: CSSProperties = {
  overflowY: "auto",
  padding: "0.25rem 0.1rem 0.5rem",
};

export function Modal({ title, onClose, children, wide = false }: ModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      style={overlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`card modal ${wide ? "modal-wide" : ""}`}
        style={modalStyle}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.6rem",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.2rem" }}>{title}</h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <div style={bodyStyle}>{children}</div>
      </div>
    </div>
  );
}
