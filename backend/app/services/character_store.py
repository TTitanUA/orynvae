from __future__ import annotations

import sqlite3
from uuid import uuid4

from app.models.projects import (
    CharacterBulkCreate,
    CharacterBulkCreateResponse,
    CharacterBulkCreateItem,
    CharacterCreate,
    CharacterListItem,
    CharacterRecord,
    CharacterRelationshipCreate,
    CharacterRelationshipRecord,
    CharacterRelationshipUpdate,
    CharacterUpdate,
)
from app.storage.migrations import apply_migrations
from app.storage.paths import get_database_path


class CharacterStoreError(ValueError):
    pass


class CharacterValidationError(CharacterStoreError):
    pass


def _connection() -> sqlite3.Connection:
    apply_migrations()
    connection = sqlite3.connect(get_database_path())
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def list_characters(project_id: str) -> list[CharacterListItem] | None:
    with _connection() as connection:
        if not _project_exists(connection, project_id):
            return None
        rows = connection.execute(
            """
            SELECT *
            FROM characters
            WHERE project_id = ?
            ORDER BY updated_at DESC, name ASC
            """,
            (project_id,),
        ).fetchall()
        relationships = _relationships_for_project(connection, project_id)
        relationships_by_character: dict[str, list[CharacterRelationshipRecord]] = {}
        for relationship in relationships:
            relationships_by_character.setdefault(relationship.source_character_id, []).append(
                relationship
            )
            relationships_by_character.setdefault(relationship.target_character_id, []).append(
                relationship
            )
        return [
            CharacterListItem(
                **_character_row_payload(row),
                relationships=relationships_by_character.get(row["id"], []),
            )
            for row in rows
        ]


def get_character(project_id: str, character_id: str) -> CharacterRecord | None:
    with _connection() as connection:
        row = _character_row(connection, project_id, character_id)
        if row is None:
            return None
        return CharacterRecord(
            **_character_row_payload(row),
            relationships=_relationships_for_source(connection, project_id, character_id),
        )


def create_character(project_id: str, payload: CharacterCreate) -> CharacterRecord | None:
    character_id = str(uuid4())
    with _connection() as connection:
        if not _project_exists(connection, project_id):
            return None
        connection.execute("BEGIN")
        try:
            _insert_character(connection, project_id, character_id, payload)
            _replace_relationships(
                connection,
                project_id,
                character_id,
                payload.relationships,
            )
            connection.execute(
                "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (project_id,),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        return _record_for_character(connection, project_id, character_id)


def update_character(
    project_id: str,
    character_id: str,
    payload: CharacterUpdate,
) -> CharacterRecord | None:
    with _connection() as connection:
        if _character_row(connection, project_id, character_id) is None:
            return None
        connection.execute("BEGIN")
        try:
            updates = payload.model_dump(exclude_unset=True, exclude={"relationships"})
            if "name" in updates and not _clean(updates["name"]):
                raise CharacterValidationError("Character name is required")
            if updates:
                assignments = [f"{field} = ?" for field in updates]
                values = [
                    _clean(value) if isinstance(value, str) else value
                    for value in updates.values()
                ]
                assignments.append("updated_at = CURRENT_TIMESTAMP")
                values.extend([project_id, character_id])
                connection.execute(
                    f"""
                    UPDATE characters
                    SET {", ".join(assignments)}
                    WHERE project_id = ? AND id = ?
                    """,
                    values,
                )
            if payload.relationships is not None:
                _replace_relationships(
                    connection,
                    project_id,
                    character_id,
                    payload.relationships,
                )
            connection.execute(
                "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (project_id,),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        return _record_for_character(connection, project_id, character_id)


def delete_character(project_id: str, character_id: str) -> bool:
    with _connection() as connection:
        cursor = connection.execute(
            "DELETE FROM characters WHERE project_id = ? AND id = ?",
            (project_id, character_id),
        )
        if cursor.rowcount:
            connection.execute(
                "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (project_id,),
            )
        connection.commit()
        return cursor.rowcount > 0


def bulk_create_characters(
    project_id: str,
    payload: CharacterBulkCreate,
) -> CharacterBulkCreateResponse | None:
    with _connection() as connection:
        if not _project_exists(connection, project_id):
            return None
        connection.execute("BEGIN")
        try:
            draft_to_character_id: dict[str, str] = {}
            created_ids: list[str] = []
            for index, character in enumerate(payload.characters):
                draft_id = character.draft_id or f"draft-{index + 1}"
                if draft_id in draft_to_character_id:
                    raise CharacterValidationError(f"Duplicate draft id: {draft_id}")
                character_id = str(uuid4())
                draft_to_character_id[draft_id] = character_id
                created_ids.append(character_id)
                _insert_character(connection, project_id, character_id, character)

            relationship_ids: list[str] = []
            for relationship in payload.relationships:
                source_id = draft_to_character_id.get(relationship.source_draft_id)
                target_id = draft_to_character_id.get(relationship.target_draft_id)
                if not source_id or not target_id:
                    raise CharacterValidationError("Relationship references an unknown draft")
                if source_id == target_id:
                    raise CharacterValidationError("Character cannot relate to itself")
                relationship_ids.append(
                    _insert_relationship(
                        connection,
                        project_id,
                        source_id,
                        CharacterRelationshipCreate(
                            target_character_id=target_id,
                            relationship_type=relationship.relationship_type,
                            description=relationship.description,
                        ),
                    )
                )

            connection.execute(
                "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (project_id,),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise

        records = [
            record
            for character_id in created_ids
            if (record := _record_for_character(connection, project_id, character_id)) is not None
        ]
        relationships = _relationships_by_ids(connection, project_id, relationship_ids)
        return CharacterBulkCreateResponse(characters=records, relationships=relationships)


def _project_exists(connection: sqlite3.Connection, project_id: str) -> bool:
    row = connection.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone()
    return row is not None


def _character_row(
    connection: sqlite3.Connection,
    project_id: str,
    character_id: str,
) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT * FROM characters WHERE project_id = ? AND id = ?",
        (project_id, character_id),
    ).fetchone()


def _character_row_payload(row: sqlite3.Row) -> dict[str, str | None]:
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "name": row["name"],
        "gender": row["gender"],
        "age": row["age"],
        "role": row["role"],
        "biography": row["biography"],
        "motivation": row["motivation"],
        "goal": row["goal"],
        "fear": row["fear"],
        "internal_conflict": row["internal_conflict"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _record_for_character(
    connection: sqlite3.Connection,
    project_id: str,
    character_id: str,
) -> CharacterRecord | None:
    row = _character_row(connection, project_id, character_id)
    if row is None:
        return None
    return CharacterRecord(
        **_character_row_payload(row),
        relationships=_relationships_for_source(connection, project_id, character_id),
    )


def _insert_character(
    connection: sqlite3.Connection,
    project_id: str,
    character_id: str,
    payload: CharacterCreate | CharacterBulkCreateItem,
) -> None:
    connection.execute(
        """
        INSERT INTO characters (
          id, project_id, name, gender, age, role, biography, motivation,
          goal, fear, internal_conflict
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            character_id,
            project_id,
            payload.name.strip(),
            _clean(payload.gender),
            _clean(payload.age),
            _clean(payload.role),
            _clean(payload.biography),
            _clean(payload.motivation),
            _clean(payload.goal),
            _clean(payload.fear),
            _clean(payload.internal_conflict),
        ),
    )


def _replace_relationships(
    connection: sqlite3.Connection,
    project_id: str,
    source_character_id: str,
    relationships: list[CharacterRelationshipCreate | CharacterRelationshipUpdate],
) -> None:
    connection.execute(
        """
        DELETE FROM character_relationships
        WHERE project_id = ? AND source_character_id = ?
        """,
        (project_id, source_character_id),
    )
    for relationship in relationships:
        _insert_relationship(connection, project_id, source_character_id, relationship)


def _insert_relationship(
    connection: sqlite3.Connection,
    project_id: str,
    source_character_id: str,
    relationship: CharacterRelationshipCreate | CharacterRelationshipUpdate,
) -> str:
    target_character_id = relationship.target_character_id
    if source_character_id == target_character_id:
        raise CharacterValidationError("Character cannot relate to itself")
    if not _character_row(connection, project_id, source_character_id):
        raise CharacterValidationError("Source character does not belong to this project")
    if not _character_row(connection, project_id, target_character_id):
        raise CharacterValidationError("Target character does not belong to this project")

    relationship_id = getattr(relationship, "id", None) or str(uuid4())
    connection.execute(
        """
        INSERT INTO character_relationships (
          id, project_id, source_character_id, target_character_id,
          relationship_type, description
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            relationship_id,
            project_id,
            source_character_id,
            target_character_id,
            relationship.relationship_type.strip(),
            _clean(relationship.description),
        ),
    )
    return relationship_id


def _relationships_for_project(
    connection: sqlite3.Connection,
    project_id: str,
) -> list[CharacterRelationshipRecord]:
    rows = connection.execute(
        """
        SELECT
          relationships.*,
          source.name AS source_character_name,
          target.name AS target_character_name
        FROM character_relationships AS relationships
        INNER JOIN characters AS source
          ON source.id = relationships.source_character_id
        INNER JOIN characters AS target
          ON target.id = relationships.target_character_id
        WHERE relationships.project_id = ?
        ORDER BY relationships.updated_at DESC, target.name ASC
        """,
        (project_id,),
    ).fetchall()
    return [_relationship_from_row(row) for row in rows]


def _relationships_for_source(
    connection: sqlite3.Connection,
    project_id: str,
    source_character_id: str,
) -> list[CharacterRelationshipRecord]:
    rows = connection.execute(
        """
        SELECT
          relationships.*,
          source.name AS source_character_name,
          target.name AS target_character_name
        FROM character_relationships AS relationships
        INNER JOIN characters AS source
          ON source.id = relationships.source_character_id
        INNER JOIN characters AS target
          ON target.id = relationships.target_character_id
        WHERE relationships.project_id = ?
          AND relationships.source_character_id = ?
        ORDER BY relationships.updated_at DESC, target.name ASC
        """,
        (project_id, source_character_id),
    ).fetchall()
    return [_relationship_from_row(row) for row in rows]


def _relationships_by_ids(
    connection: sqlite3.Connection,
    project_id: str,
    relationship_ids: list[str],
) -> list[CharacterRelationshipRecord]:
    if not relationship_ids:
        return []
    placeholders = ", ".join("?" for _ in relationship_ids)
    rows = connection.execute(
        f"""
        SELECT
          relationships.*,
          source.name AS source_character_name,
          target.name AS target_character_name
        FROM character_relationships AS relationships
        INNER JOIN characters AS source
          ON source.id = relationships.source_character_id
        INNER JOIN characters AS target
          ON target.id = relationships.target_character_id
        WHERE relationships.project_id = ?
          AND relationships.id IN ({placeholders})
        ORDER BY relationships.created_at ASC
        """,
        [project_id, *relationship_ids],
    ).fetchall()
    return [_relationship_from_row(row) for row in rows]


def _relationship_from_row(row: sqlite3.Row) -> CharacterRelationshipRecord:
    return CharacterRelationshipRecord(
        id=row["id"],
        project_id=row["project_id"],
        source_character_id=row["source_character_id"],
        target_character_id=row["target_character_id"],
        relationship_type=row["relationship_type"],
        description=row["description"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        source_character_name=row["source_character_name"],
        target_character_name=row["target_character_name"],
    )


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None
