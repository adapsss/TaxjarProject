# Выкладка на EC2

Один сервер делает всё: гоняет тесты, собирает образы, пушит их в ECR и запускает приложение через docker compose. Запускается на каждый push в `main`.

```
push в main
   │
   ▼
[test]     сборка образов на сервере, тесты бэкенда внутри образа, линт и тесты фронтенда
   │       любой упавший тест останавливает всё
   ▼
[publish]  docker push в ECR: тег = sha коммита, плюс latest
   │
   ▼
[deploy]   docker compose pull + up на том же сервере, проверка, откат при неудаче
```

Файлы:

- `.github/workflows/deploy.yml`: пайплайн.
- `compose.prod.yaml`: что запускается на сервере. Ничего не собирает, только тянет образы из ECR.
- `docker/backend.Dockerfile`, `docker/web.Dockerfile`: образы. У веб-образа есть стадия `test` с линтом и юнит-тестами.
- `.github/workflows/ci.yml`: прежний CI на раннерах GitHub для всех веток и PR, включая золотой путь в браузере. Он остаётся как был.

## Как это устроено

- Сервер зарегистрирован в GitHub как self-hosted runner с меткой `taxjar`. Все три задачи идут на нём, поэтому собранные образы не нужно передавать между задачами и SSH для выкладки не нужен.
- Доступ к ECR даёт IAM-роль сервера. Ключей AWS в репозитории и в секретах GitHub нет.
- Тесты бэкенда запускаются внутри того самого образа, который уедет в прод.
- База: SQLite в docker-томе `taxjar_backend-data`. Том переживает выкладки и перезагрузки.
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

В GitHub: Actions > Deploy > Run workflow, в поле `image_tag` вписать sha коммита, образ которого уже есть в ECR. Тесты и сборка пропускаются, сервер просто переключается на этот образ.

### Сброс данных

Кнопка "Fresh start" в симуляторе возвращает демо-данные без перезапуска. Полный сброс тома:

```bash
cd /opt/taxjar
docker compose -f compose.prod.yaml down -v
docker compose -f compose.prod.yaml up -d --wait
```

### Копия базы

```bash
docker run --rm -v taxjar_backend-data:/data -v "$PWD":/backup alpine cp /data/app.db /backup/app.db
```

## Что важно знать

- **Раннер и прод на одной машине.** Пайплайн исполняет код из репозитория на прод-сервере. Репозиторий приватный, и workflow запускается только на push в `main` и вручную, не на pull request. Если репозиторий станет публичным, self-hosted runner нужно убрать: любой форк сможет исполнить свой код на сервере.
- **Простой при выкладке.** Контейнеры пересоздаются, это несколько секунд недоступности. Для одного сервера без балансировщика так и должно быть.
- **Сборка грузит сервер.** Пока идут тесты и сборка, приложение на том же сервере работает медленнее.
- **HTTPS нет.** Шлюз слушает обычный HTTP. Для домена с сертификатом нужно убрать `auto_https off` в `docker/Caddyfile` и задать имя сайта, либо поставить перед сервером балансировщик.
- **SQLite, не PostgreSQL.** Для одного сервера и одного процесса бэкенда этого хватает. Переход на PostgreSQL потребует правок в коде: сейчас в запросах используются `rowid` и `PRAGMA`, которые есть только в SQLite.
- **Золотой путь в браузере** на сервере не запускается, он остаётся в `ci.yml` на раннерах GitHub.
