# Tax Engine: как подключаться

Короткая шпаргалка для ролей A, B и D. Всё, что ниже, лежит в `backend/app/engine/` на ветке `engine/integrate-on-main`.

Движок отличается от того, что описано в плане C1/C2: классификатор больше не смотрит на слова в референсе, а налоговые данные покрывают не только Эстонию. Сигнатуры из плана сохранены, новое добавлено необязательными аргументами.

## Откуда движок берёт данные

Налоговые данные и формы юрлиц движок читает из Postgres, а не из файлов: `app/engine/data.py` держит текущую копию и перечитывает её из базы раз в `TAX_DATA_REFRESH_SECONDS` (по умолчанию 60 секунд). Форма словарей та же, что в `countries.json` и `legal_forms.json`, поэтому функции ниже работают как раньше. Ставка, исправленная в базе SQL-запросом, доходит до API в течение минуты, без перезапуска.

JSON-файлы теперь только наполняют пустую базу (`python -m app.data_load`). Подробнее: раздел «Data» в `README.md` и `backend/tools/tax_data/README.md`.

## Запуск тестов

```bash
docker compose up -d db   # тесты идут на Postgres, база taxjar_test
cd backend
.venv/bin/pytest -q
```

Движок подключён к бэкенду из `main`: `pipeline.py` зовёт `classify`, `reservations.py` зовёт `compute_tax`, `summary.py` и `db.py` зовут разбивку.

## Классификатор

```python
from app.engine.classifier import classify, infer_kind, normalize_name, PriorPayment, OwnerContext

result = classify(
    sender_name="Acme Inc.",
    sender_kind=None,            # "company" | "person" | "unknown" | None
    amount=150000,               # minor units
    reference="INV-042",
    owner_name="Kadri Saar",
    payer_status=None,           # "client" | "personal" | None
    # всё ниже необязательно:
    currency="USD",
    history=[PriorPayment(at=..., amount=..., currency="USD")],   # прошлые платежи этого же плательщика
    owner=OwnerContext(home_currency="EUR", typical_income_minor=None),
    now=datetime(...),
)
result.label        # "income" | "unknown" | "personal"
result.score        # 0..100, вероятность дохода в процентах
result.confidence   # score/100 для income и unknown, 1 - score/100 для personal
result.reasons      # список строк для строки "Why"
```

Пороги прежние: `score >= 80` это income, `40..79` это unknown (задаём вопрос), ниже 40 это personal.

Порядок правил:

1. Имя отправителя совпадает с владельцем: personal, score 0. Сравнение не зависит от регистра, порядка слов и диакритики.
2. `amount <= 0`: personal, score 0.
3. `payer_status` задан: income 100 или personal 0.
4. Иначе считается модель по признакам.

Признаки модели:

| Признак | Причина в `reasons` |
|---|---|
| Форма юрлица в названии или `sender_kind == "company"` | `company sender` |
| Номер счёта или заказа в референсе (`INV-042`, `#123`, `2026-118`) | `invoice in reference` |
| Валидный RF-референс (ISO 11649) или числовой с контрольной цифрой | `structured payment reference` |
| Сумма заметно больше или меньше обычной | `sizeable amount`, `small amount`, `larger than your usual payment`, `smaller than your usual payment` |
| Плательщик уже платил | `this payer has paid you before` |
| Та же сумма, что раньше | `same amount as an earlier payment` |
| Платежи идут по расписанию | `payments arrive on a regular schedule` |
| Валюта не домашняя | `paid in a foreign currency` |

Остальные причины: `transfer between your own accounts`, `not an incoming amount`, `you marked this payer as a client`, `you marked this payer as personal`.

Слова в референсе ничего не значат: `website` и `birthday` дают одинаковый результат. Эмодзи в референсе не мешают и не учитываются.

### Демо-сценарии

Все восемь сценариев из плана роли D дают ожидаемую метку, это закреплено тестом `test_demo_scenarios`:

| Отправитель | Сумма | Референс | Метка | Score |
|---|---|---|---|---|
| Acme Inc. | 150000 | INV-042 | income | 96 |
| Nordwind GmbH | 220000 | Rechnung 2026-118 | income | 96 |
| Brightside Ltd | 90000 | consulting March | income | 86 |
| Pihlakas Disain OÜ | 64000 | arve 77 | income | 86 |
| John Smith | 40000 | website | unknown | 49 |
| Mari Tamm (person) | 2300 | pizza | personal | 15 |
| Liis Kask (person) | 1200 | beer | personal | 10 |
| Kadri Saar | 20000 | between my accounts | personal | 0 |

Причины у Acme остались как в плане: `["company sender", "invoice in reference"]`.

### Что важно роли B

- Старый вызов из шести аргументов работает без изменений.
- `history` и `now` стоит передавать, когда появится таблица транзакций: повторный клиент с регулярными платежами уходит в income без вопроса.
- С `OwnerContext.typical_income_minor` осторожно. Если передать крупное значение (например 200000), платёж John Smith на 400 евро становится personal и вопрос из шага 4 демо пропадает. На демо либо не передавать `owner`, либо оставлять `typical_income_minor=None`.
- `normalize_name` и `infer_kind` по-прежнему импортируются из `classifier`.
- `infer_kind("Acme GmbH", "person")` возвращает `"company"`: форма юрлица в названии сильнее заявленного типа.

## Налоговые правила

```python
from app.engine.tax_rules import load_countries, get_regime, compute_tax, next_deadline, estimate_annual_tax
```

- `load_countries()` отдаёт список для `GET /tax/countries`: `code`, `name`, `currency`, `regimes[]` с ключами `id`, `name`, `defaultRate`, `hint`, `deadline`. Последняя запись всегда `*` (Other) с режимом `custom`.
- `get_regime(country, regime)` отдаёт полную запись режима или `None`. Подходит для валидации профиля. Режим `custom` существует только у страны `*`: пара `("EE", "custom")` вернёт `None`.
- `compute_tax(amount, rate_bp)` считает в целых числах с округлением half-up.
- `next_deadline(country, regime, today)` отдаёт ближайшую дату или `None`.
- `estimate_annual_tax(regime, annual_income)` оценивает годовой налог и взносы от налоговой базы. Никем не используется, на демо-путь не влияет.

Идентификаторы эстонских режимов остались `entrepreneur_account` и `fie`.

### Единицы

Суммы в минорных единицах валюты по ISO 4217: центы для EUR и USD, целые единицы для JPY, KRW, CLP и ISK, тысячные для KWD и BHD. Ставки в базисных пунктах.

### Что важно роли A

Стран теперь 80 плюс `*`, а не две. Шаг выбора страны в онбординге нужен с поиском или хотя бы с прокруткой. `hint` у режимов длиннее одной строки: это пояснение, как получена ставка.

### Что важно роли D

Все налоговые цифры нужно сверить с официальными источниками перед показом. Сейчас они собраны в основном из сводок PwC и консалтинговых сайтов, сайты налоговых органов почти не открывались.

- У каждого режима есть `sources`, `verifiedAt`, `notes` и список `unverified` с пустыми полями.
- `defaultRate` посчитан на предположенном доходе, арифметика записана в `hint`.
- Эстония сверена с первоисточниками 13.11.2026 (EMTA и текст закона в Riigi Teataja): ставка 20%, деление 22/55 и 33/55, перевод банком до 10-го числа, FIE 22% и 33%, сроки 30 апреля, 1 октября, авансы 15 сентября и 15 декабря. У таких режимов `verification` равно `official`, у остальных `secondary`.
- Не сверено для FIE: необлагаемый минимум 8400 евро и даты авансов по социальному налогу.
- Формы юрлиц в `legal_forms.json` записаны по памяти моделей и по внешним реестрам не сверялись.
- Референсы с эмодзи в сценариях можно оставить, движку они безразличны.

## Сводка, экспорт и инварианты

Эти три задачи (C3, C4, C5) живут вне движка: `backend/app/summary.py` и `backend/tests/invariants.py`. Движок даёт им `next_deadline`, разбивку и форматирование сумм по валюте (`format_minor`: два знака для EUR и USD, без дробной части для JPY, три знака для KWD).

В CSV поля плательщика и референса, начинающиеся с `=`, `+`, `-` или `@`, экранируются апострофом, чтобы таблица не выполнила их как формулу.

## Контекст для классификатора

```python
from app.engine import owner_context, payer_history

owner = owner_context("EUR", income_amounts)          # медиана дохода; None, пока платежей меньше пяти
history = payer_history(sender_name, past_payments)   # прошлые платежи того же плательщика
```

Сейчас `pipeline.py` их не передаёт, классификатор работает только по самому платежу. `owner_context` сам не включает сравнение с обычным доходом, пока подтверждённых доходных платежей меньше пяти, поэтому на демо с чистой базой John Smith остаётся в зоне вопроса.

## Разбивка налога

Деньги делятся на налоги только там, где закон задаёт это деление для каждого платежа. Сейчас это один режим: эстонский `entrepreneur_account` (22/55 подоходный, 33/55 социальный, плюс накопительная пенсия при ставке 22, 24 или 26%). Для остальных режимов есть только правило словами.

```python
from app.engine import split_tax, describe_rule, get_regime

regime = get_regime("EE", "entrepreneur_account")
split_tax(27600, regime, rate_bp=2000)
# [{"id": "income_tax", "name": "Income tax", "amount": 11040},
#  {"id": "social_tax", "name": "Social tax", "amount": 16560}]
split_tax(27600, get_regime("EE", "fie"))    # None: поплатёжной разбивки нет
describe_rule(get_regime("EE", "fie"))       # "22% income tax on profit + 33% social tax"
```

- Части всегда сходятся с суммой до цента.
- Если ставка в профиле не та, что задаёт закон (например 25%), `split_tax` вернёт `None`.
- В контракте это необязательные поля `TaxReservation.breakdown`, `TaxSummary.breakdown`, `TaxSummary.breakdownRule` и `Regime.breakdownRule`. Когда `breakdown` равен `null`, фронтенд показывает `breakdownRule` без сумм.
- Бэкенд уже отдаёт их: в ответах `simulate/incoming`, `transactions`, в событиях SSE, в `tax/summary` и в `tax/countries`.
- Резервация запоминает страну и режим, под которыми сделана (`ReservationRow.country`, `regime`), поэтому её разбивка не меняется при смене профиля. В существующую базу колонки добавляются сами при старте.
- Сводка отдаёт разбивку, только если все активные резервации сделаны под текущим режимом; иначе `null`.
- В CSV разбивки нет: формат колонок из плана не менялся.

Фронтенд (`frontend/`) показывает разбивку в тосте, в карточке платежа (`/transactions/:id`) и на экране Tax Jar; `breakdownRule` режима виден в онбординге.

## Известные ограничения

- Двухбуквенные формы в имени заглавными буквами распознаются только для однозначных (`AG`, `AB`, `AS`, `OY`, `OU`, `BV`, `NV`, `KG`, `UAB`); в начале имени заглавными только `AS` и `UAB`. `CARREFOUR SA` или `ACME SE` заглавными уходят в вопрос, потому что `SA`, `SE`, `BA` бывают фамилиями.
- Коды вида `COVID-19`, `MH370`, `ISO-9001` в референсе считаются номером документа. Один такой признак у неизвестного частного лица автоматического резерва не даёт, только вопрос.
- `KK` без точек не распознаётся, `K.K.` и `Kabushiki Kaisha` распознаются.
- Python 3.10 проверен только разбором синтаксиса.

## Что ещё не сделано

| Задача | Кто |
|---|---|
| Показать разбивку в интерфейсе | роль A |
| Передавать в `classify` историю плательщика и контекст владельца | роль B, по желанию |
| Ревью `pipeline.py` и `reservations.py` по списку из задачи C3 | роль C |
| Сверка налоговых данных остальных 78 стран | роль D |
