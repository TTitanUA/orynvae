from app.models.projects import ProjectCreate
from app.models.story_runtime import (
    ChapterCreate,
    ChapterSessionCreate,
    DraftVersionCreate,
    ForecastCreate,
    ForecastOptionCreate,
    KeyEventCreate,
    MemoryItemCreate,
    MemoryProposalCreate,
    SessionTurnCreate,
    StoryLineCreate,
    StoryLineProgressCreate,
)
from app.services import project_store, story_runtime_store


def test_story_runtime_store_persists_v2_entities(tmp_path, monkeypatch):
    monkeypatch.setenv("ORYNVAE_DATA_DIR", str(tmp_path / "data"))
    project = project_store.create_project(
        ProjectCreate(title="Memory Courier", synopsis="A courier finds a future memory.")
    )

    memory = story_runtime_store.create_memory_item(
        project.id,
        MemoryItemCreate(
            type="character",
            title="Courier",
            summary="Finds a memory of his own death.",
            status="canon",
        ),
    )
    story_runtime_store.create_memory_proposal(
        project.id,
        MemoryProposalCreate(
            proposal_type="update",
            target_item_id=memory.id,
            suggested_payload={"summary": "Carries forbidden memories"},
        ),
    )
    line = story_runtime_store.create_story_line(
        project.id,
        StoryLineCreate(type="mystery", title="Who lived his future?", status="active"),
    )
    chapter = story_runtime_store.create_chapter(
        project.id,
        ChapterCreate(
            title="Delivery",
            order_index=1,
            synopsis="The courier receives the wrong package.",
            draft_markdown="# Delivery",
        ),
    )
    session = story_runtime_store.create_chapter_session(
        project.id,
        ChapterSessionCreate(
            chapter_id=chapter.id,
            user_role="author",
            controlled_character_ids=[memory.id],
            active_story_line_ids=[line.id],
        ),
    )
    turn = story_runtime_store.create_session_turn(
        session.id,
        SessionTurnCreate(
            turn_index=1,
            actor_type="user",
            turn_type="action",
            content="Open the memory.",
            related_memory_item_ids=[memory.id],
            related_story_line_ids=[line.id],
            is_key_event=True,
        ),
    )
    event = story_runtime_store.create_key_event(
        project.id,
        KeyEventCreate(
            session_id=session.id,
            chapter_id=chapter.id,
            title="The future is already recorded",
            related_memory_item_ids=[memory.id],
            related_story_line_ids=[line.id],
        ),
    )
    progress = story_runtime_store.create_story_line_progress(
        project.id,
        StoryLineProgressCreate(
            story_line_id=line.id,
            chapter_id=chapter.id,
            session_id=session.id,
            after_state="The courier knows the future memory exists.",
        ),
    )
    draft = story_runtime_store.create_draft_version(
        project.id,
        DraftVersionCreate(
            chapter_id=chapter.id,
            source_session_id=session.id,
            markdown="# Delivery\n\nHe opened the memory.",
        ),
    )
    forecast = story_runtime_store.create_forecast(
        project.id,
        ForecastCreate(
            source_chapter_id=chapter.id,
            summary="Several directions remain open.",
            options=[
                ForecastOptionCreate(
                    title="Trace the memory seller",
                    likely_consequences=["The market reacts"],
                    related_story_line_ids=[line.id],
                    risks=["The courier is exposed"],
                )
            ],
        ),
    )

    assert story_runtime_store.list_memory_items(project.id)[0].id == memory.id
    assert story_runtime_store.list_memory_proposals(project.id)[0].suggested_payload == {
        "summary": "Carries forbidden memories"
    }
    assert story_runtime_store.list_story_lines(project.id)[0].id == line.id
    assert story_runtime_store.list_chapters(project.id)[0].draft_markdown == "# Delivery"
    assert story_runtime_store.list_chapter_sessions(project.id)[0].controlled_character_ids == [memory.id]
    assert story_runtime_store.list_session_turns(session.id)[0].is_key_event is True
    assert story_runtime_store.list_key_events(session.id)[0].id == event.id
    assert story_runtime_store.list_story_line_progress(project.id, line.id)[0].id == progress.id
    assert story_runtime_store.list_draft_versions(project.id, chapter.id)[0].id == draft.id
    assert story_runtime_store.list_forecasts(project.id)[0].options[0].id == forecast.options[0].id
    assert turn.related_story_line_ids == [line.id]
