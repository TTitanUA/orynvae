import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  FileText,
  FolderKanban,
  Save,
  Sparkles,
  Wand2,
} from "lucide-react";

import {
  analyzeProjectSetup,
  createProjectFromSetup,
  fetchProjects,
  projectStatusLabel,
} from "../api/projects";
import { fetchProviders, providerScopeLabel } from "../api/providers";
import { AppShell } from "../components/templates/AppShell";
import type { Project, ProjectSetupAnalysis } from "../types/projects";
import type { Provider } from "../types/providers";
import "./ProjectsRoute.css";

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

function defaultModelFor(provider?: Provider): string {
  return provider?.default_model_id || provider?.models[0]?.model_id || "";
}

function splitThemes(value: string): string[] {
  return value
    .split(",")
    .map((theme) => theme.trim())
    .filter(Boolean);
}

function settingValue(project: Project, key: string): string {
  const value = project.settings?.settings[key];
  return typeof value === "string" ? value : "";
}

export function ProjectsRoute() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [ideaText, setIdeaText] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [warnings, setWarnings] = useState<string[]>([]);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId),
    [providers, selectedProviderId],
  );

  useEffect(() => {
    let isCurrent = true;

    Promise.all([fetchProjects(), fetchProviders()])
      .then(([nextProjects, nextProviders]) => {
        if (!isCurrent) {
          return;
        }
        setProjects(nextProjects);
        setProviders(nextProviders);
        const firstReadyProvider =
          nextProviders.find((provider) => provider.default_model_id || provider.models.length > 0) ||
          nextProviders[0];
        if (firstReadyProvider) {
          setSelectedProviderId(firstReadyProvider.id);
          setSelectedModelId(defaultModelFor(firstReadyProvider));
        }
      })
      .catch((reason) => {
        if (isCurrent) {
          setError(reason instanceof Error ? reason.message : "Не удалось загрузить проекты");
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  function updateProvider(providerId: string) {
    const provider = providers.find((item) => item.id === providerId);
    setSelectedProviderId(providerId);
    setSelectedModelId(defaultModelFor(provider));
  }

  async function runAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnalyzing(true);
    setError(undefined);
    setNotice(undefined);
    setWarnings([]);
    try {
      const analysis = await analyzeProjectSetup({
        idea_text: ideaText.trim(),
        provider_id: selectedProviderId || undefined,
        model_id: selectedModelId || undefined,
      });
      setDraft(draftFromAnalysis(analysis));
      setWarnings(analysis.warnings);
      setNotice("Заготовка проекта готова");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "AI Project Setup не выполнился");
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveProject() {
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
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
      setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
      setNotice(`${project.name}: проект создан`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось создать проект");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell currentPath="/projects">
      <div className="projects-route">
        <header className="projects-route__header">
          <div>
            <p className="projects-route__eyebrow">MVP · этап 3</p>
            <h1>Проекты и AI Project Setup</h1>
          </div>
          <div className="projects-route__summary" aria-label="Сводка проектов">
            <span>
              <FolderKanban size={16} aria-hidden="true" />
              {projects.length}
            </span>
            <span>
              <Sparkles size={16} aria-hidden="true" />
              {providers.length}
            </span>
            <span>
              <CheckCircle2 size={16} aria-hidden="true" />
              {projects.filter((project) => project.status === "active").length}
            </span>
          </div>
        </header>

        {(error || notice) && (
          <div className={`projects-route__message ${error ? "is-error" : "is-ready"}`}>
            {error || notice}
          </div>
        )}

        <div className="projects-route__layout">
          <form className="project-setup" onSubmit={runAnalysis}>
            <div className="project-setup__title">
              <Wand2 size={18} aria-hidden="true" />
              <h2>Новая история</h2>
            </div>

            <label className="project-setup__idea">
              Идея
              <textarea
                id="project-idea"
                name="project-idea"
                value={ideaText}
                onChange={(event) => setIdeaText(event.target.value)}
                placeholder="Город живет по снам мертвого маяка..."
                rows={7}
              />
            </label>

            <div className="project-setup__provider-row">
              <label>
                Провайдер
                <select
                  id="project-provider"
                  name="project-provider"
                  value={selectedProviderId}
                  onChange={(event) => updateProvider(event.target.value)}
                >
                  <option value="">Без AI</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} · {providerScopeLabel(provider)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Модель
                <select
                  id="project-model"
                  name="project-model"
                  value={selectedModelId}
                  onChange={(event) => setSelectedModelId(event.target.value)}
                  disabled={!selectedProvider}
                >
                  <option value="">Не выбрана</option>
                  {selectedProvider?.models.map((model) => (
                    <option key={model.id} value={model.model_id}>
                      {model.display_name}
                    </option>
                  ))}
                  {selectedProvider?.default_model_id &&
                    !selectedProvider.models.some(
                      (model) => model.model_id === selectedProvider.default_model_id,
                    ) && (
                      <option value={selectedProvider.default_model_id}>
                        {selectedProvider.default_model_id}
                      </option>
                    )}
                </select>
              </label>
            </div>

            {selectedProvider?.is_external && (
              <p className="project-setup__external">
                Текст идеи будет отправлен внешнему провайдеру: {selectedProvider.name}.
              </p>
            )}

            <button
              className="projects-route__button is-primary"
              disabled={analyzing || !ideaText.trim()}
            >
              <Sparkles size={16} aria-hidden="true" />
              {analyzing ? "Анализ" : "Разобрать идею"}
            </button>
          </form>

          <section className="project-draft" aria-label="Черновик проекта">
            <div className="project-draft__title">
              <FileText size={18} aria-hidden="true" />
              <h2>Карточка перед созданием</h2>
            </div>

            {warnings.length > 0 && (
              <div className="project-draft__warnings">
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}

            <div className="project-draft__grid">
              <label>
                Название
                <input
                  id="project-name"
                  name="project-name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
              <label>
                Формат
                <input
                  id="project-format"
                  name="project-format"
                  value={draft.format}
                  onChange={(event) => setDraft({ ...draft, format: event.target.value })}
                />
              </label>
              <label>
                Жанр
                <input
                  id="project-genre"
                  name="project-genre"
                  value={draft.genre}
                  onChange={(event) => setDraft({ ...draft, genre: event.target.value })}
                />
              </label>
              <label>
                Тон
                <input
                  id="project-tone"
                  name="project-tone"
                  value={draft.tone}
                  onChange={(event) => setDraft({ ...draft, tone: event.target.value })}
                />
              </label>
            </div>

            <label>
              Сеттинг
              <input
                id="project-setting"
                name="project-setting"
                value={draft.setting}
                onChange={(event) => setDraft({ ...draft, setting: event.target.value })}
              />
            </label>

            <label>
              Короткое описание
              <input
                id="project-description"
                name="project-description"
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </label>

            <label>
              Синопсис
              <textarea
                id="project-synopsis"
                name="project-synopsis"
                value={draft.synopsis}
                onChange={(event) => setDraft({ ...draft, synopsis: event.target.value })}
                rows={6}
              />
            </label>

            <label>
              Главный конфликт
              <textarea
                id="project-central-conflict"
                name="project-central-conflict"
                value={draft.centralConflict}
                onChange={(event) => setDraft({ ...draft, centralConflict: event.target.value })}
                rows={3}
              />
            </label>

            <div className="project-draft__grid">
              <label>
                Темы
                <input
                  id="project-themes"
                  name="project-themes"
                  value={draft.themes}
                  onChange={(event) => setDraft({ ...draft, themes: event.target.value })}
                />
              </label>
              <label>
                Объем
                <input
                  id="project-target-length"
                  name="project-target-length"
                  value={draft.targetLength}
                  onChange={(event) => setDraft({ ...draft, targetLength: event.target.value })}
                />
              </label>
              <label>
                POV
                <input
                  id="project-point-of-view"
                  name="project-point-of-view"
                  value={draft.pointOfView}
                  onChange={(event) => setDraft({ ...draft, pointOfView: event.target.value })}
                />
              </label>
              <label>
                Направление
                <select
                  id="project-selected-direction"
                  name="project-selected-direction"
                  value={draft.selectedDirection}
                  onChange={(event) =>
                    setDraft({ ...draft, selectedDirection: event.target.value })
                  }
                >
                  <option value="">Не выбрано</option>
                  {draft.directions.map((direction) => (
                    <option key={direction} value={direction}>
                      {direction}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {draft.directions.length > 0 && (
              <div className="project-draft__directions">
                {draft.directions.map((direction) => (
                  <button
                    type="button"
                    key={direction}
                    className={direction === draft.selectedDirection ? "is-selected" : ""}
                    onClick={() => setDraft({ ...draft, selectedDirection: direction })}
                  >
                    {direction}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              className="projects-route__button is-primary"
              disabled={saving || !draft.name.trim() || !ideaText.trim()}
              onClick={() => void saveProject()}
            >
              <Save size={16} aria-hidden="true" />
              {saving ? "Создание" : "Создать проект"}
            </button>
          </section>

          <section className="project-list" aria-label="Список проектов">
            <div className="project-list__title">
              <BookOpen size={18} aria-hidden="true" />
              <h2>Рабочие проекты</h2>
            </div>

            {loading && <div className="projects-route__empty">Загрузка проектов</div>}
            {!loading && projects.length === 0 && (
              <div className="projects-route__empty">Проектов пока нет</div>
            )}

            {projects.map((project) => (
              <article className="project-card" key={project.id}>
                <div className="project-card__header">
                  <div>
                    <h3>{project.name}</h3>
                    <p>{project.description || project.synopsis || "Без описания"}</p>
                  </div>
                  <span>{projectStatusLabel(project)}</span>
                </div>
                <div className="project-card__meta">
                  <span>{project.settings?.genre || "жанр не задан"}</span>
                  <span>{project.settings?.format || "формат не задан"}</span>
                  <span>{settingValue(project, "point_of_view") || "POV позже"}</span>
                </div>
                {project.synopsis && <p className="project-card__synopsis">{project.synopsis}</p>}
              </article>
            ))}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
