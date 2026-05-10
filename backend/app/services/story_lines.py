from __future__ import annotations

from app.models.ai_actions import AiActionContext, SuggestStoryLinesOutput
from app.models.projects import ProjectRecord
from app.models.story_lines import (
    StoryLineSuggestRequest,
    StoryLineSuggestResponse,
    StoryLineSuggestion,
)
from app.services import project_ai_settings, story_runtime_store


async def suggest_story_lines(
    project: ProjectRecord,
    payload: StoryLineSuggestRequest,
) -> StoryLineSuggestResponse:
    memory_items = [
        item
        for item in story_runtime_store.list_memory_items(project.id)
        if item.status != "rejected"
    ]
    story_lines = [
        line
        for line in story_runtime_store.list_story_lines(project.id)
        if line.status != "rejected"
    ]
    result = await project_ai_settings.execute_project_action(
        project_id=project.id,
        action_type="suggest_story_lines",
        input={
            "instructions": payload.instructions,
            "max_suggestions": payload.max_suggestions,
            "language": "ru",
            "mode": "suggest_additional_story_lines",
        },
        context=AiActionContext(
            synopsis=project.synopsis,
            project=project.model_dump(mode="json"),
            memory_items=[item.model_dump(mode="json") for item in memory_items],
            story_lines=[line.model_dump(mode="json") for line in story_lines],
            instructions=payload.instructions,
        ),
        privacy_level="project",
    )
    output = SuggestStoryLinesOutput.model_validate(result.structured_json)
    return StoryLineSuggestResponse(
        story_lines=[
            StoryLineSuggestion(
                type=line.type,
                title=line.title,
                description=line.description,
                current_state=line.current_state,
                priority=line.priority,
                reason=line.reason,
            )
            for line in output.story_lines[: payload.max_suggestions]
        ],
        warnings=output.warnings,
    )
