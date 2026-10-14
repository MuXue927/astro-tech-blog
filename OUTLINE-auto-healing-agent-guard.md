# 文章大纲与证据时间线（待确认，正文未写）

> 素材范围：`C:\Users\whxnt\.agent-vision\logs\` 全部 7 个文件 + `guard_service.py` + 本次会话的实测命令输出。
> 目标成稿：`src\content\posts\auto-healing-agent-guard.md`

---

## 一、日志素材清点（全部已读）

| 文件 | 体量 | 性质 | 可引用价值 |
|---|---|---|---|
| `watchdog.log` | 509 行 | 旧版 watchdog 循环日志 | **471 条 `already_running` 假死装活铁证**；其中 pid=6772 占 205 条 |
| `proxy.log` | 3494 行 | 代理 HTTP 访问日志（带时间戳） | 30 次代理启动记录、3438 次 POST、状态码分布、`vision batch failed` 23 条 |
| `runtime.log` | 3672 行 | 代理进程 stdout（无时间戳） | 29 次启动横幅、7 个 `ConnectionAbortedError` traceback（行 26/1243/1281/1914/3214/3344/3383） |
| `guard-service.log` | 13 行 | **新守护进程关键日志** | 7.4 秒恢复全过程（23:26:03 → 23:26:07）、幂等退出记录 |
| `guard.log` | 37 行 | 第一轮方案（每分钟计划任务）残留 | 每分钟两条日志 = **弹窗双份**的硬证据 |
| `guard-stdout.log` | 1 行 | 手动重定向启动的代理横幅 | 23:04:49 那次人工拉起 |
| `guard-stderr.log` | 0 字节 | 标准错误为空 | 佐证守护自身无异常输出 |

## 二、证据时间线（2026-10-14，全部来自日志原文）

```log
21:55:40  CC Switch 最后一次成功转发（cc-switch.db proxy_request_logs 末条）
22:05:36  watchdog starting: check every 10s for 127.0.0.1:19100
22:05:39  watchdog start attempt: status=started pid=6772 ready=True
          proxy.log: vision bridge proxy listening on 127.0.0.1:19100
          ↑ 这是当天的真实代理进程；此后 proxy.log 再无任何请求行
22:23:12  watchdog start attempt: status=already_running pid=6772 ready=True   ← 假死开始
   ...    （每 12 秒一条，共 205 条，全部 ready=True）
23:02:10  实测 tasklist：PID 6772 不存在；19100 主动拒绝连接
23:04:04  watchdog start attempt: status=already_running pid=6772 ready=True   ← 假死最后一条
23:04:49  人工拉起代理（guard-stdout.log 记录该次启动横幅）
23:05:36  watchdog starting（被 Harness 结束旧进程后重启）
23:05:52  guard.log: unhealthy: port dead; state pid=6772 alive=False listener=None
23:05:52  guard.log: restarted proxy pid=15780 ready=True
23:26:03  guard-service.log: [warn] vision 19100 down; state pid=15780 listener=None
23:26:04  guard-service.log: [info] vision proxy restarted pid=1584 ready=True
23:26:06  guard-service.log: [warn] cc-switch 15721 down; launching app
23:26:07  guard-service.log: [info] cc-switch launched ready=True
          ↑ 两段代理同时故障 → 7.4 秒内无窗口自愈
```

**代理存活时长分布（由 `proxy.log` 的 30 次启动横幅算出）——直接支撑"崩溃时机随机"**

| 存活时长 | 出现次数 | 代表区间 |
|---|---|---|
| < 2 分钟 | 5 次 | 08-29 22:58:20 → 22:58:45 |
| 数分钟 ~ 数小时 | 9 次 | 09-18 17:34:16 → 17:45:12 |
| 1 ~ 3.5 天 | 8 次 | 10-03 22:02:37 → 10-05 06:21:59 |
| 12 ~ 16.4 天 | 3 次 | 09-02 08:20:13 → 09-18 17:34:16 |
| 随机长尾 | — | 完全无规律，说明"什么时候死"不可预测 |

## 三、需要你确认的一处事实（会影响正文措辞）

1. **Codex 报错文案**：`Reconnecting... waiting for network`、`1/5 → 5/5`、`stream disconnected before completion` 这三个字符串我在 7 个日志里**都找不到**（它们属于 Codex 客户端 UI，不落在这里的日志里）。我会按"你的目击描述"来写，并在文中注明"日志侧的证据是请求行彻底消失"。请确认可以这样处理。
2. **时间点**：CC Switch 停在 `21:55:40`，agent-vision 死在 `22:05:39`（相差约 10 分钟）。文中我会写成"半小时内两段代理先后/近乎同时阵亡"，而不是"同一秒同时挂"。请确认。
3. **弹窗频率**：`guard.log` 显示每分钟出现**两条**记录（如 `23:12:01` 与 `23:12:01` 成对），说明当时有**两个**残留计划任务在跑 → 每分钟闪两次。文章会按"每分钟、有时成对出现"来写。

## 四、文章大纲（确认后即写正文）

### 1. 引言：那个黑色夜晚
- Codex 每轮对话卡在 `Reconnecting... waiting for network`，`1/5` 重试到 `5/5`，最后 `stream disconnected before completion`，然后无限重连——**它连"报错"都完不成**。
- 最折磨人的不是崩，是**随机崩**：有时能跑两周（`09-02 → 09-18`，16.4 天），有时两分钟就死（`08-29 22:58:20 → 22:58:45`）。你永远不知道它什么时候死。
- 我（Harness）在 Codex 完全不可用的状态下接手，只能靠日志和代码定位。

### 2. 第一步排查：谁杀死了 Codex？
- **两跳链路**：`Codex → 127.0.0.1:15721 (CC Switch) → 127.0.0.1:19100 (agent-vision) → api.deepseek.com`。
- **凶手一：watchdog 的"台账式健康检查"**。`RuntimeManager.start()` 只要 `runtime.json` 里的 pid 被判"存活"，就直接 `return already_running`；`watchdog_tick()` 又把它当成功。于是**只要台账残留一个死 pid，watchdog 就永远认为一切正常**。铁证：`watchdog.log` 里 `22:23:12 → 23:04:04` 连续 **205 条** `already_running pid=6772 ready=True`，而实测 `tasklist /FI "PID eq 6772"` 返回"没有运行的任务"、19100 主动拒绝连接。
- **凶手二：CC Switch 静默退出**。`.codex/config.toml` 的 `base_url = "http://127.0.0.1:15721/v1"`，但它 `launchOnStartup = false`、不在任何启动项里，一退出就没人拉它。
- **结论**：两段代理在半小时内先后阵亡，Codex 每轮对话直接连不上 15721。

### 3. 第二步破局：从"每分钟闪黑框"到"零窗口静默守护"
- **第一轮方案（能用但有副作用）**：`schtasks /sc minute` 每分钟拉起 `powershell.exe` 体检 15721/19100。救活了 Codex，但**任何"每分钟创建一个控制台进程"的方案都会闪窗**——控制台窗口在进程创建瞬间就出现，`-WindowStyle Hidden` 只能事后隐藏。副作用证据：`guard.log` 里每分钟两条 `ok: 19100 listening`（两个残留任务在跑），也就是**每分钟闪两次**，开发时被持续打断。
- **第二轮方案（最终版 `guard_service.py`）**：
  - 用 `pythonw.exe`：GUI 子系统程序，**本身没有控制台**，从根上没有窗口可闪；
  - `WINDOWLESS_FLAGS = CREATE_NO_WINDOW(0x08000000) | DETACHED_PROCESS(0x00000008)`：前者禁止为新进程分配控制台，后者让它脱离父进程控制台并在父进程退出后存活；再叠加 `NEW_PROCESS_GROUP(0x00000200)` 让子进程不受 Ctrl+C 影响；
  - 健康路径**只做一次非阻塞 TCP 连接**（`socket.create_connection`，1.5s 超时），**不启动任何辅助进程**；`tasklist`/`netstat`/`taskkill` 只在端口真的挂掉后才用；
  - **幂等**：`already_running()` 读 pid 文件 + `pid_is_alive()`，第二个实例直接退出（日志实证：`23:22:21`、`23:23:51` 两条 `another guard service is already running; exiting`）；
  - 启动方式：启动文件夹 `agent-vision-guard-service.vbs`，`WScript.Shell.Run ..., 0` 窗口样式 0 = 完全不显示窗口（`schtasks /sc onlogon` 需要管理员权限，被系统拒绝，这条路径等价且无 UAC）。
  - 附对比表：第一轮 vs 第二轮（触发方式 / 是否创建进程 / 窗口 / 每分钟闪窗次数 / CPU / 恢复时延）。

### 4. 第三步验证：7.4 秒真机实验
- 直接引用 `guard-service.log` 原文（```log 代码块），展示两段同时被杀后的自愈全过程；说明"我是在用户正在用 Codex 的情况下做的破坏性验证，7.4 秒里没有窗口、没有弹窗"。

### 5. 总结与思考
- **主力 AI 瘫痪时，具备本地系统级排障能力的本地 Agent 不可替代**：Codex 自己没有能力读 `watchdog.log` 的 471 条假日志、读 `runtime.py` 的判定逻辑、改启动项——它那时连一轮对话都发不出去。
- **两轮迭代的价值**：第一轮解决"能不能用"，第二轮解决"好不好用"。真正的工程精神不是一次做到完美，而是**持续迭代到无感**。
- 可复用清单：把"端口级健康检查"作为中间件的兜底原则；永远不要让健康检查依赖**台账文件**而非**真实端口**。

## 五、格式化计划
- YAML frontmatter（`title` / `date: "2026-10-15"` / `tags` / `description`）；`z.coerce.date()` 会把带引号的日期正常解析，无需改格式。
- 代码块语言标识：`python` / `powershell` / `vbs` / `log`。
- 核心代码片段加中文注释，重点解释 `WINDOWLESS_FLAGS` 位运算与幂等判定。
- 关键结论加粗；第一轮 vs 第二轮用表格对比。
