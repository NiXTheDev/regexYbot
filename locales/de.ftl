# German translations

## Errors
error-rateLimit = Rate-Limit überschritten. Bitte warte { $seconds } Sekunden.
error-invalidRegex = Ungültiges Regex-Muster. Überprüfe deine Syntax und versuche es erneut.
error-telegramAPI = Etwas ist schiefgelaufen. Bitte versuche es erneut.
error-workerTimeout = Verarbeitungsfehler. Bitte versuche es mit einem einfacheren Muster erneut.
error-circuitOpen = Dienst vorübergehend nicht verfügbar. Bitte versuche es später erneut.
error-noTarget = Kein passendes Ziel in den letzten Nachrichten gefunden.
error-targetIsCommand = Kann nicht auf einen anderen sed-Befehl zugreifen.
error-messageTooLong = Ergebnis ist zu lang ({ $length }/{ $max } Zeichen).
error-chainTooLong = Zu viele Befehle in der Kette (max { $max }).

## Commands
command-start = Hallo! Ich bin ein Regex-Bot. Verwende s/find/replace/flags, um Text in Nachrichten zu ersetzen. Der Ersatztext kann mehrere Zeilen umfassen oder Escape-Sequenzen wie `\n` verwenden. Du kannst auch mehrere Befehle verketten, einer pro Zeile.

    Spezielle Flags:
    - `p`: Zeige Ausführungszeit an
    Verwende `\N` für erfasste Gruppen.

command-privacy = Dieser Bot sammelt oder verarbeitet keine Benutzerdaten, außer einem kurzen Nachrichtenverlauf, um Regex-Ersetzungen durchzuführen. Diese werden für 48 Stunden in einer In-Memory-SQL-Datenbank gespeichert und können vom Administrator des Bots in keiner Weise abgerufen werden.

command-language-usage = Verwendung:
    /language - Zeige aktuelle Sprache
    /language list - Zeige verfügbare Sprachen
    /language set <code> - Sprache ändern

command-language-current = Deine aktuelle Sprache ist: { $language }
command-language-list = Verfügbare Sprachen:

    { $languages }

    Verwende /language set <code> zum Ändern.
command-language-setSuccess = Sprache geändert zu { $language }
command-language-setError = Ungültiger Sprachcode. Verwende /language list, um die verfügbaren Optionen zu sehen.

## Substitution results
substitution-result = Ergebnis: { $result }
substitution-noMatch = Keine Übereinstimmung gefunden.
substitution-multipleResults = { $count } Ersetzungen angewendet
substitution-performance = { $count } Ersetzungen in { $time } ausgeführt

## Tips
tip-optimization = Tipp: { $suggestion }
tip-useShorthand = Verwende { $shorthand } statt { $longform } (kürzer)
tip-nonCapturing = Verwende (?:...) für Gruppen, die du nicht referenzierst
tip-greedy = Erwäge .*? statt .* zu verwenden (nicht-gierig)

## Regex Help
regexHelp-title = Regex-Hilfe
regexHelp-selectCategory = Wähle eine Kategorie, um Regex-Syntax zu lernen:
regexHelp-back = Zurück
regexHelp-backToCategories = Zurück zu Kategorien

## Health & Metrics
health-title = Bot-Gesundheitsstatus
health-healthy = GESUND
health-degraded = BEEINTRÄCHTIGT
health-unhealthy = NICHT GESUND
health-workers = Worker: { $active } aktiv, { $idle } inaktiv
health-queue = Warteschlange: { $pending } ausstehende Aufgaben
health-errorRate = Fehlerrate: { $rate }%
health-uptime = Betriebszeit: { $uptime }

metrics-title = Leistungsmetriken
metrics-cacheHitRate = Cache-Trefferrate: { $rate }%
metrics-avgProcessingTime = Durchschnittliche Verarbeitungszeit: { $time }ms
metrics-totalSubstitutions = Gesamtzahl der Ersetzungen: { $count }
metrics-regexCompilations = Regex-Kompilierungen: { $total } (zwischengespeichert: { $cached })

## General
general-yes = Ja
general-no = Nein
general-cancel = Abbrechen
general-done = Fertig
general-loading = Laden...
general-error = Fehler
