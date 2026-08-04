export function Spinner({ label = "Chargement…" }: { label?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.6rem",
        padding: "2rem 1rem",
        color: "var(--muted)",
        fontStyle: "italic",
      }}
    >
      <span
        className="spinner"
        style={{
          width: "1.2rem",
          height: "1.2rem",
          border: "3px solid var(--ink)",
          borderTopColor: "transparent",
          borderRadius: "50%",
          display: "inline-block",
          animation: "spin 0.7s linear infinite",
        }}
      />
      {label}
    </div>
  );
}
