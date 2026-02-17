# Ukrainian translations

## Errors
error-rateLimit = Перевищено ліміт швидкості. Будь ласка, зачекайте { $seconds } секунд.
error-invalidRegex = Неприпустимий шаблон regex. Перевірте синтаксис і спробуйте знову.
error-telegramAPI = Щось пішло не так. Будь ласка, спробуйте знову.
error-workerTimeout = Помилка обробки. Спробуйте знову з простішим шаблоном.
error-circuitOpen = Сервіс тимчасово недоступний. Будь ласка, спробуйте пізніше.
error-noTarget = Відповідна ціль не знайдена в останніх повідомленнях.
error-targetIsCommand = Неможливо замінити на іншій sed-команді.
error-messageTooLong = Результат занадто довгий ({ $length }/{ $max } символів).
error-chainTooLong = Занадто багато команд у ланцюжку (макс { $max }).

## Commands
command-start = Привіт! Я бот regex. Використовуйте s/find/replace/flags для заміни тексту в повідомленнях. Текст заміни може займати кілька рядків або використовувати escape-послідовності як `\n`. Ви також можете об'єднувати кілька команд, по одній на рядок.

    Спеціальні прапорці:
    - `p`: Показати час виконання
    Використовуйте `\N` для захоплених груп.

command-privacy = Цей бот не збирає і не обробляє дані користувачів, окрім короткої історії повідомлень для виконання regex-замін. Вони зберігаються в базі даних SQL у пам'яті протягом 48 годин і не можуть бути доступні адміністратору бота жодним чином.

command-language-usage = Використання:
    /language - Показати поточну мову
    /language list - Показати доступні мови
    /language set <код> - Змінити мову

command-language-current = Ваша поточна мова: { $language }
command-language-list = Доступні мови:

    { $languages }

    Використовуйте /language set <код> для зміни.
command-language-setSuccess = Мову змінено на { $language }
command-language-setError = Неприпустимий код мови. Використовуйте /language list для перегляду доступних опцій.

## Substitution results
substitution-result = Результат: { $result }
substitution-noMatch = Відповідність не знайдено.
substitution-multipleResults = Застосовано { $count } замін
substitution-performance = Виконано { $count } замін за { $time }

## Tips
tip-optimization = Підказка: { $suggestion }
tip-useShorthand = Використовуйте { $shorthand } замість { $longform } (коротше)
tip-nonCapturing = Використовуйте (?:...) для груп, на які ви не посилаєтесь
tip-greedy = Розгляньте використання .*? замість .* (нежадний)

## Regex Help
regexHelp-title = Довідка Regex
regexHelp-selectCategory = Виберіть категорію, щоб вивчити синтаксис regex:
regexHelp-back = Назад
regexHelp-backToCategories = Назад до Категорій

## Health & Metrics
health-title = Стан Бота
health-healthy = ЗДОРОВИЙ
health-degraded = ДЕГРАДОВАНИЙ
health-unhealthy = НЕЗДОРОВИЙ
health-workers = Воркери: { $active } активних, { $idle } неактивних
health-queue = Черга: { $pending } очікуючих завдань
health-errorRate = Рівень Помилок: { $rate }%
health-uptime = Час Роботи: { $uptime }

metrics-title = Метрики Продуктивності
metrics-cacheHitRate = Рівень Попадань у Кеш: { $rate }%
metrics-avgProcessingTime = Середній Час Обробки: { $time }ms
metrics-totalSubstitutions = Всього Замін: { $count }
metrics-regexCompilations = Компіляції Regex: { $total } (у кеші: { $cached })

## General
general-yes = Так
general-no = Ні
general-cancel = Скасувати
general-done = Готово
general-loading = Завантаження...
general-error = Помилка
