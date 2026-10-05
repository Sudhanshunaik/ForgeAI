#!/usr/bin/env python3
"""
Generate an Excalidraw diagram for Hermes Agent Architecture.
Follows the official Excalidraw v2 format and Hermes excalidraw skill specifications.
"""

import json
import os
import sys

def make_element_id(prefix, idx):
    return f"{prefix}_{idx}"

class ExcalidrawBuilder:
    def __init__(self, bg_color="#ffffff"):
        self.elements = []
        self.bg_color = bg_color
        self._id_counter = 0

    def next_id(self, prefix="el"):
        self._id_counter += 1
        return f"{prefix}_{self._id_counter}"

    def add_standalone_text(self, text, x, y, font_size=20, color="#1e1e1e", font_family=1, text_align="left"):
        el_id = self.next_id("txt")
        width = len(text) * font_size * 0.6
        height = font_size * 1.3
        elem = {
            "type": "text",
            "id": el_id,
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "text": text,
            "fontSize": font_size,
            "fontFamily": font_family,
            "strokeColor": color,
            "textAlign": text_align,
            "verticalAlign": "top",
            "originalText": text,
            "autoResize": True,
            "roughness": 1,
            "opacity": 100
        }
        self.elements.append(elem)
        return el_id

    def add_zone(self, zone_id, label, x, y, w, h, bg_color, stroke_color, opacity=30, label_color=None):
        """A background grouped zone with a top-left label."""
        zone_rect = {
            "type": "rectangle",
            "id": zone_id,
            "x": x,
            "y": y,
            "width": w,
            "height": h,
            "roundness": {"type": 3},
            "backgroundColor": bg_color,
            "fillStyle": "solid",
            "strokeColor": stroke_color,
            "strokeWidth": 2,
            "strokeStyle": "dashed",
            "roughness": 1,
            "opacity": opacity
        }
        self.elements.append(zone_rect)

        # Label for the zone
        lbl_col = label_color or stroke_color
        lbl_id = self.add_standalone_text(label, x + 20, y + 16, font_size=20, color=lbl_col)
        return zone_id

    def add_box(self, box_id, text, x, y, w, h, bg_color="#ffffff", stroke_color="#1e1e1e",
                font_size=16, text_color="#1e1e1e", stroke_width=2, stroke_style="solid",
                roundness=3, fill_style="solid", opacity=100):
        """A container rectangle with bound text."""
        txt_id = f"t_{box_id}"
        box = {
            "type": "rectangle",
            "id": box_id,
            "x": x,
            "y": y,
            "width": w,
            "height": h,
            "roundness": {"type": roundness} if roundness else None,
            "backgroundColor": bg_color,
            "fillStyle": fill_style,
            "strokeColor": stroke_color,
            "strokeWidth": stroke_width,
            "strokeStyle": stroke_style,
            "roughness": 1,
            "opacity": opacity,
            "boundElements": [
                {"id": txt_id, "type": "text"}
            ]
        }
        self.elements.append(box)

        txt_elem = {
            "type": "text",
            "id": txt_id,
            "x": x + 10,
            "y": y + (h - (len(text.split("\n")) * font_size * 1.3)) / 2,
            "width": w - 20,
            "height": len(text.split("\n")) * font_size * 1.3,
            "text": text,
            "fontSize": font_size,
            "fontFamily": 1,
            "strokeColor": text_color,
            "textAlign": "center",
            "verticalAlign": "middle",
            "containerId": box_id,
            "originalText": text,
            "autoResize": True,
            "roughness": 1,
            "opacity": 100
        }
        self.elements.append(txt_elem)
        return box_id

    def add_arrow(self, arrow_id, start_box_id, end_box_id, start_point, end_point,
                  label=None, color="#1e1e1e", stroke_width=2, stroke_style="solid",
                  start_fixed=(1, 0.5), end_fixed=(0, 0.5)):
        """
        Connect start_point to end_point.
        start_point: (x1, y1)
        end_point: (x2, y2)
        """
        x1, y1 = start_point
        x2, y2 = end_point
        dx = x2 - x1
        dy = y2 - y1

        arrow = {
            "type": "arrow",
            "id": arrow_id,
            "x": x1,
            "y": y1,
            "width": abs(dx),
            "height": abs(dy),
            "points": [[0, 0], [dx, dy]],
            "strokeColor": color,
            "strokeWidth": stroke_width,
            "strokeStyle": stroke_style,
            "roughness": 1,
            "opacity": 100,
            "endArrowhead": "arrow"
        }

        if start_box_id:
            arrow["startBinding"] = {
                "elementId": start_box_id,
                "fixedPoint": list(start_fixed)
            }
            # Also register arrow in start_box's boundElements
            for el in self.elements:
                if el["id"] == start_box_id:
                    el.setdefault("boundElements", []).append({"id": arrow_id, "type": "arrow"})
                    break

        if end_box_id:
            arrow["endBinding"] = {
                "elementId": end_box_id,
                "fixedPoint": list(end_fixed)
            }
            for el in self.elements:
                if el["id"] == end_box_id:
                    el.setdefault("boundElements", []).append({"id": arrow_id, "type": "arrow"})
                    break

        if label:
            txt_id = f"t_{arrow_id}"
            arrow["boundElements"] = arrow.get("boundElements", []) + [{"id": txt_id, "type": "text"}]
            self.elements.append(arrow)

            # Labeled arrow container text
            lbl_elem = {
                "type": "text",
                "id": txt_id,
                "x": x1 + dx / 2 - (len(label) * 14 * 0.5) / 2,
                "y": y1 + dy / 2 - 12,
                "width": len(label) * 14 * 0.6,
                "height": 22,
                "text": label,
                "fontSize": 14,
                "fontFamily": 1,
                "strokeColor": color,
                "textAlign": "center",
                "verticalAlign": "middle",
                "containerId": arrow_id,
                "originalText": label,
                "autoResize": True,
                "roughness": 1,
                "opacity": 100
            }
            self.elements.append(lbl_elem)
        else:
            self.elements.append(arrow)

        return arrow_id

    def to_dict(self):
        return {
            "type": "excalidraw",
            "version": 2,
            "source": "hermes-agent",
            "elements": self.elements,
            "appState": {
                "viewBackgroundColor": self.bg_color,
                "gridSize": 20
            }
        }

def build_diagram():
    b = ExcalidrawBuilder(bg_color="#f8f9fa")

    # ==========================================
    # 0. HEADER & TITLE BANNER
    # ==========================================
    b.add_standalone_text("HERMES AGENT: SYSTEM ARCHITECTURE & RUNTIME", 60, 40, font_size=32, color="#0f172a")
    b.add_standalone_text("Self-Improving AI Agent by Nous Research | Narrow Waist Core - Infinite Capability at Edges", 65, 85, font_size=18, color="#475569")
    
    # Key Invariants Badges (top right)
    inv_text = "Core Invariants: 1. Prompt Caching is Sacred  |  2. Core is a Narrow Waist  |  3. Profiles are Isolated Islands"
    b.add_standalone_text(inv_text, 820, 45, font_size=16, color="#0369a1")

    # ==========================================
    # 1. ZONE 1: ENTRY POINTS & USER SURFACES
    # ==========================================
    b.add_zone("z_entry", "ENTRY POINTS & USER INTERFACES", 60, 130, 2360, 220,
               bg_color="#e0f2fe", stroke_color="#0284c7", opacity=25)

    # CLI & REPL
    b.add_box("ep_cli", "Terminal CLI & REPL\n(cli.py / hermes_cli)\nPrompt Toolkit, multiline, /slash", 
              90, 180, 430, 140, bg_color="#bae6fd", stroke_color="#0284c7", font_size=16)

    # Messaging Gateway
    b.add_box("ep_gateway", "Messaging Gateway\n(gateway/run.py)\nTelegram, Discord, Slack, WhatsApp,\nSignal, Matrix, Teams (~20 Platforms)", 
              550, 180, 450, 140, bg_color="#bae6fd", stroke_color="#0284c7", font_size=16)

    # Desktop & Web UI
    b.add_box("ep_desktop", "Desktop App & Web UI\n(apps/desktop / web / ui-tui)\nElectron, Ink React TUI, Web SPA,\ntui_gateway JSON-RPC backend", 
              1030, 180, 430, 140, bg_color="#bae6fd", stroke_color="#0284c7", font_size=16)

    # ACP Server
    b.add_box("ep_acp", "IDE Agent Protocol\n(acp_adapter/)\nACP server for VS Code,\nZed, & JetBrains IDEs", 
              1490, 180, 430, 140, bg_color="#bae6fd", stroke_color="#0284c7", font_size=16)

    # Cron & Batch
    b.add_box("ep_cron", "Cron & Batch Runner\n(cron/ & batch_runner.py)\nNatural language cron jobs,\nplatform delivery, offline trajectories", 
              1950, 180, 440, 140, bg_color="#bae6fd", stroke_color="#0284c7", font_size=16)


    # ==========================================
    # 2. ZONE 2: GATEWAY & MULTI-PROFILE ORCHESTRATION
    # ==========================================
    b.add_zone("z_gateway", "GATEWAY & SESSION ORCHESTRATION", 60, 390, 720, 580,
               bg_color="#fef3c7", stroke_color="#d97706", opacity=25)

    b.add_box("gw_dispatch", "Message Dispatcher & Hooks\n(gateway/run_*.py, hooks.py)\nPlatform routing, DM pairing auth,\nVoice memo transcription, Mirroring",
              90, 440, 660, 110, bg_color="#fde68a", stroke_color="#d97706", font_size=16)

    b.add_box("gw_session", "Session Store & Lineage\n(gateway/session.py & hermes_state.py)\nSession lineage, turn logging,\nSQLite DB + FTS5 full-text search",
              90, 580, 660, 110, bg_color="#fde68a", stroke_color="#d97706", font_size=16)

    b.add_box("gw_profile", "Profile Runtime Scope\n(hermes_constants.py & profiles/)\nMulti-profile isolation (HERMES_HOME)\nIsolated .env, config.yaml, & SOUL.md",
              90, 720, 660, 110, bg_color="#fde68a", stroke_color="#d97706", font_size=16)

    b.add_box("gw_pairing", "Security & Pairing Barrier\nDM pairing handshake, token locks,\nrate limiting, & profile multiplexing",
              90, 860, 660, 80, bg_color="#fed7aa", stroke_color="#ea580c", font_size=15)


    # ==========================================
    # 3. ZONE 3: CORE AGENT "NARROW WAIST" (AIAgent)
    # ==========================================
    b.add_zone("z_core", "CORE AGENT ENGINE — AIAgent (NARROW WAIST)", 820, 390, 940, 580,
               bg_color="#f3e8ff", stroke_color="#7e22ce", opacity=30)

    # AIAgent facade & loop
    b.add_box("core_loop", "AIAgent Facade & Synchronous Turn Loop\n(run_agent.py, agent/conversation_loop.py, agent/turn_*.py)\nTurns, Tool Call Parsing, Retries, Role Alternation Guard",
              850, 440, 880, 100, bg_color="#e9d5ff", stroke_color="#7e22ce", font_size=17)

    # System prompt builder
    b.add_box("core_prompt", "System Prompt Builder\n(agent/prompt_builder.py)\nAssembles: Persona (SOUL.md),\nUser facts, Active skills catalog,\nCore + Session tool definitions",
              850, 570, 420, 120, bg_color="#e9d5ff", stroke_color="#7e22ce", font_size=15)

    # Prompt caching
    b.add_box("core_cache", "Prompt Caching Manager\n(agent/prompt_caching.py)\nByte-stable prefix caching (Anthropic)\nDeferred cache invalidation (next turn)\nPrevents cache busts & cost spikes",
              1300, 570, 430, 120, bg_color="#e9d5ff", stroke_color="#7e22ce", font_size=15)

    # Context compressor
    b.add_box("core_compress", "Context Engine & Compressor\n(agent/context_engine.py)\nPluggable ContextEngine ABC,\nlossy summarization near limit,\nprotects context window headroom",
              850, 720, 420, 120, bg_color="#e9d5ff", stroke_color="#7e22ce", font_size=15)

    # Runtime provider resolver
    b.add_box("core_provider", "Runtime Provider Resolution\n(hermes_cli/runtime_provider.py)\nMaps configured model to 3 API Modes:\nchat_completions | codex_responses |\nanthropic_messages",
              1300, 720, 430, 120, bg_color="#e9d5ff", stroke_color="#7e22ce", font_size=15)

    # Trajectory & Turn Integrity
    b.add_box("core_guard", "Turn Integrity & Alternation Guard\nStrict role alternation (User -> Assistant -> Tool) | Auxiliary LLM Client (vision / summarization)",
              850, 870, 880, 70, bg_color="#ddd6fe", stroke_color="#6b21a8", font_size=15)


    # ==========================================
    # 4. ZONE 4: LLM PROVIDERS & NOUS PORTAL
    # ==========================================
    b.add_zone("z_providers", "MODEL PROVIDERS & NOUS PORTAL", 1800, 390, 620, 580,
               bg_color="#ffedd5", stroke_color="#ea580c", opacity=25)

    # Nous Portal
    b.add_box("p_portal", "Nous Portal (Unified Subscription)\n(portal.nousresearch.com)\n- 300+ LLM models with zero key setup\n- Tool Gateway: FAL image gen, OpenAI TTS,\n  Browser Use cloud, Web search routed natively",
              1830, 440, 560, 130, bg_color="#fed7aa", stroke_color="#ea580c", font_size=15)

    # External Providers
    b.add_box("p_external", "Direct Provider Integrations\n(hermes model / config.yaml)\n- Anthropic (Claude 3.7 / 3.5 Sonnet)\n- OpenAI (GPT-4o, o1, o3-mini)\n- OpenRouter (all hosted models)\n- DeepSeek, Together, Groq, Mistral\n- Local / Self-hosted: Ollama, vLLM",
              1830, 600, 560, 190, bg_color="#ffedd5", stroke_color="#ea580c", font_size=15)

    # Auxiliary sidecar
    b.add_box("p_aux", "Auxiliary Client (agent/auxiliary_client.py)\nSide tasks: Vision evaluation, context compression,\nembedding creation without polluting main prompt",
              1830, 820, 560, 120, bg_color="#fed7aa", stroke_color="#ea580c", font_size=15)


    # ==========================================
    # 5. ZONE 5: TOOL ORCHESTRATION & ENVIRONMENTS
    # ==========================================
    b.add_zone("z_tools", "TOOL ORCHESTRATION & EXECUTION ENVIRONMENTS (CAPABILITY AT EDGES)", 60, 1010, 1500, 740,
               bg_color="#ecfdf5", stroke_color="#059669", opacity=25)

    # Tool orchestrator & registry
    b.add_box("to_registry", "Tool Orchestrator & Toolsets\n(model_tools.py & toolsets.py)\n- Core Tools (_HERMES_CORE_TOOLS)\n- Session-gated toolsets (desktop_ui, project)\n- Dynamic discovery & check_fn gating (70+ tools)",
              90, 1060, 680, 110, bg_color="#a7f3d0", stroke_color="#059669", font_size=15)

    # Approval and safety
    b.add_box("to_approval", "Command Approval & Safety Gate\n(tools/approval.py)\n- Dangerous pattern detection (rm -rf, dd...)\n- Interactive CLI / Platform confirm prompts\n- Sandbox isolation & permission allowlists",
              800, 1060, 730, 110, bg_color="#fecdd3", stroke_color="#e11d48", font_size=15)

    # Builtin tools row
    b.add_standalone_text("BUILT-IN TOOL CAPABILITIES (Model Tools):", 90, 1195, font_size=16, color="#047857")

    b.add_box("t_term", "Terminal Tool\n(terminal_tool.py)\nShell execution,\nbackground tasks,\nPTY & ANSI strip", 
              90, 1230, 220, 120, bg_color="#d1fae5", stroke_color="#059669", font_size=14)

    b.add_box("t_file", "File System\n(file_tools.py)\nread_file, write_file,\npatch, search_files,\nripgrep integration", 
              330, 1230, 220, 120, bg_color="#d1fae5", stroke_color="#059669", font_size=14)

    b.add_box("t_browser", "Browser Automation\n(browser_tool.py)\n5 backends, Playwright,\nheadless DOM actions,\nscreenshot capture", 
              570, 1230, 230, 120, bg_color="#d1fae5", stroke_color="#059669", font_size=14)

    b.add_box("t_web", "Web Search\n(web_tools.py)\nweb_search, extract,\nNous Tool Gateway,\nDuckDuckGo / Tavily", 
              820, 1230, 220, 120, bg_color="#d1fae5", stroke_color="#059669", font_size=14)

    b.add_box("t_mcp", "MCP Dynamic Client\n(tools/mcp_tool.py)\nModel Context Protocol\nstdio/SSE servers,\nzero core schema cost", 
              1060, 1230, 220, 120, bg_color="#d1fae5", stroke_color="#059669", font_size=14)

    b.add_box("t_subagent", "Subagent Delegate\n(delegate_tool.py)\nSpawn isolated child\nagents for parallel\nmulti-step workflows", 
              1300, 1230, 230, 120, bg_color="#d1fae5", stroke_color="#059669", font_size=14)

    # Environments row
    b.add_standalone_text("7 TERMINAL EXECUTION BACKENDS (tools/environments/):", 90, 1375, font_size=16, color="#047857")

    b.add_box("env_local", "Local OS Execution\n(LocalEnvironment)\nDirect host shell,\nprocess management,\ninteractive PTY", 
              90, 1410, 330, 110, bg_color="#ccfbf1", stroke_color="#0d9488", font_size=15)

    b.add_box("env_docker", "Docker / Singularity\n(DockerEnvironment)\nContainerized sandbox,\nfilesystem isolation,\nsecure reproducible run", 
              440, 1410, 330, 110, bg_color="#ccfbf1", stroke_color="#0d9488", font_size=15)

    b.add_box("env_ssh", "Remote SSH\n(SSHEnvironment)\nRun commands on remote\ncloud VMs, edge nodes,\nor GPU clusters", 
              790, 1410, 340, 110, bg_color="#ccfbf1", stroke_color="#0d9488", font_size=15)

    b.add_box("env_serverless", "Modal & Daytona & Vercel\n(Serverless Hibernation)\nHibernates when idle — $0 cost\nWakes on demand with full state", 
              1150, 1410, 380, 110, bg_color="#ccfbf1", stroke_color="#0d9488", font_size=15)

    b.add_box("env_sec", "Credential Isolation & Env Passthrough (tools/credential_files.py & env_passthrough.py)\nSafely forwards selected API keys into isolated sandboxes without leaking full host environment",
              90, 1550, 1440, 70, bg_color="#99f6e4", stroke_color="#0f766e", font_size=15)

    b.add_box("env_plugins", "Extensibility Plugins Ecosystem (plugins/)\nmemory/ | context_engine/ | platforms/ | model-providers/ | kanban/ | image_gen/",
              90, 1640, 1440, 80, bg_color="#a7f3d0", stroke_color="#047857", font_size=15)


    # ==========================================
    # 6. ZONE 6: CLOSED LEARNING & MEMORY LOOP
    # ==========================================
    b.add_zone("z_learning", "CLOSED LEARNING & PERSISTENCE LOOP", 1600, 1010, 820, 740,
               bg_color="#e0e7ff", stroke_color="#4338ca", opacity=25)

    # Memory manager
    b.add_box("m_memory", "Persistent Memory System\n(agent/memory_manager.py)\n- Curated MEMORY.md & USER.md\n- Autonomous memory nudges\n- Dialectic user modeling (Honcho)\n- Profile-scoped memory banks",
              1630, 1060, 760, 150, bg_color="#c7d2fe", stroke_color="#4338ca", font_size=16)

    # Skills system
    b.add_box("m_skills", "Autonomous Skills System\n(skills/ & hermes_cli/skills_hub.py)\n- Autonomous skill creation after complex tasks\n- Skills self-improve through practical usage\n- Compatible with agentskills.io open standard\n- Skills Hub discovery & /skills slash commands",
              1630, 1240, 760, 160, bg_color="#c7d2fe", stroke_color="#4338ca", font_size=16)

    # Cross-session recall
    b.add_box("m_recall", "Cross-Session Recall & FTS5 Search\n(hermes_state.py & hermes_state_*.py)\n- SQLite FTS5 full-text indexing of past turns\n- Semantic & keyword conversation recall\n- LLM cross-session summarization",
              1630, 1430, 760, 140, bg_color="#c7d2fe", stroke_color="#4338ca", font_size=16)

    # Feedback loop banner
    b.add_box("m_loop", "Continuous Self-Improvement Loop\nSkills & Memories automatically feed into the System Prompt Builder\nfor future sessions, creating a cumulative learning flywheel",
              1630, 1600, 760, 120, bg_color="#a5b4fc", stroke_color="#3730a3", font_size=16)


    # ==========================================
    # 7. ARROWS & DATA FLOW
    # ==========================================
    # Flow 1: Entry Points to AIAgent / Gateway
    b.add_arrow("a_ep_cli", "ep_cli", "gw_dispatch", (305, 320), (305, 440),
                label="Command / Input", color="#0284c7", start_fixed=(0.5, 1), end_fixed=(0.33, 0))

    b.add_arrow("a_ep_gw", "ep_gateway", "gw_dispatch", (775, 320), (520, 440),
                label="Message Event", color="#0284c7", start_fixed=(0.5, 1), end_fixed=(0.65, 0))

    b.add_arrow("a_ep_desk", "ep_desktop", "core_loop", (1245, 320), (1245, 440),
                label="JSON-RPC Request", color="#7e22ce", start_fixed=(0.5, 1), end_fixed=(0.45, 0))

    b.add_arrow("a_ep_acp", "ep_acp", "core_loop", (1705, 320), (1450, 440),
                label="ACP Protocol", color="#7e22ce", start_fixed=(0.5, 1), end_fixed=(0.7, 0))

    b.add_arrow("a_gw_to_core", "gw_dispatch", "core_loop", (750, 490), (850, 490),
                label="Spawn AIAgent", color="#d97706", start_fixed=(1, 0.45), end_fixed=(0, 0.45))

    # Flow 2: Core Prompt & Caching to Turn Loop
    b.add_arrow("a_pr_to_loop", "core_prompt", "core_loop", (1060, 570), (1060, 540),
                label="System Prompt", color="#7e22ce", start_fixed=(0.5, 0), end_fixed=(0.24, 1))

    b.add_arrow("a_ca_to_loop", "core_cache", "core_loop", (1515, 570), (1515, 540),
                label="Cached Prefix", color="#7e22ce", start_fixed=(0.5, 0), end_fixed=(0.76, 1))

    # Flow 3: AIAgent to Provider Resolution and Models
    b.add_arrow("a_core_prov", "core_loop", "core_provider", (1550, 540), (1550, 720),
                label="Resolve API Mode", color="#7e22ce", start_fixed=(0.8, 1), end_fixed=(0.6, 0))

    b.add_arrow("a_prov_portal", "core_provider", "p_portal", (1730, 750), (1830, 510),
                label="Portal API", color="#ea580c", start_fixed=(1, 0.25), end_fixed=(0, 0.5))

    b.add_arrow("a_prov_ext", "core_provider", "p_external", (1730, 780), (1830, 700),
                label="LLM Request", color="#ea580c", start_fixed=(1, 0.5), end_fixed=(0, 0.5))

    # Flow 4: Models to AIAgent (Tool Calls)
    b.add_arrow("a_llm_return", "p_external", "core_loop", (1830, 630), (1730, 470),
                label="Tool Calls / Text", color="#ea580c", stroke_style="dashed", start_fixed=(0, 0.15), end_fixed=(1, 0.3))

    # Flow 5: AIAgent to Tool Orchestration
    b.add_arrow("a_loop_to_to", "core_loop", "to_registry", (950, 540), (430, 1060),
                label="Execute Tool Call", color="#059669", start_fixed=(0.11, 1), end_fixed=(0.5, 0))

    b.add_arrow("a_to_approval", "to_registry", "to_approval", (770, 1115), (800, 1115),
                label="Safety Check", color="#e11d48", start_fixed=(1, 0.5), end_fixed=(0, 0.5))

    # Flow 6: Approval to Tools Execution
    b.add_arrow("a_app_to_term", "to_approval", "t_term", (850, 1170), (200, 1230),
                label="Approved", color="#059669", start_fixed=(0.07, 1), end_fixed=(0.5, 0))

    b.add_arrow("a_app_to_mcp", "to_approval", "t_mcp", (1165, 1170), (1170, 1230),
                label="Dispatch", color="#059669", start_fixed=(0.5, 1), end_fixed=(0.5, 0))

    # Flow 7: Tools to Environments
    b.add_arrow("a_term_to_env", "t_term", "env_local", (200, 1350), (255, 1410),
                label="Exec Target", color="#0d9488", start_fixed=(0.5, 1), end_fixed=(0.5, 0))

    b.add_arrow("a_term_to_modal", "t_term", "env_serverless", (310, 1340), (1200, 1410),
                label="Hibernate/Wake", color="#0d9488", start_fixed=(1, 0.9), end_fixed=(0.15, 0))

    # Flow 8: Tool Output back to AIAgent Turn Loop
    b.add_arrow("a_tool_result", "to_approval", "core_loop", (1250, 1060), (1350, 540),
                label="Tool Return Data", color="#059669", stroke_style="dashed", start_fixed=(0.6, 0), end_fixed=(0.57, 1))

    # Flow 9: AIAgent to Persistence & Learning Loop
    b.add_arrow("a_loop_session", "core_loop", "gw_session", (850, 520), (750, 610),
                label="Persist Turn", color="#d97706", start_fixed=(0, 0.8), end_fixed=(1, 0.27))

    b.add_arrow("a_loop_learn", "core_loop", "m_memory", (1730, 520), (1800, 1060),
                label="Post-Task Nudge", color="#4338ca", start_fixed=(1, 0.8), end_fixed=(0.22, 0))

    b.add_arrow("a_loop_skill", "core_loop", "m_skills", (1680, 540), (1950, 1240),
                label="Autonomous Skill Creation", color="#4338ca", start_fixed=(0.94, 1), end_fixed=(0.42, 0))

    # Flow 10: Learning Loop Feedback to System Prompt Builder (Next Session)
    b.add_arrow("a_flywheel", "m_loop", "core_prompt", (1630, 1660), (850, 630),
                label="Cumulative Learning Flywheel (Fed to Next System Prompt)", color="#3730a3", stroke_width=3,
                start_fixed=(0, 0.5), end_fixed=(0, 0.5))

    return b

def main():
    b = build_diagram()
    diag_dict = b.to_dict()

    out_file = "/home/sudhanshunaik/Projects/Projects/Rescape Hermes/hermes-agent/hermes-agent-architecture.excalidraw"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(diag_dict, f, indent=2)

    print(f"Successfully generated Excalidraw diagram with {len(b.elements)} elements at:")
    print(out_file)

if __name__ == "__main__":
    main()
