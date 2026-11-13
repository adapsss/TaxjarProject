"""Tax engine: payment classification, tax rules, summary and money invariants.

Pure Python, standard library only, no database and no network.
"""
from .breakdown import describe_rule, split_tax
from .classifier import ASK_AT, RESERVE_AT, OwnerContext, PriorPayment, Result, classify, infer_kind
from .context import owner_context, payer_history
from .invariants import find_violations
from .money import format_minor, format_rate_percent
from .names import normalize_name, same_party
from .summary import DISCLAIMER, build_summary, export_rows, to_csv
from .tax_rules import compute_tax, estimate_annual_tax, get_regime, load_countries, next_deadline

__all__ = [
    "ASK_AT", "RESERVE_AT", "OwnerContext", "PriorPayment", "Result", "classify", "infer_kind",
    "owner_context", "payer_history", "find_violations", "format_minor", "format_rate_percent",
    "normalize_name", "same_party", "DISCLAIMER", "build_summary", "export_rows", "to_csv",
    "describe_rule", "split_tax", "compute_tax", "estimate_annual_tax", "get_regime", "load_countries", "next_deadline",
]
