---
name: excalidraw-diagram
description: Create or edit editable Excalidraw SVG/PNG diagrams, visually validate them, and set up the local exporter when needed. Use for workflows, architectures, concepts, or diagrams integrated into presentations, documents, sites, and brand systems.
---

# Excalidraw Diagram

Create diagrams that make a visual argument: structure, scale, position, and
connections should communicate the idea even before the labels are read.

## Output Contract

Deliver `<name>.excalidraw.svg` by default or `<name>.excalidraw.png` when the
user requests PNG. Both outputs must contain the embedded scene and reopen as
editable drawings in Excalidraw and the Excalidraw VS Code extension.

Keep a `.excalidraw` JSON working file while designing or editing. Export it
with the bundled script; changing a JSON filename to an image suffix is not an
export.

## Route the Task

1. Determine whether the task creates a new diagram or edits an existing one.
   For edits, preserve content and style that the user did not ask to change.
2. Resolve the diagram theme before layout:
   - standalone diagram or unknown destination: read
     [references/default-theme.md](references/default-theme.md);
   - known presentation, document, site, or brand system: inspect that artifact
     and read [references/theme-adaptation.md](references/theme-adaptation.md).
   Validate any resolved theme sidecar with `scripts/validate_theme.mjs` before
   applying it.
3. For visual patterns, evidence artifacts, hierarchy, layout, and the quality
   bar, read [references/design-guidance.md](references/design-guidance.md).
4. Before authoring or repairing scene JSON, read
   [references/json-schema.md](references/json-schema.md). Use
   [references/element-templates.md](references/element-templates.md) when
   concrete element shapes or bindings are useful.

Installed skill files are immutable inputs. Apply resolved theme values only
to the working scene. For a multi-diagram artifact, an artifact-local temporary
`diagram-theme.json` may preserve consistency; do not place it in this skill or
deliver it unless it is useful to the user.

## Design Workflow

### 1. Establish the argument

Write down the intended audience, the conclusion the viewer should reach, the
core flow or relationship, and the required output format. Choose conceptual
depth for mental models and technical depth for real systems.

For technical diagrams, verify the actual specifications, event names, API
shapes, or data formats before drawing. Include concrete evidence such as a
payload, code fragment, UI state, or real sequence when it helps the diagram
teach rather than merely label.

### 2. Map meaning to visual structure

Choose patterns that mirror behavior: fan-out for one-to-many, convergence for
aggregation, a tree for hierarchy, a timeline for sequence, a cycle for
feedback, an assembly line for transformation, and side-by-side structures for
comparison. Trace the intended eye path before assigning coordinates.

Use typography and lines for structure. Add a container when it represents a
real entity, groups related content, carries semantic shape meaning, or anchors
a connection. Distinguish major concepts through pattern and hierarchy instead
of repeating uniform cards.

### 3. Build or edit the scene

Use descriptive unique IDs and stable seeds. In a large scene, work by coherent
visual sections so each edit remains reviewable; update both sides of bindings
when adding cross-section arrows. Keep all resolved theme values consistent
across the scene.

Text elements contain only the visible text in `text` and `originalText`.
Relationships must be shown with arrows or structural lines, not proximity
alone. Use stroke widths `1`, `2`, or `3`, and keep opacity at `100`; use theme
colors and stroke styles for hierarchy.

### 4. Export and inspect

From the directory containing this `SKILL.md`, run:

```bash
node scripts/export_excalidraw.mjs <path-to-scene.excalidraw> \
  --preview /tmp/excalidraw-preview.png
```

This creates the default editable SVG. For PNG:

```bash
node scripts/export_excalidraw.mjs <path-to-scene.excalidraw> --format png
```

`--output` sets an explicit destination and `--scale 1|2|3` controls PNG
resolution. If setup is missing, run the single command printed by the exporter
(the skill's `scripts/setup_renderer.sh`) and retry.

View the PNG preview or exported PNG. Compare it with the intended argument and
check text fit, unintended overlaps, ambiguous labels, arrow routing, spacing,
legibility, and composition. Fix the working scene and repeat until the preview
passes every applicable check.

### 5. Deliver

Confirm that the exporter completed embedded-scene verification. Deliver the
editable image requested by the user. Keep the working JSON and any temporary
theme sidecar private unless the user asks for them or they materially help
future editing.

## Self-update

When the user explicitly asks to update this skill, run the public installer
for the current agent. Use `--codex` in Codex or `--claude` in Claude Code:

```bash
# Codex
curl -fsSL https://raw.githubusercontent.com/alexxlz7r/excalidraw-diagram-skill/main/install.sh | bash -s -- --codex

# Claude Code
curl -fsSL https://raw.githubusercontent.com/alexxlz7r/excalidraw-diagram-skill/main/install.sh | bash -s -- --claude
```

The installer refreshes the marketplace plugin and rebuilds its renderer. After
it succeeds, tell the user to start a new Codex thread or run `/reload-plugins`
in Claude Code.

## Completion Criteria

- The visual structure communicates the intended argument without relying on a
  grid of labels.
- Technical claims and evidence are accurate at the level shown.
- The diagram uses one resolved theme with compliant text contrast.
- Text is readable and unclipped; spacing is balanced; arrows connect cleanly.
- The output suffix is `.excalidraw.svg` or `.excalidraw.png` as requested.
- The exported image contains a scene that the exporter successfully reloaded.
