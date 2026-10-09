"""Granular permission policy engine for agent profiles.

Evaluates permissions based on OpenCode / IAM pattern:
Each rule defines:
  action: "read" | "edit" | "shell" | "subagent" | "web" | "*"
  resource: path glob, command pattern, agent id, or "*"
  effect: "allow" | "ask" | "deny"

Rules are evaluated in sequential order; the last matching rule wins.
"""

from __future__ import annotations

import fnmatch
import logging
import os
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple, Union

logger = logging.getLogger("agent.permissions")

PermissionEffect = Literal["allow", "ask", "deny"]

# Mapping tool names to action categories and resource extraction logic
TOOL_ACTION_MAP: Dict[str, str] = {
    # File Read Tools
    "read_file": "read",
    "view_file": "read",
    "grep_search": "read",
    "list_dir": "read",
    "search_files": "read",
    "mcp_filesystem_read_file": "read",
    "mcp_filesystem_read_text_file": "read",
    "mcp_filesystem_list_directory": "read",

    # File Edit Tools
    "write_to_file": "edit",
    "replace_file_content": "edit",
    "multi_replace_file_content": "edit",
    "patch": "edit",
    "write_file": "edit",
    "mcp_filesystem_write_file": "edit",

    # Shell Execution Tools
    "run_command": "shell",
    "terminal": "shell",
    "execute_code": "shell",

    # Subagent Delegation Tools
    "delegate_task": "subagent",
    "spawn_subagent": "subagent",

    # Web & Network Tools
    "web_search": "web",
    "read_url_content": "web",
    "browser_navigate": "web",
}


@dataclass(frozen=True)
class PermissionRule:
    action: str  # "read" | "edit" | "shell" | "subagent" | "web" | "*"
    resource: str  # Glob pattern, command pattern, agent id, or "*"
    effect: PermissionEffect  # "allow" | "ask" | "deny"

    def to_dict(self) -> Dict[str, str]:
        return {"action": self.action, "resource": self.resource, "effect": self.effect}

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PermissionRule:
        action = str(data.get("action", "*")).strip()
        resource = str(data.get("resource", "*")).strip()
        effect_raw = str(data.get("effect", "allow")).strip().lower()
        effect: PermissionEffect = effect_raw if effect_raw in ("allow", "ask", "deny") else "allow"
        return cls(action=action, resource=resource, effect=effect)


def glob_to_regex(pattern: str) -> str:
    i = 0
    n = len(pattern)
    res = []
    while i < n:
        c = pattern[i]
        if c == "*":
            if i + 1 < n and pattern[i + 1] == "*":
                res.append(".*")
                i += 2
                if i < n and pattern[i] == "/":
                    res.append("(/.*)?")
                    i += 1
                continue
            else:
                res.append("[^/]*")
                i += 1
                continue
        elif c == "?":
            res.append("[^/]")
            i += 1
            continue
        else:
            res.append(re.escape(c))
            i += 1
    return "^" + "".join(res) + "$"


def match_pattern(pattern: str, target: str) -> bool:
    """Matches a wildcard pattern against a target string.
    
    Supports:
      - "*" matches any string.
      - "**" recursive glob matching.
      - Standard fnmatch wildcarding (*, ?, [a-z]).
      - Regex alternation if formatted as a|b|c.
    """
    if not pattern or pattern == "*":
        return True
    if target == pattern:
        return True

    # Support pipe alternation (e.g. "reviewer|qa|security")
    if "|" in pattern:
        parts = [p.strip() for p in pattern.split("|")]
        return any(match_pattern(p, target) for p in parts if p)

    # Normalize paths: collapse leading ./ or trailing /
    norm_pattern = pattern.replace("\\", "/").rstrip("/")
    norm_target = target.replace("\\", "/").rstrip("/")

    # If pattern has "**", translate to regex
    if "**" in norm_pattern:
        try:
            rx = glob_to_regex(norm_pattern)
            return bool(re.match(rx, norm_target))
        except Exception:
            pass

    return fnmatch.fnmatch(norm_target, norm_pattern) or fnmatch.fnmatch(os.path.basename(norm_target), norm_pattern)


def evaluate_permission(
    rules: List[PermissionRule],
    action: str,
    resource: str,
    default_effect: PermissionEffect = "allow",
) -> Tuple[PermissionEffect, Optional[PermissionRule]]:
    """Evaluates an ordered list of PermissionRules against an action and resource.
    
    Sequential rule evaluation: last matching rule wins.
    Returns (effect, winning_rule).
    """
    if not rules:
        return default_effect, None

    winning_rule: Optional[PermissionRule] = None
    winning_effect: PermissionEffect = default_effect

    for rule in rules:
        # Check action match
        if rule.action != "*" and rule.action.lower() != action.lower():
            continue

        # Check resource match
        if match_pattern(rule.resource, resource):
            winning_rule = rule
            winning_effect = rule.effect

    return winning_effect, winning_rule


def extract_tool_action_and_resource(
    tool_name: str,
    tool_args: Dict[str, Any],
    workspace_root: Optional[str] = None,
) -> Tuple[str, str]:
    """Extracts normalized action category and target resource from a tool call."""
    action = TOOL_ACTION_MAP.get(tool_name, "*")

    if action in ("read", "edit"):
        raw_path = (
            tool_args.get("path")
            or tool_args.get("TargetFile")
            or tool_args.get("AbsolutePath")
            or tool_args.get("file_path")
            or tool_args.get("DirectoryPath")
            or tool_args.get("SearchPath")
            or ""
        )
        norm_path = str(raw_path).strip()
        if norm_path and workspace_root:
            norm_path = os.path.expanduser(norm_path)
            try:
                rel = os.path.relpath(norm_path, workspace_root)
                if not rel.startswith(".."):
                    norm_path = rel
            except Exception:
                pass
        return action, norm_path or "*"

    elif action == "shell":
        cmd = tool_args.get("command") or tool_args.get("CommandLine") or tool_args.get("cmd") or ""
        return action, str(cmd).strip()

    elif action == "subagent":
        target = (
            tool_args.get("agent_id")
            or tool_args.get("role")
            or tool_args.get("profile")
            or tool_args.get("target_agent")
            or ""
        )
        return action, str(target).strip()

    elif action == "web":
        url = tool_args.get("url") or tool_args.get("Url") or tool_args.get("query") or ""
        return action, str(url).strip()

    return "*", "*"


_PERM_CACHE: Dict[str, Tuple[float, List[PermissionRule]]] = {}


def load_profile_permissions(profile_dir: Union[str, Path]) -> List[PermissionRule]:
    """Loads permission rules for a profile from permissions.yaml, config.yaml, or profile.yaml (mtime-cached)."""
    p_dir = Path(profile_dir)
    perm_file = p_dir / "permissions.yaml"
    config_file = p_dir / "config.yaml"
    profile_file = p_dir / "profile.yaml"

    target_file = perm_file if perm_file.exists() else (config_file if config_file.exists() else profile_file)
    if not target_file.exists():
        return []

    try:
        mtime = target_file.stat().st_mtime
    except Exception:
        mtime = 0.0

    key = str(p_dir.resolve())
    cached = _PERM_CACHE.get(key)
    if cached is not None and cached[0] == mtime:
        return cached[1]

    raw_rules: List[Dict[str, Any]] = []

    try:
        import yaml
        content = target_file.read_text(encoding="utf-8-sig")
        data = yaml.safe_load(content)
        if isinstance(data, list):
            raw_rules = data
        elif isinstance(data, dict) and "permissions" in data:
            raw_rules = data.get("permissions") or []
    except Exception as exc:
        logger.warning("Failed to parse permissions in %s: %s", target_file, exc)

    rules = [PermissionRule.from_dict(r) for r in raw_rules if isinstance(r, dict)]
    _PERM_CACHE[key] = (mtime, rules)
    return rules


def save_profile_permissions(profile_dir: Union[str, Path], rules: List[PermissionRule]) -> None:
    """Saves permission rules to permissions.yaml and updates config.yaml/profile.yaml in the profile dir."""
    import yaml
    try:
        from utils import atomic_write_text
    except Exception:
        def atomic_write_text(dest: Path, txt: str, **kwargs):
            tmp = dest.with_suffix(".tmp." + str(os.getpid()))
            tmp.write_text(txt, encoding="utf-8")
            tmp.replace(dest)

    p_dir = Path(profile_dir)
    p_dir.mkdir(parents=True, exist_ok=True)
    perm_file = p_dir / "permissions.yaml"
    config_file = p_dir / "config.yaml"
    profile_file = p_dir / "profile.yaml"

    rule_dicts = [r.to_dict() for r in rules]
    content = yaml.safe_dump(rule_dicts, sort_keys=False, default_flow_style=False)

    atomic_write_text(perm_file, content, preserve_mode=True, create_mode=0o644)

    # Sync to config.yaml or profile.yaml if either exists
    for cfg_target in (config_file, profile_file):
        if cfg_target.exists():
            try:
                c_data = yaml.safe_load(cfg_target.read_text(encoding="utf-8-sig")) or {}
                if isinstance(c_data, dict):
                    c_data["permissions"] = rule_dicts
                    c_content = yaml.safe_dump(c_data, sort_keys=False, default_flow_style=False)
                    atomic_write_text(cfg_target, c_content, preserve_mode=True, create_mode=0o644)
            except Exception as exc:
                logger.warning("Could not sync permissions to %s: %s", cfg_target, exc)
