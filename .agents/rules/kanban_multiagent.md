# Multi-Agent Kanban Orchestration Rule

## Core Invariant
**ALWAYS create a new Kanban board whenever there are multiple agents working together.**

## Applicability
- When orchestrating or dispatching tasks across multiple Hermes Agent profiles (`manager`, `backend`, `frontend`, `researcher`, `reviewer`).
- When coordinating multi-agent workflows, subagents, or parallel agent roles to complete complex, multi-stage software engineering or research tasks.

## Workflow Protocol
1. **Initialize a Dedicated Board**:
   - Before dispatching work to multiple agents, create a fresh, dedicated Kanban board using a descriptive slug based on the task objective:
     ```bash
     hermes kanban boards create <slug>
     hermes kanban boards switch <slug>
     ```
   - Never reuse a stale board or coordinate multiple agents without an active board.

2. **Decompose into Discrete Cards**:
   - Break the objective into well-defined, actionable tasks.
   - Each card must specify clear acceptance criteria in the body and designate the responsible agent (`backend`, `frontend`, `researcher`, `reviewer`, etc.):
     ```bash
     hermes kanban create --title "<title>" --body "<acceptance criteria>" --assignee <agent>
     ```

3. **Link Task Dependencies**:
   - Establish explicit dependency links (e.g., frontend components blocked by backend API schema contracts, code changes blocked by reviewer audits) using `kanban_link` or `hermes kanban link <parent_id> <child_id>`.

4. **Synchronize Lifecycle Transitions**:
   - Track progress across stages: `todo` → `in_progress` → `review` → `done`.
   - Ensure deliverables and verification proofs (test runs, command outputs, diffs) are attached to task records before marking them complete.

5. **User Visibility**:
   - Always inform the user of the created Kanban board slug and summarize the task progression.
