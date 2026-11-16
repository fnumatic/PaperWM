#!/usr/bin/env bash
# Start a nested GNOME Shell against this checkout, isolated from the live
# desktop: separate extension tree, settings and database.
#
# Isolation uses GSETTINGS_BACKEND=keyfile, so no dconf service is contacted.
# `dconf write` would reach the running session's dconf over D-Bus and change
# the live settings, even with a private profile.
#
# It never touches ~/.local/share/gnome-shell/extensions or the live dconf.
# `--devkit` is required on GNOME 51; there is no `--nested` flag anymore.
#
#   ./scripts/dev-shell.sh                 # run until interrupted
#   ./scripts/dev-shell.sh --cycle         # enable/disable three times, then exit
#   ./scripts/dev-shell.sh --no-x11        # extra gnome-shell arguments
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
UUID=paperwm@paperwm.github.com
LIVE="$HOME/.local/share/gnome-shell/extensions/$UUID"
LIVE_DCONF="$HOME/.config/dconf/user"

if [ "${1:-}" = "--inner" ]; then
    shift
    cycle=0
    if [ "${1:-}" = "--cycle" ]; then
        cycle=1
        shift
    fi
    smoke=0
    if [ "${1:-}" = "--smoke" ]; then
        smoke=1
        shift
    fi

    gnome-shell --devkit --wayland --wayland-display paperwm-dev "$@" &
    shell_pid=$!

    if [ "$smoke" = 1 ]; then
        for _ in $(seq 1 60); do
            if gnome-extensions info "$UUID" >/dev/null 2>&1; then
                break
            fi
            sleep 0.5
        done
        echo "smoke: opening alacritty"
        alacritty --class paperwm-smoke >/dev/null 2>&1 &
        client_pid=$!
        sleep 5
        kill "$client_pid" 2>/dev/null || true
        kill "$shell_pid" 2>/dev/null || true
    fi

    if [ "$cycle" = 1 ]; then
        for _ in $(seq 1 60); do
            if gnome-extensions info "$UUID" >/dev/null 2>&1; then
                break
            fi
            sleep 0.5
        done
        for n in 1 2 3; do
            echo "cycle $n: disable"
            gnome-extensions disable "$UUID" || true
            sleep 1
            echo "cycle $n: enable"
            gnome-extensions enable "$UUID" || true
            sleep 1
        done
        kill "$shell_pid" 2>/dev/null || true
    fi

    wait "$shell_pid" || true
    exit 0
fi

if [ -L "$LIVE" ] && [ "$(readlink -f "$LIVE")" = "$ROOT" ]; then
    echo "warning: the live extension points at this checkout; a normal login loads these files too" >&2
fi

BASE="${TMPDIR:-/tmp}/paperwm-dev-$$"
DATA="$BASE/data"
CONFIG="$BASE/config"
RUNTIME="$BASE/run"
cleanup() { rm -rf "$BASE"; }
trap cleanup EXIT INT TERM

mkdir -p "$DATA/gnome-shell/extensions" "$CONFIG" "$RUNTIME"
chmod 700 "$RUNTIME"
ln -s "$ROOT" "$DATA/gnome-shell/extensions/$UUID"

export XDG_DATA_HOME="$DATA"
export XDG_CONFIG_HOME="$CONFIG"
export XDG_RUNTIME_DIR="$RUNTIME"
export GSETTINGS_BACKEND=keyfile

# Enable only this extension inside the isolated settings database.
gsettings set org.gnome.shell enabled-extensions "['$UUID']"

if [ -f "$LIVE_DCONF" ]; then
    before=$(dconf read /org/gnome/shell/enabled-extensions || true)
fi

echo "extension tree: $DATA/gnome-shell/extensions/$UUID -> $ROOT"
echo "settings:       $CONFIG (keyfile backend)"

dbus-run-session -- "$0" --inner "$@"

if [ -n "${before:-}" ]; then
    after=$(dconf read /org/gnome/shell/enabled-extensions || true)
    if [ "$before" != "$after" ]; then
        echo "error: the live enabled-extensions list changed during the isolated run" >&2
        exit 1
    fi
fi
