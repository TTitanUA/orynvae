from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Response, status

from app.core.debug_logging import debug_log
from app.models.projects import (
    CharacterBulkCreate,
    CharacterBulkCreateResponse,
    CharacterBulkDraftItem,
    CharacterBulkDraftRelationship,
    CharacterBulkDraftRequest,
    CharacterBulkDraftResponse,
    CharacterCreate,
    CharacterListItem,
    CharacterProfileAssistRequest,
    CharacterProfileAssistResponse,
    CharacterProfileDraft,
    CharacterRecord,
    CharacterRelationshipCreate,
    CharacterUpdate,
    ProjectWorkspaceRecord,
)
from app.models.providers import ChatMessage
from app.providers.adapters import create_adapter
from app.services import character_store, project_store, provider_store

router = APIRouter(prefix="/projects/{project_id}/characters", tags=["characters"])


@router.get("", response_model=list[CharacterListItem])
def list_project_characters(project_id: str) -> list[CharacterListItem]:
    characters = character_store.list_characters(project_id)
    if characters is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return characters


@router.post("", response_model=CharacterRecord, status_code=status.HTTP_201_CREATED)
def create_project_character(project_id: str, payload: CharacterCreate) -> CharacterRecord:
    try:
        character = character_store.create_character(project_id, payload)
    except character_store.CharacterValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if character is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return character


@router.get("/{character_id}", response_model=CharacterRecord)
def get_project_character(project_id: str, character_id: str) -> CharacterRecord:
    character = character_store.get_character(project_id, character_id)
    if character is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    return character


@router.patch("/{character_id}", response_model=CharacterRecord)
def update_project_character(
    project_id: str,
    character_id: str,
    payload: CharacterUpdate,
) -> CharacterRecord:
    try:
        character = character_store.update_character(project_id, character_id, payload)
    except character_store.CharacterValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if character is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    return character


@router.delete("/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_character(project_id: str, character_id: str) -> Response:
    if not character_store.delete_character(project_id, character_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/bulk", response_model=CharacterBulkCreateResponse, status_code=status.HTTP_201_CREATED)
def bulk_create_project_characters(
    project_id: str,
    payload: CharacterBulkCreate,
) -> CharacterBulkCreateResponse:
    try:
        result = character_store.bulk_create_characters(project_id, payload)
    except character_store.CharacterValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return result


@router.post("/assist/bulk-draft", response_model=CharacterBulkDraftResponse)
async def assist_bulk_character_draft(
    project_id: str,
    payload: CharacterBulkDraftRequest,
) -> CharacterBulkDraftResponse:
    workspace = project_store.get_project_workspace(project_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    provider_id, model_id = _resolve_model_selection(workspace, payload.provider_id, payload.model_id)
    if not provider_id or not model_id:
        debug_log("backend", "LLM", "characters.bulk_draft.fallback.no_model", {"project_id": project_id})
        result = _fallback_bulk_draft(payload)
        result.warnings.append("AI model is not selected; local parsing fallback was used.")
        return result

    stored, model = _load_allowed_provider_model(provider_id, model_id)
    adapter = create_adapter(stored.provider, stored.api_key)
    try:
        raw = await adapter.complete_chat(
            model_id=model_id,
            temperature=0.35,
            routing_config=model.routing_config,
            messages=_bulk_draft_messages(workspace, payload),
        )
    except Exception as exc:
        debug_log(
            "backend",
            "LLM",
            "characters.bulk_draft.fallback.error",
            {
                "project_id": project_id,
                "provider_id": provider_id,
                "model_id": model_id,
                "error_type": exc.__class__.__name__,
                "error": str(exc),
            },
        )
        result = _fallback_bulk_draft(payload)
        result.warnings.append(f"AI draft unavailable: {exc.__class__.__name__}.")
        return result

    result = _bulk_draft_from_ai_text(raw, payload)
    result.raw_text = raw
    return result


@router.post("/assist/profile", response_model=CharacterProfileAssistResponse)
async def assist_character_profile(
    project_id: str,
    payload: CharacterProfileAssistRequest,
) -> CharacterProfileAssistResponse:
    workspace = project_store.get_project_workspace(project_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    provider_id, model_id = _resolve_model_selection(workspace, payload.provider_id, payload.model_id)
    if not provider_id or not model_id:
        debug_log("backend", "LLM", "characters.profile.fallback.no_model", {"project_id": project_id})
        result = _fallback_profile_assist(workspace, payload)
        result.warnings.append("AI model is not selected; local profile fallback was used.")
        return result

    stored, model = _load_allowed_provider_model(provider_id, model_id)
    adapter = create_adapter(stored.provider, stored.api_key)
    try:
        raw = await adapter.complete_chat(
            model_id=model_id,
            temperature=0.42,
            routing_config=model.routing_config,
            messages=_profile_assist_messages(workspace, payload),
        )
    except Exception as exc:
        debug_log(
            "backend",
            "LLM",
            "characters.profile.fallback.error",
            {
                "project_id": project_id,
                "provider_id": provider_id,
                "model_id": model_id,
                "error_type": exc.__class__.__name__,
                "error": str(exc),
            },
        )
        result = _fallback_profile_assist(workspace, payload)
        result.warnings.append(f"AI profile assist unavailable: {exc.__class__.__name__}.")
        return result

    result = _profile_assist_from_ai_text(raw, workspace)
    result.raw_text = raw
    return result


def _resolve_model_selection(
    workspace: ProjectWorkspaceRecord,
    provider_id: str | None,
    model_id: str | None,
) -> tuple[str | None, str | None]:
    if provider_id or model_id:
        if not provider_id or not model_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Provider and model must be selected together",
            )
        return provider_id, model_id
    return workspace.project.provider_id, workspace.project.model_id


def _load_allowed_provider_model(provider_id: str, model_id: str):
    stored = provider_store.get_provider(provider_id)
    if stored is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    if not stored.provider.is_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Provider is disabled")
    model = provider_store.get_model(provider_id, model_id)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Model does not belong to this provider",
        )
    if not model.is_allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Model is not allowed for this provider",
        )
    return stored, model


def _bulk_draft_messages(
    workspace: ProjectWorkspaceRecord,
    payload: CharacterBulkDraftRequest,
) -> list[ChatMessage]:
    return [
        ChatMessage(
            role="system",
            content=(
                "You draft fictional character records. Return compact valid JSON only with "
                "characters, relationships, and warnings. Character fields: draft_id, name, "
                "gender, age, role, biography. Relationship fields: source_draft_id, "
                "target_draft_id, relationship_type, description. Do not duplicate existing "
                "characters unless the user explicitly asks."
            ),
        ),
        ChatMessage(
            role="user",
            content="\n\n".join(
                [
                    _workspace_context(workspace),
                    _existing_characters_context(workspace),
                    (
                        f"Max characters: {payload.max_characters}. "
                        f"Include relationships: {payload.include_relationships}."
                    ),
                    f"User request:\n{payload.prompt}",
                ]
            ),
        ),
    ]


def _profile_assist_messages(
    workspace: ProjectWorkspaceRecord,
    payload: CharacterProfileAssistRequest,
) -> list[ChatMessage]:
    return [
        ChatMessage(
            role="system",
            content=(
                "You help fiction authors refine one character profile. Return compact valid "
                "JSON only with patch, suggested_relationships, and warnings. Patch may include "
                "name, gender, age, role, biography, motivation, goal, fear, internal_conflict. "
                "Suggested relationships must use target_character_id values from existing "
                "characters only."
            ),
        ),
        ChatMessage(
            role="user",
            content="\n\n".join(
                [
                    _workspace_context(workspace),
                    _existing_characters_context(workspace),
                    f"Mode: {payload.mode}",
                    f"Character id: {payload.character_id}" if payload.character_id else "",
                    f"Current draft JSON: {payload.draft.model_dump_json()}",
                    f"User instruction: {payload.instruction}" if payload.instruction else "",
                ]
            ),
        ),
    ]


def _workspace_context(workspace: ProjectWorkspaceRecord) -> str:
    settings = workspace.settings
    return "\n".join(
        part
        for part in [
            f"Project: {workspace.project.name}",
            f"Synopsis: {workspace.project.synopsis}" if workspace.project.synopsis else "",
            f"Genre: {settings.genre}" if settings.genre else "",
            f"Tone: {settings.tone}" if settings.tone else "",
            f"Setting: {settings.setting}" if settings.setting else "",
            f"Central conflict: {settings.central_conflict}" if settings.central_conflict else "",
            f"Themes: {', '.join(settings.themes)}" if settings.themes else "",
        ]
        if part
    )


def _existing_characters_context(workspace: ProjectWorkspaceRecord) -> str:
    if not workspace.characters:
        return "Existing characters: none."
    lines = [
        f"- {character.id}: {character.name}; {character.gender or ''}; "
        f"{character.age or ''}; {character.role or ''}; {character.biography or ''}"
        for character in workspace.characters[:30]
    ]
    return "Existing characters:\n" + "\n".join(lines)


def _bulk_draft_from_ai_text(
    raw_text: str,
    payload: CharacterBulkDraftRequest,
) -> CharacterBulkDraftResponse:
    parsed = _parse_json_object(raw_text)
    if parsed is None:
        result = _fallback_bulk_draft(payload)
        result.warnings.append("AI returned non-JSON text; local parsing fallback was used.")
        return result

    raw_characters = parsed.get("characters")
    raw_relationships = parsed.get("relationships")
    warnings = _string_list(parsed.get("warnings"))
    characters: list[CharacterBulkDraftItem] = []
    if isinstance(raw_characters, list):
        for index, item in enumerate(raw_characters[: payload.max_characters]):
            if not isinstance(item, dict):
                continue
            name = _string(item.get("name"))
            if not name:
                continue
            characters.append(
                CharacterBulkDraftItem(
                    draft_id=_string(item.get("draft_id")) or f"draft-{index + 1}",
                    name=name,
                    gender=_string(item.get("gender")),
                    age=_string(item.get("age")),
                    role=_string(item.get("role")),
                    biography=_string(item.get("biography")),
                )
            )

    draft_ids = {character.draft_id for character in characters}
    relationships: list[CharacterBulkDraftRelationship] = []
    if payload.include_relationships and isinstance(raw_relationships, list):
        for item in raw_relationships:
            if not isinstance(item, dict):
                continue
            source_id = _string(item.get("source_draft_id"))
            target_id = _string(item.get("target_draft_id"))
            relationship_type = _string(item.get("relationship_type"))
            if not source_id or not target_id or not relationship_type:
                continue
            if source_id == target_id or source_id not in draft_ids or target_id not in draft_ids:
                warnings.append("Some AI relationship suggestions referenced invalid draft ids.")
                continue
            relationships.append(
                CharacterBulkDraftRelationship(
                    source_draft_id=source_id,
                    target_draft_id=target_id,
                    relationship_type=relationship_type,
                    description=_string(item.get("description")),
                )
            )

    if not characters:
        result = _fallback_bulk_draft(payload)
        result.warnings.extend(warnings)
        result.warnings.append("AI JSON did not include usable characters; fallback was used.")
        return result
    return CharacterBulkDraftResponse(
        characters=characters,
        relationships=relationships,
        warnings=warnings,
    )


def _fallback_bulk_draft(payload: CharacterBulkDraftRequest) -> CharacterBulkDraftResponse:
    lines = [line.strip() for line in payload.prompt.splitlines() if line.strip()]
    characters: list[CharacterBulkDraftItem] = []
    relationships: list[CharacterBulkDraftRelationship] = []
    relationship_markers: list[tuple[str, str, str]] = []

    for line in lines:
        relation_parts = [part.strip() for part in line.split(" - ") if part.strip()]
        if len(relation_parts) >= 3:
            relationship_markers.append((relation_parts[0], relation_parts[1], relation_parts[2]))
            continue
        parts = [part.strip() for part in line.split(",")]
        name = parts[0] if parts else ""
        if not name:
            continue
        characters.append(
            CharacterBulkDraftItem(
                draft_id=f"draft-{len(characters) + 1}",
                name=name[:160],
                gender=parts[1] if len(parts) > 1 else None,
                age=parts[2] if len(parts) > 2 else None,
                role=parts[3] if len(parts) > 3 else (parts[1] if len(parts) > 1 else None),
                biography=parts[4] if len(parts) > 4 else None,
            )
        )
        if len(characters) >= payload.max_characters:
            break

    if not characters:
        words = payload.prompt.strip().split()
        name = " ".join(words[:2]).strip(".,:;!?") or "New character"
        characters.append(
            CharacterBulkDraftItem(
                draft_id="draft-1",
                name=name[:160],
                role="to be defined",
                biography=payload.prompt.strip()[:500] or None,
            )
        )

    if payload.include_relationships:
        ids_by_name = {character.name.lower(): character.draft_id for character in characters}
        for source_name, relationship_type, target_name in relationship_markers:
            source_id = ids_by_name.get(source_name.lower())
            target_id = ids_by_name.get(target_name.lower())
            if source_id and target_id and source_id != target_id:
                relationships.append(
                    CharacterBulkDraftRelationship(
                        source_draft_id=source_id,
                        target_draft_id=target_id,
                        relationship_type=relationship_type,
                    )
                )

    return CharacterBulkDraftResponse(
        characters=characters,
        relationships=relationships,
        warnings=["Fallback accepts lines like: Name, gender, age, role."],
    )


def _profile_assist_from_ai_text(
    raw_text: str,
    workspace: ProjectWorkspaceRecord,
) -> CharacterProfileAssistResponse:
    parsed = _parse_json_object(raw_text)
    if parsed is None:
        return CharacterProfileAssistResponse(
            warnings=["AI returned non-JSON text; no profile changes were applied."],
            raw_text=raw_text,
        )

    patch_raw = parsed.get("patch") if isinstance(parsed.get("patch"), dict) else {}
    patch = CharacterProfileDraft(
        name=_string(patch_raw.get("name")),
        gender=_string(patch_raw.get("gender")),
        age=_string(patch_raw.get("age")),
        role=_string(patch_raw.get("role")),
        biography=_string(patch_raw.get("biography")),
        motivation=_string(patch_raw.get("motivation")),
        goal=_string(patch_raw.get("goal")),
        fear=_string(patch_raw.get("fear")),
        internal_conflict=_string(patch_raw.get("internal_conflict")),
    )
    existing_ids = {character.id for character in workspace.characters if character.id}
    warnings = _string_list(parsed.get("warnings"))
    relationships: list[CharacterRelationshipCreate] = []
    raw_relationships = parsed.get("suggested_relationships")
    if isinstance(raw_relationships, list):
        for item in raw_relationships:
            if not isinstance(item, dict):
                continue
            target_id = _string(item.get("target_character_id"))
            relationship_type = _string(item.get("relationship_type"))
            if not target_id or not relationship_type:
                continue
            if target_id not in existing_ids:
                warnings.append("Some relationship suggestions referenced unknown characters.")
                continue
            relationships.append(
                CharacterRelationshipCreate(
                    target_character_id=target_id,
                    relationship_type=relationship_type,
                    description=_string(item.get("description")),
                )
            )
    return CharacterProfileAssistResponse(
        patch=patch,
        suggested_relationships=relationships,
        warnings=warnings,
    )


def _fallback_profile_assist(
    workspace: ProjectWorkspaceRecord,
    payload: CharacterProfileAssistRequest,
) -> CharacterProfileAssistResponse:
    draft = payload.draft
    name = _string(draft.name) or "Character"
    role = _string(draft.role) or "central figure"
    patch = CharacterProfileDraft()

    if payload.mode in {"expand", "revise"}:
        patch.biography = draft.biography or (
            f"{name} moves through the story as a {role} whose public role hides a private cost."
        )
        patch.motivation = draft.motivation or "Protect what still feels personally true."
        patch.goal = draft.goal or "Make a choice that changes their place in the project conflict."
        patch.fear = draft.fear or "Losing the identity that made survival possible."
        patch.internal_conflict = draft.internal_conflict or (
            "They want control, but the story asks them to trust another person or truth."
        )
    elif payload.mode == "conflict":
        patch.fear = draft.fear or "Being seen clearly at the wrong moment."
        patch.internal_conflict = draft.internal_conflict or (
            "The safest lie protects them from the one change they need."
        )

    relationships: list[CharacterRelationshipCreate] = []
    if payload.mode == "relationships" and payload.character_id:
        for character in workspace.characters:
            if character.id and character.id != payload.character_id:
                relationships.append(
                    CharacterRelationshipCreate(
                        target_character_id=character.id,
                        relationship_type="foil",
                        description=f"{character.name} pressures {name}'s central contradiction.",
                    )
                )
                break

    return CharacterProfileAssistResponse(patch=patch, suggested_relationships=relationships)


def _parse_json_object(text: str) -> dict[str, Any] | None:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        parsed = json.loads(stripped[start : end + 1])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _string(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]
