---
name: kami-browser
description: Use this Skill to operate websites in KamiBrowser, a Chromium browser that the user and AI agents share. It opens and operates websites, fills forms, clicks buttons, takes screenshots and extracts page data in the user's logged-in browser, and supports web app testing, QA and bug investigation. Agent work runs in its own task space, and the user can take over and hand control back at any time.
metadata:
  version: "0.1.0"
  date: "2026-11-02"
  bootstrap: "true"
---

# kami-browser

Before any browser task, run:

```bash
kami-browser skill
```

and follow its output. It prints the usage guide that matches the installed
KamiBrowser version. Run it again after `kami-browser upgrade`, or when any output
says to.

The guide ends with a line starting `[kami-browser:skill] end of guide`. If that
line is missing, the output was truncated: save it to a file and read the file
in parts, for example `kami-browser skill > "$TMPDIR/kami-browser-skill.md"`, or
`kami-browser skill > "$env:TEMP\kami-browser-skill.md"` in PowerShell.

## Setup and distribution

The app installs this entry Skill on first launch. A standalone copy is available
at https://kamibrowser.com/skill/kami-browser-skill.zip; extract the `kami-browser`
folder into your agent host’s skills directory. Installing the Skill does not
install the browser. Read the installation reference if the command is missing.

Like the original upstream entry Skill, keep this file thin: load the usage
guide from the installed app rather than copying runtime APIs here. The canonical
guide is `package/kami-browser/skill-body/SKILL.md` in the source repository.

## References

- [Install or upgrade KamiBrowser](references/install.md) — read when
  `kami-browser` is not found, or `skill` is an unknown command.
- [Clearing cookies, cache, and storage](references/clearing-state.md) — read
  before clearing any cookie, cache, or storage; some clears reach the whole
  browser profile.
