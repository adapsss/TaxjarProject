"""SQLAlchemy Core definitions of the tax data tables, for reading and writing rows.

The schema itself (types, constraints, triggers) is owned by the Alembic migrations;
tests/test_tax_schema.py checks that these definitions match the migrated database.
"""
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

metadata = sa.MetaData()

country = sa.Table(
    "tax_country", metadata,
    sa.Column("code", sa.String, primary_key=True),
    sa.Column("name", sa.String),
    sa.Column("currency", sa.String),
    sa.Column("tax_year_start_month", sa.SmallInteger),
    sa.Column("tax_year_start_day", sa.SmallInteger),
    sa.Column("inherits_from", sa.String),
    sa.Column("position", sa.Integer),
)

regime = sa.Table(
    "tax_regime", metadata,
    sa.Column("country_code", sa.String, primary_key=True),
    sa.Column("id", sa.String, primary_key=True),
    sa.Column("position", sa.Integer),
    sa.Column("name", sa.String),
    sa.Column("applies_to", sa.Text),
    sa.Column("computable", sa.Boolean),
    sa.Column("allowance_minor", sa.BigInteger),
    sa.Column("income_tax_type", sa.String),
    sa.Column("income_tax_rate_bp", sa.Integer),
    sa.Column("income_tax_base", sa.Text),
    sa.Column("income_tax_brackets", JSONB(none_as_null=True)),  # None is SQL NULL, not a JSON null
    sa.Column("vat_registration_threshold_minor", sa.BigInteger),
    sa.Column("vat_standard_rate_bp", sa.Integer),
    sa.Column("suggested_reserve_rate_bp", sa.Integer),
    sa.Column("default_rate_bp", sa.Integer),
    sa.Column("reserve_rate_source", sa.String),
    sa.Column("reserve_basis", sa.Text),
    sa.Column("rule_text", sa.Text),
    sa.Column("hint", sa.Text),
    sa.Column("verification", sa.String),
    sa.Column("verified_at", sa.Date),
    sa.Column("notes", sa.Text),
    sa.Column("unverified", ARRAY(sa.Text)),
)


def _child(name: str, *columns: sa.Column, positioned: bool = True) -> sa.Table:
    keys = [sa.Column("country_code", sa.String, primary_key=True), sa.Column("regime_id", sa.String, primary_key=True)]
    if positioned:
        keys.append(sa.Column("position", sa.Integer, primary_key=True))
    return sa.Table(name, metadata, *keys, *columns)


social_contribution = _child(
    "tax_social_contribution",
    sa.Column("name", sa.Text), sa.Column("rate_bp", sa.Integer), sa.Column("base", sa.Text),
    sa.Column("floor_minor", sa.BigInteger), sa.Column("cap_minor", sa.BigInteger),
    sa.Column("fixed_annual_minor", sa.BigInteger),
)
part = _child(
    "tax_part",
    sa.Column("part_id", sa.String), sa.Column("name", sa.String),
    sa.Column("share_num", sa.Integer), sa.Column("share_den", sa.Integer),
)
extra_part = _child(
    "tax_extra_part",
    sa.Column("part_id", sa.String), sa.Column("name", sa.String), sa.Column("rates_bp", ARRAY(sa.Integer)),
    positioned=False,
)
deadline = _child(
    "tax_deadline",
    sa.Column("name", sa.Text), sa.Column("type", sa.String), sa.Column("day", sa.SmallInteger),
    sa.Column("month", sa.SmallInteger), sa.Column("months", ARRAY(sa.SmallInteger)),
    sa.Column("is_primary", sa.Boolean),
)
source = _child("tax_source", sa.Column("url", sa.Text))

legal_form = sa.Table(
    "legal_form", metadata,
    sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
    sa.Column("position", sa.Integer),
    sa.Column("token", sa.String),
    sa.Column("name", sa.String),
    sa.Column("case_sensitive", sa.Boolean),
    sa.Column("caps_safe", sa.Boolean),
    sa.Column("caps_leading", sa.Boolean),
    sa.Column("countries", ARRAY(sa.String)),
)

data_load = sa.Table(
    "tax_data_load", metadata,
    sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
    sa.Column("loaded_at", sa.DateTime(timezone=True)),
    sa.Column("dataset", sa.String),
    sa.Column("mode", sa.String),
    sa.Column("checksum", sa.String),
    sa.Column("rows", sa.Integer),
)

change_log = sa.Table(
    "tax_change_log", metadata,
    sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
    sa.Column("changed_at", sa.DateTime(timezone=True)),
    sa.Column("db_user", sa.String),
    sa.Column("table_name", sa.String),
    sa.Column("operation", sa.String),
    sa.Column("old_row", JSONB),
    sa.Column("new_row", JSONB),
)

# Children before parents: the order a full replace deletes in.
DATA_TABLES_CHILDREN_FIRST = (source, deadline, extra_part, part, social_contribution, regime, country)
