#!/usr/bin/env python3
"""Decision Journal & "Why" Engine Tool for Sovereign AI Engineering Team.

Dual-storage architecture:
1. File-based records: <target-project>/docs/decisions/DECISION-XXX.yaml
2. Hindsight Memory (Vectorize): Biomimetic memory retain & recall with graceful offline fallback.

Usage:
  python tools/decision_journal.py record --project <path> --agent "System Architect" --gate "Gate 1: Architecture & Contract" --title "Auth Strategy" ...
  python tools/decision_journal.py record --project <path> --payload decision.json
  python tools/decision_journal.py list --project <path>
  python tools/decision_journal.py get --project <path> --id DECISION-001
  python tools/decision_journal.py recall --project <path> --query "why did we choose jwt?"
  python tools/decision_journal.py update-status --project <path> --id DECISION-001 --status APPROVED
"""

from __future__ import annotations

import argparse
import datetime
import glob
import json
import logging
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import yaml
except ImportError:
    yaml = None  # Fallback JSON-compatible dumper if yaml missing

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("decision_journal")

HINDSIGHT_DEFAULT_URL = os.environ.get("HINDSIGHT_URL", "http://localhost:8888")
HINDSIGHT_API_KEY = os.environ.get("HINDSIGHT_API_KEY", "")


# ---------------------------------------------------------------------------
# Hindsight Integration (retain / recall)
# ---------------------------------------------------------------------------

def _hindsight_request(endpoint: str, payload: Dict[str, Any], timeout: float = 3.0) -> Optional[Dict[str, Any]]:
    """Send request to Hindsight service with graceful fallback on failure."""
    url = f"{HINDSIGHT_DEFAULT_URL.rstrip('/')}/{endpoint.lstrip('/')}"
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if HINDSIGHT_API_KEY:
        headers["Authorization"] = f"Bearer {HINDSIGHT_API_KEY}"

    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if 200 <= resp.status < 300:
                body = resp.read().decode("utf-8")
                return json.loads(body) if body else {}
    except (urllib.error.URLError, TimeoutError, ConnectionRefusedError, OSError) as e:
        logger.debug("Hindsight unreachable (%s) at %s: %s", endpoint, url, e)
    except Exception as e:
        logger.warning("Hindsight unexpected error (%s): %s", endpoint, e)
    return None


def retain_in_hindsight(bank_id: str, decision: Dict[str, Any]) -> bool:
    """Store decision in Hindsight long-term memory bank using the 'retain' verb."""
    content = (
        f"Decision {decision.get('decision_id')}: {decision.get('title')}\n"
        f"Agent: {decision.get('agent')}\n"
        f"Gate: {decision.get('phase_gate')}\n"
        f"Chosen Option: {decision.get('chosen_option')}\n"
        f"Rationale: {decision.get('rationale')}\n"
        f"Context Problem: {decision.get('context', {}).get('problem', '')}\n"
        f"Blast Radius: {', '.join(decision.get('blast_radius', {}).get('components_affected', []))}"
    )
    payload = {
        "bank_id": bank_id,
        "content": content,
        "metadata": {
            "type": "decision_record",
            "decision_id": decision.get("decision_id"),
            "agent": decision.get("agent"),
            "phase_gate": decision.get("phase_gate"),
            "title": decision.get("title"),
            "status": decision.get("human_review_status", {}).get("status", "PENDING"),
        }
    }
    res = _hindsight_request("retain", payload)
    if res is not None:
        logger.info("Successfully retained %s in Hindsight bank '%s'", decision.get("decision_id"), bank_id)
        return True
    logger.info("Hindsight is offline or unreachable; retained %s locally in file journal.", decision.get("decision_id"))
    return False


def recall_from_hindsight(bank_id: str, query: str) -> Optional[List[Dict[str, Any]]]:
    """Recall relevant decisions from Hindsight memory bank."""
    payload = {
        "bank_id": bank_id,
        "query": query,
        "filter": {"type": "decision_record"},
        "limit": 5,
    }
    res = _hindsight_request("recall", payload)
    if res and "results" in res:
        return res["results"]
    return None


# ---------------------------------------------------------------------------
# File-Based YAML Journal
# ---------------------------------------------------------------------------

def get_decisions_dir(project_path: Optional[str] = None) -> Path:
    """Resolve <project>/docs/decisions directory and ensure it exists."""
    base = Path(project_path).resolve() if project_path else Path.cwd().resolve()
    decisions_dir = base / "docs" / "decisions"
    decisions_dir.mkdir(parents=True, exist_ok=True)
    return decisions_dir


def get_next_decision_id(decisions_dir: Path) -> str:
    """Scan existing decisions and return next DECISION-XXX formatted ID."""
    existing_files = glob.glob(str(decisions_dir / "DECISION-*.yaml"))
    max_num = 0
    pattern = re.compile(r"DECISION-(\d+)\.yaml$")
    for f in existing_files:
        match = pattern.search(f)
        if match:
            num = int(match.group(1))
            if num > max_num:
                max_num = num
    next_num = max_num + 1
    return f"DECISION-{next_num:03d}"


def save_decision_yaml(decisions_dir: Path, decision: Dict[str, Any]) -> Path:
    """Write decision dictionary to formatted YAML file."""
    decision_id = decision.get("decision_id")
    if not decision_id:
        decision_id = get_next_decision_id(decisions_dir)
        decision["decision_id"] = decision_id

    file_path = decisions_dir / f"{decision_id}.yaml"
    if yaml is not None:
        with open(file_path, "w", encoding="utf-8") as f:
            yaml.dump(decision, f, sort_keys=False, default_flow_style=False)
    else:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(decision, f, indent=2)
    return file_path


def load_decision_yaml(file_path: Path) -> Optional[Dict[str, Any]]:
    """Read decision dictionary from YAML file."""
    if not file_path.exists():
        return None
    try:
        content = file_path.read_text(encoding="utf-8")
        if yaml is not None:
            return yaml.safe_load(content)
        return json.loads(content)
    except Exception as e:
        logger.error("Failed to parse decision file %s: %s", file_path, e)
        return None


def list_decisions(decisions_dir: Path) -> List[Dict[str, Any]]:
    """List all decisions in directory sorted by ID."""
    files = sorted(glob.glob(str(decisions_dir / "DECISION-*.yaml")))
    results = []
    for f in files:
        data = load_decision_yaml(Path(f))
        if data:
            results.append(data)
    return results


def local_semantic_recall(decisions_dir: Path, query: str) -> List[Dict[str, Any]]:
    """Fallback keyword & token scoring over local YAML files when Hindsight is offline."""
    decisions = list_decisions(decisions_dir)
    query_tokens = set(re.findall(r"\w+", query.lower()))
    scored = []

    for d in decisions:
        text_corpus = (
            f"{d.get('title', '')} {d.get('chosen_option', '')} {d.get('rationale', '')} "
            f"{d.get('context', {}).get('problem', '')} {d.get('agent', '')} "
            f"{' '.join(d.get('blast_radius', {}).get('components_affected', []))}"
        ).lower()
        score = sum(1 for token in query_tokens if token in text_corpus)
        if score > 0:
            scored.append((score, d))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item[1] for item in scored]


# ---------------------------------------------------------------------------
# CLI Command Handlers
# ---------------------------------------------------------------------------

def handle_record(args: argparse.Namespace) -> int:
    decisions_dir = get_decisions_dir(args.project)

    if args.payload:
        payload_path = Path(args.payload)
        if not payload_path.exists():
            logger.error("Payload file not found: %s", args.payload)
            return 1
        with open(payload_path, "r", encoding="utf-8") as f:
            if payload_path.suffix.lower() in (".yaml", ".yml") and yaml is not None:
                record = yaml.safe_load(f)
            else:
                record = json.load(f)
    else:
        if not args.title or not args.agent or not args.rationale:
            logger.error("--title, --agent, and --rationale are required when not using --payload")
            return 1

        options = []
        if args.options:
            try:
                options = json.loads(args.options)
            except Exception:
                options = [{"option": opt.strip()} for opt in args.options.split(";")]

        blast_components = [c.strip() for c in args.blast_radius.split(",")] if args.blast_radius else []

        record = {
            "decision_id": args.id or get_next_decision_id(decisions_dir),
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "agent": args.agent,
            "phase_gate": args.gate or "Gate 1: Architecture & Contract",
            "title": args.title,
            "context": {
                "problem": args.problem or "",
                "scale_target": args.scale_target or ""
            },
            "options_considered": options,
            "chosen_option": args.chosen or "",
            "rationale": args.rationale,
            "blast_radius": {
                "components_affected": blast_components,
                "reversibility": args.reversibility or "Moderate"
            },
            "human_review_status": {
                "status": args.status or "PENDING"
            }
        }

    saved_path = save_decision_yaml(decisions_dir, record)
    logger.info("Saved Decision Record: %s", saved_path)

    # Attempt Hindsight retain
    bank_id = Path(args.project or os.getcwd()).name or "sovereign_swarm"
    retain_in_hindsight(bank_id, record)

    print(json.dumps({"status": "success", "decision_id": record["decision_id"], "path": str(saved_path)}))
    return 0


def handle_list(args: argparse.Namespace) -> int:
    decisions_dir = get_decisions_dir(args.project)
    decisions = list_decisions(decisions_dir)
    if not decisions:
        print("No Decision Records found in " + str(decisions_dir))
        return 0

    print(f"\n{'ID':<14} | {'GATE':<32} | {'AGENT':<22} | {'STATUS':<10} | {'TITLE'}")
    print("-" * 105)
    for d in decisions:
        d_id = d.get("decision_id", "N/A")
        gate = d.get("phase_gate", "N/A")[:30]
        agent = d.get("agent", "N/A")[:20]
        status = d.get("human_review_status", {}).get("status", "PENDING")
        title = d.get("title", "")
        print(f"{d_id:<14} | {gate:<32} | {agent:<22} | {status:<10} | {title}")
    print()
    return 0


def handle_get(args: argparse.Namespace) -> int:
    decisions_dir = get_decisions_dir(args.project)
    d_id = args.id.upper()
    if not d_id.startswith("DECISION-"):
        d_id = f"DECISION-{d_id}"
    file_path = decisions_dir / f"{d_id}.yaml"
    decision = load_decision_yaml(file_path)
    if not decision:
        logger.error("Decision Record not found: %s", file_path)
        return 1

    if yaml is not None:
        print(yaml.dump(decision, sort_keys=False))
    else:
        print(json.dumps(decision, indent=2))
    return 0


def handle_recall(args: argparse.Namespace) -> int:
    decisions_dir = get_decisions_dir(args.project)
    bank_id = Path(args.project or os.getcwd()).name or "sovereign_swarm"

    print(f"\n🧠 Querying Decision Journal for: '{args.query}'...\n")

    # Try Hindsight first
    hindsight_results = recall_from_hindsight(bank_id, args.query)
    if hindsight_results:
        print("🔍 Found via Hindsight Biomimetic Memory:")
        for idx, res in enumerate(hindsight_results, 1):
            print(f"[{idx}] {res.get('content')}\n---")
        return 0

    # Fallback to local files
    print("ℹ️  Hindsight offline or empty; falling back to local YAML search in " + str(decisions_dir))
    local_results = local_semantic_recall(decisions_dir, args.query)
    if not local_results:
        print("No matching decisions found.")
        return 0

    for idx, d in enumerate(local_results[:5], 1):
        print(f"[{idx}] {d.get('decision_id')}: {d.get('title')}")
        print(f"    Agent: {d.get('agent')} | Gate: {d.get('phase_gate')}")
        print(f"    Chosen: {d.get('chosen_option')}")
        print(f"    Rationale: {d.get('rationale')}")
        print(f"    Status: {d.get('human_review_status', {}).get('status')}")
        print()
    return 0


def handle_update_status(args: argparse.Namespace) -> int:
    decisions_dir = get_decisions_dir(args.project)
    d_id = args.id.upper()
    if not d_id.startswith("DECISION-"):
        d_id = f"DECISION-{d_id}"
    file_path = decisions_dir / f"{d_id}.yaml"
    decision = load_decision_yaml(file_path)
    if not decision:
        logger.error("Decision Record not found: %s", file_path)
        return 1

    old_status = decision.get("human_review_status", {}).get("status", "PENDING")
    decision.setdefault("human_review_status", {})["status"] = args.status.upper()
    decision["human_review_status"]["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if args.notes:
        decision["human_review_status"]["notes"] = args.notes

    save_decision_yaml(decisions_dir, decision)
    logger.info("Updated %s status: %s -> %s", d_id, old_status, args.status.upper())

    # Update in Hindsight
    bank_id = Path(args.project or os.getcwd()).name or "sovereign_swarm"
    retain_in_hindsight(bank_id, decision)

    print(f"Decision {d_id} status updated to {args.status.upper()}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Decision Journal & 'Why' Engine CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Record
    rec_parser = subparsers.add_parser("record", help="Record a new architectural/technical decision")
    rec_parser.add_argument("--project", help="Target project root directory")
    rec_parser.add_argument("--payload", help="JSON or YAML file containing full decision object")
    rec_parser.add_argument("--id", help="Explicit decision ID (e.g. DECISION-042)")
    rec_parser.add_argument("--agent", help="Agent role authoring the decision (e.g. 'System Architect')")
    rec_parser.add_argument("--gate", help="Associated Phase Gate (e.g. 'Gate 1: Architecture & Contract')")
    rec_parser.add_argument("--title", help="Decision title")
    rec_parser.add_argument("--problem", help="Context/problem description")
    rec_parser.add_argument("--scale-target", help="Expected scale or scope")
    rec_parser.add_argument("--options", help="JSON array of options or semicolon-separated strings")
    rec_parser.add_argument("--chosen", help="Chosen option name or identifier")
    rec_parser.add_argument("--rationale", help="Reasoning and trade-offs for choice")
    rec_parser.add_argument("--blast-radius", help="Comma-separated components affected")
    rec_parser.add_argument("--reversibility", choices=["Low", "Moderate", "High"], default="Moderate")
    rec_parser.add_argument("--status", choices=["PENDING", "APPROVED", "REQUESTED_CHANGES"], default="PENDING")

    # List
    list_parser = subparsers.add_parser("list", help="List all Decision Records in target project")
    list_parser.add_argument("--project", help="Target project root directory")

    # Get
    get_parser = subparsers.add_parser("get", help="Get a single Decision Record")
    get_parser.add_argument("--project", help="Target project root directory")
    get_parser.add_argument("--id", required=True, help="Decision ID (e.g. DECISION-001 or 001)")

    # Recall
    recall_parser = subparsers.add_parser("recall", help="Recall decisions relevant to a query ('Why did we do X?')")
    recall_parser.add_argument("--project", help="Target project root directory")
    recall_parser.add_argument("--query", required=True, help="Natural language query")

    # Update Status
    status_parser = subparsers.add_parser("update-status", help="Update human review status of a decision")
    status_parser.add_argument("--project", help="Target project root directory")
    status_parser.add_argument("--id", required=True, help="Decision ID")
    status_parser.add_argument("--status", required=True, choices=["PENDING", "APPROVED", "REQUESTED_CHANGES"])
    status_parser.add_argument("--notes", help="Human feedback or review notes")

    args = parser.parse_args()

    if args.command == "record":
        return handle_record(args)
    elif args.command == "list":
        return handle_list(args)
    elif args.command == "get":
        return handle_get(args)
    elif args.command == "recall":
        return handle_recall(args)
    elif args.command == "update-status":
        return handle_update_status(args)
    return 1


if __name__ == "__main__":
    sys.exit(main())
