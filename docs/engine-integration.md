# Tax Engine: как подключаться

Короткая шпаргалка для ролей A, B и D. Всё, что ниже, лежит в `backend/app/engine/` на ветке `engine/classifier-and-rules`.

Движок отличается от того, что описано в плане C1/C2: классификатор больше не смотрит на слова в референсе, а налоговые данные покрывают не только Эстонию. Сигнатуры из плана сохранены, новое добавлено необязательными аргументами.

## Запуск тестов

Из каталога `backend/`:

```bash
python3 -m pytest tests -q -p no:cacheprovider
```

Пока S0 не в `main`, работает только такой вызов (нет `pytest.ini`). После S0 хватит обычного `pytest`.

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
| Acme Inc. | 150000 | INV-042 | income | 97 |
| Nordwind GmbH | 220000 | Rechnung 2026-118 | income | 97 |
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
- Дедлайн "10-е число" у `entrepreneur_account` это заглушка из общего плана, не исследованная дата.
- Формы юрлиц в `legal_forms.json` записаны по памяти моделей и по внешним реестрам не сверялись.
- Референсы с эмодзи в сценариях можно оставить, движку они безразличны.

## Известные ограничения

- В имени, набранном заглавными буквами, двухбуквенные формы (`SIEMENS AG`, `AS TALLINNA VESI`) не распознаются. Такой платёж уходит в вопрос.
- Коды вида `COVID-19`, `MH370`, `ISO-9001` в референсе считаются номером документа.
- `KK` и `Kabushiki Kaisha` не распознаются, только `K.K.` и запись иероглифами.
- Python 3.10 проверен только разбором синтаксиса.

## Что ещё не сделано в роли C

| Задача | Ждёт |
|---|---|
| C3: `assert_invariants` и ревью `pipeline.py` | B2, затем B4 |
| C4: `build_summary` и `/tax/summary` | B2, B4, один тест ждёт B5 |
| C5: CSV-экспорт | B4 |
| Проверка под S0 (`pytest.ini`, `schemas.Country`) | S0 в `main` |
| Сверка налоговых данных с официальными источниками | роль D |
