# Multi-Agent Kanban Orchestration Rule

## Core Invariants
1. **The Kanban board MUST be created by the Tech Lead (`tech_lead`) only.** The Engineering Manager clarifies requirements with the human (Gate 0) and dispatches the locked brief to the Tech Lead; the Manager does not create boards or developer task cards.
2. **The Tech Lead decides technical decomposition and assigns all tasks to specialized agents.**
3. **Mandatory Task Specialization Invariant:** Technical tasks on the Kanban board MUST ALWAYS be assigned directly to their specific domain specialist (`--assignee <agent>`). **NEVER assign all tasks or implementation tasks to `tech_lead`!** `tech_lead` coordinates the swarm, resolves blockers, and packages milestone gates; individual deliverables belong to the specialized engineers.

## Applicability
- When orchestrating or dispatching tasks across Sovereign AI Engineering Team profiles:
  - `manager` (Agent 1: Human Interface & Milestone Gatekeeper)
  - `tech_lead` (Agent 2: Technical Swarm Commander — Sole Board Creator & Assigner)
  - `backend` (Agent 3: APIs, Business Logic, Services)
  - `frontend` (Agent 4: UI Components, Client State, Accessibility)
  - `reviewer` (Agent 5: Adversarial Code Review, Bug Proofs)
  - `architect` (Agent 6: ADRs, OpenAPI Contracts, Blueprints)
  - `security` (Agent 7: Threat Modeling, Vulnerability Scanning)
  - `qa` (Agent 8: Edge Cases, Chaos & Mutation Testing)
  - `devops` (Agent 9: CI/CD, Canary Deployments, Rollback Config)
  - `database` (Agent 10: SQL Migrations, Lock Analysis, Indexing)
  - `docs` (Agent 11: Documentation Drift Sync)
  - `performance` (Agent 12: Bundle Size & Latency Benchmarks)
  - `researcher` (External Fact-Finding & Library Recon)

## Workflow Protocol

1. **Initialize a Dedicated Board (Tech Lead Only)**:
   - Upon receiving the brief from the Manager, the **Tech Lead** initializes the dedicated Kanban board:
     ```bash
     hermes kanban boards create <slug>
     hermes kanban boards switch <slug>
     ```
   - Only `tech_lead` creates sprint boards. Never reuse a stale board.

2. **Decompose into Discrete Specialist Cards**:
   - Break the sprint into well-defined, actionable tasks.
   - **Every card MUST designate the appropriate specialist assignee (`--assignee <agent>`).**
     ```bash
     # Gate 1: Architecture & Contract
     hermes kanban create --title "<title>" --body "<acceptance criteria>" --assignee architect

     # Gate 2: Database Migration
     hermes kanban create --title "<title>" --body "<acceptance criteria>" --assignee database

     # Gate 3: Implementation
     hermes kanban create --title "<title>" --body "<acceptance criteria>" --assignee backend
     hermes kanban create --title "<title>" --body "<acceptance criteria>" --assignee frontend

     # Gate 4: Verification & Adversarial Audit
     hermes kanban create --title "<title>" --body "<acceptance criteria>" --assignee reviewer
     hermes kanban create --title "<title>" --body "<acceptance criteria>" --assignee security
     hermes kanban create --title "<title>" --body "<acceptance criteria>" --assignee qa
     hermes kanban create --title "<title>" --body "<acceptance criteria>" --assignee performance

     # Gate 5 & Post-Deploy: Release & Documentation
     hermes kanban create --title "<title>" --body "<acceptance criteria>" --assignee devops
     hermes kanban create --title "<title>" --body "<acceptance criteria>" --assignee docs
     ```

3. **Reassign Any Misassigned Cards Immediately**:
   - If a card was created unassigned or mistakenly assigned to `tech_lead`, reassign it before work begins:
     ```bash
     hermes kanban assign <task_id> <specialist>
     ```

4. **Link Task Dependencies**:
   - Establish explicit dependency links (e.g., frontend components blocked by Gate 1 architecture contract, PR merge blocked by reviewer audits) using `hermes kanban link <parent_id> <child_id>`.

5. **Synchronize Lifecycle Transitions**:
   - Track progress across stages: `todo` → `in_progress` → `review` → `done`.
   - Ensure deliverables and verification proofs (test runs, command outputs, diffs) are attached to task records before marking them complete.

6. **User Visibility**:
   - Always inform the user of the created Kanban board slug and summarize task assignments across the specialist team.
