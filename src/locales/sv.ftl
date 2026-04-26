# Swedish translations

## Errors
error-rateLimit = Hastighetsgräns överskriden. Vänta { $seconds } sekunder.
error-invalidRegex = Ogiltigt regex-mönster. Kontrollera din syntax och försök igen.
error-telegramAPI = Något gick fel. Försök igen.
error-workerTimeout = Bearbetningsfel. Försök igen med ett enklare mönster.
error-circuitOpen = Tjänsten tillfälligt otillgänglig. Försök igen senare.
error-noTarget = Ingen matchande mål hittades i senaste meddelanden.
error-targetIsCommand = Kan inte ersätta på ett annat sed-kommando.
error-messageTooLong = Resultatet är för långt ({ $length }/{ $max } tecken).
error-chainTooLong = För många kommandon i kedjan (max { $max }).

## Commands
command-start = Hej! Jag är en regex-bot. Använd s/find/replace/flags för att ersätta text i meddelanden. Ersättningstexten kan sträcka sig över flera rader eller använda escape-sekvenser som `\n`. Du kan också kedja flera kommandon, ett per rad.

    Specialflaggor:
    - `p`: Visa exekveringstid
    Använd `\N` för fångade grupper.

command-privacy = Denna bot samlar inte in eller bearbetar några användardata, förutom en kort meddelandehistorik för att utföra regex-ersättningar. Dessa lagras i en SQL-databas i minnet i 48 timmar och kan inte nås av botens administratör på något sätt.

command-language-usage = Användning:
    /language - Visa aktuellt språk
    /language list - Visa tillgängliga språk
    /language set <kod> - Byt språk

command-language-current = Ditt aktuella språk är: { $language }
command-language-list = Tillgängliga språk:

    { $languages }

    Använd /language set <kod> för att byta.
command-language-setSuccess = Språk ändrat till { $language }
command-language-setError = Ogiltig språkkod. Använd /language list för att se tillgängliga alternativ.

## Substitution results
substitution-result = Resultat: { $result }
substitution-noMatch = Ingen matchning hittades.
substitution-multipleResults = Tillämpade { $count } ersättningar
substitution-performance = Utförde { $count } ersättningar på { $time }

## Tips
tip-optimization = Tips: { $suggestion }
tip-useShorthand = Använd { $shorthand } istället för { $longform } (kortare)
tip-nonCapturing = Använd (?:...) för grupper du inte refererar till
tip-greedy = Överväg att använda .*? istället för .* (icke-girig)

## Regex Help
regexHelp-title = Regex-hjälp
regexHelp-selectCategory = Välj en kategori för att lära dig regex-syntax:
regexHelp-back = Tillbaka
regexHelp-backToCategories = Tillbaka till Kategorier

## Health & Metrics
health-title = Bot Hälsostatus
health-healthy = FRISK
health-degraded = FÖRSÄMRAD
health-unhealthy = OFRISK
health-workers = Workers: { $active } aktiva, { $idle } inaktiva
health-queue = Kö: { $pending } väntande uppgifter
health-errorRate = Felfrekvens: { $rate }%
health-uptime = Drifttid: { $uptime }

metrics-title = Prestandamått
metrics-cacheHitRate = Cache-träffsats: { $rate }%
metrics-avgProcessingTime = Genomsnittlig Bearbetningstid: { $time }ms
metrics-totalSubstitutions = Totala Ersättningar: { $count }
metrics-regexCompilations = Regex-kompileringar: { $total } (i cache: { $cached })

## General
general-yes = Ja
general-no = Nej
general-cancel = Avbryt
general-done = Klart
general-loading = Laddar...
general-error = Fel
