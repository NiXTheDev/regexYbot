# Polish translations

## Errors
error-rateLimit = Przekroczono limit szybkości. Poczekaj { $seconds } sekund.
error-invalidRegex = Nieprawidłowy wzorzec regex. Sprawdź składnię i spróbuj ponownie.
error-telegramAPI = Coś poszło nie tak. Spróbuj ponownie.
error-workerTimeout = Błąd przetwarzania. Spróbuj ponownie z prostszym wzorcem.
error-circuitOpen = Usługa tymczasowo niedostępna. Spróbuj ponownie później.
error-noTarget = Nie znaleziono pasującego celu w ostatnich wiadomościach.
error-targetIsCommand = Nie można podstawiać na innym poleceniu sed.
error-messageTooLong = Wynik jest zbyt długi ({ $length }/{ $max } znaków).
error-chainTooLong = Zbyt wiele poleceń w łańcuchu (max { $max }).

## Commands
command-start = Cześć! Jestem botem regex. Użyj s/find/replace/flags, aby zamienić tekst w wiadomościach. Tekst zastępczy może obejmować wiele linii lub używać sekwencji ucieczki jak `\n`. Możesz też łączyć wiele poleceń, jedno na linię.

    Specjalne flagi:
    - `p`: Pokaż czas wykonania
    Użyj `\N` dla przechwyconych grup.

command-privacy = Ten bot nie zbiera ani nie przetwarza danych użytkowników, poza krótkim historią wiadomości do wykonywania podstawień regex. Są one przechowywane w pamięciowej bazie danych SQL przez 48 godzin i nie mogą być w żaden sposób dostępne dla administratora bota.

privacy-delete-button = Usuń moje zapisane dane
privacy-delete-confirmation = Spowoduje to natychmiastowe usunięcie wszystkich zapisanych wiadomości i odpowiedzi bota z tego czatu. Tej operacji nie można cofnąć.
privacy-delete-apply = Tak, usuń wszystko
privacy-delete-done = Wszystkie zapisane dane tego czatu zostały usunięte.
privacy-private-only = Ta akcja jest dostępna tylko na czatach prywatnych.

command-language-usage = Użycie:
    /language - Pokaż aktualny język
    /language list - Pokaż dostępne języki
    /language set <kod> - Zmień język

command-language-current = Twój aktualny język to: { $language }
command-language-list = Dostępne języki:

    { $languages }

    Użyj /language set <kod> aby zmienić.
command-language-setSuccess = Zmieniono język na { $language }
command-language-setError = Nieprawidłowy kod języka. Użyj /language list, aby zobaczyć dostępne opcje.

## Substitution results
substitution-result = Wynik: { $result }
substitution-noMatch = Nie znaleziono dopasowania.
substitution-multipleResults = Zastosowano { $count } podstawień
substitution-performance = Podstawienia: { $count } w { $time }

## Tips
tip-optimization = Wskazówka: { $suggestion }
tip-useShorthand = Użyj { $shorthand } zamiast { $longform } (krótsze)
tip-nonCapturing = Użyj (?:...) dla grup, których nie referencjesz
tip-greedy = Rozważ użycie .*? zamiast .* (niechciwe)

## Regex Help
regexHelp-title = Pomoc Regex
regexHelp-selectCategory = Wybierz kategorię, aby nauczyć się składni regex:
regexHelp-back = Wstecz
regexHelp-backToCategories = Powrót do Kategorii

## Health & Metrics
health-title = Stan Zdrowia Bota
health-healthy = ZDROWY
health-degraded = DEGRADOWANY
health-unhealthy = NIEZDROWY
health-workers = Workerów: { $active } aktywnych, { $idle } bezczynnych
health-queue = Kolejka: { $pending } oczekujących zadań
health-errorRate = Wskaźnik Błędów: { $rate }%
health-uptime = Czas Działania: { $uptime }

metrics-title = Metryki Wydajności
metrics-cacheHitRate = Cache: { $cached }/{ $max } ({ $rate }% trafień, { $misses } pomyłek)
metrics-avgProcessingTime = Średni Czas Oczekiwania: { $time }ms
metrics-maxQueueWait = Maksymalny Czas Oczekiwania: { $time }ms
metrics-totalSubstitutions = Całkowita Liczba Podstawień: { $count }
metrics-regexCompilations = Kompilacje Regex: { $total } (w cache: { $cached })

## General
general-yes = Tak
general-no = Nie
general-cancel = Anuluj
general-done = Gotowe
general-loading = Ładowanie...
general-error = Błąd
