# Install or open KamiBrowser

Read this file only when `kami-browser` is not found, when `kami-browser skill` reports an unknown command, or when the user asks to install KamiBrowser. For day-to-day browser work, run `kami-browser skill` and follow its output.

The kami-browser Skill drives KamiBrowser through the `kami-browser` command that ships inside the KamiBrowser app.

KamiBrowser website: https://kamibrowser.com/

## Current availability

KamiBrowser is a developer preview. No signed and notarized installer has been published yet. KamiBrowser ships the `kami-browser` agent command with its own Node.js runtime. On first launch it links the command to `~/.local/bin/kami-browser` and installs this entry Skill into `~/.agents/skills/kami-browser` when they are missing; files you installed yourself are left alone. The release manifest at https://kamibrowser.com/releases/latest.json states what is available; the install script reads it.

If the manifest reports no release and the user has no KamiBrowser build, stop and tell the user. Do not install or switch to another browser, and do not try to build Chromium on the user's behalf.

## Install on macOS

The install script lives at `scripts/install.sh` in this Skill and is also served at https://kamibrowser.com/install.sh. It supports macOS only. It:

- opens an installed `KamiBrowser.app` from `/Applications` or `~/Applications`;
- otherwise reads the release manifest and, when a release exists for this CPU, downloads it over https, checks its sha256, verifies the code signature and Gatekeeper assessment, and installs it to `/Applications` (falling back to `~/Applications`);
- stops with an error when no release is published;
- warns when the installed build does not contain the `kami-browser` command.

Ask the user before running it, then run (use the script's actual path under this Skill's directory):

```bash
sh skills/kami-browser/scripts/install.sh
```

or, from any directory:

```bash
curl -fsSL https://kamibrowser.com/install.sh | sh
```

## Other platforms

There is no Windows or Linux build yet. Tell the user and stop.

## After installing: confirm `kami-browser` is available

Once the app is open and the user has finished any first-run steps, confirm the command:

```bash
command -v kami-browser
```

If it is not found, check `~/.local/bin` and retry:

```bash
export PATH="$HOME/.local/bin:$PATH"
command -v kami-browser
```

If the command is still missing and the install script warned that the build has no `kami-browser` command, this build cannot be driven through the Skill yet. Tell the user; do not fall back to another browser.

Once the command exists, verify the runtime:

```bash
kami-browser nodejs <<'EOF'
console.log('kami-browser ready')
EOF
```

Printing `kami-browser ready` means the environment is ready. Then print the usage guide:

```bash
kami-browser skill
```

## After that, return to the original task

Run `kami-browser skill` and follow its output.

## Troubleshooting

- **Not macOS**: the script supports macOS only.
- **Manifest or download failed**: the script retries 3 times; if it still fails, it is usually a network issue. Have the user check their network and retry.
- **sha256, signature or Gatekeeper check failed**: do not bypass it. Report the exact error to the user; the download is not trustworthy as is.
- **Upgrading**: when the guide or `kami-browser` says an update is available, run `kami-browser upgrade` only with the user's approval, then run `kami-browser skill` again.
