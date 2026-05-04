import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, useBeforeUnload, useBlocker, useNavigate } from "react-router-dom";
import {
  Bot,
  Brain,
  ChevronLeft,
  CirclePlus,
  Save,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";

import {
  characterMutations,
  characterQueries,
  characterQueryKeys,
  type CharacterProfileAssistMode,
} from "../../../entities/character";
import { projectQueries, projectQueryKeys } from "../../../entities/project";
import {
  applyProfileAssistPreview,
  profileAssistPreview,
  type ProfileAssistPreview,
} from "../../../features/assist-character-profile";
import {
  characterFormDraftToPayload,
  characterToFormDraft,
  emptyCharacterFormDraft,
  type CharacterFormDraft,
} from "../../../features/manage-character-form";
import { UnsavedChangesDialog } from "../../../shared/ui";
import { AppShell } from "../../../widgets/app-shell";
import "./CharacterFormRoute.css";

type CharacterFormRouteProps = {
  projectId: string;
  characterId?: string;
};

const workspaceTabs = [
  ["overview", "Overview"],
  ["ideas", "Idea Lab"],
  ["world", "World Bible"],
  ["characters", "Characters"],
  ["plot", "Plot Board"],
  ["canon", "Canon"],
  ["editor", "Editor"],
] as const;

const assistModes: Array<{ id: CharacterProfileAssistMode; label: string; icon: typeof Sparkles }> = [
  { id: "expand", label: "Expand", icon: WandSparkles },
  { id: "revise", label: "Improve", icon: Sparkles },
  { id: "relationships", label: "Links", icon: Bot },
  { id: "conflict", label: "Conflict", icon: Brain },
];

function workspaceSectionPath(projectId: string, section: string): string {
  return `/projects/${encodeURIComponent(projectId)}/workspace/${section}`;
}

function listPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/workspace/characters`;
}

function text(value: string | null | undefined): string {
  return value ?? "";
}

async function invalidateCharacterData(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  characterId?: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: characterQueryKeys.list(projectId) }),
    characterId
      ? queryClient.invalidateQueries({ queryKey: characterQueryKeys.detail(projectId, characterId) })
      : Promise.resolve(),
    queryClient.invalidateQueries({ queryKey: projectQueryKeys.workspace(projectId) }),
    queryClient.invalidateQueries({ queryKey: projectQueryKeys.chapterEditor(projectId) }),
  ]);
}

function fingerprint(draft: CharacterFormDraft): string {
  return JSON.stringify(draft);
}

export function CharacterFormRoute({ projectId, characterId }: CharacterFormRouteProps) {
  const isEdit = Boolean(characterId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const skipNextBlockerRef = useRef(false);
  const workspaceQuery = useQuery(projectQueries.workspace(projectId));
  const charactersQuery = useQuery(characterQueries.list(projectId));
  const characterQuery = useQuery(characterQueries.detail(projectId, characterId || ""));
  const createMutation = useMutation({
    ...characterMutations.create(projectId),
    onSuccess: async (saved) => {
      await invalidateCharacterData(queryClient, projectId, saved.id);
    },
  });
  const updateMutation = useMutation({
    ...characterMutations.update(projectId, characterId || ""),
    onSuccess: async (saved) => {
      await invalidateCharacterData(queryClient, projectId, saved.id);
    },
  });
  const deleteMutation = useMutation({
    ...characterMutations.delete(projectId),
    onSuccess: async () => {
      await invalidateCharacterData(queryClient, projectId);
    },
  });
  const profileAssistMutation = useMutation(characterMutations.profileAssist(projectId));
  const [formState, setFormState] = useState(() => ({
    draft: emptyCharacterFormDraft,
    savedFingerprint: fingerprint(emptyCharacterFormDraft),
    loadedKey: "",
  }));
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [assistantInstruction, setAssistantInstruction] = useState("");
  const [assistantWarnings, setAssistantWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<ProfileAssistPreview>();
  const workspace = workspaceQuery.data;
  const characters = useMemo(() => charactersQuery.data || [], [charactersQuery.data]);
  const relationshipOptions = useMemo(
    () => characters.filter((character) => character.id !== characterId),
    [characterId, characters],
  );
  const relationshipNameById = useMemo(
    () => new Map(characters.map((character) => [character.id, character.name])),
    [characters],
  );
  const loading =
    workspaceQuery.isPending || charactersQuery.isPending || (isEdit && characterQuery.isPending);
  const saving = createMutation.isPending || updateMutation.isPending;
  const displayError =
    error ||
    (workspaceQuery.error instanceof Error ? workspaceQuery.error.message : undefined) ||
    (charactersQuery.error instanceof Error ? charactersQuery.error.message : undefined) ||
    (characterQuery.error instanceof Error ? characterQuery.error.message : undefined);
  let draft = formState.draft;
  let savedFingerprint = formState.savedFingerprint;
  const loadedKey = isEdit ? characterQuery.data?.id : "new";
  if (loadedKey && formState.loadedKey !== loadedKey) {
    const nextDraft =
      isEdit && characterQuery.data ? characterToFormDraft(characterQuery.data) : emptyCharacterFormDraft;
    const nextFingerprint = fingerprint(nextDraft);
    draft = nextDraft;
    savedFingerprint = nextFingerprint;
    setFormState({
      draft: nextDraft,
      savedFingerprint: nextFingerprint,
      loadedKey,
    });
  }
  const isDirty = fingerprint(draft) !== savedFingerprint;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (skipNextBlockerRef.current) {
      skipNextBlockerRef.current = false;
      return false;
    }
    return isDirty && currentLocation.pathname !== nextLocation.pathname;
  });

  useBeforeUnload((event) => {
    if (!isDirty) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });

  function updateDraft(patch: Partial<CharacterFormDraft>) {
    setFormState((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
  }

  function updateRelationship(index: number, patch: Partial<CharacterFormDraft["relationships"][number]>) {
    setFormState((current) => ({
      ...current,
      draft: {
        ...current.draft,
        relationships: current.draft.relationships.map((relationship, relationshipIndex) =>
          relationshipIndex === index ? { ...relationship, ...patch } : relationship,
        ),
      },
    }));
  }

  function addRelationship() {
    const target = relationshipOptions[0];
    if (!target) {
      return;
    }
    setFormState((current) => ({
      ...current,
      draft: {
        ...current.draft,
        relationships: [
          ...current.draft.relationships,
          {
            target_character_id: target.id,
            relationship_type: "ally",
            description: "",
          },
        ],
      },
    }));
  }

  async function saveCharacter() {
    const payload = characterFormDraftToPayload(draft);
    if (!payload.name.trim()) {
      setError("Character name is required.");
      return;
    }
    setError(undefined);
    setNotice(undefined);
    try {
      if (isEdit && characterId) {
        const saved = await updateMutation.mutateAsync(payload);
        const nextDraft = characterToFormDraft(saved);
        setFormState({
          draft: nextDraft,
          savedFingerprint: fingerprint(nextDraft),
          loadedKey: saved.id,
        });
        setNotice("Character saved.");
      } else {
        const saved = await createMutation.mutateAsync(payload);
        const nextDraft = characterToFormDraft(saved);
        setFormState({
          draft: nextDraft,
          savedFingerprint: fingerprint(nextDraft),
          loadedKey: saved.id,
        });
        setNotice("Character created.");
        skipNextBlockerRef.current = true;
        navigate(`/projects/${encodeURIComponent(projectId)}/workspace/characters/${saved.id}/edit`, {
          replace: true,
        });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Character could not be saved.");
    }
  }

  async function deleteCurrentCharacter() {
    if (!characterId || !window.confirm(`Delete ${draft.name || "this character"}?`)) {
      return;
    }
    setError(undefined);
    setNotice(undefined);
    try {
      await deleteMutation.mutateAsync(characterId);
      skipNextBlockerRef.current = true;
      navigate(listPath(projectId), { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Character could not be deleted.");
    }
  }

  async function runProfileAssist(mode: CharacterProfileAssistMode) {
    setError(undefined);
    setNotice(undefined);
    setPreview(undefined);
    try {
      const response = await profileAssistMutation.mutateAsync({
        character_id: characterId,
        draft: {
          name: draft.name,
          gender: draft.gender,
          age: draft.age,
          role: draft.role,
          biography: draft.biography,
          motivation: draft.motivation,
          goal: draft.goal,
          fear: draft.fear,
          internal_conflict: draft.internal_conflict,
        },
        instruction: assistantInstruction,
        mode,
        provider_id: workspace?.project.provider_id,
        model_id: workspace?.project.model_id,
      });
      setAssistantWarnings(response.warnings);
      setPreview(profileAssistPreview(draft, response));
      setNotice("Profile draft ready.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Profile assist failed.");
    }
  }

  function applyPreview() {
    if (!preview) {
      return;
    }
    setFormState((current) => ({
      ...current,
      draft: applyProfileAssistPreview(current.draft, preview),
    }));
    setPreview(undefined);
    setNotice("Profile changes applied.");
  }

  function discardChangesAndLeave() {
    if (isEdit && characterQuery.data) {
      const nextDraft = characterToFormDraft(characterQuery.data);
      setFormState({
        draft: nextDraft,
        savedFingerprint: fingerprint(nextDraft),
        loadedKey: characterQuery.data.id,
      });
    } else {
      setFormState({
        draft: emptyCharacterFormDraft,
        savedFingerprint: fingerprint(emptyCharacterFormDraft),
        loadedKey: "new",
      });
    }
    if (blocker.state === "blocked") {
      blocker.proceed();
    }
  }

  return (
    <AppShell>
      <div className="character-form-route">
        <header className="character-form-route__header">
          <div>
            <Link className="character-form-route__back" to={listPath(projectId)}>
              <ChevronLeft size={16} aria-hidden="true" />
              Characters
            </Link>
            <h1>{isEdit ? draft.name || "Edit character" : "New character"}</h1>
            <p>{workspace?.project.name || "Project"}</p>
          </div>
          <div className="character-form-route__actions">
            {isEdit && (
              <button type="button" onClick={() => void deleteCurrentCharacter()}>
                <Trash2 size={16} aria-hidden="true" />
                Delete
              </button>
            )}
            <button type="button" disabled={saving || !draft.name.trim()} onClick={() => void saveCharacter()}>
              <Save size={16} aria-hidden="true" />
              {saving ? "Saving" : "Save"}
            </button>
          </div>
        </header>

        <nav className="character-workspace-nav" aria-label="Workspace pages">
          {workspaceTabs.map(([id, label]) => (
            <NavLink key={id} to={workspaceSectionPath(projectId, id)}>
              {label}
            </NavLink>
          ))}
        </nav>

        {(displayError || notice) && (
          <div className={`character-form-route__message ${displayError ? "is-error" : "is-ready"}`}>
            {displayError || notice}
          </div>
        )}

        {loading ? (
          <div className="character-form-route__state">Loading character...</div>
        ) : (
          <div className="character-form-route__layout">
            <main className="character-form-panel">
              <section className="character-form-section">
                <div className="character-form-grid is-three">
                  <label>
                    Name
                    <input
                      name="character-name"
                      value={draft.name}
                      onChange={(event) => updateDraft({ name: event.target.value })}
                    />
                  </label>
                  <label>
                    Role
                    <input
                      name="character-role"
                      value={draft.role}
                      onChange={(event) => updateDraft({ role: event.target.value })}
                    />
                  </label>
                  <label>
                    Gender
                    <input
                      name="character-gender"
                      value={draft.gender}
                      onChange={(event) => updateDraft({ gender: event.target.value })}
                    />
                  </label>
                  <label>
                    Age
                    <input
                      name="character-age"
                      value={draft.age}
                      onChange={(event) => updateDraft({ age: event.target.value })}
                    />
                  </label>
                </div>
                <label>
                  Biography
                  <textarea
                    name="character-biography"
                    rows={6}
                    value={draft.biography}
                    onChange={(event) => updateDraft({ biography: event.target.value })}
                  />
                </label>
                <div className="character-form-grid is-two">
                  <label>
                    Motivation
                    <textarea
                      name="character-motivation"
                      rows={4}
                      value={draft.motivation}
                      onChange={(event) => updateDraft({ motivation: event.target.value })}
                    />
                  </label>
                  <label>
                    Goal
                    <textarea
                      name="character-goal"
                      rows={4}
                      value={draft.goal}
                      onChange={(event) => updateDraft({ goal: event.target.value })}
                    />
                  </label>
                  <label>
                    Fear
                    <textarea
                      name="character-fear"
                      rows={4}
                      value={draft.fear}
                      onChange={(event) => updateDraft({ fear: event.target.value })}
                    />
                  </label>
                  <label>
                    Internal conflict
                    <textarea
                      name="character-internal-conflict"
                      rows={4}
                      value={draft.internal_conflict}
                      onChange={(event) => updateDraft({ internal_conflict: event.target.value })}
                    />
                  </label>
                </div>
              </section>

              <section className="character-form-section">
                <div className="character-form-section__head">
                  <h2>Relationships</h2>
                  <button type="button" disabled={relationshipOptions.length === 0} onClick={addRelationship}>
                    <CirclePlus size={16} aria-hidden="true" />
                    Add
                  </button>
                </div>
                {draft.relationships.length === 0 ? (
                  <div className="character-form-route__state">No relationships.</div>
                ) : (
                  <div className="character-relationship-list">
                    {draft.relationships.map((relationship, index) => (
                      <div className="character-relationship-row" key={`${relationship.target_character_id}-${index}`}>
                        <select
                          aria-label="Relationship target"
                          value={relationship.target_character_id}
                          onChange={(event) =>
                            updateRelationship(index, { target_character_id: event.target.value })
                          }
                        >
                          {relationshipOptions.map((character) => (
                            <option key={character.id} value={character.id}>
                              {character.name}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label="Relationship type"
                          value={relationship.relationship_type}
                          onChange={(event) =>
                            updateRelationship(index, { relationship_type: event.target.value })
                          }
                        />
                        <input
                          aria-label="Relationship description"
                          value={relationship.description}
                          onChange={(event) =>
                            updateRelationship(index, { description: event.target.value })
                          }
                        />
                        <button
                          aria-label="Remove relationship"
                          title="Remove"
                          type="button"
                          onClick={() =>
                            setFormState((current) => ({
                              ...current,
                              draft: {
                                ...current.draft,
                                relationships: current.draft.relationships.filter(
                                  (_, relationshipIndex) => relationshipIndex !== index,
                                ),
                              },
                            }))
                          }
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </main>

            <aside className="character-profile-assist" aria-label="Character profile assistant">
              <div className="character-profile-assist__head">
                <span>
                  <Bot size={17} aria-hidden="true" />
                  Profile Assist
                </span>
              </div>
              <textarea
                name="character-profile-instruction"
                rows={5}
                value={assistantInstruction}
                onChange={(event) => setAssistantInstruction(event.target.value)}
              />
              <div className="character-profile-assist__actions">
                {assistModes.map((mode) => {
                  const Icon = mode.icon;
                  return (
                    <button
                      type="button"
                      disabled={profileAssistMutation.isPending}
                      key={mode.id}
                      onClick={() => void runProfileAssist(mode.id)}
                    >
                      <Icon size={16} aria-hidden="true" />
                      {mode.label}
                    </button>
                  );
                })}
              </div>

              {assistantWarnings.length > 0 && (
                <div className="character-profile-assist__warnings">
                  {assistantWarnings.map((warning, index) => (
                    <span key={`${warning}-${index}`}>{warning}</span>
                  ))}
                </div>
              )}

              {preview && (
                <section className="character-profile-preview">
                  <div className="character-profile-preview__head">
                    <strong>Preview</strong>
                    <button
                      type="button"
                      disabled={
                        preview.fields.every((field) => !field.selected) &&
                        preview.relationships.every((relationship) => !relationship.selected)
                      }
                      onClick={applyPreview}
                    >
                      <Save size={15} aria-hidden="true" />
                      Apply
                    </button>
                  </div>
                  {preview.fields.map((field, index) => (
                    <label className="character-profile-diff" key={field.field}>
                      <input
                        type="checkbox"
                        checked={field.selected}
                        onChange={(event) =>
                          setPreview((current) =>
                            current
                              ? {
                                  ...current,
                                  fields: current.fields.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, selected: event.target.checked }
                                      : item,
                                  ),
                                }
                              : current,
                          )
                        }
                      />
                      <span>{field.label}</span>
                      <small>{field.currentValue || "Empty"}</small>
                      <strong>{field.nextValue}</strong>
                    </label>
                  ))}
                  {preview.relationships.map((relationship, index) => (
                    <label className="character-profile-diff" key={`${relationship.target_character_id}-${index}`}>
                      <input
                        type="checkbox"
                        checked={relationship.selected}
                        onChange={(event) =>
                          setPreview((current) =>
                            current
                              ? {
                                  ...current,
                                  relationships: current.relationships.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, selected: event.target.checked }
                                      : item,
                                  ),
                                }
                              : current,
                          )
                        }
                      />
                      <span>{relationship.relationship_type}</span>
                      <small>{relationshipNameById.get(relationship.target_character_id) || "Character"}</small>
                      <strong>{text(relationship.description)}</strong>
                    </label>
                  ))}
                  {preview.fields.length === 0 && preview.relationships.length === 0 && (
                    <div className="character-form-route__state">No changes returned.</div>
                  )}
                </section>
              )}
            </aside>
          </div>
        )}

        {blocker.state === "blocked" && (
          <UnsavedChangesDialog onLeave={discardChangesAndLeave} onStay={() => blocker.reset()} />
        )}
      </div>
    </AppShell>
  );
}
