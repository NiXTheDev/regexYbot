# Russian translations

## Errors
error-rateLimit = Превышен лимит скорости. Пожалуйста, подождите { $seconds } секунд.
error-invalidRegex = Недопустимый шаблон regex. Проверьте синтаксис и попробуйте снова.
error-telegramAPI = Что-то пошло не так. Пожалуйста, попробуйте снова.
error-workerTimeout = Ошибка обработки. Попробуйте снова с более простым шаблоном.
error-circuitOpen = Сервис временно недоступен. Пожалуйста, попробуйте позже.
error-noTarget = Совпадающая цель не найдена в последних сообщениях.
error-targetIsCommand = Невозможно заменить на другой sed-команде.
error-messageTooLong = Результат слишком длинный ({ $length }/{ $max } символов).
error-chainTooLong = Слишком много команд в цепочке (макс { $max }).

## Commands
command-start = Привет! Я бот regex. Используйте s/find/replace/flags для замены текста в сообщениях. Текст замены может занимать несколько строк или использовать escape-последовательности как `\n`. Вы также можете объединять несколько команд, по одной на строку.

    Специальные флаги:
    - `p`: Показать время выполнения
    Используйте `\N` для захваченных групп.

command-privacy = Этот бот не собирает и не обрабатывает данные пользователей, кроме краткой истории сообщений для выполнения regex-замен. Они хранятся в базе данных SQL в памяти в течение 48 часов и не могут быть доступны администратору бота никаким образом.

command-language-usage = Использование:
    /language - Показать текущий язык
    /language list - Показать доступные языки
    /language set <код> - Изменить язык

command-language-current = Ваш текущий язык: { $language }
command-language-list = Доступные языки:

    { $languages }

    Используйте /language set <код> для изменения.
command-language-setSuccess = Язык изменен на { $language }
command-language-setError = Недопустимый код языка. Используйте /language list для просмотра доступных опций.

## Substitution results
substitution-result = Результат: { $result }
substitution-noMatch = Совпадение не найдено.
substitution-multipleResults = Применено { $count } замен
substitution-performance = Выполнено { $count } замен за { $time }

## Tips
tip-optimization = Подсказка: { $suggestion }
tip-useShorthand = Используйте { $shorthand } вместо { $longform } (короче)
tip-nonCapturing = Используйте (?:...) для групп, на которые вы не ссылаетесь
tip-greedy = Рассмотрите использование .*? вместо .* (нежадный)

## Regex Help
regexHelp-title = Помощь по Regex
regexHelp-selectCategory = Выберите категорию, чтобы изучить синтаксис regex:
regexHelp-back = Назад
regexHelp-backToCategories = Назад к Категориям

## Health & Metrics
health-title = Состояние Бота
health-healthy = ЗДОРОВ
health-degraded = ДЕГРАДИРОВАН
health-unhealthy = НЕЗДОРОВ
health-workers = Воркеры: { $active } активных, { $idle } неактивных
health-queue = Очередь: { $pending } ожидающих задач
health-errorRate = Уровень Ошибок: { $rate }%
health-uptime = Время Работы: { $uptime }

metrics-title = Метрики Производительности
metrics-cacheHitRate = Уровень Попаданий в Кэш: { $rate }%
metrics-avgProcessingTime = Среднее Время Обработки: { $time }ms
metrics-totalSubstitutions = Всего Замен: { $count }
metrics-regexCompilations = Компиляции Regex: { $total } (в кэше: { $cached })

## General
general-yes = Да
general-no = Нет
general-cancel = Отмена
general-done = Готово
general-loading = Загрузка...
general-error = Ошибка
