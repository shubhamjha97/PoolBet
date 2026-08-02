from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # SQLite by default (zero setup). Swap to Postgres by setting DATABASE_URL, e.g.
    #   postgresql+psycopg://user:pass@localhost:5432/poolbet
    database_url: str = "sqlite:///./poolbet.db"

    # Default dispute window (hours) applied to new groups.
    default_dispute_window_hours: int = 12

    # Default credits each member pools in when joining a group.
    default_starting_credits: str = "1000"

    # Optional house rake on each settled market, as a fraction (0 = none).
    default_rake: str = "0"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
