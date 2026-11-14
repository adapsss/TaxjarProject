"""CHECK constraints on the app state: the money tables refuse values the code never writes.

The tax tables have had such checks since 0002; the tables that hold the account's money had none,
so a hand edit (or a bug) could store a negative balance or a 200% rate and the API served it.
The same constraints are declared on the models (app/models.py); tests/test_app_state_checks.py compares the two.

Adding a constraint fails if a row already breaks it, which stops the migrate step and with it the
rollout: check an existing database first (one SELECT count(*) ... WHERE NOT (<condition>) per entry).

Rolling back: `alembic downgrade 0004` drops them again; no data changes either way.

Revision ID: 0005
Revises: 0004
"""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

# (table, constraint name, condition). Names are short: Postgres stores them as given.
CHECKS = (
    ("profilerow", "profile_rate_range", "rate_bp BETWEEN 0 AND 10000"),
    ("balancerow", "balance_not_negative", "amount >= 0"),
    ("jarrow", "jar_not_negative", "balance >= 0"),
    ("jarrow", "jar_type_known", "type IN ('tax', 'regular')"),
    ("counterpartyrow", "counterparty_kind_known", "kind IN ('company', 'person', 'unknown')"),
    ("counterpartyrow", "counterparty_status_known", "status IS NULL OR status IN ('client', 'personal')"),
    ("transactionrow", "transaction_amount_positive", "amount > 0"),
    ("transactionrow", "transaction_direction_known", "direction IN ('in', 'out')"),
    ("transactionrow", "transaction_label_known", "label IN ('income', 'personal', 'unknown')"),
    ("transactionrow", "transaction_confidence_range", "confidence BETWEEN 0 AND 1"),
    ("reservationrow", "reservation_source_positive", "source_amount > 0"),
    ("reservationrow", "reservation_reserved_not_negative", "reserved_amount >= 0"),
    ("reservationrow", "reservation_rate_range", "rate_bp BETWEEN 0 AND 10000"),
    ("reservationrow", "reservation_fx_positive", "fx_rate > 0"),
    ("reservationrow", "reservation_status_known", "status IN ('reserved', 'undone', 'paid')"),
)


def upgrade() -> None:
    for table, name, condition in CHECKS:
        op.create_check_constraint(name, table, condition)


def downgrade() -> None:
    for table, name, _ in reversed(CHECKS):
        op.drop_constraint(name, table, type_="check")
