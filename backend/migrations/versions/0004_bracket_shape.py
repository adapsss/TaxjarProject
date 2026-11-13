"""Income-tax brackets must have the shape the engine reads.

A hand edit like '[{}]' used to pass the "is a list" check and then broke GET /api/tax/countries
for every country. Each bracket now needs "rateBp" (0-10000) and "upToMinor" (null for the top
bracket, else a whole number >= 0).

Revision ID: 0004
Revises: 0003
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION tax_brackets_valid(brackets jsonb) RETURNS boolean
        LANGUAGE sql IMMUTABLE AS $$
            SELECT brackets IS NULL OR (
                jsonb_typeof(brackets) = 'array'
                AND NOT EXISTS (
                    SELECT 1 FROM jsonb_array_elements(brackets) AS b
                    WHERE jsonb_typeof(b) <> 'object'
                       OR NOT (b ? 'rateBp') OR NOT (b ? 'upToMinor')
                       OR jsonb_typeof(b->'rateBp') <> 'number'
                       OR (b->>'rateBp')::numeric <> trunc((b->>'rateBp')::numeric)
                       OR (b->>'rateBp')::numeric NOT BETWEEN 0 AND 10000
                       OR jsonb_typeof(b->'upToMinor') NOT IN ('number', 'null')
                       OR (jsonb_typeof(b->'upToMinor') = 'number' AND (
                              (b->>'upToMinor')::numeric < 0
                              OR (b->>'upToMinor')::numeric <> trunc((b->>'upToMinor')::numeric)))
                )
            )
        $$
        """
    )
    op.create_check_constraint("brackets_shape", "tax_regime", "tax_brackets_valid(income_tax_brackets)")


def downgrade() -> None:
    op.drop_constraint("brackets_shape", "tax_regime", type_="check")
    op.execute("DROP FUNCTION tax_brackets_valid(jsonb)")
