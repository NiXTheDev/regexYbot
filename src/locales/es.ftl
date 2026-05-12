# Spanish translations

## Errors
error-rateLimit = Límite de velocidad excedido. Por favor espera { $seconds } segundos.
error-invalidRegex = Patrón regex inválido. Verifica tu sintaxis e inténtalo de nuevo.
error-telegramAPI = Algo salió mal. Por favor inténtalo de nuevo.
error-workerTimeout = Error de procesamiento. Por favor inténtalo con un patrón más simple.
error-circuitOpen = Servicio temporalmente no disponible. Por favor inténtalo más tarde.
error-noTarget = No se encontró objetivo coincidente en mensajes recientes.
error-targetIsCommand = No se puede sustituir en otro comando sed.
error-messageTooLong = El resultado es demasiado largo ({ $length }/{ $max } caracteres).
error-chainTooLong = Demasiados comandos en cadena (máx { $max }).

## Commands
command-start = ¡Hola! Soy un bot de regex. Usa s/find/replace/flags para sustituir texto en mensajes. El texto de reemplazo puede abarcar múltiples líneas o usar secuencias de escape como `\n`. También puedes encadenar múltiples comandos, uno por línea.

    Flags especiales:
    - `p`: Mostrar tiempo de ejecución
    Usa `\N` para grupos capturados.

command-privacy = Este bot no recopila ni procesa datos de usuario, aparte de un breve historial de mensajes para realizar sustituciones regex. Estos se almacenan en una base de datos SQL en memoria durante 48 horas y no pueden ser accedidos por el administrador del bot de ninguna manera.

command-language-usage = Uso:
    /language - Mostrar idioma actual
    /language list - Mostrar idiomas disponibles
    /language set <código> - Cambiar idioma

command-language-current = Tu idioma actual es: { $language }
command-language-list = Idiomas disponibles:

    { $languages }

    Usa /language set <código> para cambiar.
command-language-setSuccess = Idioma cambiado a { $language }
command-language-setError = Código de idioma inválido. Usa /language list para ver las opciones disponibles.

## Substitution results
substitution-result = Resultado: { $result }
substitution-noMatch = No se encontró coincidencia.
substitution-multipleResults = Aplicadas { $count } sustituciones
substitution-performance = Realizadas { $count } sustituciones en { $time }

## Tips
tip-optimization = Consejo: { $suggestion }
tip-useShorthand = Usa { $shorthand } en lugar de { $longform } (más corto)
tip-nonCapturing = Usa (?:...) para grupos que no referencias
tip-greedy = Considera usar .*? en lugar de .* (no codicioso)

## Regex Help
regexHelp-title = Ayuda de Regex
regexHelp-selectCategory = Selecciona una categoría para aprender sintaxis regex:
regexHelp-back = Atrás
regexHelp-backToCategories = Volver a Categorías

## Health & Metrics
health-title = Estado de Salud del Bot
health-healthy = SALUDABLE
health-degraded = DEGRADADO
health-unhealthy = NO SALUDABLE
health-workers = Workers: { $active } activos, { $idle } inactivos
health-queue = Cola: { $pending } tareas pendientes
health-errorRate = Tasa de Error: { $rate }%
health-uptime = Tiempo de Actividad: { $uptime }

metrics-title = Métricas de Rendimiento
metrics-cacheHitRate = Tasa de Acierto de Caché: { $rate }%
metrics-avgProcessingTime = Tiempo Promedio de Procesamiento: { $time }ms
metrics-totalSubstitutions = Sustituciones Totales: { $count }
metrics-regexCompilations = Compilaciones Regex: { $total } (en caché: { $cached })

## General
general-yes = Sí
general-no = No
general-cancel = Cancelar
general-done = Hecho
general-loading = Cargando...
general-error = Error
