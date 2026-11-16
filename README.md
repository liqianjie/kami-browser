# kami-browser

Agent SDK and Skill for [KamiBrowser](https://kamibrowser.com) — a Chromium browser where AI agents work across multiple isolated accounts (environments), act with human-like input, and hand control to you for sign-ins, captchas and payments.

| Path | What it is |
| --- | --- |
| [`package/kami-browser`](package/kami-browser) | `@kamibrowser/sdk`: the agent runtime (`TaskSpace`, `Page`, snapshots with element refs, human-like pointer and keyboard input) |
| [`skills/kami-browser`](skills/kami-browser) | The `kami-browser` agent Skill and per-site learnings |

## Quick start

Requires Node.js 22+ and [KamiBrowser](https://kamibrowser.com) installed.

```bash
cd package/kami-browser
npm ci
npm test
```

```bash
kami-browser nodejs <<'EOF'
const task = await taskSpace('demo')
const page = task.page('p1')
await page.goto('https://example.com')
console.log(await page.snapshot())
EOF
```

See [`package/kami-browser/README.md`](package/kami-browser/README.md) for the full API and [`skills/kami-browser/SKILL.md`](skills/kami-browser/SKILL.md) for agent usage.

## License

MIT — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
