# Korean translations

## Errors
error-rateLimit = 속도 제한을 초과했습니다. { $seconds }초 기다려주세요.
error-invalidRegex = 잘못된 정규식 패턴입니다. 구문을 확인하고 다시 시도하세요.
error-telegramAPI = 문제가 발생했습니다. 다시 시도해주세요.
error-workerTimeout = 처리 오류. 더 간단한 패턴으로 다시 시도하세요.
error-circuitOpen = 서비스를 일시적으로 사용할 수 없습니다. 나중에 다시 시도해주세요.
error-noTarget = 최근 메시지에서 일치하는 대상을 찾을 수 없습니다.
error-targetIsCommand = 다른 sed 명령에서는 대체할 수 없습니다.
error-messageTooLong = 결과가 너무 깁니다 ({ $length }/{ $max }자).
error-chainTooLong = 체인의 명령이 너무 많습니다 (최대 { $max }).

## Commands
command-start = 안녕하세요! 저는 정규식 봇입니다. s/find/replace/flags를 사용하여 메시지의 텍스트를 대체하세요. 대체 텍스트는 여러 줄에 걸쳐 있거나 `\n`과 같은 이스케이프 시퀀스를 사용할 수 있습니다. 여러 명령을 한 줄에 하나씩 연결할 수도 있습니다.

    특수 플래그:
    - `p`: 실행 시간 표시
    캡처 그룹에는 `\N`을 사용하세요.

command-privacy = 이 봇은 정규식 대체를 수행하기 위한 짧은 메시지 기록을 제외하고는 사용자 데이터를 수집하거나 처리하지 않습니다. 이러한 데이터는 인메모리 SQL 데이터베이스에 48시간 동안 저장되며 봇 관리자가 어떤 방식으로도 액세스할 수 없습니다.

command-language-usage = 사용법:
    /language - 현재 언어 표시
    /language list - 사용 가능한 언어 표시
    /language set <코드> - 언어 변경

command-language-current = 현재 언어: { $language }
command-language-list = 사용 가능한 언어:

    { $languages }

    변경하려면 /language set <코드>를 사용하세요.
command-language-setSuccess = 언어를 { $language }(으)로 변경했습니다
command-language-setError = 잘못된 언어 코드입니다. 사용 가능한 옵션을 볼 수 있도록 /language list를 사용하세요.

## Substitution results
substitution-result = 결과: { $result }
substitution-noMatch = 일치하는 항목을 찾을 수 없습니다.
substitution-multipleResults = { $count }개의 대체 적용
substitution-performance = { $time }에 { $count }개의 대체 실행

## Tips
tip-optimization = 팁: { $suggestion }
tip-useShorthand = { $longform } 대신 { $shorthand } 사용 (더 짧음)
tip-nonCapturing = 참조하지 않는 그룹에는 (?:...) 사용
tip-greedy = .* 대신 .*? 고려 (비탐욕적)

## Regex Help
regexHelp-title = 정규식 도움말
regexHelp-selectCategory = 정규식 구문을 배울 카테고리를 선택하세요:
regexHelp-back = 뒤로
regexHelp-backToCategories = 카테고리로 돌아가기

## Health & Metrics
health-title = 봇 상태
health-healthy = 정상
health-degraded = 저하됨
health-unhealthy = 비정상
health-workers = 워커: { $active }개 활성, { $idle }개 유휴
health-queue = 대기열: { $pending }개 대기 중인 작업
health-errorRate = 오류율: { $rate }%
health-uptime = 가동 시간: { $uptime }

metrics-title = 성능 지표
metrics-cacheHitRate = 캐시 적중률: { $rate }%
metrics-avgProcessingTime = 평균 처리 시간: { $time }ms
metrics-totalSubstitutions = 총 대체 횟수: { $count }
metrics-regexCompilations = 정규식 컴파일 수: { $total } (캐시됨: { $cached })

## General
general-yes = 예
general-no = 아니오
general-cancel = 취소
general-done = 완료
general-loading = 로딩 중...
general-error = 오류
