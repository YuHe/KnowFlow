"""
Alembic environment configuration – async (asyncpg / SQLAlchemy 2).

This file is loaded by Alembic for every migration command.  It:
  1. Reads DATABASE_URL from the environment (or falls back to alembic.ini).
  2. Imports every SQLAlchemy model so that autogenerate can detect schema changes.
  3. Configures both "offline" (SQL script) and "online" (live DB) migration modes
     using the async engine provided by asyncpg.
"""

from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# ---------------------------------------------------------------------------
# Alembic Config object – access values in alembic.ini
# ---------------------------------------------------------------------------
config = context.config

# Honour the logging configuration in alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ---------------------------------------------------------------------------
# Override sqlalchemy.url with the DATABASE_URL environment variable so that
# docker-compose / production environments don't rely on alembic.ini secrets.
# ---------------------------------------------------------------------------
database_url = os.environ.get("DATABASE_URL")
if database_url:
    # asyncpg dialect is required for async migrations
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql+asyncpg://", 1)
    config.set_main_option("sqlalchemy.url", database_url)

# ---------------------------------------------------------------------------
# Import all models so that their metadata is populated for autogenerate.
# Add new model modules here as the project grows.
# ---------------------------------------------------------------------------
try:
    from app.database import Base  # noqa: F401
    import app.models  # noqa: F401  – imports all models via __init__

    target_metadata = Base.metadata
except ImportError:
    # If the app package is not yet present (e.g. during initial scaffold)
    # fall back to None so that offline migrations still work.
    target_metadata = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Offline migration – generates a .sql script without a DB connection
# ---------------------------------------------------------------------------
def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL and not an Engine, though
    an Engine is acceptable here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the script output.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Online migration – runs against a live async database connection
# ---------------------------------------------------------------------------
def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run migrations within a sync connection wrapper."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode using asyncio."""
    asyncio.run(run_async_migrations())


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
