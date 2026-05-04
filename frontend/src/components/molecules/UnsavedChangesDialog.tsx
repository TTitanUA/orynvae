import { AlertTriangle } from "lucide-react";

import "./UnsavedChangesDialog.css";

type UnsavedChangesDialogProps = {
  onLeave: () => void;
  onStay: () => void;
};

export function UnsavedChangesDialog({ onLeave, onStay }: UnsavedChangesDialogProps) {
  return (
    <div className="unsaved-dialog__backdrop" role="presentation">
      <section
        aria-labelledby="unsaved-dialog-title"
        aria-modal="true"
        className="unsaved-dialog"
        role="dialog"
      >
        <div className="unsaved-dialog__icon" aria-hidden="true">
          <AlertTriangle size={22} />
        </div>
        <div>
          <h2 id="unsaved-dialog-title">Есть несохраненные изменения</h2>
          <p>Если покинуть страницу сейчас, изменения на ней будут потеряны.</p>
        </div>
        <div className="unsaved-dialog__actions">
          <button type="button" onClick={onStay}>
            Остаться
          </button>
          <button className="is-danger" type="button" onClick={onLeave}>
            Покинуть
          </button>
        </div>
      </section>
    </div>
  );
}
