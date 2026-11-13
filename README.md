# Wise Tax Jar

Прототип для хакатона: входящие платежи делятся на рабочий доход и личные, с дохода процент уходит в Tax Jar. Данные только синтетические, публично не разворачивать.

Спецификация: `roadmap-tax-jar-en.md`. Планы по ролям: `docs/superpowers/plans/`. Как подключаться к движку: `docs/engine-integration.md`.

## Бэкенд

Нужен Python 3.10 или новее.

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Тесты:

```bash
cd backend
.venv/bin/pytest -q
```

Документация API после запуска: `http://localhost:8000/docs`, схема: `http://localhost:8000/openapi.json`.

Сейчас маршруты отдают фиксированные примеры в форме контракта (`backend/app/examples.py`). Это моки для фронтенда, пока роль B не подключит хранилище. `/api/tax/countries`, `/api/tax/summary` и `/api/tax/export.csv` уже считаются настоящим движком.

## Фронтенд

Ещё не создан (вторая половина задачи S0). После создания:

```bash
cd frontend
npm run dev
npm run gen:api
```

## Контракт

`backend/app/schemas.py` заморожен: правки только через тех-лида. Относительно общего плана добавлены три необязательных поля для разбивки налога: `TaxReservation.breakdown`, `TaxSummary.breakdown` с `breakdownRule` и `Regime.breakdownRule`.
