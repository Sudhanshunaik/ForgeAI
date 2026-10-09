"""Tests for agent/permissions.py"""

import os
import tempfile
from pathlib import Path

from agent.permissions import (
    PermissionRule,
    evaluate_permission,
    extract_tool_action_and_resource,
    load_profile_permissions,
    match_pattern,
    save_profile_permissions,
)


def test_match_pattern():
    assert match_pattern("*", "anything") is True
    assert match_pattern("src/**", "src/api/auth.py") is True
    assert match_pattern("src/**", "tests/test_auth.py") is False
    assert match_pattern("*.env*", ".env") is True
    assert match_pattern("*.env*", ".env.local") is True
    assert match_pattern("*.env*", "config.yaml") is False
    assert match_pattern("git push*", "git push origin main") is True
    assert match_pattern("git status", "git status") is True
    assert match_pattern("git status", "git commit") is False
    assert match_pattern("reviewer|qa|security", "reviewer") is True
    assert match_pattern("reviewer|qa|security", "qa") is True
    assert match_pattern("reviewer|qa|security", "backend") is False


def test_evaluate_permission_sequential_override():
    # Last matching rule wins
    rules = [
        PermissionRule(action="*", resource="*", effect="allow"),
        PermissionRule(action="edit", resource="*", effect="deny"),
        PermissionRule(action="edit", resource="src/**", effect="allow"),
        PermissionRule(action="shell", resource="git push*", effect="ask"),
        PermissionRule(action="read", resource="**/.env*", effect="deny"),
    ]

    # Reading normal file -> allow
    eff, rule = evaluate_permission(rules, "read", "src/main.py")
    assert eff == "allow"

    # Reading .env -> deny
    eff, rule = evaluate_permission(rules, "read", "config/.env")
    assert eff == "deny"

    # Editing src/main.py -> allow (overrides edit: * deny)
    eff, rule = evaluate_permission(rules, "edit", "src/main.py")
    assert eff == "allow"

    # Editing docs/readme.md -> deny
    eff, rule = evaluate_permission(rules, "edit", "docs/readme.md")
    assert eff == "deny"

    # Running git push -> ask
    eff, rule = evaluate_permission(rules, "shell", "git push origin main")
    assert eff == "ask"

    # Running npm test -> allow (matches base allow)
    eff, rule = evaluate_permission(rules, "shell", "npm test")
    assert eff == "allow"


def test_extract_tool_action_and_resource():
    action, res = extract_tool_action_and_resource("read_file", {"path": "src/api.py"})
    assert action == "read"
    assert res == "src/api.py"

    action, res = extract_tool_action_and_resource("write_to_file", {"TargetFile": "/app/src/index.js"}, workspace_root="/app")
    assert action == "edit"
    assert res == "src/index.js"

    action, res = extract_tool_action_and_resource("run_command", {"CommandLine": "npm test"})
    assert action == "shell"
    assert res == "npm test"

    action, res = extract_tool_action_and_resource("delegate_task", {"role": "reviewer"})
    assert action == "subagent"
    assert res == "reviewer"


def test_save_and_load_profile_permissions(tmp_path):
    rules = [
        PermissionRule(action="edit", resource="*", effect="deny"),
        PermissionRule(action="shell", resource="npm test", effect="allow"),
    ]

    save_profile_permissions(tmp_path, rules)
    assert (tmp_path / "permissions.yaml").exists()

    loaded = load_profile_permissions(tmp_path)
    assert len(loaded) == 2
    assert loaded[0].action == "edit"
    assert loaded[0].effect == "deny"
    assert loaded[1].action == "shell"
    assert loaded[1].effect == "allow"
