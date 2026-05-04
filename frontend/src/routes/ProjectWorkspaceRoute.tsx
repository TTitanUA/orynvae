import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, useBeforeUnload, useBlocker } from "react-router-dom";
import {
  BookMarked,
  Boxes,
  Brain,
  CalendarDays,
  ChevronLeft,
  CirclePlus,
  ClipboardCheck,
  Link2,
  Map,
  PenLine,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  UsersRound,
} from "lucide-react";

import {
  continuitySeverityLabel,
  fetchProjectWorkspace,
  requestContinuityCheck,
  updateProjectWorkspace,
} from "../api/projects";
import { allowedModels, defaultModelFor, enabledProviders, fetchProviders } from "../api/providers";
import { AppShell } from "../components/templates/AppShell";
import { UnsavedChangesDialog } from "../components/molecules/UnsavedChangesDialog";
import { ChapterEditorPanel } from "./ChapterEditorPanel";
import { useShowHiddenItems } from "../privacySettings";
import type { Provider } from "../types/providers";
import type {
  ChapterPlan,
  CharacterWorkspace,
  CanonFact,
  CanonFactLink,
  CanonWorkspace,
  ContinuityCheck,
  IdeaLab,
  PlotArcWorkspace,
  ProjectWorkspace,
  TimelineEvent,
  WorkspaceSettings,
  WorldBible,
  WorldEntry,
} from "../types/projects";
import "./ProjectWorkspaceRoute.css";

type WorkspaceTab = "overview" | "ideas" | "world" | "characters" | "plot" | "canon" | "editor";

const tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof BookMarked }> = [
  { id: "overview", label: "Overview", icon: BookMarked },
  { id: "ideas", label: "Idea Lab", icon: Brain },
  { id: "world", label: "World Bible", icon: Map },
  { id: "characters", label: "Characters", icon: UsersRound },
  { id: "plot", label: "Plot Board", icon: Boxes },
  { id: "canon", label: "Canon", icon: ShieldCheck },
  { id: "editor", label: "Editor", icon: PenLine },
];

const tabIds = new Set<string>(tabs.map((tab) => tab.id));

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

function tempId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyFact(): CanonFact {
  return {
    id: tempId("fact"),
    title: "New canon fact",
    fact: "",
    category: "general",
    status: "confirmed",
    source_type: null,
    source_id: null,
    notes: "",
    links: [],
  };
}

function emptyTimelineEvent(position: number): TimelineEvent {
  return {
    id: tempId("event"),
    title: "New event",
    summary: "",
    event_time: "",
    source_chapter_id: null,
    position,
  };
}

function updateItem<T>(items: T[], index: number, patch: Partial<T>): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

function removeItem<T>(items: T[], index: number): T[] {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

function sectionFromValue(value: string): WorkspaceTab | undefined {
  return tabIds.has(value) ? (value as WorkspaceTab) : undefined;
}

function workspaceSectionPath(projectId: string, section: WorkspaceTab): string {
  return `/projects/${encodeURIComponent(projectId)}/workspace/${section}`;
}

function workspacePayload(workspace: ProjectWorkspace) {
  return {
    name: workspace.project.name,
    description: workspace.project.description,
    synopsis: workspace.project.synopsis,
    provider_id: workspace.project.provider_id,
    model_id: workspace.project.model_id,
    is_hidden: workspace.project.is_hidden,
    settings: workspace.settings,
    idea_lab: workspace.idea_lab,
    world_bible: workspace.world_bible,
    characters: workspace.characters,
    plot_board: workspace.plot_board,
    canon: workspace.canon,
  };
}

function sectionFingerprint(workspace: ProjectWorkspace | undefined, section: WorkspaceTab): string {
  if (!workspace || section === "editor") {
    return "";
  }

  const values: Record<Exclude<WorkspaceTab, "editor">, unknown> = {
    overview: {
      project: {
        name: workspace.project.name,
        description: workspace.project.description,
        synopsis: workspace.project.synopsis,
        provider_id: workspace.project.provider_id,
        model_id: workspace.project.model_id,
        is_hidden: workspace.project.is_hidden,
      },
      settings: workspace.settings,
    },
    ideas: {
      idea_lab: workspace.idea_lab,
      themes: workspace.settings.themes,
    },
    world: workspace.world_bible,
    characters: workspace.characters,
    plot: workspace.plot_board,
    canon: workspace.canon,
  };

  return JSON.stringify(values[section as Exclude<WorkspaceTab, "editor">]);
}

function sectionSavedMessage(section: WorkspaceTab): string {
  const tab = tabs.find((item) => item.id === section);
  return `${tab?.label || "Section"} saved.`;
}

type ProjectWorkspaceRouteProps = {
  projectId: string;
  section: string;
};

export function ProjectWorkspaceRoute({ projectId, section }: ProjectWorkspaceRouteProps) {
  const activeSection = sectionFromValue(section);
  const [showHiddenItems] = useShowHiddenItems();
  const [workspace, setWorkspace] = useState<ProjectWorkspace>();
  const [savedWorkspace, setSavedWorkspace] = useState<ProjectWorkspace>();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingCanon, setCheckingCanon] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [continuityText, setContinuityText] = useState("");
  const [continuityCheck, setContinuityCheck] = useState<ContinuityCheck>();
  const currentSection = activeSection || "overview";

  const providerId = workspace?.project.provider_id;
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === providerId),
    [providers, providerId],
  );
  const activeProviders = useMemo(() => enabledProviders(providers), [providers]);
  const selectedAllowedModels = useMemo(() => allowedModels(selectedProvider), [selectedProvider]);
  const currentProjectModelId = workspace?.project.model_id || "";
  const hasLegacyModel = Boolean(
    currentProjectModelId &&
      selectedProvider &&
      !selectedAllowedModels.some((model) => model.model_id === currentProjectModelId),
  );
  const currentFingerprint = sectionFingerprint(workspace, currentSection);
  const savedFingerprint = sectionFingerprint(savedWorkspace, currentSection);
  const isDirty = Boolean(workspace && savedWorkspace && currentFingerprint !== savedFingerprint);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    return isDirty && currentLocation.pathname !== nextLocation.pathname;
  });

  useBeforeUnload((event) => {
    if (!isDirty) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });

  useEffect(() => {
    let isCurrent = true;

    Promise.all([fetchProjectWorkspace(projectId), fetchProviders()])
      .then(([nextWorkspace, nextProviders]) => {
        if (!isCurrent) {
          return;
        }
        setWorkspace(nextWorkspace);
        setSavedWorkspace(nextWorkspace);
        setProviders(nextProviders);
        setError(undefined);
      })
      .catch((reason) => {
        if (isCurrent) {
          setWorkspace(undefined);
          setSavedWorkspace(undefined);
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
  }, [projectId, showHiddenItems]);

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

  function updateCanon(patch: Partial<CanonWorkspace>) {
    setWorkspace((current) =>
      current ? { ...current, canon: { ...current.canon, ...patch } } : current,
    );
  }

  async function runContinuityCheck() {
    if (!workspace || !continuityText.trim()) {
      return;
    }
    setCheckingCanon(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const check = await requestContinuityCheck(projectId, {
        text: continuityText,
        provider_id: workspace.project.provider_id,
        model_id: workspace.project.model_id,
      });
      setContinuityCheck(check);
      setNotice("Continuity check ready for review.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Continuity check failed.");
    } finally {
      setCheckingCanon(false);
    }
  }

  async function saveCurrentSection() {
    if (!workspace) {
      return;
    }
    setSaving(true);
    setError(undefined);
    setNotice(undefined);

    try {
      const saved = await updateProjectWorkspace(projectId, workspacePayload(workspace));
      setWorkspace(saved);
      setSavedWorkspace(saved);
      setNotice(sectionSavedMessage(currentSection));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Section could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!activeSection) {
    return <Navigate replace to={workspaceSectionPath(projectId, "overview")} />;
  }

  if (loading) {
    return (
      <AppShell>
        <div className="workspace-route__state">Loading workspace...</div>
      </AppShell>
    );
  }

  if (!workspace) {
    return (
      <AppShell>
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

  function discardChangesAndLeave() {
    setWorkspace(savedWorkspace);
    if (blocker.state === "blocked") {
      blocker.proceed();
    }
  }

  return (
    <AppShell>
      <div className="workspace-route">
        <header className="workspace-route__header">
          <div>
            <Link className="workspace-route__back" to="/projects">
              <ChevronLeft size={16} aria-hidden="true" />
              Projects
            </Link>
            <h1>{workspace.project.name || "Untitled project"}</h1>
            <p>{workspace.project.description || "Shape the project history and canon base."}</p>
          </div>
        </header>

        {(error || notice) && (
          <div className={`workspace-route__message ${error ? "is-error" : "is-ready"}`}>
            {error || notice}
          </div>
        )}

        <nav className="workspace-nav" aria-label="Workspace pages">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                aria-label={tab.label}
                key={tab.id}
                to={workspaceSectionPath(projectId, tab.id)}
              >
                <Icon size={16} aria-hidden="true" />
                {tab.label}
              </NavLink>
            );
          })}
        </nav>

        {currentSection === "overview" && (
          <section className="workspace-panel">
            <div className="workspace-panel__heading">
              <span>
                <BookMarked size={18} aria-hidden="true" />
                <h2>Project Overview</h2>
              </span>
              <button
                disabled={saving || !workspace.project.name.trim() || !isDirty}
                onClick={() => void saveCurrentSection()}
                type="button"
              >
                <Save size={16} aria-hidden="true" />
                {saving ? "Saving" : "Save"}
              </button>
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
                Visibility
                <select
                  name="workspace-visibility"
                  value={workspace.project.is_hidden ? "hidden" : "visible"}
                  onChange={(event) => updateProject({ is_hidden: event.target.value === "hidden" })}
                >
                  <option value="visible">Visible project</option>
                  <option value="hidden">Hidden project</option>
                </select>
              </label>
              <label>
                Provider
                <select
                  name="workspace-provider"
                  value={workspace.project.provider_id || ""}
                  onChange={(event) => updateProvider(event.target.value)}
                >
                  <option value="">No AI provider</option>
                  {selectedProvider && !selectedProvider.is_enabled && (
                    <option value={selectedProvider.id}>
                      {selectedProvider.name} (disabled)
                    </option>
                  )}
                  {activeProviders.map((provider) => (
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
                  {selectedAllowedModels.map((model) => (
                    <option key={model.id} value={model.model_id}>
                      {model.display_name}
                    </option>
                  ))}
                  {hasLegacyModel && (
                    <option value={currentProjectModelId}>
                      {currentProjectModelId} (legacy)
                    </option>
                  )}
                </select>
              </label>
            </div>
            {hasLegacyModel && (
              <div className="workspace-route__message is-error">
                Current project model is no longer allowed for this provider.
              </div>
            )}
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

        {currentSection === "ideas" && (
          <section className="workspace-panel">
            <div className="workspace-panel__heading">
              <span>
                <Brain size={18} aria-hidden="true" />
                <h2>Idea Lab</h2>
              </span>
              <button
                disabled={saving || !isDirty}
                onClick={() => void saveCurrentSection()}
                type="button"
              >
                <Save size={16} aria-hidden="true" />
                {saving ? "Saving" : "Save"}
              </button>
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

        {currentSection === "world" && (
          <section className="workspace-panel">
            <div className="workspace-panel__heading">
              <span>
                <Map size={18} aria-hidden="true" />
                <h2>World Bible</h2>
              </span>
              <button
                disabled={saving || !isDirty}
                onClick={() => void saveCurrentSection()}
                type="button"
              >
                <Save size={16} aria-hidden="true" />
                {saving ? "Saving" : "Save"}
              </button>
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

        {currentSection === "characters" && (
          <section className="workspace-panel">
            <div className="workspace-panel__heading">
              <span>
                <UsersRound size={18} aria-hidden="true" />
                <h2>Characters</h2>
              </span>
              <div className="workspace-panel__actions">
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
                <button
                  disabled={saving || !isDirty}
                  onClick={() => void saveCurrentSection()}
                  type="button"
                >
                  <Save size={16} aria-hidden="true" />
                  {saving ? "Saving" : "Save"}
                </button>
              </div>
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

        {currentSection === "plot" && (
          <section className="workspace-panel">
            <div className="workspace-panel__heading">
              <span>
                <Boxes size={18} aria-hidden="true" />
                <h2>Plot Board</h2>
              </span>
              <button
                disabled={saving || !isDirty}
                onClick={() => void saveCurrentSection()}
                type="button"
              >
                <Save size={16} aria-hidden="true" />
                {saving ? "Saving" : "Save"}
              </button>
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

        {currentSection === "canon" && (
          <section className="workspace-panel">
            <div className="workspace-panel__heading">
              <span>
                <ShieldCheck size={18} aria-hidden="true" />
                <h2>Canon & Timeline</h2>
              </span>
              <button
                disabled={saving || !isDirty}
                onClick={() => void saveCurrentSection()}
                type="button"
              >
                <Save size={16} aria-hidden="true" />
                {saving ? "Saving" : "Save"}
              </button>
            </div>
            <CanonPanel
              canon={workspace.canon}
              characters={workspace.characters}
              chapters={workspace.plot_board.chapters}
              checking={checkingCanon}
              continuityCheck={continuityCheck}
              continuityText={continuityText}
              onCanonChange={updateCanon}
              onContinuityTextChange={setContinuityText}
              onRunContinuityCheck={() => void runContinuityCheck()}
            />
          </section>
        )}

        {currentSection === "editor" && (
          <ChapterEditorPanel projectId={projectId} providers={activeProviders} />
        )}

        {blocker.state === "blocked" && (
          <UnsavedChangesDialog
            onLeave={discardChangesAndLeave}
            onStay={() => blocker.reset()}
          />
        )}
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

function CanonPanel({
  canon,
  characters,
  chapters,
  checking,
  continuityCheck,
  continuityText,
  onCanonChange,
  onContinuityTextChange,
  onRunContinuityCheck,
}: {
  canon: CanonWorkspace;
  characters: CharacterWorkspace[];
  chapters: ChapterPlan[];
  checking: boolean;
  continuityCheck?: ContinuityCheck;
  continuityText: string;
  onCanonChange: (patch: Partial<CanonWorkspace>) => void;
  onContinuityTextChange: (value: string) => void;
  onRunContinuityCheck: () => void;
}) {
  function updateFact(index: number, patch: Partial<CanonFact>) {
    onCanonChange({ facts: updateItem(canon.facts, index, patch) });
  }

  function updateTimeline(index: number, patch: Partial<TimelineEvent>) {
    onCanonChange({ timeline: updateItem(canon.timeline, index, patch) });
  }

  function addSuggestedFact(fact: CanonFact) {
    onCanonChange({
      facts: [
        {
          ...fact,
          id: tempId("fact"),
          status: fact.status || "suggested",
          links: fact.links || [],
        },
        ...canon.facts,
      ],
    });
  }

  return (
    <>
      <section className="workspace-subsection">
        <div className="workspace-subsection__header">
          <h3>Canon Facts</h3>
          <button type="button" onClick={() => onCanonChange({ facts: [emptyFact(), ...canon.facts] })}>
            <CirclePlus size={16} aria-hidden="true" />
            Add fact
          </button>
        </div>
        <div className="workspace-card-grid">
          {canon.facts.map((fact, index) => (
            <CanonFactCard
              chapters={chapters}
              characters={characters}
              fact={fact}
              index={index}
              key={fact.id || index}
              timeline={canon.timeline}
              onChange={(patch) => updateFact(index, patch)}
              onRemove={() => onCanonChange({ facts: removeItem(canon.facts, index) })}
            />
          ))}
        </div>
      </section>

      <section className="workspace-subsection">
        <div className="workspace-subsection__header">
          <h3>Timeline</h3>
          <button
            type="button"
            onClick={() =>
              onCanonChange({ timeline: [...canon.timeline, emptyTimelineEvent(canon.timeline.length)] })
            }
          >
            <CalendarDays size={16} aria-hidden="true" />
            Add event
          </button>
        </div>
        <div className="workspace-card-grid">
          {canon.timeline.map((event, index) => (
            <article className="workspace-card" key={event.id || index}>
              <div className="workspace-card__tools">
                <input
                  aria-label={`Timeline event ${index + 1} title`}
                  name={`timeline-event-${index}-title`}
                  value={event.title}
                  onChange={(changeEvent) => updateTimeline(index, { title: changeEvent.target.value })}
                />
                <button
                  type="button"
                  aria-label="Remove timeline event"
                  onClick={() => onCanonChange({ timeline: removeItem(canon.timeline, index) })}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="workspace-grid is-two">
                <label>
                  When
                  <input
                    name={`timeline-event-${index}-time`}
                    value={text(event.event_time)}
                    onChange={(changeEvent) => updateTimeline(index, { event_time: changeEvent.target.value })}
                  />
                </label>
                <label>
                  Chapter
                  <select
                    name={`timeline-event-${index}-chapter`}
                    value={event.source_chapter_id || ""}
                    onChange={(changeEvent) =>
                      updateTimeline(index, { source_chapter_id: changeEvent.target.value || null })
                    }
                  >
                    <option value="">No chapter</option>
                    {chapters.filter((chapter) => chapter.id).map((chapter) => (
                      <option key={chapter.id} value={chapter.id || ""}>
                        {chapter.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <textarea
                name={`timeline-event-${index}-summary`}
                rows={4}
                value={text(event.summary)}
                onChange={(changeEvent) => updateTimeline(index, { summary: changeEvent.target.value })}
              />
            </article>
          ))}
        </div>
      </section>

      <section className="workspace-subsection">
        <div className="workspace-subsection__header">
          <h3>Continuity Check</h3>
          <button
            type="button"
            disabled={checking || !continuityText.trim()}
            onClick={onRunContinuityCheck}
          >
            <Sparkles size={16} aria-hidden="true" />
            {checking ? "Checking" : "Run check"}
          </button>
        </div>
        <label>
          Passage to compare
          <textarea
            name="canon-continuity-text"
            rows={6}
            value={continuityText}
            onChange={(event) => onContinuityTextChange(event.target.value)}
          />
        </label>
        {continuityCheck && (
          <div className="canon-review">
            {continuityCheck.issues.map((issue) => (
              <article className={`canon-review__issue is-${issue.severity}`} key={issue.id}>
                <div>
                  <strong>{continuitySeverityLabel(issue.severity)}</strong>
                  <h4>{issue.summary}</h4>
                  {issue.detail && <p>{issue.detail}</p>}
                  {issue.related_fact_ids.length > 0 && (
                    <small>Related: {issue.related_fact_ids.join(", ")}</small>
                  )}
                </div>
                {issue.suggested_fact && (
                  <button type="button" onClick={() => addSuggestedFact(issue.suggested_fact as CanonFact)}>
                    <ClipboardCheck size={16} aria-hidden="true" />
                    Add fact
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function CanonFactCard({
  fact,
  index,
  characters,
  chapters,
  timeline,
  onChange,
  onRemove,
}: {
  fact: CanonFact;
  index: number;
  characters: CharacterWorkspace[];
  chapters: ChapterPlan[];
  timeline: TimelineEvent[];
  onChange: (patch: Partial<CanonFact>) => void;
  onRemove: () => void;
}) {
  function updateLink(linkIndex: number, patch: Partial<CanonFactLink>) {
    onChange({ links: updateItem(fact.links, linkIndex, patch) });
  }

  function addLink() {
    const targetType = characters.length > 0 ? "character" : chapters.length > 0 ? "chapter" : "world";
    const options = linkOptions(targetType, characters, chapters, timeline);
    onChange({
      links: [
        ...fact.links,
        {
          id: tempId("link"),
          target_type: targetType,
          target_id: options[0]?.id || "world",
          label: options[0]?.label || "Project",
        },
      ],
    });
  }

  return (
    <article className="workspace-card canon-fact-card">
      <div className="workspace-card__tools">
        <input
          aria-label={`Canon fact ${index + 1} title`}
          name={`canon-fact-${index}-title`}
          value={fact.title}
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <button type="button" aria-label="Remove canon fact" onClick={onRemove}>
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="workspace-grid is-two">
        <label>
          Category
          <input
            name={`canon-fact-${index}-category`}
            value={fact.category}
            onChange={(event) => onChange({ category: event.target.value })}
          />
        </label>
        <label>
          Status
          <select
            name={`canon-fact-${index}-status`}
            value={fact.status}
            onChange={(event) => onChange({ status: event.target.value })}
          >
            <option value="confirmed">Confirmed</option>
            <option value="suggested">Suggested</option>
            <option value="question">Question</option>
            <option value="retired">Retired</option>
          </select>
        </label>
      </div>
      <label>
        Fact
        <textarea
          name={`canon-fact-${index}-fact`}
          rows={4}
          value={fact.fact}
          onChange={(event) => onChange({ fact: event.target.value })}
        />
      </label>
      <label>
        Notes
        <textarea
          name={`canon-fact-${index}-notes`}
          rows={3}
          value={text(fact.notes)}
          onChange={(event) => onChange({ notes: event.target.value })}
        />
      </label>
      <section className="canon-links">
        <div className="canon-links__header">
          <span>
            <Link2 size={14} aria-hidden="true" />
            Links
          </span>
          <button type="button" onClick={addLink}>
            <CirclePlus size={14} aria-hidden="true" />
          </button>
        </div>
        {fact.links.map((link, linkIndex) => {
          const options = linkOptions(link.target_type, characters, chapters, timeline);
          return (
            <div className="canon-link-row" key={link.id || linkIndex}>
              <select
                name={`canon-fact-${index}-link-${linkIndex}-type`}
                value={link.target_type}
                onChange={(event) => {
                  const nextType = event.target.value as CanonFactLink["target_type"];
                  const nextOptions = linkOptions(nextType, characters, chapters, timeline);
                  updateLink(linkIndex, {
                    target_type: nextType,
                    target_id: nextOptions[0]?.id || "world",
                    label: nextOptions[0]?.label || "Project",
                  });
                }}
              >
                <option value="character">Character</option>
                <option value="chapter">Chapter</option>
                <option value="event">Event</option>
                <option value="world">World</option>
              </select>
              <select
                name={`canon-fact-${index}-link-${linkIndex}-target`}
                value={link.target_id}
                onChange={(event) => {
                  const option = options.find((item) => item.id === event.target.value);
                  updateLink(linkIndex, {
                    target_id: event.target.value,
                    label: option?.label || event.target.value,
                  });
                }}
              >
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Remove canon link"
                onClick={() => onChange({ links: removeItem(fact.links, linkIndex) })}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </section>
    </article>
  );
}

function linkOptions(
  type: CanonFactLink["target_type"],
  characters: CharacterWorkspace[],
  chapters: ChapterPlan[],
  timeline: TimelineEvent[],
): Array<{ id: string; label: string }> {
  if (type === "character") {
    return characters.map((character) => ({
      id: character.id || character.name,
      label: character.name,
    }));
  }
  if (type === "chapter") {
    return chapters.map((chapter) => ({
      id: chapter.id || chapter.title,
      label: chapter.title,
    }));
  }
  if (type === "event") {
    return timeline.map((event) => ({
      id: event.id || event.title,
      label: event.title,
    }));
  }
  return [{ id: "world", label: "Project world" }];
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
