# Выкладка на EC2

Один сервер делает всё: гоняет тесты, собирает образы, пушит их в ECR и запускает приложение через docker compose.

Автоматический deploy выполняется только после зелёного CI на `main`. Сам по себе push в `main` ничего не выкладывает: workflow `Deploy` стартует по `workflow_run` после завершения workflow `CI`.

```
push в main
   │
   ▼
[CI]       ci.yml на раннерах GitHub: бэкенд (Python 3.10 и 3.13, Postgres), фронтенд, золотой путь в браузере
   │       красный или отменённый CI: Deploy ничего не делает
   ▼
[gate]     Deploy: CI был на push в main этого же репозитория и завершился success;
   │       тег образа = head_sha того самого CI-запуска, 40 hex-символов, коммит лежит в main
   ▼
[test]     сборка образов на сервере, тесты бэкенда внутри образа на одноразовом Postgres,
   │       линт и юнит-тесты фронтенда, сборка веб-образа; любой сбой останавливает всё
   ▼
[publish]  docker push в ECR: тег = sha коммита, плюс latest (needs: test)
   │
   ▼
[deploy]   environment production: checkout ровно этого sha, docker compose pull + up,
           проверка, откат при неудаче
```

Deploy возможен только в двух случаях: publish прошёл успешно после зелёного CI на `main`, либо вручную запущен откат из `main` с валидным `image_tag` (см. "Откат"). Упавший или отменённый test/publish до deploy не доходит.

Файлы:

- `.github/workflows/deploy.yml`: пайплайн выкладки.
- `compose.prod.yaml`: что запускается на сервере. Ничего не собирает, только тянет образы из ECR.
- `docker/backend.Dockerfile`, `docker/web.Dockerfile`: образы. У веб-образа есть стадия `test` с линтом и юнит-тестами.
- `.github/workflows/ci.yml`: CI на раннерах GitHub для всех веток и PR, включая золотой путь в браузере. Его успех на push в `main` и есть условие автоматического deploy.

## Как это устроено

- Сервер зарегистрирован в GitHub как self-hosted runner с меткой `taxjar`. Задачи test, publish и deploy идут на нём (gate считается на раннере GitHub и ничего не исполняет из образов), поэтому собранные образы не нужно передавать между задачами и SSH для выкладки не нужен.
- Доступ к ECR даёт IAM-роль сервера. Ключей AWS в репозитории и в секретах GitHub нет.
- Тесты бэкенда запускаются внутри того самого образа, который уедет в прод.
- База: PostgreSQL 17 в сервисе `db`, данные хранятся в docker-томе `db-data`. Том переживает выкладки и перезагрузки.
- После запуска пайплайн проверяет приложение через шлюз. Если новая версия не поднялась, он возвращает предыдущий тег.

## Настройка, один раз

### 1. ECR

Два репозитория: `taxjar-backend` и `taxjar-web`.

```bash
aws ecr create-repository --repository-name taxjar-backend --region eu-north-1
aws ecr create-repository --repository-name taxjar-web --region eu-north-1
```

Чтобы реестр не рос бесконечно, стоит повесить lifecycle-правило "хранить последние 20 образов" на оба.

### 2. IAM-роль сервера

Роль с такой политикой прикрепляется к инстансу (Actions > Security > Modify IAM role). Номер аккаунта и регион подставить свои.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*" },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer",
        "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage"
      ],
      "Resource": [
        "arn:aws:ecr:eu-north-1:123456789012:repository/taxjar-backend",
        "arn:aws:ecr:eu-north-1:123456789012:repository/taxjar-web"
      ]
    }
  ]
}
```

### 3. Сервер

Подойдёт `t3.small` (2 ГБ памяти) с 20 ГБ диска: сборка фронтенда на 1 ГБ может не пройти. Ниже команды для Ubuntu 24.04.

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-buildx docker-compose-v2 curl
sudo snap install aws-cli --classic
sudo usermod -aG docker ubuntu
sudo mkdir -p /opt/taxjar && sudo chown ubuntu:ubuntu /opt/taxjar
```

После `usermod` нужно перелогиниться. Проверка, что роль работает:

```bash
aws sts get-caller-identity
```

### 4. Раннер GitHub

В репозитории: Settings > Actions > Runners > New self-hosted runner, Linux x64. Страница покажет команды с одноразовым токеном. При настройке добавить метку `taxjar`:

```bash
./config.sh --url https://github.com/adapsss/goyslop --token <токен со страницы> --labels taxjar
sudo ./svc.sh install ubuntu && sudo ./svc.sh start
```

Раннер ставится от пользователя `ubuntu`, не от root. Вторая строка делает его службой, которая стартует после перезагрузки.

### 5. Переменные репозитория

Settings > Secrets and variables > Actions > вкладка Variables:

| Переменная | Пример |
|---|---|
| `AWS_REGION` | `eu-north-1` |
| `ECR_REGISTRY` | `123456789012.dkr.ecr.eu-north-1.amazonaws.com` |
| `APP_PORT` | необязательно, по умолчанию `80` |

Секреты не нужны.

### 5a. Environment `production`

Settings > Environments > `production` > Deployment branches and tags > Selected branches and tags: добавить только `main`. Job `deploy` привязан к этому environment, и без такого правила гарантии из самого workflow недостаточно: ветка может изменить `deploy.yml` у себя и убрать проверки. Правило на стороне GitHub этого не даёт обойти. По желанию там же включаются Required reviewers.

### 6. Security group

Открыть наружу порт приложения (80) и, если нужен ярлык симулятора, 8081. SSH (22) только со своих адресов.

В общем плане записано ограничение: прототип не выкладывается публично. У приложения нет входа, а симулятор и кнопка сброса доступны любому, кто откроет адрес. Поэтому порт 80 стоит открыть только для адресов команды и жюри, а не для `0.0.0.0/0`.

## Работа с сервером

Всё лежит в `/opt/taxjar`: `compose.prod.yaml` и `.env` с текущим тегом.

```bash
cd /opt/taxjar
docker compose -f compose.prod.yaml ps
docker compose -f compose.prod.yaml logs -f --tail 100
```

Что сейчас запущено:

```bash
cat /opt/taxjar/.env
```

### Откат

В GitHub: Actions > Deploy > Run workflow, **ветка `main`**, в поле `image_tag` вписать полный sha (ровно 40 символов, hex) коммита, образ которого уже есть в ECR. Тесты и сборка пропускаются, сервер просто переключается на этот образ.

Правила отката:

- Откат разрешён только по sha из `main`: workflow проверяет, что коммит является предком `origin/main`. Чужой sha, короткий sha, тег или что-то с переводом строки отклоняются до того, как что-то записано в `.env`.
- Ручной запуск с любой другой ветки запрещён: с `image_tag` или без него он не выполняет ни test, ни publish, ни deploy.
- Checkout при откате делается на тот же sha, поэтому `compose.prod.yaml` соответствует образам.

### Сброс данных

Кнопка "Fresh start" в симуляторе возвращает демо-данные без перезапуска. Полный сброс тома:

```bash
cd /opt/taxjar
docker compose -f compose.prod.yaml down -v
docker compose -f compose.prod.yaml up -d --wait
```

### Копия базы

```bash
cd /opt/taxjar
docker compose -f compose.prod.yaml exec -T db \
  pg_dump -U taxjar -d taxjar > "backup-$(date +%Y%m%d-%H%M%S).sql"
```

## Что важно знать

- **Раннер и прод на одной машине.** Пайплайн исполняет код из репозитория на прод-сервере. Репозиторий приватный, и Deploy запускается только после CI на push в `main` этого же репозитория (не из форка, не на pull request) и вручную из `main`. Если репозиторий станет публичным, self-hosted runner нужно убрать: любой форк сможет исполнить свой код на сервере.
- **Простой при выкладке.** Контейнеры пересоздаются, это несколько секунд недоступности. Для одного сервера без балансировщика так и должно быть.
- **Сборка грузит сервер.** Пока идут тесты и сборка, приложение на том же сервере работает медленнее.
- **HTTPS нет.** Шлюз слушает обычный HTTP. Для домена с сертификатом нужно убрать `auto_https off` в `docker/Caddyfile` и задать имя сайта, либо поставить перед сервером балансировщик.
- **PostgreSQL на том же сервере.** Сервис `db` и том `db-data` находятся в том же compose-проекте. Перед разрушительными операциями сохраняйте дамп через `pg_dump`; откат образа сам по себе не откатывает изменения схемы или данных.
- **Золотой путь в браузере** на сервере не запускается, но блокирует deploy через `ci.yml`: пока CI на коммите не зелёный целиком, `workflow_run` не пропустит выкладку.
- **Не самый свежий коммит.** Deploy выкладывает именно тот sha, который проверил CI, а не текущий конец `main`. Если CI двух коммитов закончился в обратном порядке, выложится тот, что закончился позже.
