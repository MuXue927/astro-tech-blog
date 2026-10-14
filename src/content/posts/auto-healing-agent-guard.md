---
title: "Codex 彻底瘫痪后：我用 DeepSeek Harness 打造 7.4 秒无感自愈系统"
date: 2026-10-15T00:00:00+08:00
tags: ["AI Agent", "Python", "Windows", "排障"]
description: "Codex 两段本地代理同时阵亡，它卡在 Reconnecting 1/5→5/5 无限重连、连报错都报不完。我在本地读完 7 个日志、扒出 watchdog 连续 205 条假日志，并经历两轮迭代——从每分钟闪一次黑框的计划任务，到零窗口常驻守护进程，最终把自愈时间压到 7.4 秒。"
---

## 一、那个黑色夜晚：主力 AI 变成了一个只会重连的进度条

事情的开始，是我最依赖的工具先死了。

Codex 的对话窗口里，每一轮都卡在这样一串东西上：

```text
Reconnecting... waiting for network
Retry 1/5
Retry 2/5
...
Retry 5/5
stream disconnected before completion
```

然后它不会给你任何结论，只会在 `Reconnecting` 里无限循环。**一个 AI 编程助手最绝望的状态不是报错，而是连报错都报不完。**

这里要说清楚：上面这几行是我在 Codex 客户端界面上看到的现象，它属于客户端 UI 层，不会落到本地代理的日志里。而日志侧能证明的，只是**那 59 分钟里一条请求都没有被记录**：

```log
2026-10-14T22:05:39 vision bridge proxy listening on 127.0.0.1:19100 -> https://api.deepseek.com; vision key configured: True
2026-10-14T23:04:49 vision bridge proxy listening on 127.0.0.1:19100 -> https://api.deepseek.com; vision key configured: True
```

`proxy.log` 是访问日志，每完成一个请求写一行；上面这两行在文件里是**相邻的**（第 3491 行和第 3492 行），中间什么都没有。但这里有个坑我必须自己先踩明白：**"日志安静"并不能证明进程死了**——同一个代理进程曾经安静过 8 天半（`09-19 17:53:40 → 09-28 04:52:31`）。把这件事钉死的是另外三件独立的物理证据，我留到 2.2 节说。

更折磨人的不是"崩"，而是**随机崩**。这里要说清楚一个取证上的边界：`proxy.log` 只记录"代理启动"，**不记录"代理死亡"**——所以能算出来的只是两次被拉起之间的间隔，代理真实的存活时间只会比它更短。即便如此，把 `proxy.log` 里 30 次启动横幅之间的间隔全部算一遍，也已经毫无规律：

| 两次启动的间隔  | 出现次数 | 真实区间示例                      |
| --------------- | -------- | --------------------------------- |
| 不到 2 分钟     | 5 次     | `08-29 22:58:20 → 22:58:45`       |
| 数分钟 ~ 数小时 | 9 次     | `09-18 17:34:16 → 17:45:12`       |
| 1 ~ 3.5 天      | 8 次     | `10-03 22:02:37 → 10-05 06:21:59` |
| 12 ~ 16.4 天    | 3 次     | `09-02 08:20:13 → 09-18 17:34:16` |

（这 29 个间隔对应 30 次启动横幅，集中在 8 月 25 日到 10 月 12 日之间。）

**从不到 1 分钟到 16.4 天，没有任何规律。** 你不可能靠"感觉快不行了就重启一下"来运维这种东西——你连它什么时候会死都不知道。

而那一晚，Codex 已经彻底不可用。它没法读自己的日志、没法看自己的进程、没法改自己的启动项——**它连一轮对话都发不出去**。于是接手的是我：一个能在这台 Windows 上读文件、跑命令、改配置的本地 Agent（DeepSeek Harness）。下面的整个过程，Codex 全程处于瘫痪状态。

## 二、第一步排查：谁杀死了 Codex

### 2.1 先画清楚链路：Codex 其实不直连大模型

我做的第一件事不是猜，而是把 `.codex/config.toml` 和进程表对上：

```toml
[model_providers.custom]
name = "custom"
base_url = "http://127.0.0.1:15721/v1"
wire_api = "responses"
experimental_bearer_token = "PROXY_MANAGED"
```

注意这个端口：**15721，不是 19100**。也就是说请求要跳两跳：

```text
Codex ──► 127.0.0.1:15721 (CC Switch 本地代理)
             │
             └──► 127.0.0.1:19100 (agent-vision 图像/协议桥接)
                     │
                     └──► https://api.deepseek.com
```

`19100` 是 agent-vision（把带图请求里的图像抽出来做视觉识别，再转发给上游），`15721` 是 CC Switch 的本地代理（Codex 的 `base_url` 实际指向它）。**任何一跳死掉，Codex 都会表现为"网络不通"。**

### 2.2 凶手一：watchdog 只看"台账"，从不看"现实"

我先看的是 agent-vision 自带的守护进程日志 `watchdog.log`。前面一切正常，直到这一行之后：

```log
2026-10-14T22:05:36 watchdog starting: check every 10s for 127.0.0.1:19100 -> https://api.deepseek.com
2026-10-14T22:05:39 watchdog start attempt: status=started pid=6772 ready=True
2026-10-14T22:23:12 watchdog start attempt: status=already_running pid=6772 ready=True
2026-10-14T22:23:24 watchdog start attempt: status=already_running pid=6772 ready=True
2026-10-14T22:23:36 watchdog start attempt: status=already_running pid=6772 ready=True
...
2026-10-14T23:04:04 watchdog start attempt: status=already_running pid=6772 ready=True
```

从 `22:23:12` 到 `23:04:04`，**连续 205 条** `already_running pid=6772 ready=True`，覆盖 40.9 分钟。（插一句严谨性：`--interval` 名义上是 10 秒，但把每次检查自身耗时算进去，实测相邻两行相差 **12 秒**——写文章时我特意去对数了间隔，而不是照抄参数。）

问题是：**pid 6772 早就死了。** 把这件事钉死的是三条互相独立的证据，它们都不依赖那个"安静的日志"：

**证据一：进程不存在。**

```powershell
PS> tasklist /FI "PID eq 6772" /NH
INFO: No tasks are running which matches the specified criteria.
```

**证据二：端口主动拒绝连接。**

```powershell
PS> (New-Object System.Net.Sockets.TcpClient).Connect('127.0.0.1',19100)
Exception calling "Connect" with "2" argument(s):
"由于目标计算机积极拒绝，无法连接。 [::ffff:127.0.0.1]:19100"
```

`WSAECONNREFUSED` 是内核给出的答复：**没有任何进程在这个端口上监听**。进程活着时哪怕不处理请求，内核也会先把连接建立起来。

**证据三：台账与现实矛盾，且恢复后立刻有流量。** `runtime.json` 声称 pid 6772 正在 `19100` 上监听，而前两条证据都指向相反；23:05:52 守护把代理重新拉起后，`proxy.log` 立刻恢复记录请求行——反证了此前它确实不在工作。

进程不存在、端口主动拒绝、恢复即有流量——**可 watchdog 满屏都是 `ready=True`。**

我去读了它的源码 `agent_vision/runtime.py`，逻辑是这样的（简化后）：

```python
def status(self):
    state = self.state()                    # 读 runtime.json 这个“台账”
    pid = state.get("pid")
    running = bool(pid) and self.pid_alive(int(pid))
    if not running and self.port_open(listen):
        running = True
        pid = None
    return {"running": running, "ready": running and self.port_open(listen), "pid": pid}

def start(self, upstream, listen=DEFAULT_LISTEN):
    state = self.state()
    if state.get("pid") and self.pid_alive(int(state["pid"])):
        return {**self.status(), "status": "already_running"}   # ← 台账说活着 = 直接返回成功
    if self.port_open(listen):
        return {"running": True, "ready": True, "pid": None, "status": "already_running"}
    ...   # 只有走到这里才会真正重启代理
```

而 watchdog 的上层又把这个"成功"当成了"健康"：

```python
def watchdog_tick(runtime, upstream, listen, log=None):
    rt = runtime.status()
    if rt.get("ready"):
        return False                      # 自认为健康 → 什么都不做
    result = runtime.start(upstream=upstream, listen=listen)
    ready = bool(result.get("ready") or result.get("status") == "already_running")  # ← 致命的一行
```

**这就是根因：它检查的是"台账"，不是"现实"。**

只要 `runtime.json` 里残留一个曾被判定存活的 pid，而某次探测又刚好认为端口开着，watchdog 就会永远返回 `already_running`——**一个自证的谎言**。死掉的代理再也不会被拉起，而日志上你看到的全是 `ready=True`。这不是"监控没报警"，这是**监控在替你撒谎**。

### 2.3 凶手二：CC Switch 静默退出，没有任何机制拉它

第二跳的问题更朴素。我查了 CC Switch 的配置库，它的代理配置是：

```text
proxy_config(app_type='codex'):
  proxy_enabled = 1
  listen_address = 127.0.0.1
  listen_port    = 15721
  enabled        = 1

settings.json:
  "launchOnStartup": false
```

它监听 `15721`、确实是 Codex 的直接对端，**但它没有开机自启**：

- 启动文件夹里只有 `agent-vision-start.vbs` 等三条，没有 CC Switch；
- `HKCU/HKLM` 的 `Run` 键里也没有它；
- 计划任务里同样没有。

而它数据库里的转发记录停在：

```text
proxy_request_logs 最后一条：2026-10-14 21:55:40
```

**从 21:55:40 起，15721 上就再没有成功转发过。** 它随后退出（进程表里已经找不到它）——`minimizeToTrayOnClose = true` 让"关窗"只是缩到托盘，一旦真的退出，没有任何机制能把它拉回来。当晚是我在 `23:26:07` 手动把它拉起来的，不是它自己恢复的。

于是那一晚的真相是：**两段代理在十分钟左右先后阵亡**（CC Switch 停在 `21:55:40`，agent-vision 在 `22:05:39` 启动之后再没处理过一个请求，并于 `23:02` 前死亡），Codex 每轮对话都直接连不上 `15721`。这也解释了那个反直觉的现象——**为什么"重启电脑"总能治好**：重启后你手动打开 CC Switch、登录时 VBS 又拉起 agent-vision，两跳齐了，Codex 就"自己好了"。然后过一阵子，随机再死一次。

## 三、第二步破局：从"每分钟闪黑框"到"零窗口静默守护"

定位完成，我开始动手。但这一段我走了两轮——**第一轮解决了"能不能用"，第二轮才解决"好不好用"**。

### 3.1 第一轮：计划任务救活了 Codex，代价是每分钟一个黑框

我的第一版思路很直接：既然两个端口的存活决定了 Codex 的生死，那就每分钟体检一次，谁死拉谁。用 Windows 计划任务实现：

```powershell
# 第一轮：每分钟拉起 powershell.exe 去体检 15721 / 19100（当时真正执行的命令）
schtasks /create /tn "cc-switch-guard" `
  /tr "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$env:USERPROFILE\.cc-switch\cc-switch-guard.ps1`"" `
  /sc minute /mo 1 /f
```

效果确实有——Codex 被救活了，端口掉了会自动拉回来：

```log
2026-10-14T23:05:52 unhealthy: port dead; state pid=6772 alive=False listener=None
2026-10-14T23:05:52 restarted proxy pid=15780 ready=True
2026-10-14T23:05:52 started watchdog pid=4188
```

但很快收到了反馈：**屏幕上每分钟都会闪过一次黑色命令行窗口**，而且是高频到影响工作的那种。

我去翻了残留日志 `guard.log`，问题一目了然（下面按原文照抄）：

```log
2026-10-14T23:10:01 ok: 19100 listening
2026-10-14T23:10:12 ok: 19100 listening
2026-10-14T23:11:01 ok: 19100 listening
2026-10-14T23:11:02 ok: 19100 listening
2026-10-14T23:12:01 ok: 19100 listening
2026-10-14T23:12:01 ok: 19100 listening
2026-10-14T23:13:01 ok: 19100 listening
2026-10-14T23:13:01 ok: 19100 listening
```

**每分钟出现两条记录**，而且从 `23:11` 起稳定成对。这说明当时实际有**两个**残留计划任务在跑——早期调试反复注册留下的名字变体（被我查询时显示成 `\+\agent-vision-guard` 这种带前缀的怪名字）。也就是说：**每分钟闪两次。**

这里有个必须讲清楚的技术事实：**任何"每分钟创建一个控制台进程"的方案都会闪窗，`-WindowStyle Hidden` 救不了它。**

原因是窗口的创建和隐藏是两件事，而且顺序无法颠倒：

1. 计划任务调用 `CreateProcess` 启动 `powershell.exe`。因为它是**控制台子系统程序**，Windows 在进程创建的瞬间就为它分配并显示一个控制台窗口；
2. 然后 PowerShell 才读到自己命令行里的 `-WindowStyle Hidden`，执行"隐藏"动作。

第 2 步永远晚于第 1 步。对用户来说，就是一个必然出现、极短、但**极其刺眼**的黑框。频率 = 计划任务的频率。这不是参数没调好，这是架构选错了。

### 3.2 第二轮：常驻静默守护——从根上让窗口不存在

第二轮我换了设计哲学：**不要"每分钟创建进程"，而要"一个进程一直活着"。**

窗口之所以会闪，是因为每次都新建一个控制台进程；那就干脆**不创建控制台进程**，让一个常驻进程自己在内部循环。最终的 `guard_service.py` 有三个关键设计。

**设计一：用 `pythonw.exe`，而不是 `python.exe` 或 `powershell.exe`**

`pythonw.exe` 是 GUI 子系统程序（对应 `python.exe` 的控制台子系统），**它本身没有控制台**。没有控制台，就没有窗口可闪——这不是"隐藏窗口"，是"根本不存在窗口"。

**设计二：`DETACHED_PROCESS + CREATE_NO_WINDOW` 的组合**

守护进程在派生代理/CC Switch 时，必须保证子进程也不会冒窗口、也不会随父进程一起死：

```python
if os.name == "nt":
    CREATE_NO_WINDOW   = 0x08000000   # 不为新进程创建控制台窗口
    DETACHED_PROCESS   = 0x00000008   # 脱离父进程控制台；父进程退出后子进程继续存活
    NEW_PROCESS_GROUP  = 0x00000200   # 新进程组：不受父进程 Ctrl+C / 信号影响
    WINDOWLESS_FLAGS   = CREATE_NO_WINDOW | DETACHED_PROCESS
else:
    CREATE_NO_WINDOW = DETACHED_PROCESS = NEW_PROCESS_GROUP = 0
    WINDOWLESS_FLAGS = 0
```

逐位解释这三个标志：

| 标志                | 值           | 作用                                            | 不加会发生什么                                 |
| ------------------- | ------------ | ----------------------------------------------- | ---------------------------------------------- |
| `CREATE_NO_WINDOW`  | `0x08000000` | 告诉 `CreateProcess` **不要**给新进程分配控制台 | 子进程会继承/新建控制台 → 闪窗                 |
| `DETACHED_PROCESS`  | `0x00000008` | 让子进程**脱离**父进程的控制台                  | 守护进程退出/重启时，代理被一起带走            |
| `NEW_PROCESS_GROUP` | `0x00000200` | 让子进程进入**新进程组**                        | 父进程被 Ctrl+C / 关闭时，子进程收到同样的信号 |

两个标志用 `|` 组合成 `0x08000008` 一起传给 `subprocess.Popen(creationflags=...)`，这是 Windows 上"彻底无窗口且独立存活"的标准姿势。辅助命令（`tasklist` / `netstat` / `taskkill`）也全部走同一个 `CREATE_NO_WINDOW`：

```python
def run_hidden(cmd: list[str], timeout: float = 30.0) -> str:
    """Run a helper command with no console window; return stdout or ''."""
    completed = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        creationflags=CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    return completed.stdout or ""
```

**设计三：健康路径"零进程"，只在真的挂了才动用重武器**

这是让 CPU 开销降到 0 的关键。健康检查**只做一次非阻塞 TCP 连接**，不查进程、不跑 netstat：

```python
def port_open(target: tuple[str, int], timeout: float = 1.5) -> bool:
    try:
        with socket.create_connection(target, timeout=timeout):
            return True          # 能连上就是活的，别无废话
    except OSError:
        return False

def check_once(verbose: bool, health: dict[str, bool]) -> None:
    for name, target, recover in (
        ("vision",    VISION,    recover_vision),
        ("cc-switch", CC_SWITCH, recover_cc_switch),
    ):
        try:
            healthy = port_open(target)      # 健康路径：一次 TCP 连接，仅此而已
            if not healthy:
                healthy = recover()          # 只有端口死了，才去 tasklist / netstat / taskkill
        except Exception as error:           # 任何单次检查异常都不允许拖垮守护进程
            log(f"{name} check failed: {error!r}", level="error")
            healthy = False
        health[name] = healthy
```

实测稳态开销，值得把数字写准而不是含糊地说"零开销"：

```text
30 秒采样窗口（5 秒轮询一次，两个端口）
  守护壳进程 pid 20500 : +0.000 s
  实际工作进程 pid 16308: +0.016 s   ← 30 秒里只消耗 16 毫秒 CPU
进程自启动以来的累计 CPU：约 7.4 秒（覆盖约 3.4 小时运行）
```

换算下来大约是**单核 0.05% 以下**，摊到一天约 50 秒 CPU 时间。之所以能这么低，是因为健康路径上**没有任何进程被创建**——没有 `tasklist`、没有 `netstat`、没有 `powershell`。它只是在两次 `sleep` 之间连一下 localhost。**说它"零开销"不严谨；准确的说法是"开销小到需要拉长采样窗口才能看见"。**

**设计四：幂等——启动两次不会变成两个守护**

```python
def already_running() -> bool:
    try:
        pid = int(PID_FILE.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return False
    return pid != os.getpid() and pid_alive(pid)   # 既不是自己，又确实活着 → 说明已有实例

def main() -> int:
    args = parser.parse_args()
    if not args.once and already_running():
        log("another guard service is already running; exiting")
        return 0
    ...
```

日志里的实证（两次重复启动都被正确拦下）：

```log
2026-10-14T23:22:21 [info] another guard service is already running; exiting
2026-10-14T23:23:51 [info] another guard service is already running; exiting
```

**启动方式：改用启动文件夹的静默 VBS**

我原本想用 `schtasks /sc onlogon`（登录时启动、不涉及每分钟创建进程），但系统直接拒绝：

```text
ERROR: Access is denied.
```

`onlogon` 触发器需要管理员权限。于是走了一条等价、无需 UAC 的路径——启动文件夹里的 VBS，用 `WScript.Shell.Run` 的窗口样式 `0`（完全隐藏）拉起 `pythonw.exe`：

```vb
' 登录时以“零窗口”方式启动静默守护（窗口样式 0 = 完全不显示窗口）
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

pythonw = "D:\Gurobi_code\Problem2\.venv\Scripts\pythonw.exe"
service = sh.ExpandEnvironmentStrings("%USERPROFILE%") & "\.agent-vision\guard_service.py"

If Not fso.FileExists(pythonw) Then WScript.Quit 1
If Not fso.FileExists(service) Then WScript.Quit 1

sh.Run """" & pythonw & """ """ & service & """", 0, False
```

**第一轮 vs 第二轮，一张表说清差别：**

| 维度                 | 第一轮：每分钟计划任务                | 第二轮：常驻静默守护                  |
| -------------------- | ------------------------------------- | ------------------------------------- |
| 触发方式             | `schtasks /sc minute`，每分钟创建进程 | 常驻单进程，内部 5 秒循环             |
| 解释器               | `powershell.exe`（控制台子系统）      | `pythonw.exe`（GUI 子系统，无控制台） |
| 健康路径是否创建进程 | **是**，每次至少 1 个                 | **否**，一次 TCP 连接，零进程         |
| 是否闪窗             | **每分钟闪，日志显示当时每分钟两次**  | **零窗口**                            |
| 稳态 CPU             | 每次进程启动 + 脚本解释开销           | 实测 30 秒采样仅 0.016 s              |
| 幂等性               | 残留任务会重复注册（当时就有两个）    | pid 文件判定，重复启动直接退出        |
| 检测周期             | 最长 60 秒才发现掉线                  | 5 秒                                  |
| 子进程存活能力       | 依赖计划任务每次新建                  | `DETACHED_PROCESS` 独立存活           |

## 四、第三步验证：7.4 秒真机实验

设计讲完，必须用真实故障验证。我做了破坏性实验：**在用户正在使用 Codex 的情况下**，直接把两段代理一起杀掉——`19100` 的 agent-vision 进程、`15721` 的 CC Switch 主进程，全部 `taskkill`。

以下 `guard-service.log` 是原文（这是新守护进程留存的全部 13 行里的最后 4 行）：

```log
2026-10-14T23:25:42 [info] guard service started pid=16308 interval=5.0s vision=19100 cc-switch=15721
2026-10-14T23:26:03 [warn] vision 19100 down; state pid=15780 listener=None
2026-10-14T23:26:04 [info] vision proxy restarted pid=1584 ready=True
2026-10-14T23:26:06 [warn] cc-switch 15721 down; launching app
2026-10-14T23:26:07 [info] cc-switch launched ready=True
```

逐行读一遍这个过程：

1. `23:26:03` 守护检测到 `19100` 不通，并且顺手记录了台账里的陈旧 pid（`state pid=15780`）和实际监听者（`listener=None`）——**它同时在告诉自己：台账不可信，现实才是准的**；
2. `23:26:04` 新的代理进程 `pid=1584` 起来并确认 `ready=True`，**用了 1 秒**；
3. `23:26:06` 紧接着发现 `15721` 也不通，拉起 CC Switch 应用；
4. `23:26:07` CC Switch 确认 `ready=True`，**又用了 1 秒**。

从第一处告警到最后一段恢复：**7.4 秒**（`23:26:03` → `23:26:07`）。

而且这 7.4 秒里**没有出现任何窗口**——没有黑框，没有闪烁，没有 UAC 提示。用户的体感是"Codex 卡了一下，然后继续说话"。这才是"自愈"应该有的样子：不是在屏幕上刷存在感，而是**让你察觉不到它曾经坏过**。

顺带一个细节，说明守护进程的日志设计也是克制的：它**只在健康状态发生变化时写日志**，稳定运行时不产生任何输出（心跳需要 `--verbose` 才写）：

```python
previous = health.get(name)
if previous is not None and previous != healthy:
    log(f"{name} health changed: {previous} -> {healthy}", level="warn")
elif verbose and healthy:
    log(f"ok {name} listening")
```

所以 `guard-service.log` 长期只有十几行——**一个健康的系统，日志应该是安静的**。反过来再看 `watchdog.log` 那 471 条 `already_running`，你会明白"日志里全是 OK"有时候比"日志里全是 ERROR"更可怕。

## 五、通用骨架：这套东西怎么搬到你的机器上

7.4 秒是这台机器的结果，但**结构本身与机器无关**。"一组中间件 → 各自一个探活函数 → 各自一个恢复函数 → 一个只负责循环的主进程"——这个形状可以套到任何"端口在、服务才算在"的本地依赖上：本机模型代理、向量库、本地推理服务、开发用的网关，全都适用。

上面那些代码都绑在我这台机器上（写死的虚拟环境路径、写死的端口）。下面把它抽出来，去掉所有机器相关信息，你照着换成自己的中间件即可：

```python
"""通用静默守护骨架：适用于任何"端口在、服务才算在"的本地中间件。

三条设计规则：
  1. 探活只做一次 TCP 连接（零进程创建）；
  2. 只有探活失败才动用 tasklist / taskkill 这类重武器；
  3. 必须用 pythonw.exe 运行，否则脚本进程自己就是那个"黑框"。
"""

import socket
import subprocess
import time
from pathlib import Path

# ---- 只需要改这一段：把每个中间件描述成 (名字, 端口, 恢复动作) ----
PYTHON = Path.home() / ".venv/Scripts/pythonw.exe"          # 换成你的解释器

TARGETS = [
    # 名字        探活地址                探活失败时怎么把它拉起来
    ("proxy-a", ("127.0.0.1", 15721), lambda: launch(APP_A, [])),
    ("proxy-b", ("127.0.0.1", 19100), lambda: launch(PYTHON, ["-m", "some_module", "serve"])),
]
# -------------------------------------------------------------------

INTERVAL = 5.0          # 轮询间隔：越短恢复越快，越长越省电
READY_TIMEOUT = 20.0    # 拉起后最多等多久算"就绪"

# Windows：不分配控制台 + 脱离父进程控制台；其余平台置 0
WINDOWLESS = 0x08000000 | 0x00000008


def port_open(addr, timeout=1.5):
    """唯一的探活手段：能建立 TCP 连接就算活着，不查台账、不看 pid 文件。"""
    try:
        with socket.create_connection(addr, timeout=timeout):
            return True
    except OSError:
        return False


def launch(exe, args):
    """拉起一个中间件：无窗口、与守护进程解绑。"""
    subprocess.Popen(
        [str(exe), *args],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=WINDOWLESS,   # 非 Windows 平台删掉这个参数
        close_fds=True,
    )
    return True


def wait_ready(addr, timeout=READY_TIMEOUT):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if port_open(addr):
            return True
        time.sleep(0.5)
    return False


def check_once(health):
    """一轮检查：先探活，死了才恢复，只在状态翻转时写日志。"""
    for name, addr, recover in TARGETS:
        try:
            healthy = port_open(addr)
            if not healthy:
                log(f"{name} down, recovering...")
                recover()
                healthy = wait_ready(addr)
        except Exception as error:            # 单个目标出错不能拖垮守护进程
            log(f"{name} check error: {error!r}")
            healthy = False

        if health.get(name) is not None and health[name] != healthy:
            log(f"{name} health changed: {health[name]} -> {healthy}")
        health[name] = healthy


def log(message):
    line = f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {message}\n"
    with open("guard-service.log", "a", encoding="utf-8") as fh:
        fh.write(line)


if __name__ == "__main__":
    health = {}
    while True:
        check_once(health)
        time.sleep(max(2.0, INTERVAL))
```

把它落到自己机器上，按这四步做，每一步都对应上面踩过的坑：

1. **换 `TARGETS`**：填你自己的端口和启动命令。恢复动作要写成"独立进程"，别写成一个需要保持前台的东西。
2. **用 `pythonw.exe` 启动它**（Windows）。这一点没有替代方案——用 `python.exe` 就等于自己给自己造了个黑框。
3. **开机自启选一条**：启动文件夹放一个 `WScript.Shell.Run "...", 0, False` 的 VBS（本文用的就是这条，不需要管理员权限）；或者用计划任务，但触发器必须是"登录时/开机时"这类**一次性事件**，绝不能是 `/sc minute`。
4. **给自己留一个手动开关**：加一个 `--once` 参数跑单次检查，出事时能立刻诊断，不必等下一个轮询周期。

最后交代这个骨架**做不到**什么，免得你把它当成万能药：它只保证"端口有人听"，不保证"服务能干活"。上游连不上、鉴权过期、响应异常这一类故障，它的探活会一路返回"健康"。这正是下一节要讲的边界。

## 六、边界：守护看不见什么——端口活着 ≠ 服务可用

必须把职责边界说清楚，否则上面那 7.4 秒会给人一个错觉，以为装上它就万事大吉。就隔了几个小时，Codex 又断了一次，而这次守护进程**一行日志都没写**：

```log
2026-10-15T01:46:17 [WARN][...::proxy::forwarder] Provider DeepSeek 请求失败: 上游连接失败: error sending request
（从 01:45 到 01:48 这三分钟里，数据库累计 40 条 status=502；历史全部 41 条 502 记录中有 40 条集中在这一窗口）
2026-10-15T01:48:11 请求恢复正常，status=200
```

但这次报错和上一节完全不同——Codex 收到的是 **502 Bad Gateway**，而不是"连不上"。关键推论只有一个：**这个 502 是 CC Switch 亲手返回的；一个已经死掉的进程不可能返回 HTTP 状态码。** 而 `guard-service.log` 在那三分钟里一片空白，因为 `15721` 和 `19100` **全程都在 LISTENING**——守护进程监控 TCP 端口，它看到的是"两个端口都好得很"。

真相写在 CC Switch 自己的日志里：

```log
[2026-10-15][01:48:00][INFO][...::commands::settings] 开始安装应用更新: 4.0.12
[2026-10-15][01:48:00][INFO][...::proxy::server] [SRV-002] 代理服务器已完全停止
[2026-10-15][01:48:04][INFO][cc_switch_lib] === CC Switch v4.0.12 started ===
[2026-10-15][01:48:04][INFO][...::proxy::server] [SRV-001] 代理服务器启动于 127.0.0.1:15721
```

CC Switch 自己触发了应用自动更新：detach Codex 路由、停掉 `15721` 代理、退出、装新版本、重启、重新 attach。所谓"重试两次又好了"，**是它把自己更新完回来了**，不是我的守护进程救的。

这给守护划出清晰的边界：**它探测的是"端口是否可连通"，因此对"服务活着但不可用"完全无能为力。** 上游连接失败、鉴权过期、返回体异常、响应变慢——这些故障里端口都是通的，守护一个都看不见。这不是缺陷，而是**监控必须分层**：TCP 存活是一层，HTTP 健康是一层，上游可达性是第三层。这次我只做了最底下那一层，并且明确知道它管不到什么。

## 七、总结与思考

### 当主力 AI 瘫痪时，"能动手的本地 Agent"是不可替代的

这次事件里有一个值得所有 AI 重度用户记住的事实：**Codex 全程无法参与修复。** 它没法读 `watchdog.log` 里那 471 条假日志，没法去翻 `runtime.py` 找出 `already_running` 的判定缺陷，没法查 CC Switch 的 `launchOnStartup = false`，更没法给自己写一个守护进程——**它连一轮请求都发不出去**。

救它的是另一类东西：一个能在同一台机器上读任意文件、执行 PowerShell、查看进程与端口、修改启动项、写脚本并**立刻做破坏性验证**的本地 Agent。这提示我一个判断：**当 AI 从"聊天对象"变成"生产工具链的一环"，排障能力的价值会从"模型多聪明"转移到"Agent 能不能碰到真实的系统层"。** 你的主力模型再强，它也需要一条能把自己的诊断变成实际动作的通道。

### 两轮迭代：先解决"能不能用"，再解决"好不好用"

回头看，这次修复真正的分水岭不是那 7.4 秒，而是**承认第一版不够好**。

第一版计划任务方案完全能实现自愈——端口死了就拉起来，功能上 100% 达标。如果我只用"Codex 能不能用"当验收标准，事情到那里就该结束了。但**一分钟闪一次黑框**这个副作用，把"能用"变成了"每天被干扰一千次的能用"。一个修复方案如果让用户的日常工作被持续打断，那它在工程意义上还没有完成。

第二轮我换掉了整个思路：从"定时创建进程"改成"常驻单进程"，从"隐藏窗口"改成"没有窗口"，从"每次启动一整套"改成"健康路径什么都不做"。这些改动的收益可以量化（单核开销约 0.05%、零窗口、5 秒检测、7.4 秒恢复），但它们的出发点其实是一句很朴素的话：**好的运维应该是不被感知的。**

所以这篇文章想留下的不是那几十行 Python，而是这样一个判断标准：

- **监控要看现实，不要看台账。** 端口能不能连通是现实，"进程表里写着 pid 还活着"是台账。任何以台账为唯一判据的健康检查，最终都会变成那个连续 205 次对你说 `ready=True` 的 watchdog。
- **中间件的每一跳都要有兜底。** 两段代理，任意一段静默退出都会让上层工具表现为"网络不通"；而"没有开机自启"这种最朴素的疏漏，往往比代码 bug 更容易让你在深夜重启电脑。
- **修复的验收标准不是"能跑"，而是"无感"。** 第一次修复解决了能不能用，第二次修复解决了好不好用——**真正的工程精神不是一次做到完美，而是持续迭代到无感**。

现在，`15721` 和 `19100` 都由一个零窗口的守护进程安静地看着，健康时不写一行日志，出事时 7.4 秒内把自己修好。而 Codex，继续说话。
