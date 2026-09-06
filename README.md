# Excalidraw Diagram Skill

A coding agent skill that generates beautiful and practical Excalidraw diagrams from natural language descriptions. Not just boxes-and-arrows - diagrams that **argue visually**.

Compatible with any coding agent that reads skills from a directory — Claude Code (`~/.claude/skills`), Codex (`~/.codex/skills`), OpenCode.

## What Makes This Different

- **Diagrams that argue, not display.** Every shape/group of shapes mirrors the concept it represents — fan-outs for one-to-many, timelines for sequences, convergence for aggregation. No uniform card grids.
- **Evidence artifacts.** As an example, technical diagrams include real code snippets and actual JSON payloads.
- **Built-in visual validation.** A Playwright-based render pipeline lets the agent see its own output, catch layout issues (overlapping text, misaligned arrows, unbalanced spacing), and fix them in a loop before delivering.
- **Editable image output.** The default `.excalidraw.svg` (or optional `.excalidraw.png`) embeds the full scene and opens directly in the Excalidraw VS Code extension.
- **Brand-customizable.** All colors and brand styles live in a single file (`references/color-palette.md`). Swap it out and every diagram follows your palette.

## Installation

### Claude Code (plugin, recommended)

```
/plugin marketplace add alexxlz7r/excalidraw-diagram-skill
/plugin install excalidraw-diagram@excalidraw-diagram-skill
```

Then run the renderer setup once. Ask the agent: *"Set up the excalidraw-diagram renderer."*

### Codex

```bash
git clone https://github.com/alexxlz7r/excalidraw-diagram-skill.git
cd excalidraw-diagram-skill
./install.sh                 # links into ~/.codex/skills and sets up the exporter
```

`install.sh` links only into Codex. Claude Code should use the marketplace plugin above;
installing both a Claude plugin and a manual Claude skill copy makes Claude discover the
same skill twice. The script also sets up the exporter.

## Setup

`install.sh` does this for you. To run it by hand:

```bash
cd skills/excalidraw-diagram/references
./setup_renderer.sh
```

Setup installs the pinned Python and npm dependencies, builds the local Excalidraw
browser bundle, and installs Chromium. The ~8 MB generated bundle is gitignored; it is
not downloaded by every clone. Exporting is offline after setup. To upgrade the bundle,
see `skills/excalidraw-diagram/references/vendor/BUILD.md`.

## Usage

Ask your coding agent to create a diagram:

> "Create an Excalidraw diagram showing how the AG-UI protocol streams events from an AI agent to a frontend UI"

The skill handles the rest — concept mapping, layout, export, and visual validation. It
delivers `*.excalidraw.svg` by default. Ask for PNG to receive `*.excalidraw.png` instead.

## Customize Colors

Edit `skills/excalidraw-diagram/references/color-palette.md` to match your brand. Everything else in the skill is universal design methodology.

## File Structure

```
.claude-plugin/
  plugin.json                       # Claude Code plugin manifest
  marketplace.json                  # Claude Code marketplace manifest
.codex-plugin/plugin.json           # Codex plugin manifest
install.sh                          # Codex symlink installer + exporter setup
skills/excalidraw-diagram/
  SKILL.md                          # Design methodology + workflow
  references/
    color-palette.md                # Brand colors (edit this to customize)
    element-templates.md            # JSON templates for each element type
    json-schema.md                  # Excalidraw JSON format reference
    render_excalidraw.py            # Export editable SVG/PNG + verify embedded scene
    render_template.html            # Browser export template
    pyproject.toml                  # Python dependencies (playwright)
    uv.lock                         # Locked Python dependencies
    package.json/package-lock.json  # Locked bundle build dependencies
    setup_renderer.sh               # Install dependencies and build the bundle
    vendor/entry.js                 # Source for the generated local bundle
```
