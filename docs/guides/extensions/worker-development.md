# Worker 扩展教程

Worker 通过 `ResearchClient.worker()` 使用版本化协议：claim、heartbeat、log、complete、fail 和 recover。Descriptor 声明执行器、容量、GPU 设备和 lease 时长。只领取容量可满足的 Job。

取得 lease 后应定期 heartbeat，并携带 job ID、attempt、worker ID 和 lease token 写日志或终结。旧 attempt 和错误 token 必须视为失效。Artifact 先写入内容地址存储，再用 SHA-256、大小、media type、URI 和 access level 完成 Job。

失败必须分类为 environment、data、scientific、budget、timeout、cancelled 或 worker_lost。不要把环境失败记录成负科研结果。confirmation mount 只能使用 lease 授予的只读路径，不能缓存或复制到日志。
