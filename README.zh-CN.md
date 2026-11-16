<div align="center">

<img src="skills/kami-browser/assets/logo.png" alt="卡米浏览器" width="120" />

# 卡米浏览器 KamiBrowser

**给 AI 多账号干活、而且像真人一样操作的浏览器**

<p>
  <a href="https://kamibrowser.com"><img src="https://img.shields.io/badge/下载-kamibrowser.com-000000?style=for-the-badge&logo=apple&logoColor=white" alt="下载" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-3DA639?style=for-the-badge" alt="License MIT" /></a>
</p>

<p>
  <a href="README.md">English</a> ·
  <b>简体中文</b>
</p>

</div>

卡米浏览器是一款专为 AI Agent 在真实网站上干活打造的 Chromium 浏览器。每个账号都有自己的**环境**：独立的 Cookie、存储、指纹和代理，一个 Agent 可以同时操作十个账号，互不串号。Agent 在自己的 **Space** 里工作，你能实时看着；它的鼠标和键盘像真人一样移动和输入；遇到登录、验证码、支付，它会把控制权交给你，等你交还后继续干。

用 CDP 直连普通 Chrome，一上来就被认成机器人，只有一个临时 Profile，人也插不进来。现有的 AI 浏览器解决了外壳问题，但打字还是机器速度，也只有一个身份。卡米浏览器就是为了把这两块补齐而做的。

本仓库包含 `@kamibrowser/sdk` 和 `kami-browser` Agent Skill。

## 快速开始

### 1. 安装

**1.1 下载应用**：到 [kamibrowser.com](https://kamibrowser.com) 下载安装。应用会把 `kami-browser` Skill 装进本机所有 Agent。

**1.2 用 npx 安装 Skill**

```bash
npx skills add liqianjie/kami-browser
```

**1.3 让 Agent 帮你装**：把下面这段贴给你的 Agent：

```
帮我安装卡米浏览器：https://github.com/liqianjie/kami-browser

阅读 `skills/kami-browser/references/install.md`，按步骤安装。
```

### 2. 跑第一个任务

在 Claude Code、Codex、Cursor 或任意 Agent CLI 里：

```
kami-browser 用我的「美国-纽约」环境，打开卖家后台看一下最新订单
```

Agent 会选中这个环境，在自己的 Space 里打开页面、读取快照、用拟人输入操作，然后把结果汇报给你。网站要求登录时，它会把控制权交给你并等待。

## 亮点

| 特性 | 说明 |
|---|---|
| **一个账号一个环境** | 每个环境的 Cookie 和存储相互隔离，有自己的指纹（时区、语言、硬件、屏幕、Canvas）和自己的 HTTP/SOCKS 代理。内置纽约、东京、伦敦、上海等 10 个身份模板。 |
| **拟人输入，默认开启** | 鼠标沿曲线移动，落在元素内自然的位置；逐键输入，节奏不均。在看行为的机器人检测上，卡米被判为真人，其他 AI 浏览器被判为机器人。 |
| **内置人机交接** | `task_handoff` 把窗口交给你处理登录、验证码、支付。你一碰页面就接管；交还后 Agent 接着干。 |
| **并行 Space** | 每个任务一个真实浏览器窗口，在总览里实时可见。多个账号、多个任务同时跑。 |
| **精简快照** | 带可点击 ref 的结构化页面文本，体积只有其他 AI 浏览器的一小部分，每看一次页面更省 token。 |
| **任何 Agent 都能接入** | Node SDK、适配 Claude Code / Codex / Cursor 等的 Skill，以及覆盖环境、任务、人机交接的 MCP 服务器。 |

## 实测数据

测试机 Apple M4 Pro、macOS，所有工具使用相同脚本。

**机器人检测**：在看行为的机器人检测页上填表：

| | 判定 |
|---|---|
| **卡米浏览器** | **真人，10/10** |
| ego lite | 机器人，5/5 |
| Playwright（有界面） | 机器人，5/5 |
| Playwright（无头） | 机器人，5/5 |

**快照大小**：同一篇维基百科词条的整页快照：

| | 字符数 | 耗时 |
|---|---:|---:|
| **卡米浏览器** | **191,586（约 4.8 万 token）** | **3.7 s** |
| ego lite | 725,274（约 18.1 万 token） | 12.9 s |

**账号隔离**：在一个环境写入的 Cookie 和 localStorage，其他环境都读不到，同一环境的其他任务能读到：**4/4**。

**静态页面读取**（中位数）：卡米浏览器 **184 ms**，ego lite 208 ms，Playwright 244 ms。

## 仓库结构

| 路径 | 内容 |
|---|---|
| [`package/kami-browser`](package/kami-browser) | `@kamibrowser/sdk`：`TaskSpace`、`Page`、带 ref 的快照、拟人输入 |
| [`skills/kami-browser`](skills/kami-browser) | `kami-browser` Agent Skill 和站点经验 |

```bash
cd package/kami-browser
npm ci
npm test
```

## 许可证

[MIT](LICENSE)
