import { useEffect, useMemo, useState } from "react";
import {
  BookMarked,
  Boxes,
  Brain,
  ChevronLeft,
  CirclePlus,
  Map,
  PenLine,
  Save,
  Trash2,
  UsersRound,
} from "lucide-react";

import { fetchProjectWorkspace, updateProjectWorkspace } from "../api/projects";
import { fetchProviders } from "../api/providers";
import { AppShell } from "../components/templates/AppShell";
import { ChapterEditorPanel } from "./ChapterEditorPanel";
import type { Provider } from "../types/providers";
import type {
  ChapterPlan,
  CharacterWorkspace,
  IdeaLab,
  PlotArcWorkspace,
  ProjectWorkspace,
  WorkspaceSettings,
  WorldBible,
  WorldEntry,
} from "../types/projects";
import "./ProjectWorkspaceRoute.css";

type WorkspaceTab = "overview" | "ideas" | "world" | "characters" | "plot" | "editor";

const tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof BookMarked }> = [
  { id: "overview", label: "Overview", icon: BookMarked },
  { id: "ideas", label: "Idea Lab", icon: Brain },
  { id: "world", label: "World Bible", icon: Map },
  { id: "characters", label: "Characters", icon: UsersRound },
  { id: "plot", label: "Plot Board", icon: Boxes },
  { id: "editor", label: "Editor", icon: PenLine },
];

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function lines(values: string[]): string {
  return values.join("\n");
}

function text(value: string | null | undefined): string {
  return value ?? "";
}

function emptyEntry(title: string): WorldEntry {
  return { title, content: "", canon_status: "draft" };
}

function defaultModelFor(provider?: Provider): string {
  return provider?.default_model_id || provider?.models[0]?.model_id || "";
}

function updateItem<T>(items: T[], index: number, patch: Partial<T>): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

function removeItem<T>(items: T[], index: number): T[] {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

type ProjectWorkspaceRouteProps = {
  projectId: string;
};

export function ProjectWorkspaceRoute({ projectId }: ProjectWorkspaceRouteProps) {
  const [workspace, setWorkspace] = useState<ProjectWorkspace>();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const providerId = workspace?.project.provider_id;
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === providerId),
    [providers, providerId],
  );

  useEffect(() => {
    let isCurrent = true;

    Promise.all([fetchProjectWorkspace(projectId), fetchProviders()])
      .then(([nextWorkspace, nextProviders]) => {
        if (!isCurrent) {
          return;
        }
        setWorkspace(nextWorkspace);
        setProviders(nextProviders);
      })
      .catch((reason) => {
        if (isCurrent) {
          setError(reason instanceof Error ? reason.message : "Workspace could not be loaded.");
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
  }, [projectId]);

  function updateProject(patch: Partial<ProjectWorkspace["project"]>) {
    setWorkspace((current) =>
      current ? { ...current, project: { ...current.project, ...patch } } : current,
    );
  }

  function updateSettings(patch: Partial<WorkspaceSettings>) {
    setWorkspace((current) =>
      current ? { ...current, settings: { ...current.settings, ...patch } } : current,
    );
  }

  function updateIdeaLab(patch: Partial<IdeaLab>) {
    setWorkspace((current) =>
      current ? { ...current, idea_lab: { ...current.idea_lab, ...patch } } : current,
    );
  }

  function updateWorldBible(patch: Partial<WorldBible>) {
    setWorkspace((current) =>
      current ? { ...current, world_bible: { ...current.world_bible, ...patch } } : current,
    );
  }

  async function saveWorkspace() {
    if (!workspace) {
      return;
    }
    setSaving(true);
    setError(undefined);
    setNotice(undefined);

    try {
      const saved = await updateProjectWorkspace(projectId, {
        name: workspace.project.name,
        description: workspace.project.description,
        synopsis: workspace.project.synopsis,
        provider_id: workspace.project.provider_id,
        model_id: workspace.project.model_id,
        settings: workspace.settings,
        idea_lab: workspace.idea_lab,
        world_bible: workspace.world_bible,
        characters: workspace.characters,
        plot_board: workspace.plot_board,
      });
      setWorkspace(saved);
      setNotice("Workspace saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Workspace could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell currentPath="/projects">
        <div className="workspace-route__state">Loading workspace...</div>
      </AppShell>
    );
  }

  if (!workspace) {
    return (
      <AppShell currentPath="/projects">
        <div className="workspace-route__state is-error">{error || "Workspace not found."}</div>
      </AppShell>
    );
  }

  function updateProvider(providerId: string) {
    const provider = providers.find((item) => item.id === providerId);
    updateProject({
      provider_id: providerId || null,
      model_id: providerId ? defaultModelFor(provider) : null,
    });
  }

  return (
    <AppShell currentPath="/projects">
      <div className="workspace-route">
        <header className="workspace-route__header">
          <div>
            <a className="workspace-route__back" href="/projects">
              <ChevronLeft size={16} aria-hidden="true" />
              Projects
            </a>
            <h1>{workspace.project.name || "Untitled project"}</h1>
            <p>{workspace.project.description || "Shape the project history and canon base."}</p>
          </div>
          <button
            className="workspace-route__save"
            disabled={saving || !workspace.project.name.trim()}
            onClick={() => void saveWorkspace()}
            type="button"
          >
            <Save size={16} aria-hidden="true" />
            {saving ? "Saving" : "Save"}
          </button>
        </header>

        {(error || notice) && (
          <div className={`workspace-route__message ${error ? "is-error" : "is-ready"}`}>
            {error || notice}
          </div>
        )}

        <div className="workspace-tabs" role="tablist" aria-label="Workspace sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                aria-selected={activeTab === tab.id}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                type="button"
              >
                <Icon size={16} aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "overview" && (
          <section className="workspace-panel">
            <div className="workspace-panel__heading">
              <BookMarked size={18} aria-hidden="true" />
              <h2>Project Overview</h2>
            </div>
            <div className="workspace-grid is-two">
              <label>
                Name
                <input
                  name="workspace-project-name"
                  value={workspace.project.name}
                  onChange={(event) => updateProject({ name: event.target.value })}
                />
              </label>
              <label>
                Format
                <input
                  name="workspace-format"
                  value={text(workspace.settings.format)}
                  onChange={(event) => updateSettings({ format: event.target.value })}
                />
              </label>
              <label>
                Genre
                <input
                  name="workspace-genre"
                  value={text(workspace.settings.genre)}
                  onChange={(event) => updateSettings({ genre: event.target.value })}
                />
              </label>
              <label>
                Tone
                <input
                  name="workspace-tone"
                  value={text(workspace.settings.tone)}
                  onChange={(event) => updateSettings({ tone: event.target.value })}
                />
              </label>
              <label>
                Period / Setting
                <input
                  name="workspace-setting"
                  value={text(workspace.settings.setting)}
                  onChange={(event) => updateSettings({ setting: event.target.value })}
                />
              </label>
              <label>
                Point of view
                <input
                  name="workspace-point-of-view"
                  value={text(workspace.settings.point_of_view)}
                  onChange={(event) => updateSettings({ point_of_view: event.target.value })}
                />
              </label>
              <label>
                Target length
                <input
                  name="workspace-target-length"
                  value={text(workspace.settings.target_length)}
                  onChange={(event) => updateSettings({ target_length: event.target.value })}
                />
              </label>
              <label>
                Provider
                <select
                  name="workspace-provider"
                  value={workspace.project.provider_id || ""}
                  onChange={(event) => updateProvider(event.target.value)}
                >
                  <option value="">No AI provider</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Model
                <select
                  name="workspace-model"
                  value={workspace.project.model_id || ""}
                  disabled={!selectedProvider}
                  onChange={(event) => updateProject({ model_id: event.target.value || null })}
                >
                  <option value="">No model</option>
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
            <label>
              Description
              <input
                name="workspace-description"
                value={text(workspace.project.description)}
                onChange={(event) => updateProject({ description: event.target.value })}
              />
            </label>
            <label>
              Synopsis
              <textarea
                name="workspace-synopsis"
                rows={7}
                value={text(workspace.project.synopsis)}
                onChange={(event) => updateProject({ synopsis: event.target.value })}
              />
            </label>
            <label>
              Central conflict
              <textarea
                name="workspace-central-conflict"
                rows={3}
                value={text(workspace.settings.central_conflict)}
                onChange={(event) => updateSettings({ central_conflict: event.target.value })}
              />
            </label>
          </section>
        )}

        {activeTab === "ideas" && (
          <section className="workspace-panel">
            <div className="workspace-panel__heading">
              <Brain size={18} aria-hidden="true" />
              <h2>Idea Lab</h2>
            </div>
            <label>
              Seed idea
              <textarea
                name="workspace-seed-idea"
                rows={5}
                value={text(workspace.idea_lab.source_text)}
                onChange={(event) => updateIdeaLab({ source_text: event.target.value })}
              />
            </label>
            <label>
              Expanded idea
              <textarea
                name="workspace-expanded-idea"
                rows={6}
                value={text(workspace.idea_lab.expanded_synopsis)}
                onChange={(event) => updateIdeaLab({ expanded_synopsis: event.target.value })}
              />
            </label>
            <div className="workspace-grid is-two">
              <LineList
                label="Themes"
                value={workspace.idea_lab.themes}
                onChange={(value) => {
                  updateIdeaLab({ themes: value });
                  updateSettings({ themes: value });
                }}
              />
              <LineList
                label="Motives"
                value={workspace.idea_lab.motives}
                onChange={(value) => updateIdeaLab({ motives: value })}
              />
              <LineList
                label="Conflicts"
                value={workspace.idea_lab.conflicts}
                onChange={(value) => updateIdeaLab({ conflicts: value })}
              />
              <LineList
                label="Directions"
                value={workspace.idea_lab.directions}
                onChange={(value) =>
                  updateIdeaLab({
                    directions: value,
                    selected_direction: value.includes(text(workspace.idea_lab.selected_direction))
                      ? workspace.idea_lab.selected_direction
                      : value[0] || "",
                  })
                }
              />
            </div>
            <label>
              Selected direction
              <select
                name="workspace-selected-direction"
                value={text(workspace.idea_lab.selected_direction)}
                onChange={(event) => updateIdeaLab({ selected_direction: event.target.value })}
              >
                <option value="">No direction selected</option>
                {workspace.idea_lab.directions.map((direction) => (
                  <option key={direction} value={direction}>
                    {direction}
                  </option>
                ))}
              </select>
            </label>
          </section>
        )}

        {activeTab === "world" && (
          <section className="workspace-panel">
            <div className="workspace-panel__heading">
              <Map size={18} aria-hidden="true" />
              <h2>World Bible</h2>
            </div>
            <WorldSection
              label="World rules"
              addLabel="Add rule"
              entries={workspace.world_bible.rules}
              onChange={(rules) => updateWorldBible({ rules })}
            />
            <WorldSection
              label="Locations"
              addLabel="Add location"
              entries={workspace.world_bible.locations}
              onChange={(locations) => updateWorldBible({ locations })}
            />
            <WorldSection
              label="Factions"
              addLabel="Add faction"
              entries={workspace.world_bible.factions}
              onChange={(factions) => updateWorldBible({ factions })}
            />
          </section>
        )}

        {activeTab === "characters" && (
          <section className="workspace-panel">
            <div className="workspace-panel__heading">
              <UsersRound size={18} aria-hidden="true" />
              <h2>Characters</h2>
              <button
                type="button"
                onClick={() =>
                  setWorkspace({
                    ...workspace,
                    characters: [...workspace.characters, { name: "New character", role: "" }],
                  })
                }
              >
                <CirclePlus size={16} aria-hidden="true" />
                Add
              </button>
            </div>
            <div className="workspace-card-grid">
              {workspace.characters.map((character, index) => (
                <CharacterCard
                  character={character}
                  index={index}
                  key={character.id || index}
                  onChange={(patch) =>
                    setWorkspace({
                      ...workspace,
                      characters: updateItem(workspace.characters, index, patch),
                    })
                  }
                  onRemove={() =>
                    setWorkspace({
                      ...workspace,
                      characters: removeItem(workspace.characters, index),
                    })
                  }
                />
              ))}
            </div>
          </section>
        )}

        {activeTab === "plot" && (
          <section className="workspace-panel">
            <div className="workspace-panel__heading">
              <Boxes size={18} aria-hidden="true" />
              <h2>Plot Board</h2>
            </div>
            <PlotSection
              arcs={workspace.plot_board.arcs}
              chapters={workspace.plot_board.chapters}
              onArcsChange={(arcs) =>
                setWorkspace({ ...workspace, plot_board: { ...workspace.plot_board, arcs } })
              }
              onChaptersChange={(chapters) =>
                setWorkspace({ ...workspace, plot_board: { ...workspace.plot_board, chapters } })
              }
            />
          </section>
        )}

        {activeTab === "editor" && <ChapterEditorPanel projectId={projectId} providers={providers} />}
      </div>
    </AppShell>
  );
}

function LineList({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <label>
      {label}
      <textarea
        name={`workspace-${label.toLowerCase().replaceAll(" ", "-")}`}
        rows={5}
        value={lines(value)}
        onChange={(event) => onChange(splitLines(event.target.value))}
      />
    </label>
  );
}

function WorldSection({
  label,
  addLabel,
  entries,
  onChange,
}: {
  label: string;
  addLabel: string;
  entries: WorldEntry[];
  onChange: (entries: WorldEntry[]) => void;
}) {
  return (
    <section className="workspace-subsection">
      <div className="workspace-subsection__header">
        <h3>{label}</h3>
        <button type="button" onClick={() => onChange([...entries, emptyEntry(`New ${label}`)])}>
          <CirclePlus size={16} aria-hidden="true" />
          {addLabel}
        </button>
      </div>
      <div className="workspace-card-grid">
        {entries.map((entry, index) => (
          <article className="workspace-card" key={entry.id || index}>
            <div className="workspace-card__tools">
              <input
                aria-label={`${label} title`}
                name={`${label.toLowerCase().replaceAll(" ", "-")}-${index}-title`}
                value={entry.title}
                onChange={(event) => onChange(updateItem(entries, index, { title: event.target.value }))}
              />
              <button type="button" aria-label="Remove" onClick={() => onChange(removeItem(entries, index))}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
            {label === "World rules" && (
              <select
                name={`${label.toLowerCase().replaceAll(" ", "-")}-${index}-status`}
                value={entry.canon_status || "draft"}
                onChange={(event) =>
                  onChange(updateItem(entries, index, { canon_status: event.target.value }))
                }
              >
                <option value="draft">Draft</option>
                <option value="canon">Canon</option>
                <option value="question">Question</option>
              </select>
            )}
            <textarea
              name={`${label.toLowerCase().replaceAll(" ", "-")}-${index}-content`}
              rows={4}
              value={text(entry.content)}
              onChange={(event) => onChange(updateItem(entries, index, { content: event.target.value }))}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

function CharacterCard({
  character,
  index,
  onChange,
  onRemove,
}: {
  character: CharacterWorkspace;
  index: number;
  onChange: (patch: Partial<CharacterWorkspace>) => void;
  onRemove: () => void;
}) {
  return (
    <article className="workspace-card">
      <div className="workspace-card__tools">
        <input
          aria-label={`Character ${index + 1} name`}
          name={`character-${index}-name`}
          value={character.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <button type="button" aria-label="Remove character" onClick={onRemove}>
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
      <label>
        Role
        <input
          name={`character-${index}-role`}
          value={text(character.role)}
          onChange={(event) => onChange({ role: event.target.value })}
        />
      </label>
      <label>
        Biography
        <textarea
          name={`character-${index}-biography`}
          rows={4}
          value={text(character.biography)}
          onChange={(event) => onChange({ biography: event.target.value })}
        />
      </label>
      <div className="workspace-grid is-two">
        <label>
          Motivation
          <textarea
            name={`character-${index}-motivation`}
            rows={3}
            value={text(character.motivation)}
            onChange={(event) => onChange({ motivation: event.target.value })}
          />
        </label>
        <label>
          Goal
          <textarea
            name={`character-${index}-goal`}
            rows={3}
            value={text(character.goal)}
            onChange={(event) => onChange({ goal: event.target.value })}
          />
        </label>
        <label>
          Fear
          <textarea
            name={`character-${index}-fear`}
            rows={3}
            value={text(character.fear)}
            onChange={(event) => onChange({ fear: event.target.value })}
          />
        </label>
        <label>
          Internal conflict
          <textarea
            name={`character-${index}-internal-conflict`}
            rows={3}
            value={text(character.internal_conflict)}
            onChange={(event) => onChange({ internal_conflict: event.target.value })}
          />
        </label>
      </div>
    </article>
  );
}

function PlotSection({
  arcs,
  chapters,
  onArcsChange,
  onChaptersChange,
}: {
  arcs: PlotArcWorkspace[];
  chapters: ChapterPlan[];
  onArcsChange: (arcs: PlotArcWorkspace[]) => void;
  onChaptersChange: (chapters: ChapterPlan[]) => void;
}) {
  return (
    <div className="workspace-grid is-two">
      <section className="workspace-subsection">
        <div className="workspace-subsection__header">
          <h3>Arcs</h3>
          <button
            type="button"
            onClick={() =>
              onArcsChange([
                ...arcs,
                { title: "New arc", description: "", arc_type: "main", position: arcs.length },
              ])
            }
          >
            <CirclePlus size={16} aria-hidden="true" />
            Add arc
          </button>
        </div>
        <div className="workspace-card-grid">
          {arcs.map((arc, index) => (
            <article className="workspace-card" key={arc.id || index}>
              <div className="workspace-card__tools">
                <input
                  aria-label={`Arc ${index + 1} title`}
                  name={`plot-arc-${index}-title`}
                  value={arc.title}
                  onChange={(event) => onArcsChange(updateItem(arcs, index, { title: event.target.value }))}
                />
                <button type="button" aria-label="Remove arc" onClick={() => onArcsChange(removeItem(arcs, index))}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
              <label>
                Type
                <input
                  name={`plot-arc-${index}-type`}
                  value={arc.arc_type}
                  onChange={(event) => onArcsChange(updateItem(arcs, index, { arc_type: event.target.value }))}
                />
              </label>
              <textarea
                name={`plot-arc-${index}-description`}
                rows={4}
                value={text(arc.description)}
                onChange={(event) => onArcsChange(updateItem(arcs, index, { description: event.target.value }))}
              />
            </article>
          ))}
        </div>
      </section>

      <section className="workspace-subsection">
        <div className="workspace-subsection__header">
          <h3>Chapters</h3>
          <button
            type="button"
            onClick={() =>
              onChaptersChange([
                ...chapters,
                { title: "New chapter", summary: "", status: "planned", position: chapters.length },
              ])
            }
          >
            <CirclePlus size={16} aria-hidden="true" />
            Add chapter
          </button>
        </div>
        <div className="workspace-card-grid">
          {chapters.map((chapter, index) => (
            <article className="workspace-card" key={chapter.id || index}>
              <div className="workspace-card__tools">
                <input
                  aria-label={`Chapter ${index + 1} title`}
                  name={`chapter-${index}-title`}
                  value={chapter.title}
                  onChange={(event) =>
                    onChaptersChange(updateItem(chapters, index, { title: event.target.value }))
                  }
                />
                <button
                  type="button"
                  aria-label="Remove chapter"
                  onClick={() => onChaptersChange(removeItem(chapters, index))}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
              <label>
                Status
                <select
                  name={`chapter-${index}-status`}
                  value={chapter.status}
                  onChange={(event) =>
                    onChaptersChange(updateItem(chapters, index, { status: event.target.value }))
                  }
                >
                  <option value="planned">Planned</option>
                  <option value="draft">Draft</option>
                  <option value="revising">Revising</option>
                  <option value="done">Done</option>
                </select>
              </label>
              <textarea
                name={`chapter-${index}-summary`}
                rows={4}
                value={text(chapter.summary)}
                onChange={(event) =>
                  onChaptersChange(updateItem(chapters, index, { summary: event.target.value }))
                }
              />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
