"""Operational endpoints and settings: health check, logging (DevOps alignment)."""

import logging

from sqlalchemy import create_engine

from app import db
from app.logging_setup import configure_logging


def test_healthz_is_ok_when_the_database_answers(client, monkeypatch, pg_engine):
    monkeypatch.setattr(db, "get_engine", lambda: pg_engine)
    response = client.get("/api/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_healthz_reports_a_database_outage(client, monkeypatch):
    unreachable = create_engine("postgresql+psycopg://nobody:x@127.0.0.1:1/none", connect_args={"connect_timeout": 1})
    monkeypatch.setattr(db, "get_engine", lambda: unreachable)
    response = client.get("/api/healthz")
    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "database_unavailable"
    assert "x@" not in body["error"]["message"] and "127.0.0.1" not in body["error"]["message"]


def test_healthz_works_with_demo_mode_off(client, monkeypatch, pg_engine):
    monkeypatch.setattr(db, "get_engine", lambda: pg_engine)
    monkeypatch.setenv("DEMO_MODE", "false")
    assert client.get("/api/healthz").status_code == 200


def test_log_level_comes_from_the_environment(monkeypatch):
    monkeypatch.setenv("LOG_LEVEL", "warning")
    configure_logging()
    assert logging.getLogger().level == logging.WARNING
    monkeypatch.delenv("LOG_LEVEL")
    configure_logging()
    assert logging.getLogger().level == logging.INFO


def test_unknown_log_level_falls_back_to_info(monkeypatch):
    monkeypatch.setenv("LOG_LEVEL", "chatty")
    configure_logging()
    assert logging.getLogger().level == logging.INFO
