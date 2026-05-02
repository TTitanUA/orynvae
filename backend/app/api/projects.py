from __future__ import annotations

from collections.abc import AsyncIterator
import json
from typing import Any

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse

from app.models.projects import (
    ChapterAiRequest,
    ChapterEditorRecord,
    ChapterEditorRecordSet,
    ChapterEditorUpdate,
    ProjectCreate,
    ProjectRecord,
    ProjectSetupAnalysis,
    ProjectSetupAnalysisRequest,
    ProjectSetupCreate,
    ProjectUpdate,
    ProjectWorkspaceRecord,
    ProjectWorkspaceUpdate,
)
from app.models.providers import ChatMessage
from app.providers.adapters import create_adapter
from app.services import project_store, provider_store

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectRecord])
def list_projects() -> list[ProjectRecord]:
    return project_store.list_projects()


@router.post("", response_model=ProjectRecord, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate) -> ProjectRecord:
    _validate_provider_selection(payload.provider_id, payload.model_id)
    return project_store.create_project(payload)


@router.get("/{project_id}", response_model=ProjectRecord)
def get_project(project_id: str) -> ProjectRecord:
    project = project_store.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectRecord)
def update_project(project_id: str, payload: ProjectUpdate) -> ProjectRecord:
    _validate_provider_selection(payload.provider_id, payload.model_id)
    project = project_store.update_project(project_id, payload)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.get("/{project_id}/workspace", response_model=ProjectWorkspaceRecord)
def get_project_workspace(project_id: str) -> ProjectWorkspaceRecord:
    workspace = project_store.get_project_workspace(project_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return workspace


@router.put("/{project_id}/workspace", response_model=ProjectWorkspaceRecord)
def update_project_workspace(
    project_id: str,
    payload: ProjectWorkspaceUpdate,
) -> ProjectWorkspaceRecord:
    _validate_provider_selection(payload.provider_id, payload.model_id)
    workspace = project_store.update_project_workspace(project_id, payload)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return workspace


@router.get("/{project_id}/chapter-editor", response_model=ChapterEditorRecordSet)
def get_chapter_editor(project_id: str) -> ChapterEditorRecordSet:
    editor = project_store.get_chapter_editor(project_id)
    if editor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return editor


@router.put("/{project_id}/chapter-editor", response_model=ChapterEditorRecordSet)
def update_chapter_editor(
    project_id: str,
    payload: ChapterEditorUpdate,
) -> ChapterEditorRecordSet:
    editor = project_store.update_chapter_editor(project_id, payload)
    if editor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return editor


@router.post("/{project_id}/chapter-editor/assist")
async def assist_chapter_editor(project_id: str, payload: ChapterAiRequest) -> Response:
    editor = project_store.get_chapter_editor(project_id)
    if editor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    provider_id = payload.provider_id or editor.project.provider_id
    model_id = payload.model_id or editor.project.model_id
    if not provider_id or not model_id:
        return Response(
            content=_fallback_chapter_assist(editor, payload),
            media_type="text/plain; charset=utf-8",
        )

    stored = provider_store.get_provider(provider_id)
    if stored is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")

    adapter = create_adapter(stored.provider, stored.api_key)
    messages = _chapter_assist_messages(editor, payload)
    temperature = _chapter_temperature(payload.action)
    if payload.stream and stored.provider.streaming_enabled:
        return StreamingResponse(
            _stream_chunks(
                adapter.stream_chat(
                    model_id=model_id,
                    messages=messages,
                    temperature=temperature,
                )
            ),
            media_type="text/plain; charset=utf-8",
        )

    text = await adapter.complete_chat(
        model_id=model_id,
        messages=messages,
        temperature=temperature,
    )
    return Response(content=text, media_type="text/plain; charset=utf-8")


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_project(project_id: str) -> Response:
    if not project_store.archive_project(project_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/setup", response_model=ProjectRecord, status_code=status.HTTP_201_CREATED)
def create_project_from_setup(payload: ProjectSetupCreate) -> ProjectRecord:
    _validate_provider_selection(payload.provider_id, payload.model_id)
    return project_store.create_project_from_setup(payload)


async def _stream_chunks(chunks: AsyncIterator[str]) -> AsyncIterator[bytes]:
    async for chunk in chunks:
        yield chunk.encode("utf-8")


def _chapter_temperature(action: str) -> float:
    if action in {"continue", "brainstorm"}:
        return 0.72
    if action == "rewrite":
        return 0.48
    return 0.25


def _chapter_assist_messages(
    editor: ChapterEditorRecordSet,
    payload: ChapterAiRequest,
) -> list[ChatMessage]:
    chapter = _find_chapter(editor.chapters, payload.chapter_id)
    scene = _find_scene(chapter, payload.scene_id)
    action_instruction = {
        "continue": (
            "Continue the draft from the current ending. Keep continuity, voice, POV, "
            "and pacing. Return prose only unless the user asks for notes."
        ),
        "rewrite": (
            "Rewrite the selected passage or draft according to the instruction. Preserve "
            "story facts and return the revised prose only."
        ),
        "critique": (
            "Give concise editorial feedback. Focus on story logic, character motivation, "
            "voice, tension, and concrete next edits."
        ),
        "brainstorm": (
            "Generate useful chapter options. Provide compact bullets with scene beats, "
            "character choices, and complications."
        ),
    }[payload.action]
    scene_body = getattr(scene, "body", None) if scene is not None else None
    draft = payload.selected_text or payload.draft_text or scene_body
    if draft is None and chapter is not None:
        draft = chapter.body

    return [
        ChatMessage(
            role="system",
            content=(
                "You are Orynvae's chapter editor assistant for fiction authors. "
                "Respect the project canon and existing character arcs. Match the language "
                "and tone of the draft unless the user explicitly asks otherwise."
            ),
        ),
        ChatMessage(
            role="user",
            content="\n\n".join(
                part
                for part in [
                    _editor_context(editor),
                    _chapter_context(chapter, scene),
                    f"Task: {action_instruction}",
                    f"Persona / focus: {payload.persona}" if payload.persona else "",
                    f"User instruction: {payload.instructions}" if payload.instructions else "",
                    f"Draft:\n{draft}" if draft else "Draft: no prose has been written yet.",
                ]
                if part
            ),
        ),
    ]


def _fallback_chapter_assist(
    editor: ChapterEditorRecordSet,
    payload: ChapterAiRequest,
) -> str:
    chapter = _find_chapter(editor.chapters, payload.chapter_id)
    title = chapter.title if chapter else "the current chapter"
    if payload.action == "critique":
        return (
            f"Editorial pass for {title}:\n"
            "- Clarify the immediate character goal before the next beat.\n"
            "- Tie the scene turn back to the project conflict.\n"
            "- Add one sensory detail that belongs to this world, not a generic room.\n"
            "- End the passage on a decision, discovery, or cost."
        )
    if payload.action == "brainstorm":
        return (
            f"Options for {title}:\n"
            "- Open with a small contradiction in the canon notes.\n"
            "- Let a supporting character force the protagonist to choose a side.\n"
            "- Turn the chapter summary into three beats: pressure, reveal, consequence.\n"
            "- Carry one image from the synopsis into the closing paragraph."
        )
    if payload.action == "rewrite":
        source = payload.selected_text or payload.draft_text or (chapter.body if chapter else "")
        return source.strip() or f"Draft a sharper version of {title} around one clear choice."
    return (
        f"Continue {title} by moving from the last concrete action into a new complication. "
        "Keep the point of view close, make the next choice visible, and let the chapter "
        "end with a changed problem."
    )


def _editor_context(editor: ChapterEditorRecordSet) -> str:
    settings = editor.settings
    characters = ", ".join(
        f"{character.name} ({character.role or 'role open'})" for character in editor.characters[:8]
    )
    arcs = "; ".join(arc.title for arc in editor.arcs[:6])
    return "\n".join(
        part
        for part in [
            f"Project: {editor.project.name}",
            f"Synopsis: {editor.project.synopsis}" if editor.project.synopsis else "",
            f"Genre: {settings.genre}" if settings.genre else "",
            f"Tone: {settings.tone}" if settings.tone else "",
            f"Setting: {settings.setting}" if settings.setting else "",
            f"Point of view: {settings.point_of_view}" if settings.point_of_view else "",
            f"Central conflict: {settings.central_conflict}" if settings.central_conflict else "",
            f"Themes: {', '.join(settings.themes)}" if settings.themes else "",
            f"Characters: {characters}" if characters else "",
            f"Arcs: {arcs}" if arcs else "",
        ]
        if part
    )


def _chapter_context(
    chapter: ChapterEditorRecord | None,
    scene: object | None,
) -> str:
    if chapter is None:
        return ""
    scene_summary = ""
    if scene is not None:
        scene_title = getattr(scene, "title", None) or "Untitled scene"
        scene_summary = f"Scene: {scene_title}\nScene summary: {getattr(scene, 'summary', '') or ''}"
    return "\n".join(
        part
        for part in [
            f"Chapter: {chapter.title}",
            f"Chapter summary: {chapter.summary}" if chapter.summary else "",
            f"Chapter status: {chapter.status}",
            scene_summary,
        ]
        if part
    )


def _find_chapter(
    chapters: list[ChapterEditorRecord],
    chapter_id: str | None,
) -> ChapterEditorRecord | None:
    if chapter_id:
        for chapter in chapters:
            if chapter.id == chapter_id:
                return chapter
    return chapters[0] if chapters else None


def _find_scene(chapter: ChapterEditorRecord | None, scene_id: str | None) -> object | None:
    if chapter is None or not scene_id:
        return None
    for scene in chapter.scenes:
        if scene.id == scene_id:
            return scene
    return None


@router.post("/setup/analyze", response_model=ProjectSetupAnalysis)
async def analyze_project_setup(payload: ProjectSetupAnalysisRequest) -> ProjectSetupAnalysis:
    if not payload.provider_id or not payload.model_id:
        analysis = _fallback_analysis(payload.idea_text)
        analysis.warnings.append("AI-провайдер или модель не выбраны, создана локальная заготовка.")
        return analysis

    stored = provider_store.get_provider(payload.provider_id)
    if stored is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")

    adapter = create_adapter(stored.provider, stored.api_key)
    try:
        raw = await adapter.complete_chat(
            model_id=payload.model_id,
            temperature=0.35,
            messages=[
                ChatMessage(
                    role="system",
                    content=(
                        "You are an editorial project setup assistant. "
                        "Return only compact valid JSON with keys: title, description, "
                        "synopsis, genre, tone, setting, format, central_conflict, "
                        "themes, directions, target_length, point_of_view."
                    ),
                ),
                ChatMessage(
                    role="user",
                    content=(
                        "Analyze this story idea and produce an editable project setup. "
                        "Use Russian if the idea is Russian, otherwise use the same language "
                        f"as the idea.\n\n{payload.idea_text}"
                    ),
                ),
            ],
        )
    except Exception as exc:
        analysis = _fallback_analysis(payload.idea_text)
        analysis.warnings.append(f"AI-анализ недоступен: {exc.__class__.__name__}")
        return analysis

    analysis = _analysis_from_ai_text(raw, payload.idea_text)
    analysis.raw_text = raw
    return analysis


def _validate_provider_selection(provider_id: str | None, model_id: str | None) -> None:
    if not provider_id and not model_id:
        return
    if not provider_id or not model_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provider and model must be selected together",
        )
    if provider_store.get_provider(provider_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")


def _analysis_from_ai_text(raw_text: str, idea_text: str) -> ProjectSetupAnalysis:
    parsed = _parse_json_object(raw_text)
    if parsed is None:
        analysis = _fallback_analysis(idea_text)
        analysis.synopsis = raw_text.strip() or analysis.synopsis
        analysis.warnings.append("AI вернул неструктурированный ответ, текст помещен в синопсис.")
        return analysis

    fallback = _fallback_analysis(idea_text)
    return ProjectSetupAnalysis(
        title=_string(parsed.get("title")) or fallback.title,
        description=_string(parsed.get("description")) or fallback.description,
        synopsis=_string(parsed.get("synopsis")) or fallback.synopsis,
        genre=_string(parsed.get("genre")) or fallback.genre,
        tone=_string(parsed.get("tone")) or fallback.tone,
        setting=_string(parsed.get("setting")) or fallback.setting,
        format=_string(parsed.get("format")) or fallback.format,
        central_conflict=_string(parsed.get("central_conflict")) or fallback.central_conflict,
        themes=_string_list(parsed.get("themes")) or fallback.themes,
        directions=_string_list(parsed.get("directions")) or fallback.directions,
        target_length=_string(parsed.get("target_length")) or fallback.target_length,
        point_of_view=_string(parsed.get("point_of_view")) or fallback.point_of_view,
    )


def _fallback_analysis(idea_text: str) -> ProjectSetupAnalysis:
    clean = " ".join(idea_text.split())
    words = clean.split()
    title = " ".join(words[:6]).strip(".,:;!?") or "Новый проект"
    description = clean[:220] + ("..." if len(clean) > 220 else "")
    synopsis = clean if len(clean) < 900 else clean[:897] + "..."
    return ProjectSetupAnalysis(
        title=title,
        description=description,
        synopsis=synopsis,
        genre="Не определен",
        tone="Авторский",
        setting="Будет уточнен",
        format="Новелла",
        central_conflict="Главный конфликт будет уточнен в рабочем пространстве проекта.",
        themes=[],
        directions=[
            "Развить идею через персонажа с самой сильной внутренней ставкой.",
            "Сначала определить правила мира и цену ключевого выбора.",
            "Построить стартовую арку вокруг события, которое меняет статус-кво.",
        ],
        target_length="MVP-проект",
        point_of_view="Будет уточнена",
    )


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
