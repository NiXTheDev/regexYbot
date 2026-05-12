# Chinese (Simplified) translations

## Errors
error-rateLimit = 超出速率限制。请等待 { $seconds } 秒。
error-invalidRegex = 无效的正则表达式模式。请检查语法并重试。
error-telegramAPI = 出了点问题。请重试。
error-workerTimeout = 处理错误。请使用更简单的模式重试。
error-circuitOpen = 服务暂时不可用。请稍后重试。
error-noTarget = 在最近的消息中找不到匹配的目标。
error-targetIsCommand = 无法在其他 sed 命令上替换。
error-messageTooLong = 结果太长（{ $length }/{ $max } 个字符）。
error-chainTooLong = 链中的命令太多（最多 { $max } 个）。

## Commands
command-start = 你好！我是一个正则表达式机器人。使用 s/find/replace/flags 来替换消息中的文本。替换文本可以跨多行，或使用转义序列如 `\n`。您还可以将多个命令链接在一起，每行一个。

    特殊标志：
    - `p`: 显示执行时间
    使用 `\N` 表示捕获组。

command-privacy = 除了用于执行正则表达式替换的短消息历史记录外，此机器人不会收集或处理任何用户数据。这些数据在内存中的 SQL 数据库中存储 48 小时，机器人管理员无法以任何方式访问。

command-language-usage = 使用方法：
    /language - 显示当前语言
    /language list - 显示可用语言
    /language set <代码> - 更改语言

command-language-current = 您当前的语言是：{ $language }
command-language-list = 可用语言：

    { $languages }

    使用 /language set <代码> 进行更改。
command-language-setSuccess = 语言已更改为 { $language }
command-language-setError = 无效的语言代码。使用 /language list 查看可用选项。

## Substitution results
substitution-result = 结果：{ $result }
substitution-noMatch = 未找到匹配。
substitution-multipleResults = 应用了 { $count } 次替换
substitution-performance = 在 { $time } 内执行了 { $count } 次替换

## Tips
tip-optimization = 提示：{ $suggestion }
tip-useShorthand = 使用 { $shorthand } 代替 { $longform }（更短）
tip-nonCapturing = 对不引用的组使用 (?:...)
tip-greedy = 考虑使用 .*? 代替 .*（非贪婪）

## Regex Help
regexHelp-title = 正则表达式帮助
regexHelp-selectCategory = 选择一个类别来学习正则表达式语法：
regexHelp-back = 返回
regexHelp-backToCategories = 返回类别

## Health & Metrics
health-title = 机器人健康状态
health-healthy = 健康
health-degraded = 降级
health-unhealthy = 不健康
health-workers = 工作进程：{ $active } 个活跃，{ $idle } 个空闲
health-queue = 队列：{ $pending } 个待处理任务
health-errorRate = 错误率：{ $rate }%
health-uptime = 运行时间：{ $uptime }

metrics-title = 性能指标
metrics-cacheHitRate = 缓存命中率：{ $rate }%
metrics-avgProcessingTime = 平均处理时间：{ $time }ms
metrics-totalSubstitutions = 总替换次数：{ $count }
metrics-regexCompilations = 正则表达式编译次数：{ $total }（已缓存：{ $cached }）

## General
general-yes = 是
general-no = 否
general-cancel = 取消
general-done = 完成
general-loading = 加载中...
general-error = 错误
