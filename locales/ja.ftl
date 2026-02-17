# Japanese translations

## Errors
error-rateLimit = レート制限を超えました。{ $seconds }秒お待ちください。
error-invalidRegex = 無効な正規表現パターンです。構文を確認して再試行してください。
error-telegramAPI = 問題が発生しました。再試行してください。
error-workerTimeout = 処理エラー。よりシンプルなパターンで再試行してください。
error-circuitOpen = サービスが一時的に利用できません。後で再試行してください。
error-noTarget = 最近のメッセージに一致する対象が見つかりません。
error-targetIsCommand = 他のsedコマンドでは置換できません。
error-messageTooLong = 結果が長すぎます（{ $length }/{ $max }文字）。
error-chainTooLong = チェーン内のコマンドが多すぎます（最大{ $max }）。

## Commands
command-start = こんにちは！私は正規表現ボットです。s/find/replace/flagsを使用してメッセージ内のテキストを置換します。置換テキストは複数行にまたがることも、`\n`のようなエスケープシーケンスを使用することもできます。複数のコマンドを1行に1つずつ連鎖することもできます。

    特殊フラグ：
    - `p`: 実行時間を表示
    キャプチャグループには`\N`を使用してください。

command-privacy = このボットは、正規表現による置換を実行するための短いメッセージ履歴を除き、ユーザーデータを収集または処理しません。これらはインメモリSQLデータベースに48時間保存され、ボット管理者がいかなる方法でもアクセスすることはできません。

command-language-usage = 使用方法：
    /language - 現在の言語を表示
    /language list - 利用可能な言語を表示
    /language set <コード> - 言語を変更

command-language-current = 現在の言語：{ $language }
command-language-list = 利用可能な言語：

    { $languages }

    変更するには/language set <コード>を使用してください。
command-language-setSuccess = 言語を{ $language }に変更しました
command-language-setError = 無効な言語コードです。利用可能なオプションを表示するには/language listを使用してください。

## Substitution results
substitution-result = 結果：{ $result }
substitution-noMatch = 一致が見つかりません。
substitution-multipleResults = { $count }件の置換を適用
substitution-performance = { $time }で{ $count }件の置換を実行

## Tips
tip-optimization = ヒント：{ $suggestion }
tip-useShorthand = { $longform }の代わりに{ $shorthand }を使用（短い）
tip-nonCapturing = 参照しないグループには(?:...)を使用
tip-greedy = .*の代わりに.*?を検討（非貪欲）

## Regex Help
regexHelp-title = 正規表現ヘルプ
regexHelp-selectCategory = 正規表現の構文を学ぶカテゴリを選択：
regexHelp-back = 戻る
regexHelp-backToCategories = カテゴリに戻る

## Health & Metrics
health-title = ボットの健全性
health-healthy = 健全
health-degraded = 低下
health-unhealthy = 不健全
health-workers = ワーカー：{ $active }アクティブ、{ $idle }アイドル
health-queue = キュー：{ $pending }件の保留中タスク
health-errorRate = エラー率：{ $rate }％
health-uptime = 稼働時間：{ $uptime }

metrics-title = パフォーマンス指標
metrics-cacheHitRate = キャッシュヒット率：{ $rate }％
metrics-avgProcessingTime = 平均処理時間：{ $time }ms
metrics-totalSubstitutions = 総置換数：{ $count }
metrics-regexCompilations = 正規表現コンパイル数：{ $total }（キャッシュ済み：{ $cached }）

## General
general-yes = はい
general-no = いいえ
general-cancel = キャンセル
general-done = 完了
general-loading = 読み込み中...
general-error = エラー
