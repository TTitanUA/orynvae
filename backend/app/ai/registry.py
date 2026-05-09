from __future__ import annotations

from dataclasses import dataclass
from typing import get_args

from pydantic import BaseModel

from app.models.ai_actions import (
    AiActionDefinitionResponse,
    AiActionType,
    AnalyzeSynopsisOutput,
    AssembleDraftOutput,
    CheckContradictionsOutput,
    EditMarkdownFragmentOutput,
    ExtractKeyEventsOutput,
    ExtractMemoryUpdatesOutput,
    ExtractStoryMemoryOutput,
    ForecastNextOutput,
    NarrateTurnOutput,
    PrepareChapterSessionOutput,
    ReviewChapterOutput,
    SuggestStartPointsOutput,
    SuggestStoryLinesOutput,
    SuggestTurnActionsOutput,
    SummarizeSessionOutput,
    UpdateStoryLinesOutput,
)


@dataclass(frozen=True)
class AiActionDefinition:
    action_type: AiActionType
    description: str
    output_model: type[BaseModel]
    structured: bool = True
    supports_streaming: bool = False

    def to_response(self) -> AiActionDefinitionResponse:
        return AiActionDefinitionResponse(
            action_type=self.action_type,
            description=self.description,
            structured=self.structured,
            supports_streaming=self.supports_streaming,
            output_schema=self.output_model.model_json_schema(),
        )


ACTION_DEFINITIONS: dict[AiActionType, AiActionDefinition] = {
    "analyze_synopsis": AiActionDefinition(
        "analyze_synopsis",
        "Analyze a raw story idea and explain how Orynvae understands it.",
        AnalyzeSynopsisOutput,
    ),
    "extract_story_memory": AiActionDefinition(
        "extract_story_memory",
        "Extract initial story memory candidates from project context.",
        ExtractStoryMemoryOutput,
    ),
    "suggest_story_lines": AiActionDefinition(
        "suggest_story_lines",
        "Suggest soft story lines from synopsis and memory.",
        SuggestStoryLinesOutput,
    ),
    "suggest_start_points": AiActionDefinition(
        "suggest_start_points",
        "Suggest possible first interactive story situations.",
        SuggestStartPointsOutput,
    ),
    "prepare_chapter_session": AiActionDefinition(
        "prepare_chapter_session",
        "Prepare a chapter session opening and initial options.",
        PrepareChapterSessionOutput,
        supports_streaming=True,
    ),
    "narrate_turn": AiActionDefinition(
        "narrate_turn",
        "Generate the next narrator turn and candidates from user input.",
        NarrateTurnOutput,
        supports_streaming=True,
    ),
    "suggest_turn_actions": AiActionDefinition(
        "suggest_turn_actions",
        "Regenerate possible user actions for the current narrator turn.",
        SuggestTurnActionsOutput,
    ),
    "summarize_session": AiActionDefinition(
        "summarize_session",
        "Summarize a completed or in-progress narrator session.",
        SummarizeSessionOutput,
    ),
    "extract_key_events": AiActionDefinition(
        "extract_key_events",
        "Extract key event candidates from session turns.",
        ExtractKeyEventsOutput,
    ),
    "assemble_draft": AiActionDefinition(
        "assemble_draft",
        "Assemble session material into canonical markdown prose.",
        AssembleDraftOutput,
        supports_streaming=True,
    ),
    "edit_markdown_fragment": AiActionDefinition(
        "edit_markdown_fragment",
        "Suggest a markdown replacement for a selected fragment.",
        EditMarkdownFragmentOutput,
        supports_streaming=True,
    ),
    "review_chapter": AiActionDefinition(
        "review_chapter",
        "Review a chapter and propose memory, line and contradiction candidates.",
        ReviewChapterOutput,
    ),
    "extract_memory_updates": AiActionDefinition(
        "extract_memory_updates",
        "Extract memory update proposals from story material.",
        ExtractMemoryUpdatesOutput,
    ),
    "update_story_lines": AiActionDefinition(
        "update_story_lines",
        "Suggest story line progress updates after a chapter.",
        UpdateStoryLinesOutput,
    ),
    "forecast_next": AiActionDefinition(
        "forecast_next",
        "Forecast possible directions for the next chapters without fixing the ending.",
        ForecastNextOutput,
        supports_streaming=True,
    ),
    "check_contradictions": AiActionDefinition(
        "check_contradictions",
        "Check current story material against confirmed memory for contradictions.",
        CheckContradictionsOutput,
    ),
}


def get_action_definition(action_type: AiActionType) -> AiActionDefinition:
    return ACTION_DEFINITIONS[action_type]


def list_action_definitions() -> list[AiActionDefinitionResponse]:
    return [definition.to_response() for definition in ACTION_DEFINITIONS.values()]


def missing_action_types() -> set[str]:
    return set(get_args(AiActionType)) - set(ACTION_DEFINITIONS)
