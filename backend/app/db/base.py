"""
Central import point for Alembic autogenerate.

Alembic's env.py does:  from app.db.base import Base
This module re-exports Base from app.database AND imports all models
so that their tables are registered in Base.metadata before alembic
inspects the schema.
"""
from app.database import Base  # noqa: F401 - re-export

# Import all models so their Table objects are registered on Base.metadata
import app.models.user  # noqa: F401
import app.models.knowledge_base  # noqa: F401
import app.models.document  # noqa: F401

__all__ = ["Base"]
