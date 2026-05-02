from app.storage.migrations import apply_migrations


def main() -> None:
    applied = apply_migrations()
    if applied:
        print("Applied migrations:")
        for migration in applied:
            print(f"  - {migration}")
    else:
        print("Database is already up to date.")


if __name__ == "__main__":
    main()

