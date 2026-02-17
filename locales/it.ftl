# Italian translations

## Errors
error-rateLimit = Limite di velocità superato. Attendi { $seconds } secondi.
error-invalidRegex = Pattern regex non valido. Controlla la sintassi e riprova.
error-telegramAPI = Qualcosa è andato storto. Per favore riprova.
error-workerTimeout = Errore di elaborazione. Riprova con un pattern più semplice.
error-circuitOpen = Servizio temporaneamente non disponibile. Riprova più tardi.
error-noTarget = Nessun target corrispondente trovato nei messaggi recenti.
error-targetIsCommand = Impossibile sostituire su un altro comando sed.
error-messageTooLong = Il risultato è troppo lungo ({ $length }/{ $max } caratteri).
error-chainTooLong = Troppi comandi in catena (max { $max }).

## Commands
command-start = Ciao! Sono un bot regex. Usa s/find/replace/flags per sostituire testo nei messaggi. Il testo di sostituzione può estendersi su più righe o usare sequenze di escape come `\n`. Puoi anche concatenare più comandi, uno per riga.

    Flag speciali:
    - `p`: Mostra tempo di esecuzione
    Usa `\N` per i gruppi catturati.

command-privacy = Questo bot non raccoglie né elabora dati utente, a parte un breve storico di messaggi per eseguire sostituzioni regex. Questi vengono archiviati in un database SQL in memoria per 48 ore e non possono essere accessibili dall'amministratore del bot in alcun modo.

command-language-usage = Uso:
    /language - Mostra lingua attuale
    /language list - Mostra lingue disponibili
    /language set <codice> - Cambia lingua

command-language-current = La tua lingua attuale è: { $language }
command-language-list = Lingue disponibili:

    { $languages }

    Usa /language set <codice> per cambiare.
command-language-setSuccess = Lingua cambiata in { $language }
command-language-setError = Codice lingua non valido. Usa /language list per vedere le opzioni disponibili.

## Substitution results
substitution-result = Risultato: { $result }
substitution-noMatch = Nessuna corrispondenza trovata.
substitution-multipleResults = Applicate { $count } sostituzioni
substitution-performance = Eseguite { $count } sostituzioni in { $time }

## Tips
tip-optimization = Suggerimento: { $suggestion }
tip-useShorthand = Usa { $shorthand } invece di { $longform } (più corto)
tip-nonCapturing = Usa (?:...) per i gruppi che non referenzi
tip-greedy = Considera di usare .*? invece di .* (non avido)

## Regex Help
regexHelp-title = Aiuto Regex
regexHelp-selectCategory = Seleziona una categoria per imparare la sintassi regex:
regexHelp-back = Indietro
regexHelp-backToCategories = Torna alle Categorie

## Health & Metrics
health-title = Stato di Salute del Bot
health-healthy = SANO
health-degraded = DEGRADATO
health-unhealthy = NON SANO
health-workers = Worker: { $active } attivi, { $idle } inattivi
health-queue = Coda: { $pending } attività in sospeso
health-errorRate = Tasso di Errore: { $rate }%
health-uptime = Tempo di Attività: { $uptime }

metrics-title = Metriche di Prestazione
metrics-cacheHitRate = Tasso di Successo Cache: { $rate }%
metrics-avgProcessingTime = Tempo Medio di Elaborazione: { $time }ms
metrics-totalSubstitutions = Sostituzioni Totali: { $count }
metrics-regexCompilations = Compilazioni Regex: { $total } (in cache: { $cached })

## General
general-yes = Sì
general-no = No
general-cancel = Annulla
general-done = Fatto
general-loading = Caricamento...
general-error = Errore
