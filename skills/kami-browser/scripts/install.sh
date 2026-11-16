#!/bin/sh
# Install or open KamiBrowser on macOS.
# Served as https://kamibrowser.com/install.sh; the source is skills/kami-browser/scripts/install.sh.
#
# 1. An installed KamiBrowser.app is opened as is.
# 2. Otherwise the release manifest is read. A release is installed only from an
#    https URL with a matching sha256, and only after codesign and Gatekeeper
#    accept the app. Quarantine attributes are left to Gatekeeper.
# 3. Without a published release the script stops and says so; it never installs
#    another browser.

set -eu

MANIFEST_URL="${KAMI_BROWSER_RELEASE_MANIFEST:-https://kamibrowser.com/releases/latest.json}"
APP_NAME="KamiBrowser"
APP_BUNDLE_NAME="$APP_NAME.app"
APP_DIRS="${KAMI_BROWSER_APP_DIRS:-/Applications $HOME/Applications}"
CLI_NAME="kami-browser"
SOURCE_URL="https://github.com/kamibrowser/kamibrowser"

TEMP_DIR=""
MOUNT_DIR=""
DMG_ATTACHED=""

log() {
	printf '%s\n' "$*" >&2
}

die() {
	log "error: $*"
	exit 1
}

require_command() {
	command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

cleanup() {
	if [ -n "$DMG_ATTACHED" ]; then
		hdiutil detach "$MOUNT_DIR" -quiet >/dev/null 2>&1 || true
		DMG_ATTACHED=""
	fi
	if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
		rm -rf "$TEMP_DIR"
	fi
	TEMP_DIR=""
}

trap cleanup EXIT INT TERM

run_with_sudo_if_needed() {
	if "$@" 2>/dev/null; then
		return 0
	fi
	command -v sudo >/dev/null 2>&1 || return 1
	log "Administrator permission is required: $*"
	sudo "$@"
}

find_installed_app() {
	for dir in $APP_DIRS; do
		if [ -d "$dir/$APP_BUNDLE_NAME/Contents/MacOS" ]; then
			printf '%s\n' "$dir/$APP_BUNDLE_NAME"
			return 0
		fi
	done
	return 1
}

find_cli_in_app() {
	find "$1/Contents" -type f -name "$CLI_NAME" -perm -u+x 2>/dev/null | head -n 1
}

platform_key() {
	if [ "$(uname -m)" = "arm64" ]; then
		printf 'darwin-arm64\n'
	else
		printf 'darwin-x64\n'
	fi
}

# Read one value from the downloaded JSON manifest; prints nothing when absent.
manifest_value() {
	plutil -extract "$2" raw -o - "$1" 2>/dev/null || true
}

install_release() {
	require_command curl
	require_command hdiutil
	require_command plutil
	require_command shasum
	require_command codesign
	require_command spctl

	TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/kamibrowser-install.XXXXXX")
	MOUNT_DIR="$TEMP_DIR/mount"
	manifest="$TEMP_DIR/latest.json"
	mkdir -p "$MOUNT_DIR"

	log "$APP_NAME is not installed. Reading $MANIFEST_URL ..."
	curl -fsSL --retry 3 --output "$manifest" "$MANIFEST_URL" ||
		die "failed to read the release manifest from $MANIFEST_URL"

	if [ "$(manifest_value "$manifest" available)" != "true" ]; then
		reason=$(manifest_value "$manifest" reason)
		die "no $APP_NAME release is published yet. ${reason:-}
Build it from source ($SOURCE_URL) or install a development build, then run this script again."
	fi

	key=$(platform_key)
	url=$(manifest_value "$manifest" "platforms.$key.url")
	sha256=$(manifest_value "$manifest" "platforms.$key.sha256")
	[ -n "$url" ] || die "the published release has no $key build"
	case "$url" in
	https://*) ;;
	*) die "refusing a non-https download URL: $url" ;;
	esac
	[ -n "$sha256" ] || die "the release manifest has no sha256 for $key"

	dmg="$TEMP_DIR/KamiBrowser.dmg"
	log "Downloading $url ..."
	curl -fL --retry 3 --output "$dmg" "$url" || die "failed to download $url"
	actual=$(shasum -a 256 "$dmg" | awk '{print $1}')
	[ "$actual" = "$sha256" ] || die "sha256 mismatch for $url (expected $sha256, got $actual)"

	hdiutil attach "$dmg" -nobrowse -readonly -mountpoint "$MOUNT_DIR" >/dev/null
	DMG_ATTACHED="1"
	app_in_dmg=$(find "$MOUNT_DIR" -maxdepth 2 -type d -name "$APP_BUNDLE_NAME" | head -n 1)
	[ -n "$app_in_dmg" ] || die "the installer does not contain $APP_BUNDLE_NAME"

	spctl --assess --type execute "$app_in_dmg" || die "Gatekeeper rejected $APP_BUNDLE_NAME"

	staged="$TEMP_DIR/$APP_BUNDLE_NAME"
	ditto "$app_in_dmg" "$staged" || die "failed to stage $APP_BUNDLE_NAME"
	# The DMG's HFS volume attaches FinderInfo, which strict verification rejects;
	# extended attributes are not part of the signature. Gatekeeper already passed.
	xattr -cr "$staged"
	codesign --verify --deep --strict "$staged" || die "$APP_BUNDLE_NAME failed code signature verification"
	target="/Applications/$APP_BUNDLE_NAME"
	if [ -d "$target" ]; then
		run_with_sudo_if_needed rm -rf "$target" || die "failed to replace $target"
	fi
	if ! run_with_sudo_if_needed mv "$staged" "$target"; then
		mkdir -p "$HOME/Applications"
		target="$HOME/Applications/$APP_BUNDLE_NAME"
		mv "$staged" "$target" || die "failed to install $APP_BUNDLE_NAME"
	fi
	log "Installed $target"
}

main() {
	[ "$(uname -s)" = "Darwin" ] || die "this script supports macOS only; see https://kamibrowser.com/ for other platforms"

	app=$(find_installed_app || true)
	if [ -z "$app" ]; then
		install_release
		app=$(find_installed_app || true)
		[ -n "$app" ] || die "$APP_NAME was installed, but $APP_BUNDLE_NAME was not found"
	fi

	if [ -z "$(find_cli_in_app "$app")" ]; then
		log "warning: $app does not include the $CLI_NAME agent command yet; agents cannot drive this build through the Skill."
	fi
	cleanup

	log "Opening $app ..."
	if [ -n "${KAMI_BROWSER_INSTALL_DRY_RUN:-}" ]; then
		printf '%s\n' "$app"
		return 0
	fi
	exec open "$app"
}

main
