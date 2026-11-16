<div align="center">

<img src="skills/kami-browser/assets/logo.png" alt="KamiBrowser" width="120" />

# KamiBrowser

**The browser for AI agents that work across many accounts — and act like a human**

<p>
  <a href="https://kamibrowser.com"><img src="https://img.shields.io/badge/Download-kamibrowser.com-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-3DA639?style=for-the-badge" alt="License MIT" /></a>
</p>

<p>
  <b>English</b> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

</div>

KamiBrowser is a Chromium browser built for AI agents doing real work on real websites. Every account lives in its own **environment** — its own cookies, storage, fingerprint and proxy — so one agent can run ten accounts side by side without any of them bleeding into another. Agents work in their own **Spaces** you can watch live, their mouse and keyboard move like a person's, and when a site needs you (sign-in, captcha, payment) the agent hands over, waits, and carries on once you hand it back.

Driving a stock Chrome over CDP gets you flagged as a bot, gives you one throwaway profile and no way to step in. Existing agent browsers fix the shell but still type at machine speed and give you a single identity. KamiBrowser was built to close both gaps.

This repository contains `@kamibrowser/sdk` and the `kami-browser` agent Skill.

## Quick Start

### 1. Install

**1.1 Download the app** from [kamibrowser.com](https://kamibrowser.com). The app adds the `kami-browser` skill to every agent on your machine.

**1.2 Add the skill with npx**

```bash
npx skills add liqianjie/kami-browser
```

**1.3 Let your agent set it up** — paste this into your agent:

```
Set up KamiBrowser for me: https://github.com/liqianjie/kami-browser

Read `skills/kami-browser/references/install.md` and follow the steps.
```

### 2. Try your first task

In Claude Code, Codex, Cursor or any agent CLI:

```
kami-browser open my "US-New York" environment and check the latest orders on my seller dashboard
```

The agent picks the environment, opens the page in its own Space, reads a Snapshot, acts with human-like input, and reports back. If the site asks for a sign-in, it hands control to you and waits.

## Highlights

| Feature | What it does |
|---|---|
| **One account, one environment** | Each environment has isolated cookies and storage, its own fingerprint (time zone, language, hardware, screen, Canvas) and its own HTTP/SOCKS proxy. Ten built-in identity templates — New York, Tokyo, London, Shanghai and more. |
| **Human-like input, on by default** | The pointer travels along curves and lands at a natural spot inside the element; keys go in one by one with uneven rhythm. On behavior-based bot detection, KamiBrowser is judged human where other agent browsers are flagged. |
| **Hand-off built in** | `task_handoff` gives you the window for sign-ins, captchas and payments. Touch the page and you're in control; hand it back and the agent continues. |
| **Parallel Spaces** | Every task runs in a real browser window you can watch from the overview. Many accounts, many tasks, at the same time. |
| **Compact Snapshots** | Structured page text with clickable refs, a fraction of the size of other agent browsers — fewer tokens per look. |
| **Works with any agent** | A Node SDK, a Skill for Claude Code / Codex / Cursor and more, and an MCP server with tools for environments, tasks and hand-off. |

## Benchmarks

Measured on an Apple M4 Pro, macOS, same scripts for every tool.

**Bot detection** — form filled on a behavior-based bot detection page:

| | Verdict |
|---|---|
| **KamiBrowser** | **Human, 10/10** |
| ego lite | Bot, 5/5 |
| Playwright (headed) | Bot, 5/5 |
| Playwright (headless) | Bot, 5/5 |

**Snapshot size** — full-page snapshot of the same Wikipedia article:

| | Characters | Time |
|---|---:|---:|
| **KamiBrowser** | **191,586 (~48k tokens)** | **3.7 s** |
| ego lite | 725,274 (~181k tokens) | 12.9 s |

**Account isolation** — cookies and localStorage written in one environment are invisible to every other environment and shared by tasks in the same one: **4/4**.

**Static page read** — median: KamiBrowser **184 ms**, ego lite 208 ms, Playwright 244 ms.

## Repository layout

| Path | What it is |
|---|---|
| [`package/kami-browser`](package/kami-browser) | `@kamibrowser/sdk` — `TaskSpace`, `Page`, Snapshots with refs, human-like input |
| [`skills/kami-browser`](skills/kami-browser) | The `kami-browser` agent Skill and per-site learnings |

```bash
cd package/kami-browser
npm ci
npm test
```

## License

[MIT](LICENSE)
