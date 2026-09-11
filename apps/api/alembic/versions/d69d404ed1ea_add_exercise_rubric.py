"""add exercise rubric

Self-assessment criteria for open-ended work, where automated checks cannot see
whether the code is organised, named, or defensive (Section 6, feature 10).

Revision ID: d69d404ed1ea
Revises: f4187eeabe96
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d69d404ed1ea"
down_revision: str | Sequence[str] | None = "f4187eeabe96"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RUBRIC_TYPE = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    """Add exercises.rubric, defaulting existing rows to no criteria."""
    op.add_column(
        "exercises",
        sa.Column("rubric", RUBRIC_TYPE, nullable=False, server_default=sa.text("'[]'")),
    )


def downgrade() -> None:
    op.drop_column("exercises", "rubric")
