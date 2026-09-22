"""worked example packages and stdin

Revision ID: d412eba4dead
Revises: 549a962e7455
Create Date: 2026-09-22 20:03:21.878165

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d412eba4dead"
down_revision: str | Sequence[str] | None = "549a962e7455"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    for column in ("worked_example_packages", "worked_example_stdin"):
        op.add_column(
            "lessons",
            sa.Column(
                column,
                sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
                server_default=sa.text("'[]'"),
                nullable=False,
            ),
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("lessons", "worked_example_stdin")
    op.drop_column("lessons", "worked_example_packages")
