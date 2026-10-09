"""CLI subcommand handler for ``hermes headroom ...``."""

from __future__ import annotations

import argparse
from typing import Any

from agent.headroom_proxy import (
    DEFAULT_HEADROOM_HOST,
    DEFAULT_HEADROOM_PORT,
    is_headroom_running,
    start_headroom_daemon,
    start_server_foreground,
    stop_headroom_daemon,
)


def cmd_headroom(args: Any) -> int:
    """Handle ``hermes headroom ...`` commands."""
    sub = getattr(args, "headroom_command", None) or "status"
    port = getattr(args, "port", DEFAULT_HEADROOM_PORT) or DEFAULT_HEADROOM_PORT
    host = getattr(args, "host", DEFAULT_HEADROOM_HOST) or DEFAULT_HEADROOM_HOST

    if sub == "start":
        foreground = getattr(args, "foreground", False)
        if is_headroom_running(port, host):
            print(f"Headroom proxy is already active on http://{host}:{port}")
            return 0
        if foreground:
            start_server_foreground(port, host)
            return 0
        success = start_headroom_daemon(port, host)
        if success:
            print(f"✅ Headroom context optimization proxy started in background on http://{host}:{port}")
            return 0
        print(f"❌ Failed to start Headroom proxy on http://{host}:{port}")
        return 1

    if sub == "stop":
        stopped = stop_headroom_daemon(port)
        if stopped:
            print(f"✅ Headroom proxy stopped on port {port}")
            return 0
        print(f"Headroom proxy was not running on port {port}")
        return 0

    if sub == "status":
        running = is_headroom_running(port, host)
        if running:
            print(f"✅ Headroom context optimization proxy is active on http://{host}:{port}")
        else:
            print(f"⚪ Headroom proxy is stopped (port {port})")
            print(f"   Run `hermes headroom start` to launch it.")
        return 0

    print(f"Unknown headroom command: {sub}")
    return 1


def build_headroom_parser(subparsers) -> None:
    """Attach the ``headroom`` subcommand to the CLI parser."""
    parser = subparsers.add_parser(
        "headroom",
        help="Manage Headroom context optimization and compression proxy",
        description="Manage the Headroom proxy daemon that compresses context and reduces token consumption.",
    )
    sub = parser.add_subparsers(dest="headroom_command")

    start_p = sub.add_parser("start", help="Start the Headroom proxy daemon")
    start_p.add_argument("--port", type=int, default=DEFAULT_HEADROOM_PORT, help="Port to listen on (default: 8787)")
    start_p.add_argument("--host", default=DEFAULT_HEADROOM_HOST, help="Host to bind to (default: 127.0.0.1)")
    start_p.add_argument("--foreground", "-f", action="store_true", help="Run in foreground instead of detached daemon")

    stop_p = sub.add_parser("stop", help="Stop the running Headroom proxy daemon")
    stop_p.add_argument("--port", type=int, default=DEFAULT_HEADROOM_PORT, help="Port to stop (default: 8787)")

    status_p = sub.add_parser("status", help="Show Headroom proxy status")
    status_p.add_argument("--port", type=int, default=DEFAULT_HEADROOM_PORT, help="Port to probe (default: 8787)")
    status_p.add_argument("--host", default=DEFAULT_HEADROOM_HOST, help="Host to probe (default: 127.0.0.1)")

    parser.set_defaults(func=cmd_headroom)
