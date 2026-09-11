"""add exercise seed files

Files placed in a run's working directory before learner code executes, so an
exercise can hand them something to read. Needed from Module 8 (file I/O) onward.

Revision ID: f4187eeabe96
Revises: 84e7895ba395
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f4187eeabe96"
down_revision: str | Sequence[str] | None = "84e7895ba395"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FILES_TYPE = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    """Add exercises.files, defaulting existing rows to no files."""
    # The column is NOT NULL, so existing rows need a value. The server default
    # is kept rather than dropped: it makes the column safe to omit from an
    # INSERT, which the content loader relies on for exercises without files.
    op.add_column(
        "exercises",
        sa.Column("files", FILES_TYPE, nullable=False, server_default=sa.text("'{}'")),
    )


def downgrade() -> None:
    op.drop_column("exercises", "files")
