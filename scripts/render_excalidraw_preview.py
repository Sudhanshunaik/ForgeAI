#!/usr/bin/env python3
"""
Convert an Excalidraw JSON file to a standalone SVG and HTML viewer.
"""

import json
import html
import math

def excalidraw_to_svg(data):
    elements = data.get("elements", [])
    if not elements:
        return "<svg></svg>"

    # Compute bounding box
    min_x = min(e.get("x", 0) for e in elements) - 50
    min_y = min(e.get("y", 0) for e in elements) - 50
    max_x = max(e.get("x", 0) + e.get("width", 0) for e in elements) + 50
    max_y = max(e.get("y", 0) + e.get("height", 0) for e in elements) + 50

    width = max_x - min_x
    height = max_y - min_y

    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{min_x} {min_y} {width} {height}" width="100%" height="100%" style="background-color: {data.get("appState", {}).get("viewBackgroundColor", "#ffffff")}; font-family: \'Virgil\', \'Segoe UI\', system-ui, -apple-system, sans-serif;">',
        '<defs>',
        '  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">',
        '    <polygon points="0 0, 10 3.5, 0 7" fill="#1e1e1e" />',
        '  </marker>',
        '  <marker id="arrowhead-blue" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">',
        '    <polygon points="0 0, 10 3.5, 0 7" fill="#0284c7" />',
        '  </marker>',
        '  <marker id="arrowhead-purple" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">',
        '    <polygon points="0 0, 10 3.5, 0 7" fill="#7e22ce" />',
        '  </marker>',
        '  <marker id="arrowhead-orange" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">',
        '    <polygon points="0 0, 10 3.5, 0 7" fill="#ea580c" />',
        '  </marker>',
        '  <marker id="arrowhead-green" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">',
        '    <polygon points="0 0, 10 3.5, 0 7" fill="#059669" />',
        '  </marker>',
        '  <marker id="arrowhead-teal" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">',
        '    <polygon points="0 0, 10 3.5, 0 7" fill="#0d9488" />',
        '  </marker>',
        '  <marker id="arrowhead-indigo" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">',
        '    <polygon points="0 0, 10 3.5, 0 7" fill="#3730a3" />',
        '  </marker>',
        '  <marker id="arrowhead-red" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">',
        '    <polygon points="0 0, 10 3.5, 0 7" fill="#e11d48" />',
        '  </marker>',
        '  <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">',
        '    <feDropShadow dx="2" dy="3" stdDeviation="3" flood-opacity="0.08"/>',
        '  </filter>',
        '</defs>'
    ]

    # Map container to bound text
    bound_texts = {}
    for e in elements:
        if e.get("type") == "text" and e.get("containerId"):
            bound_texts[e["containerId"]] = e

    # Render elements in z-order
    for e in elements:
        el_type = e.get("type")
        x = e.get("x", 0)
        y = e.get("y", 0)
        w = e.get("width", 0)
        h = e.get("height", 0)
        stroke = e.get("strokeColor", "#1e1e1e")
        bg = e.get("backgroundColor", "transparent")
        sw = e.get("strokeWidth", 2)
        style = e.get("strokeStyle", "solid")
        opacity = e.get("opacity", 100) / 100.0
        dash = 'stroke-dasharray="8 6"' if style == "dashed" else ('stroke-dasharray="3 3"' if style == "dotted" else "")

        if el_type == "rectangle":
            rx = 8 if e.get("roundness") else 0
            is_zone = e.get("id", "").startswith("z_")
            filter_attr = 'filter="url(#shadow)"' if not is_zone else ''
            svg_parts.append(
                f'<rect id="{e["id"]}" x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{bg}" stroke="{stroke}" stroke-width="{sw}" {dash} opacity="{opacity}" {filter_attr} />'
            )

        elif el_type == "arrow":
            points = e.get("points", [[0, 0], [w, h]])
            pts_str = " ".join(f"{x + pt[0]},{y + pt[1]}" for pt in points)
            marker_id = "arrowhead"
            if "#0284c7" in stroke: marker_id = "arrowhead-blue"
            elif "#7e22ce" in stroke: marker_id = "arrowhead-purple"
            elif "#ea580c" in stroke: marker_id = "arrowhead-orange"
            elif "#059669" in stroke: marker_id = "arrowhead-green"
            elif "#0d9488" in stroke: marker_id = "arrowhead-teal"
            elif "#3730a3" in stroke: marker_id = "arrowhead-indigo"
            elif "#e11d48" in stroke: marker_id = "arrowhead-red"

            marker_attr = f'marker-end="url(#{marker_id})"' if e.get("endArrowhead") else ''
            svg_parts.append(
                f'<polyline id="{e["id"]}" points="{pts_str}" fill="none" stroke="{stroke}" stroke-width="{sw}" {dash} opacity="{opacity}" {marker_attr} />'
            )

        elif el_type == "text":
            raw_text = e.get("text", "")
            font_size = e.get("fontSize", 16)
            color = e.get("strokeColor", "#1e1e1e")
            lines = raw_text.split("\n")
            line_height = font_size * 1.35
            text_align = e.get("textAlign", "left")

            if e.get("containerId"):
                # Centered in container
                cid = e["containerId"]
                container = next((c for c in elements if c["id"] == cid), None)
                if container:
                    cx = container["x"] + container["width"] / 2
                    total_h = len(lines) * line_height
                    start_y = container["y"] + (container["height"] - total_h) / 2 + font_size * 0.85
                    svg_parts.append(f'<text font-size="{font_size}" fill="{color}" text-anchor="middle" font-weight="500">')
                    for i, l in enumerate(lines):
                        bold = ' font-weight="700"' if i == 0 and len(lines) > 1 else ''
                        svg_parts.append(f'<tspan x="{cx}" y="{start_y + i * line_height}"{bold}>{html.escape(l)}</tspan>')
                    svg_parts.append('</text>')
            else:
                # Standalone text
                anchor = "start" if text_align == "left" else ("middle" if text_align == "center" else "end")
                svg_parts.append(f'<text x="{x}" y="{y + font_size}" font-size="{font_size}" fill="{color}" text-anchor="{anchor}" font-weight="600">')
                for i, l in enumerate(lines):
                    svg_parts.append(f'<tspan x="{x}" y="{y + font_size + i * line_height}">{html.escape(l)}</tspan>')
                svg_parts.append('</text>')

    svg_parts.append('</svg>')
    return "\n".join(svg_parts)


def main():
    excal_file = "/home/sudhanshunaik/Projects/Projects/Rescape Hermes/hermes-agent/hermes-agent-architecture.excalidraw"
    with open(excal_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    svg_content = excalidraw_to_svg(data)

    svg_file = "/home/sudhanshunaik/Projects/Projects/Rescape Hermes/hermes-agent/hermes-agent-architecture.svg"
    with open(svg_file, "w", encoding="utf-8") as f:
        f.write(svg_content)

    html_file = "/home/sudhanshunaik/Projects/Projects/Rescape Hermes/hermes-agent/hermes-agent-architecture.html"
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hermes Agent Architecture Diagram</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Virgil&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {{
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --accent-subtle: rgba(56, 189, 248, 0.15);
      --border: #334155;
    }}
    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}
    body {{
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }}
    header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 16px;
    }}
    .title-group h1 {{
      font-size: 24px;
      font-weight: 700;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 10px;
    }}
    .title-group p {{
      color: var(--text-muted);
      font-size: 14px;
      margin-top: 4px;
    }}
    .actions {{
      display: flex;
      gap: 12px;
      align-items: center;
    }}
    .btn {{
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 500;
      font-size: 14px;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      border: 1px solid var(--border);
      transition: all 0.2s ease;
    }}
    .btn-primary {{
      background: #0284c7;
      color: white;
      border-color: #0284c7;
    }}
    .btn-primary:hover {{
      background: #0369a1;
    }}
    .btn-secondary {{
      background: var(--card-bg);
      color: var(--text);
    }}
    .btn-secondary:hover {{
      background: #334155;
    }}
    .viewer-container {{
      background: #ffffff;
      border-radius: 12px;
      border: 1px solid var(--border);
      overflow: auto;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      flex: 1;
      min-height: 750px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }}
    .viewer-container svg {{
      max-width: 100%;
      height: auto;
      display: block;
    }}
    .legend-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-top: 24px;
    }}
    .legend-card {{
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
    }}
    .legend-card h3 {{
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .dot {{
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }}
    .dot.blue {{ background: #0284c7; }}
    .dot.amber {{ background: #d97706; }}
    .dot.purple {{ background: #7e22ce; }}
    .dot.orange {{ background: #ea580c; }}
    .dot.green {{ background: #059669; }}
    .dot.indigo {{ background: #4338ca; }}
    .legend-card p {{
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.4;
    }}
  </style>
</head>
<body>
  <header>
    <div class="title-group">
      <h1>☤ Hermes Agent — Architecture & Runtime Ecosystem</h1>
      <p>Interactive Architecture Map | Open standard Excalidraw format | Built by Nous Research</p>
    </div>
    <div class="actions">
      <a href="https://excalidraw.com/#json=8ljx4EiFvfwS8c6BJGTCf,q496cOTbG6dzGBIEDeHmzg" target="_blank" class="btn btn-primary">
        ⚡ Open in Excalidraw.com
      </a>
      <a href="hermes-agent-architecture.excalidraw" download class="btn btn-secondary">
        ⬇ Download .excalidraw
      </a>
    </div>
  </header>

  <div class="viewer-container">
    {svg_content}
  </div>

  <div class="legend-grid">
    <div class="legend-card">
      <h3><span class="dot blue"></span> Surface & Entry Points</h3>
      <p>Terminal CLI, 20+ Messaging platforms (Telegram, Discord, Slack, etc.), Desktop Electron app, Ink React TUI, and IDE ACP server.</p>
    </div>
    <div class="legend-card">
      <h3><span class="dot amber"></span> Gateway & Profiles</h3>
      <p>Message dispatching, DM pairing verification, SQLite + FTS5 conversation lineage, and strict multi-profile home isolation.</p>
    </div>
    <div class="legend-card">
      <h3><span class="dot purple"></span> Narrow Waist Core (AIAgent)</h3>
      <p>Synchronous turn loop, prompt caching preservation, dynamic prompt assembly, lossy context compression, and strict role alternation.</p>
    </div>
    <div class="legend-card">
      <h3><span class="dot orange"></span> Nous Portal & Providers</h3>
      <p>Nous Portal unified key with 300+ models & tool gateway, Anthropic, OpenAI, OpenRouter, and local inference engines.</p>
    </div>
    <div class="legend-card">
      <h3><span class="dot green"></span> Tool Orchestration & Backends</h3>
      <p>7 terminal backends (Local, Docker, SSH, Modal serverless hibernation), 70+ tools, approval safety guard, and dynamic MCP client.</p>
    </div>
    <div class="legend-card">
      <h3><span class="dot indigo"></span> Closed Learning Loop</h3>
      <p>Autonomous skill creation and self-improvement during use, dialectic user modeling, and cross-session FTS5 recall flywheel.</p>
    </div>
  </div>
</body>
</html>
"""

    with open(html_file, "w", encoding="utf-8") as f:
        f.write(html_content)

    print("SVG and HTML preview successfully created:")
    print("SVG:", svg_file)
    print("HTML:", html_file)

if __name__ == "__main__":
    main()
