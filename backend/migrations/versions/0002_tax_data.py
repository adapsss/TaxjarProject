"""Tax data: countries, regimes and their parts, legal forms, the import log and the change log.

The database is the source of truth for tax data. Constraints reject hand edits the engine
cannot handle; a trigger writes every change to tax_change_log.

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

DATA_TABLES = (
    "tax_country", "tax_regime", "tax_social_contribution", "tax_part", "tax_extra_part",
    "tax_deadline", "tax_source", "legal_form",
)


def _rate(column: str, nullable_ok: bool = True) -> sa.CheckConstraint:
    rule = f"{column} BETWEEN 0 AND 10000"
    return sa.CheckConstraint(f"{column} IS NULL OR {rule}" if nullable_ok else rule, name=f"rate_{column}")


def _not_negative(column: str) -> sa.CheckConstraint:
    return sa.CheckConstraint(f"{column} IS NULL OR {column} >= 0", name=f"not_negative_{column}")


def _regime_fk() -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        ["country_code", "regime_id"], ["tax_regime.country_code", "tax_regime.id"], ondelete="CASCADE"
    )


def upgrade() -> None:
    op.create_table(
        "tax_country",
        sa.Column("code", sa.String, primary_key=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("tax_year_start_month", sa.SmallInteger, nullable=False),
        sa.Column("tax_year_start_day", sa.SmallInteger, nullable=False),
        sa.Column("inherits_from", sa.String, sa.ForeignKey("tax_country.code", deferrable=True, initially="DEFERRED"), nullable=True),
        sa.Column("position", sa.Integer, nullable=False),
        sa.CheckConstraint("inherits_from IS NULL OR inherits_from <> code", name="no_self_inheritance"),
        sa.CheckConstraint("tax_year_start_month BETWEEN 1 AND 12", name="tax_year_month"),
        sa.CheckConstraint("tax_year_start_day BETWEEN 1 AND 31", name="tax_year_day"),
    )
    op.create_table(
        "tax_regime",
        sa.Column("country_code", sa.String, sa.ForeignKey("tax_country.code", ondelete="CASCADE"), primary_key=True),
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("applies_to", sa.Text, nullable=False),
        sa.Column("computable", sa.Boolean, nullable=False),
        sa.Column("allowance_minor", sa.BigInteger, nullable=False),
        sa.Column("income_tax_type", sa.String, nullable=False),
        sa.Column("income_tax_rate_bp", sa.Integer, nullable=True),
        sa.Column("income_tax_base", sa.Text, nullable=False),
        sa.Column("income_tax_brackets", JSONB, nullable=True),
        sa.Column("vat_registration_threshold_minor", sa.BigInteger, nullable=True),
        sa.Column("vat_standard_rate_bp", sa.Integer, nullable=True),
        sa.Column("suggested_reserve_rate_bp", sa.Integer, nullable=False),
        sa.Column("default_rate_bp", sa.Integer, nullable=False),
        sa.Column("reserve_rate_source", sa.String, nullable=False),
        sa.Column("reserve_basis", sa.Text, nullable=False),
        sa.Column("rule_text", sa.Text, nullable=True),
        sa.Column("hint", sa.Text, nullable=False),
        sa.Column("verification", sa.String, nullable=False),
        sa.Column("verified_at", sa.Date, nullable=False),
        sa.Column("notes", sa.Text, nullable=False),
        sa.Column("unverified", ARRAY(sa.Text), nullable=False, server_default="{}"),
        _rate("income_tax_rate_bp"), _rate("vat_standard_rate_bp"),
        _rate("suggested_reserve_rate_bp", False), _rate("default_rate_bp", False),
        _not_negative("allowance_minor"), _not_negative("vat_registration_threshold_minor"),
        sa.CheckConstraint("income_tax_type IN ('progressive', 'flat', 'none')", name="income_tax_type"),
        sa.CheckConstraint("verification IN ('official', 'secondary', 'user')", name="verification"),
        sa.CheckConstraint("reserve_rate_source IN ('researched', 'derived_from_rates', 'user')", name="reserve_rate_source"),
        sa.CheckConstraint(
            "income_tax_brackets IS NULL OR jsonb_typeof(income_tax_brackets) = 'array'", name="brackets_is_a_list"
        ),
    )
    op.create_table(
        "tax_social_contribution",
        sa.Column("country_code", sa.String, primary_key=True),
        sa.Column("regime_id", sa.String, primary_key=True),
        sa.Column("position", sa.Integer, primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("rate_bp", sa.Integer, nullable=True),
        sa.Column("base", sa.Text, nullable=False),
        sa.Column("floor_minor", sa.BigInteger, nullable=True),
        sa.Column("cap_minor", sa.BigInteger, nullable=True),
        sa.Column("fixed_annual_minor", sa.BigInteger, nullable=True),
        _regime_fk(), _rate("rate_bp"),
        _not_negative("floor_minor"), _not_negative("cap_minor"), _not_negative("fixed_annual_minor"),
    )
    op.create_table(
        "tax_part",
        sa.Column("country_code", sa.String, primary_key=True),
        sa.Column("regime_id", sa.String, primary_key=True),
        sa.Column("position", sa.Integer, primary_key=True),
        sa.Column("part_id", sa.String, nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("share_num", sa.Integer, nullable=False),
        sa.Column("share_den", sa.Integer, nullable=False),
        _regime_fk(),
        sa.CheckConstraint("share_num BETWEEN 1 AND share_den", name="share"),
    )
    op.create_table(
        "tax_extra_part",
        sa.Column("country_code", sa.String, primary_key=True),
        sa.Column("regime_id", sa.String, primary_key=True),
        sa.Column("part_id", sa.String, nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("rates_bp", ARRAY(sa.Integer), nullable=False),
        _regime_fk(),
        sa.CheckConstraint("0 <= ALL(rates_bp) AND 10000 >= ALL(rates_bp)", name="rates_bp"),
    )
    op.create_table(
        "tax_deadline",
        sa.Column("country_code", sa.String, primary_key=True),
        sa.Column("regime_id", sa.String, primary_key=True),
        sa.Column("position", sa.Integer, primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("type", sa.String, nullable=False),
        sa.Column("day", sa.SmallInteger, nullable=False),
        sa.Column("month", sa.SmallInteger, nullable=True),
        sa.Column("months", ARRAY(sa.SmallInteger), nullable=True),
        sa.Column("is_primary", sa.Boolean, nullable=False, server_default=sa.false()),
        _regime_fk(),
        sa.CheckConstraint("type IN ('annual', 'quarterly', 'monthly')", name="deadline_type"),
        sa.CheckConstraint("day BETWEEN 1 AND 31", name="deadline_day"),
        sa.CheckConstraint("month IS NULL OR month BETWEEN 1 AND 12", name="deadline_month"),
        sa.CheckConstraint(
            "months IS NULL OR months <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]", name="deadline_months"
        ),
    )
    op.create_index(
        "uq_tax_deadline_one_primary", "tax_deadline", ["country_code", "regime_id"], unique=True,
        postgresql_where=sa.text("is_primary"),
    )
    op.create_table(
        "tax_source",
        sa.Column("country_code", sa.String, primary_key=True),
        sa.Column("regime_id", sa.String, primary_key=True),
        sa.Column("position", sa.Integer, primary_key=True),
        sa.Column("url", sa.Text, nullable=False),
        _regime_fk(),
    )
    op.create_table(
        "legal_form",
        sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("token", sa.String, nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("case_sensitive", sa.Boolean, nullable=False),
        sa.Column("caps_safe", sa.Boolean, nullable=False),
        sa.Column("caps_leading", sa.Boolean, nullable=False),
        sa.Column("countries", ARRAY(sa.String), nullable=False),
        sa.CheckConstraint("token <> ''", name="token_not_empty"),
    )
    op.create_table(
        "tax_data_load",
        sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
        sa.Column("loaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("dataset", sa.String, nullable=False),
        sa.Column("mode", sa.String, nullable=False),
        sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column("rows", sa.Integer, nullable=False),
        sa.CheckConstraint("dataset IN ('tax', 'demo_seed', 'demo_scenarios')", name="dataset"),
        sa.CheckConstraint("mode IN ('import', 'replace')", name="mode"),
    )
    op.create_table(
        "tax_change_log",
        sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("db_user", sa.String, nullable=False),
        sa.Column("table_name", sa.String, nullable=False),
        sa.Column("operation", sa.String, nullable=False),
        sa.Column("old_row", JSONB, nullable=True),
        sa.Column("new_row", JSONB, nullable=True),
    )
    op.execute(
        """
        CREATE FUNCTION tax_change_log_record() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            INSERT INTO tax_change_log (db_user, table_name, operation, old_row, new_row)
            VALUES (
                current_user, TG_TABLE_NAME, TG_OP,
                CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
                CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
            );
            RETURN NULL;
        END
        $$
        """
    )
    for table in DATA_TABLES:
        op.execute(
            f"CREATE TRIGGER tax_change_log_trg AFTER INSERT OR UPDATE OR DELETE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION tax_change_log_record()"
        )


def downgrade() -> None:
    for table in DATA_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS tax_change_log_trg ON {table}")
    op.execute("DROP FUNCTION IF EXISTS tax_change_log_record()")
    for table in ("tax_change_log", "tax_data_load", "legal_form", "tax_source", "tax_deadline", "tax_extra_part",
                  "tax_part", "tax_social_contribution", "tax_regime", "tax_country"):
        op.drop_table(table)
