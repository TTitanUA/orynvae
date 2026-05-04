import { Server, ShieldCheck } from "lucide-react";

import { StatusPill } from "../../../shared/ui";
import { getHealthLabel } from "../model/health-labels";
import type { HealthResponse } from "../model/types";
import "./HealthPanel.css";

type HealthPanelProps = {
  health?: HealthResponse;
  error?: string;
};

export function HealthPanel({ health, error }: HealthPanelProps) {
  const tone = error ? "danger" : health?.database_exists ? "ready" : "warning";

  return (
    <section className="health-panel" aria-label="Состояние локального запуска">
      <div className="health-panel__header">
        <div className="health-panel__icon" aria-hidden="true">
          <Server size={18} />
        </div>
        <div>
          <h2>Локальный запуск</h2>
          <p>Backend: localhost:9001 · Frontend: localhost:9002</p>
        </div>
        <StatusPill label={getHealthLabel(health, error)} tone={tone} />
      </div>

      <dl className="health-panel__grid">
        <div>
          <dt>API</dt>
          <dd>{health ? "/api/health" : "ожидание ответа"}</dd>
        </div>
        <div>
          <dt>Данные</dt>
          <dd>{health?.data_dir ?? "локальная папка data"}</dd>
        </div>
        <div>
          <dt>SQLite</dt>
          <dd>{health?.database_path ?? "data/app.db"}</dd>
        </div>
      </dl>

      <div className="health-panel__note">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>Runtime-данные остаются локально и не попадают в git.</span>
      </div>
    </section>
  );
}
