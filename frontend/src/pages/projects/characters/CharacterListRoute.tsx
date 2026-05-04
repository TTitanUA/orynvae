import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink } from "react-router-dom";
import {
  Bot,
  ChevronLeft,
  CirclePlus,
  Pencil,
  Save,
  Sparkles,
  Trash2,
  UsersRound,
} from "lucide-react";

import {
  characterMutations,
  characterQueries,
  characterQueryKeys,
  type CharacterBulkDraftRelationship,
  type CharacterListItem,
} from "../../../entities/character";
import { projectQueries, projectQueryKeys } from "../../../entities/project";
import {
  bulkDraftToPayload,
  draftRowsFromResponse,
  duplicateDraftWarnings,
  type CharacterBulkDraftRow,
} from "../../../features/assist-character-bulk";
import { AppShell } from "../../../widgets/app-shell";
import "./CharacterListRoute.css";

type CharacterListRouteProps = {
  projectId: string;
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

function workspaceSectionPath(projectId: string, section: string): string {
  return `/projects/${encodeURIComponent(projectId)}/workspace/${section}`;
}

function text(value: string | null | undefined): string {
  return value ?? "";
}

function relationLabel(character: CharacterListItem, relationship: CharacterListItem["relationships"][number]) {
  const otherName =
    relationship.source_character_id === character.id
      ? relationship.target_character_name
      : relationship.source_character_name;
  return `${relationship.relationship_type}: ${otherName || "Unknown"}`;
}

async function invalidateCharacterData(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: characterQueryKeys.list(projectId) }),
    queryClient.invalidateQueries({ queryKey: projectQueryKeys.workspace(projectId) }),
    queryClient.invalidateQueries({ queryKey: projectQueryKeys.chapterEditor(projectId) }),
  ]);
}

export function CharacterListRoute({ projectId }: CharacterListRouteProps) {
  const queryClient = useQueryClient();
  const charactersQuery = useQuery(characterQueries.list(projectId));
  const workspaceQuery = useQuery(projectQueries.workspace(projectId));
  const deleteMutation = useMutation({
    ...characterMutations.delete(projectId),
    onSuccess: async () => {
      await invalidateCharacterData(queryClient, projectId);
    },
  });
  const bulkDraftMutation = useMutation(characterMutations.bulkDraft(projectId));
  const bulkCreateMutation = useMutation({
    ...characterMutations.bulkCreate(projectId),
    onSuccess: async () => {
      await invalidateCharacterData(queryClient, projectId);
    },
  });
  const characters = useMemo(() => charactersQuery.data || [], [charactersQuery.data]);
  const workspace = workspaceQuery.data;
  const [prompt, setPrompt] = useState("");
  const [draftRows, setDraftRows] = useState<CharacterBulkDraftRow[]>([]);
  const [draftRelationships, setDraftRelationships] = useState<CharacterBulkDraftRelationship[]>([]);
  const [assistantWarnings, setAssistantWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const duplicateWarnings = useMemo(
    () => duplicateDraftWarnings(draftRows, characters),
    [characters, draftRows],
  );
  const loading = charactersQuery.isPending || workspaceQuery.isPending;
  const displayError =
    error ||
    (charactersQuery.error instanceof Error ? charactersQuery.error.message : undefined) ||
    (workspaceQuery.error instanceof Error ? workspaceQuery.error.message : undefined);
  const selectedDraftCount = draftRows.filter((row) => row.selected && row.name.trim()).length;

  function updateDraftRow(index: number, patch: Partial<CharacterBulkDraftRow>) {
    setDraftRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }

  function updateDraftRelationship(index: number, patch: Partial<CharacterBulkDraftRelationship>) {
    setDraftRelationships((current) =>
      current.map((relationship, relationshipIndex) =>
        relationshipIndex === index ? { ...relationship, ...patch } : relationship,
      ),
    );
  }

  async function generateDraft() {
    if (!prompt.trim()) {
      return;
    }
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await bulkDraftMutation.mutateAsync({
        prompt,
        provider_id: workspace?.project.provider_id,
        model_id: workspace?.project.model_id,
        max_characters: 8,
        include_relationships: true,
      });
      setDraftRows(draftRowsFromResponse(result.characters));
      setDraftRelationships(result.relationships);
      setAssistantWarnings(result.warnings);
      setNotice("Draft ready.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Draft generation failed.");
    }
  }

  async function createSelected(selectAll: boolean) {
    const rows = selectAll ? draftRows.map((row) => ({ ...row, selected: true })) : draftRows;
    const payload = bulkDraftToPayload(rows, draftRelationships);
    if (!payload.characters.length) {
      setError("Select at least one character with a name.");
      return;
    }
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await bulkCreateMutation.mutateAsync(payload);
      setDraftRows([]);
      setDraftRelationships([]);
      setAssistantWarnings([]);
      setNotice(`${result.characters.length} characters created.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Characters could not be created.");
    }
  }

  async function removeCharacter(character: CharacterListItem) {
    if (!window.confirm(`Delete ${character.name}?`)) {
      return;
    }
    setError(undefined);
    setNotice(undefined);
    try {
      await deleteMutation.mutateAsync(character.id);
      setNotice("Character deleted.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Character could not be deleted.");
    }
  }

  return (
    <AppShell>
      <div className="character-list-route">
        <header className="character-list-route__header">
          <div>
            <Link className="character-list-route__back" to="/projects">
              <ChevronLeft size={16} aria-hidden="true" />
              Projects
            </Link>
            <h1>{workspace?.project.name || "Characters"}</h1>
            <p>Characters</p>
          </div>
          <Link
            className="character-list-route__primary"
            to={`/projects/${encodeURIComponent(projectId)}/workspace/characters/create`}
          >
            <CirclePlus size={16} aria-hidden="true" />
            New
          </Link>
        </header>

        <nav className="character-workspace-nav" aria-label="Workspace pages">
          {workspaceTabs.map(([id, label]) => (
            <NavLink key={id} to={workspaceSectionPath(projectId, id)}>
              {label}
            </NavLink>
          ))}
        </nav>

        {(displayError || notice) && (
          <div className={`character-list-route__message ${displayError ? "is-error" : "is-ready"}`}>
            {displayError || notice}
          </div>
        )}

        {loading ? (
          <div className="character-list-route__state">Loading characters...</div>
        ) : (
          <div className="character-list-route__layout">
            <section className="character-list-panel" aria-label="Characters">
              {characters.length === 0 ? (
                <div className="character-list-route__state">
                  <UsersRound size={20} aria-hidden="true" />
                  No characters yet.
                </div>
              ) : (
                <div className="character-list-table" role="table">
                  <div className="character-list-table__row is-head" role="row">
                    <span>Name</span>
                    <span>Role</span>
                    <span>Profile</span>
                    <span>Relationships</span>
                    <span>Actions</span>
                  </div>
                  {characters.map((character) => (
                    <div className="character-list-table__row" key={character.id} role="row">
                      <Link
                        className="character-list-table__name"
                        to={`/projects/${encodeURIComponent(projectId)}/workspace/characters/${encodeURIComponent(
                          character.id,
                        )}/edit`}
                      >
                        {character.name}
                      </Link>
                      <span>{character.role || "Open"}</span>
                      <span>
                        {[character.gender, character.age].filter(Boolean).join(", ") || "Open"}
                      </span>
                      <div className="character-list-table__chips">
                        {character.relationships.slice(0, 3).map((relationship) => (
                          <span key={relationship.id}>{relationLabel(character, relationship)}</span>
                        ))}
                        {character.relationships.length > 3 && (
                          <span>+{character.relationships.length - 3}</span>
                        )}
                      </div>
                      <div className="character-list-table__actions">
                        <Link
                          aria-label={`Edit ${character.name}`}
                          title="Edit"
                          to={`/projects/${encodeURIComponent(projectId)}/workspace/characters/${encodeURIComponent(
                            character.id,
                          )}/edit`}
                        >
                          <Pencil size={15} aria-hidden="true" />
                        </Link>
                        <button
                          aria-label={`Delete ${character.name}`}
                          title="Delete"
                          type="button"
                          onClick={() => void removeCharacter(character)}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <aside className="character-bulk-assist" aria-label="Bulk character assistant">
              <div className="character-bulk-assist__head">
                <span>
                  <Bot size={17} aria-hidden="true" />
                  Bulk Assist
                </span>
                <button
                  type="button"
                  disabled={bulkDraftMutation.isPending || !prompt.trim()}
                  onClick={() => void generateDraft()}
                >
                  <Sparkles size={16} aria-hidden="true" />
                  {bulkDraftMutation.isPending ? "Generating" : "Generate"}
                </button>
              </div>
              <textarea
                name="character-bulk-prompt"
                rows={7}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />

              {[...assistantWarnings, ...duplicateWarnings].length > 0 && (
                <div className="character-bulk-assist__warnings">
                  {[...assistantWarnings, ...duplicateWarnings].map((warning, index) => (
                    <span key={`${warning}-${index}`}>{warning}</span>
                  ))}
                </div>
              )}

              {draftRows.length > 0 && (
                <div className="character-draft-preview">
                  <div className="character-draft-preview__toolbar">
                    <strong>{selectedDraftCount} selected</strong>
                    <div>
                      <button
                        type="button"
                        disabled={bulkCreateMutation.isPending || selectedDraftCount === 0}
                        onClick={() => void createSelected(false)}
                      >
                        <Save size={15} aria-hidden="true" />
                        Selected
                      </button>
                      <button
                        type="button"
                        disabled={bulkCreateMutation.isPending}
                        onClick={() => void createSelected(true)}
                      >
                        <Save size={15} aria-hidden="true" />
                        All
                      </button>
                    </div>
                  </div>
                  <div className="character-draft-grid">
                    {draftRows.map((row, index) => (
                      <article className="character-draft-row" key={row.draft_id}>
                        <label className="character-draft-row__select">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(event) => updateDraftRow(index, { selected: event.target.checked })}
                          />
                          {row.draft_id}
                        </label>
                        <input
                          aria-label="Draft character name"
                          value={row.name}
                          onChange={(event) => updateDraftRow(index, { name: event.target.value })}
                        />
                        <input
                          aria-label="Draft character gender"
                          value={text(row.gender)}
                          onChange={(event) => updateDraftRow(index, { gender: event.target.value })}
                        />
                        <input
                          aria-label="Draft character age"
                          value={text(row.age)}
                          onChange={(event) => updateDraftRow(index, { age: event.target.value })}
                        />
                        <input
                          aria-label="Draft character role"
                          value={text(row.role)}
                          onChange={(event) => updateDraftRow(index, { role: event.target.value })}
                        />
                        <textarea
                          aria-label="Draft character biography"
                          rows={2}
                          value={text(row.biography)}
                          onChange={(event) => updateDraftRow(index, { biography: event.target.value })}
                        />
                      </article>
                    ))}
                  </div>

                  <section className="character-draft-relationships">
                    <div className="character-draft-preview__toolbar">
                      <strong>Relationships</strong>
                      <button
                        type="button"
                        disabled={draftRows.length < 2}
                        onClick={() =>
                          setDraftRelationships((current) => [
                            ...current,
                            {
                              source_draft_id: draftRows[0].draft_id,
                              target_draft_id: draftRows[1].draft_id,
                              relationship_type: "ally",
                              description: "",
                            },
                          ])
                        }
                      >
                        <CirclePlus size={15} aria-hidden="true" />
                      </button>
                    </div>
                    {draftRelationships.map((relationship, index) => (
                      <div className="character-draft-relationship-row" key={`${relationship.source_draft_id}-${index}`}>
                        <select
                          aria-label="Relationship source"
                          value={relationship.source_draft_id}
                          onChange={(event) =>
                            updateDraftRelationship(index, { source_draft_id: event.target.value })
                          }
                        >
                          {draftRows.map((row) => (
                            <option key={row.draft_id} value={row.draft_id}>
                              {row.name || row.draft_id}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label="Relationship type"
                          value={relationship.relationship_type}
                          onChange={(event) =>
                            updateDraftRelationship(index, { relationship_type: event.target.value })
                          }
                        />
                        <select
                          aria-label="Relationship target"
                          value={relationship.target_draft_id}
                          onChange={(event) =>
                            updateDraftRelationship(index, { target_draft_id: event.target.value })
                          }
                        >
                          {draftRows.map((row) => (
                            <option key={row.draft_id} value={row.draft_id}>
                              {row.name || row.draft_id}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label="Relationship description"
                          value={text(relationship.description)}
                          onChange={(event) =>
                            updateDraftRelationship(index, { description: event.target.value })
                          }
                        />
                        <button
                          aria-label="Remove draft relationship"
                          title="Remove"
                          type="button"
                          onClick={() =>
                            setDraftRelationships((current) =>
                              current.filter((_, relationshipIndex) => relationshipIndex !== index),
                            )
                          }
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </section>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}
