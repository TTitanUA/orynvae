import "./StatusPill.css";

type StatusPillTone = "neutral" | "ready" | "warning" | "danger";

type StatusPillProps = {
  label: string;
  tone?: StatusPillTone;
};

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  return <span className={`status-pill status-pill--${tone}`}>{label}</span>;
}

