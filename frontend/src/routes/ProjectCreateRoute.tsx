import { FormEvent, useEffect, useMemo, useState } from "react";
import Markdown from "react-markdown";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Eye,
  FileText,
  PencilLine,
  Save,
  Sparkles,
  Wand2,
} from "lucide-react";

import {
  ApiError,
  analyzeProjectSetup,
  createProjectFromSetup,
} from "../api/projects";
import {
  allowedModels,
  defaultModelFor,
  enabledProviders,
  fetchProviders,
  preferredProvider,
  providerScopeLabel,
} from "../api/providers";
import { AppShell } from "../components/templates/AppShell";
import type { ProjectSetupAnalysis } from "../types/projects";
import type { Provider } from "../types/providers";
import "./ProjectCreateRoute.css";

type DraftState = {
  name: string;
  description: string;
  synopsis: string;
  genre: string;
  tone: string;
  setting: string;
  format: string;
  centralConflict: string;
  themes: string;
  directions: string[];
  selectedDirection: string;
  targetLength: string;
  pointOfView: string;
};

type CreateField = keyof DraftState | "ideaText" | "selectedProviderId" | "selectedModelId";
type FieldErrors = Partial<Record<CreateField, string>>;

const emptyDraft: DraftState = {
  name: "",
  description: "",
  synopsis: "",
  genre: "",
  tone: "",
  setting: "",
  format: "",
  centralConflict: "",
  themes: "",
  directions: [],
  selectedDirection: "",
  targetLength: "",
  pointOfView: "",
};

const apiFieldMap: Record<string, CreateField> = {
  name: "name",
  idea_text: "ideaText",
  description: "description",
  synopsis: "synopsis",
  genre: "genre",
  tone: "tone",
  setting: "setting",
  format: "format",
  central_conflict: "centralConflict",
  themes: "themes",
  directions: "directions",
  selected_direction: "selectedDirection",
  target_length: "targetLength",
  point_of_view: "pointOfView",
  provider_id: "selectedProviderId",
  model_id: "selectedModelId",
};

function draftFromAnalysis(analysis: ProjectSetupAnalysis): DraftState {
  return {
    name: analysis.title,
    description: analysis.description,
    synopsis: analysis.synopsis,
    genre: analysis.genre,
    tone: analysis.tone,
    setting: analysis.setting,
    format: analysis.format,
    centralConflict: analysis.central_conflict,
    themes: analysis.themes.join(", "),
    directions: analysis.directions,
    selectedDirection: analysis.directions[0] || "",
    targetLength: analysis.target_length || "",
    pointOfView: analysis.point_of_view || "",
  };
}

function splitThemes(value: string): string[] {
  return value
    .split(",")
    .map((theme) => theme.trim())
    .filter(Boolean);
}

function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

function maxLengthError(value: string, maxLength: number, label: string): string | undefined {
  return value.trim().length > maxLength
    ? `${label} не должно быть длиннее ${maxLength} символов.`
    : undefined;
}

function mapApiFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError)) {
    return {};
  }

  return Object.entries(error.fieldErrors).reduce<FieldErrors>((errors, [apiField, message]) => {
    const formField = apiFieldMap[apiField];
    if (formField) {
      errors[formField] = message;
    }
    return errors;
  }, {});
}

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function ProjectCreateRoute() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [ideaText, setIdeaText] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [createdProjectId, setCreatedProjectId] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId),
    [providers, selectedProviderId],
  );
  const selectedAllowedModels = useMemo(() => allowedModels(selectedProvider), [selectedProvider]);

  useEffect(() => {
    let isCurrent = true;

    fetchProviders()
      .then((nextProviders) => {
        if (!isCurrent) {
          return;
        }
        setProviders(nextProviders);
        const firstReadyProvider = preferredProvider(nextProviders);
        if (firstReadyProvider) {
          setSelectedProviderId(firstReadyProvider.id);
          setSelectedModelId(defaultModelFor(firstReadyProvider));
        }
      })
      .catch((reason) => {
        if (isCurrent) {
          setError(reason instanceof Error ? reason.message : "Не удалось загрузить провайдеры.");
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoadingProviders(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  function clearFieldError(field: CreateField) {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function updateDraftField<K extends keyof DraftState>(field: K, value: DraftState[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    clearFieldError(field);
  }

  function updateIdeaText(value: string) {
    setIdeaText(value);
    clearFieldError("ideaText");
  }

  function updateProvider(providerId: string) {
    const provider = providers.find((item) => item.id === providerId);
    setSelectedProviderId(providerId);
    setSelectedModelId(defaultModelFor(provider));
    clearFieldError("selectedProviderId");
    clearFieldError("selectedModelId");
  }

  function validateAnalysis(): FieldErrors {
    const nextErrors: FieldErrors = {};
    if (!ideaText.trim()) {
      nextErrors.ideaText = "Опишите идею проекта.";
    }
    const ideaError = maxLengthError(ideaText, 12000, "Идея");
    if (ideaError) {
      nextErrors.ideaText = ideaError;
    }
    if (selectedProviderId && !selectedModelId) {
      nextErrors.selectedModelId = "Выберите модель для провайдера.";
    }
    return nextErrors;
  }

  function validateCreate(): FieldErrors {
    const nextErrors = validateAnalysis();
    if (!draft.name.trim()) {
      nextErrors.name = "Укажите название проекта.";
    }

    const maxLengthErrors: FieldErrors = {
      name: maxLengthError(draft.name, 120, "Название"),
      description: maxLengthError(draft.description, 1200, "Короткое описание"),
      synopsis: maxLengthError(draft.synopsis, 5000, "Синопсис"),
      genre: maxLengthError(draft.genre, 1200, "Жанр"),
      tone: maxLengthError(draft.tone, 1200, "Тон"),
      setting: maxLengthError(draft.setting, 5000, "Сеттинг"),
      format: maxLengthError(draft.format, 1200, "Формат"),
      centralConflict: maxLengthError(draft.centralConflict, 5000, "Главный конфликт"),
      targetLength: maxLengthError(draft.targetLength, 1200, "Объем"),
      pointOfView: maxLengthError(draft.pointOfView, 1200, "POV"),
    };

    Object.entries(maxLengthErrors).forEach(([field, fieldError]) => {
      if (fieldError) {
        nextErrors[field as CreateField] = fieldError;
      }
    });

    return nextErrors;
  }

  async function runAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validateAnalysis();
    if (hasErrors(validationErrors)) {
      setFieldErrors(validationErrors);
      setError("Проверьте поля идеи.");
      setNotice(undefined);
      return;
    }

    setAnalyzing(true);
    setError(undefined);
    setNotice(undefined);
    setWarnings([]);
    setCreatedProjectId(undefined);
    setFieldErrors({});
    try {
      const analysis = await analyzeProjectSetup({
        idea_text: ideaText.trim(),
        provider_id: selectedProviderId || undefined,
        model_id: selectedModelId || undefined,
      });
      setDraft(draftFromAnalysis(analysis));
      setWarnings(analysis.warnings);
      setNotice("Заготовка проекта готова.");
    } catch (reason) {
      const apiFieldErrors = mapApiFieldErrors(reason);
      setFieldErrors(apiFieldErrors);
      setError(
        hasErrors(apiFieldErrors)
          ? "Проверьте поля идеи."
          : messageFromError(reason, "AI Project Setup не выполнился."),
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validateCreate();
    if (hasErrors(validationErrors)) {
      setFieldErrors(validationErrors);
      setError("Проверьте поля формы.");
      setNotice(undefined);
      return;
    }

    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    setCreatedProjectId(undefined);
    setFieldErrors({});
    const hasProviderModel = Boolean(selectedProviderId && selectedModelId);
    try {
      const project = await createProjectFromSetup({
        name: draft.name.trim(),
        idea_text: ideaText.trim(),
        description: draft.description.trim() || undefined,
        synopsis: draft.synopsis.trim() || undefined,
        genre: draft.genre.trim() || undefined,
        tone: draft.tone.trim() || undefined,
        setting: draft.setting.trim() || undefined,
        format: draft.format.trim() || undefined,
        central_conflict: draft.centralConflict.trim() || undefined,
        themes: splitThemes(draft.themes),
        directions: draft.directions,
        selected_direction: draft.selectedDirection || undefined,
        target_length: draft.targetLength.trim() || undefined,
        point_of_view: draft.pointOfView.trim() || undefined,
        provider_id: hasProviderModel ? selectedProviderId : undefined,
        model_id: hasProviderModel ? selectedModelId : undefined,
      });
      setCreatedProjectId(project.id);
      setNotice(`${project.name}: проект создан.`);
    } catch (reason) {
      const apiFieldErrors = mapApiFieldErrors(reason);
      setFieldErrors(apiFieldErrors);
      setError(
        hasErrors(apiFieldErrors)
          ? "Проверьте поля формы."
          : messageFromError(reason, "Не удалось создать проект."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="project-create-route">
        <header className="project-create-route__header">
          <div>
            <p className="project-create-route__eyebrow">Новый проект</p>
            <h1>Создание проекта</h1>
          </div>
          <Link className="project-create-route__back-link" to="/projects">
            Все проекты
          </Link>
        </header>

        {(error || notice) && (
          <div className={`project-create-route__message ${error ? "is-error" : "is-ready"}`}>
            <span>{error || notice}</span>
            {createdProjectId && !error && (
              <Link to={`/projects/${encodeURIComponent(createdProjectId)}/workspace`}>
                <PencilLine size={16} aria-hidden="true" />
                Рабочая область
              </Link>
            )}
          </div>
        )}

        <div className="project-create-route__layout">
          <form className="project-idea-panel" onSubmit={runAnalysis}>
            <div className="project-create-route__section-title">
              <Wand2 size={18} aria-hidden="true" />
              <h2>Идея</h2>
            </div>

            <label
              className={`project-create-field ${fieldErrors.ideaText ? "has-error" : ""}`}
              htmlFor="project-idea"
            >
              Идея проекта
            </label>
            <div className="project-idea-panel__markdown">
              <div className="project-idea-panel__editor">
                <div className="project-idea-panel__subhead">
                  <PencilLine size={16} aria-hidden="true" />
                  <span>Markdown</span>
                </div>
                <textarea
                  id="project-idea"
                  name="project-idea"
                  value={ideaText}
                  onChange={(event) => updateIdeaText(event.target.value)}
                  placeholder="Например: героиня возвращается в город, где воспоминания хранятся как официальные документы."
                  rows={13}
                  aria-invalid={Boolean(fieldErrors.ideaText)}
                  aria-describedby={fieldErrors.ideaText ? "project-idea-error" : undefined}
                />
              </div>
              <div className="project-idea-panel__preview" aria-label="Предпросмотр идеи">
                <div className="project-idea-panel__subhead">
                  <Eye size={16} aria-hidden="true" />
                  <span>Предпросмотр</span>
                </div>
                <div className="project-idea-panel__markdown-body">
                  {ideaText.trim() ? (
                    <Markdown>{ideaText}</Markdown>
                  ) : (
                    <p className="project-idea-panel__placeholder">Предпросмотр появится здесь.</p>
                  )}
                </div>
              </div>
            </div>
            {fieldErrors.ideaText && (
              <p className="project-create-field__error" id="project-idea-error">
                {fieldErrors.ideaText}
              </p>
            )}

            <div className="project-create-route__provider-row">
              <label
                className={`project-create-field ${
                  fieldErrors.selectedProviderId ? "has-error" : ""
                }`}
              >
                Провайдер
                <select
                  id="project-provider"
                  name="project-provider"
                  value={selectedProviderId}
                  onChange={(event) => updateProvider(event.target.value)}
                  disabled={loadingProviders}
                  aria-invalid={Boolean(fieldErrors.selectedProviderId)}
                  aria-describedby={
                    fieldErrors.selectedProviderId ? "project-provider-error" : undefined
                  }
                >
                  <option value="">Без AI</option>
                  {enabledProviders(providers).map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} · {providerScopeLabel(provider)}
                    </option>
                  ))}
                </select>
                {fieldErrors.selectedProviderId && (
                  <span className="project-create-field__error" id="project-provider-error">
                    {fieldErrors.selectedProviderId}
                  </span>
                )}
              </label>
              <label
                className={`project-create-field ${
                  fieldErrors.selectedModelId ? "has-error" : ""
                }`}
              >
                Модель
                <select
                  id="project-model"
                  name="project-model"
                  value={selectedModelId}
                  onChange={(event) => {
                    setSelectedModelId(event.target.value);
                    clearFieldError("selectedModelId");
                  }}
                  disabled={!selectedProvider}
                  aria-invalid={Boolean(fieldErrors.selectedModelId)}
                  aria-describedby={fieldErrors.selectedModelId ? "project-model-error" : undefined}
                >
                  <option value="">Не выбрана</option>
                  {selectedAllowedModels.map((model) => (
                    <option key={model.id} value={model.model_id}>
                      {model.display_name}
                    </option>
                  ))}
                  {selectedModelId &&
                    !selectedAllowedModels.some((model) => model.model_id === selectedModelId) && (
                      <option value={selectedModelId}>{selectedModelId} (legacy)</option>
                    )}
                </select>
                {fieldErrors.selectedModelId && (
                  <span className="project-create-field__error" id="project-model-error">
                    {fieldErrors.selectedModelId}
                  </span>
                )}
              </label>
            </div>

            {selectedProvider?.is_external && (
              <p className="project-create-route__note">
                Текст идеи будет отправлен внешнему провайдеру {selectedProvider.name}.
              </p>
            )}

            <button className="project-create-route__button is-primary" disabled={analyzing}>
              <Sparkles size={16} aria-hidden="true" />
              {analyzing ? "Анализ" : "Разобрать идею"}
            </button>
          </form>

          <form className="project-draft-panel" onSubmit={saveProject}>
            <div className="project-create-route__section-title">
              <FileText size={18} aria-hidden="true" />
              <h2>Форма создания</h2>
            </div>

            {warnings.length > 0 && (
              <div className="project-create-route__warnings">
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}

            <div className="project-draft-panel__grid">
              <label
                className={`project-create-field ${fieldErrors.name ? "has-error" : ""}`}
                htmlFor="project-name"
              >
                Название
                <input
                  id="project-name"
                  name="project-name"
                  value={draft.name}
                  onChange={(event) => updateDraftField("name", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? "project-name-error" : undefined}
                />
                {fieldErrors.name && (
                  <span className="project-create-field__error" id="project-name-error">
                    {fieldErrors.name}
                  </span>
                )}
              </label>
              <label
                className={`project-create-field ${fieldErrors.format ? "has-error" : ""}`}
                htmlFor="project-format"
              >
                Формат
                <input
                  id="project-format"
                  name="project-format"
                  value={draft.format}
                  onChange={(event) => updateDraftField("format", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.format)}
                  aria-describedby={fieldErrors.format ? "project-format-error" : undefined}
                />
                {fieldErrors.format && (
                  <span className="project-create-field__error" id="project-format-error">
                    {fieldErrors.format}
                  </span>
                )}
              </label>
              <label
                className={`project-create-field ${fieldErrors.genre ? "has-error" : ""}`}
                htmlFor="project-genre"
              >
                Жанр
                <input
                  id="project-genre"
                  name="project-genre"
                  value={draft.genre}
                  onChange={(event) => updateDraftField("genre", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.genre)}
                  aria-describedby={fieldErrors.genre ? "project-genre-error" : undefined}
                />
                {fieldErrors.genre && (
                  <span className="project-create-field__error" id="project-genre-error">
                    {fieldErrors.genre}
                  </span>
                )}
              </label>
              <label
                className={`project-create-field ${fieldErrors.tone ? "has-error" : ""}`}
                htmlFor="project-tone"
              >
                Тон
                <input
                  id="project-tone"
                  name="project-tone"
                  value={draft.tone}
                  onChange={(event) => updateDraftField("tone", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.tone)}
                  aria-describedby={fieldErrors.tone ? "project-tone-error" : undefined}
                />
                {fieldErrors.tone && (
                  <span className="project-create-field__error" id="project-tone-error">
                    {fieldErrors.tone}
                  </span>
                )}
              </label>
            </div>

            <label
              className={`project-create-field ${fieldErrors.setting ? "has-error" : ""}`}
              htmlFor="project-setting"
            >
              Сеттинг
              <input
                id="project-setting"
                name="project-setting"
                value={draft.setting}
                onChange={(event) => updateDraftField("setting", event.target.value)}
                aria-invalid={Boolean(fieldErrors.setting)}
                aria-describedby={fieldErrors.setting ? "project-setting-error" : undefined}
              />
              {fieldErrors.setting && (
                <span className="project-create-field__error" id="project-setting-error">
                  {fieldErrors.setting}
                </span>
              )}
            </label>

            <label
              className={`project-create-field ${fieldErrors.description ? "has-error" : ""}`}
              htmlFor="project-description"
            >
              Короткое описание
              <input
                id="project-description"
                name="project-description"
                value={draft.description}
                onChange={(event) => updateDraftField("description", event.target.value)}
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby={
                  fieldErrors.description ? "project-description-error" : undefined
                }
              />
              {fieldErrors.description && (
                <span className="project-create-field__error" id="project-description-error">
                  {fieldErrors.description}
                </span>
              )}
            </label>

            <label
              className={`project-create-field ${fieldErrors.synopsis ? "has-error" : ""}`}
              htmlFor="project-synopsis"
            >
              Синопсис
              <textarea
                id="project-synopsis"
                name="project-synopsis"
                value={draft.synopsis}
                onChange={(event) => updateDraftField("synopsis", event.target.value)}
                rows={5}
                aria-invalid={Boolean(fieldErrors.synopsis)}
                aria-describedby={fieldErrors.synopsis ? "project-synopsis-error" : undefined}
              />
              {fieldErrors.synopsis && (
                <span className="project-create-field__error" id="project-synopsis-error">
                  {fieldErrors.synopsis}
                </span>
              )}
            </label>

            <label
              className={`project-create-field ${
                fieldErrors.centralConflict ? "has-error" : ""
              }`}
              htmlFor="project-central-conflict"
            >
              Главный конфликт
              <textarea
                id="project-central-conflict"
                name="project-central-conflict"
                value={draft.centralConflict}
                onChange={(event) => updateDraftField("centralConflict", event.target.value)}
                rows={3}
                aria-invalid={Boolean(fieldErrors.centralConflict)}
                aria-describedby={
                  fieldErrors.centralConflict ? "project-central-conflict-error" : undefined
                }
              />
              {fieldErrors.centralConflict && (
                <span className="project-create-field__error" id="project-central-conflict-error">
                  {fieldErrors.centralConflict}
                </span>
              )}
            </label>

            <div className="project-draft-panel__grid">
              <label
                className={`project-create-field ${fieldErrors.themes ? "has-error" : ""}`}
                htmlFor="project-themes"
              >
                Темы
                <input
                  id="project-themes"
                  name="project-themes"
                  value={draft.themes}
                  onChange={(event) => updateDraftField("themes", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.themes)}
                  aria-describedby={fieldErrors.themes ? "project-themes-error" : undefined}
                />
                {fieldErrors.themes && (
                  <span className="project-create-field__error" id="project-themes-error">
                    {fieldErrors.themes}
                  </span>
                )}
              </label>
              <label
                className={`project-create-field ${fieldErrors.targetLength ? "has-error" : ""}`}
                htmlFor="project-target-length"
              >
                Объем
                <input
                  id="project-target-length"
                  name="project-target-length"
                  value={draft.targetLength}
                  onChange={(event) => updateDraftField("targetLength", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.targetLength)}
                  aria-describedby={
                    fieldErrors.targetLength ? "project-target-length-error" : undefined
                  }
                />
                {fieldErrors.targetLength && (
                  <span className="project-create-field__error" id="project-target-length-error">
                    {fieldErrors.targetLength}
                  </span>
                )}
              </label>
              <label
                className={`project-create-field ${fieldErrors.pointOfView ? "has-error" : ""}`}
                htmlFor="project-point-of-view"
              >
                POV
                <input
                  id="project-point-of-view"
                  name="project-point-of-view"
                  value={draft.pointOfView}
                  onChange={(event) => updateDraftField("pointOfView", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.pointOfView)}
                  aria-describedby={
                    fieldErrors.pointOfView ? "project-point-of-view-error" : undefined
                  }
                />
                {fieldErrors.pointOfView && (
                  <span className="project-create-field__error" id="project-point-of-view-error">
                    {fieldErrors.pointOfView}
                  </span>
                )}
              </label>
              <label
                className={`project-create-field ${
                  fieldErrors.selectedDirection ? "has-error" : ""
                }`}
                htmlFor="project-selected-direction"
              >
                Направление
                <select
                  id="project-selected-direction"
                  name="project-selected-direction"
                  value={draft.selectedDirection}
                  onChange={(event) => updateDraftField("selectedDirection", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.selectedDirection)}
                  aria-describedby={
                    fieldErrors.selectedDirection ? "project-selected-direction-error" : undefined
                  }
                >
                  <option value="">Не выбрано</option>
                  {draft.directions.map((direction) => (
                    <option key={direction} value={direction}>
                      {direction}
                    </option>
                  ))}
                </select>
                {fieldErrors.selectedDirection && (
                  <span
                    className="project-create-field__error"
                    id="project-selected-direction-error"
                  >
                    {fieldErrors.selectedDirection}
                  </span>
                )}
              </label>
            </div>

            {draft.directions.length > 0 && (
              <div className="project-draft-panel__directions">
                {draft.directions.map((direction) => (
                  <button
                    type="button"
                    key={direction}
                    className={direction === draft.selectedDirection ? "is-selected" : ""}
                    onClick={() => updateDraftField("selectedDirection", direction)}
                  >
                    {direction}
                  </button>
                ))}
              </div>
            )}

            <button className="project-create-route__button is-primary" disabled={saving}>
              {createdProjectId ? (
                <CheckCircle2 size={16} aria-hidden="true" />
              ) : (
                <Save size={16} aria-hidden="true" />
              )}
              {saving ? "Создание" : "Создать проект"}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
