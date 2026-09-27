---
name: excalidraw-diagram
description: Create or edit editable Excalidraw SVG/PNG diagrams, visually validate them, and set up the local exporter when needed. Use for workflows, architectures, lightweight UML and software design, concepts, or diagrams integrated into presentations, documents, sites, and brand systems.
---

# Excalidraw Diagram

Create diagrams that make a visual argument: structure, scale, position, and
connections should communicate the idea even before the labels are read.

## Output Contract

Deliver `<name>.excalidraw.svg` by default or `<name>.excalidraw.png` when the
user requests PNG. Both outputs must contain the embedded scene and reopen as
editable drawings in Excalidraw and the Excalidraw VS Code extension.

Build the scene in a temporary `.excalidraw` JSON file outside the requested
destination, then export it with the bundled script. After the exporter verifies
the embedded scene, remove the temporary files created for the task. Leave one
new artifact: the requested editable SVG or PNG. Preserve a working JSON only
when the user explicitly asks for it; changing a JSON filename to an image
suffix is not an export.

## Run in a Subagent

Create and edit diagrams in a subagent. The references, scene JSON, and preview
images then stay out of the main conversation. If this session is already a
subagent started for the diagram, skip this section and do the work. Run
self-update and other small tasks in the main session.

1. In the main session, resolve everything that needs the user, because a
   subagent cannot ask questions: the delivery width, the output path and
   format, the file to edit, and an optional style choice.
2. If the host can fork the conversation, fork it. In Claude Code, call the
   Agent tool with `subagent_type: "fork"`. The fork inherits the full
   conversation, so the prompt only names the task: use this skill, the
   resolved values from step 1, and the reply format from step 4.
3. If the host has subagents but cannot fork, start a new subagent with a
   brief. The subagent sees only the brief, so include the path to this
   `SKILL.md`, the purpose and audience, the facts, names, and data from the
   conversation that the diagram shows, the source files to inspect, the
   style or theme, the resolved values from step 1, and the reply format from
   step 4.
4. Ask the subagent to reply with the path of the delivered file, a one-line
   summary, and any assumption or unresolved issue. Relay this reply to the
   user. Do not open the scene JSON or the preview in the main session.

If the host has no subagents, do the work in the current session.

A fork runs on the model of the main session. Diagram quality depends on the
model: in benchmarks, the most capable model (Opus in Claude Code) gave the
best layouts in the least time. If the main session runs a smaller model and
the diagram does not depend on the conversation, start a new subagent on the
most capable model with a brief instead of a fork.

## Route the Task

1. Determine whether the task creates a new diagram or edits an existing one.
   For edits, preserve content and style that the user did not ask to change.
   To edit a delivered `.excalidraw.svg` or `.excalidraw.png`, first get its
   scene as "Edit a delivered image" in step 3 of the design workflow tells.
2. Resolve the diagram's style and theme before layout. The user's style
   instructions take precedence over an existing scene, host theme, or built-in
   defaults. Apply the chosen style to the whole diagram: typography, shapes,
   connectors, fills, background, annotations, and legends, in every diagram
   mode. Preserve the meaning of notation such as UML arrowheads.
   - Use one of the two named styles in
     [references/styles.md](references/styles.md): `clean` (smooth, colored)
     or `sketch` (hand-drawn, ink only). Use the style that the user names. If
     the user names no style, use `clean`. Do not ask the user to choose.
   - For a style brief, visual reference, or known presentation, document, site,
     or brand system, read
     [references/theme-adaptation.md](references/theme-adaptation.md) and inspect
     the supplied material.
   - For standalone work, use
     [references/default-theme.md](references/default-theme.md) for values left
     unspecified by the request. During edits, retain unspecified styling from
     the existing scene; in a host artifact, inherit it from the host.
   Validate any resolved theme sidecar with `scripts/validate_theme.mjs` before
   applying it.
3. For visual patterns, evidence artifacts, hierarchy, layout, and the quality
   bar, read [references/design-guidance.md](references/design-guidance.md).
4. For application design diagrams involving classes, interfaces, or abstract
   classes (C/I/A badges), actors and use cases, interaction sequences, or
   control and state flows, read
   [references/application-design.md](references/application-design.md).
   Generate the scene from a spec instead of authoring coordinates by hand:

   | Diagram | Generator | Spec |
   | --- | --- | --- |
   | Type map | `scripts/type_map.mjs` | [references/type-map-spec.md](references/type-map-spec.md) |
   | Sequence | `scripts/sequence.mjs` | [references/sequence-spec.md](references/sequence-spec.md) |
   | Flow or state | `scripts/flow.mjs` | [references/flow-spec.md](references/flow-spec.md) |
   | Use-case map | `scripts/use_cases.mjs` | [references/use-case-spec.md](references/use-case-spec.md) |
   | System or service architecture | `scripts/architecture.mjs` | [references/architecture-spec.md](references/architecture-spec.md) |

   Author the scene by hand only when the argument depends on a composition
   that the generators cannot express, such as two mirrored structures.
5. Before authoring or repairing scene JSON, read
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
core flow or relationship, the required output format, and the delivery width
in pixels that the diagram will receive in its document column, slide, README,
or other destination. Inspect the destination when available; if the delivery
width is unknown, ask before laying out the scene. Treat it as the size budget
for every later decision. Choose conceptual depth for mental models and
technical depth for real systems.

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
across the scene. Choose the intended viewing width before assigning dimensions,
then fit containers to their wrapped text using the scale and density rules in
`references/design-guidance.md`. When generating scene JSON with code, import
`textWidth`, `textHeight`, or `boxFor` from `scripts/layout.mjs` instead of
reimplementing their sizing formulas.

Text elements contain only the visible text in `text` and `originalText`.
Relationships must be shown with arrows or structural lines, not proximity
alone. Use stroke widths `1`, `2`, or `3`, and keep opacity at `100`; use theme
colors and stroke styles for hierarchy.

#### Edit a delivered image

A delivered image holds its scene. Edit that scene and export it again:

1. If a generator made the diagram and its spec is available, edit the spec
   and generate the scene again. A regeneration from the spec replaces all
   edits made in the scene JSON.
2. Otherwise, extract the scene to a working file outside the destination.
   From the directory containing this `SKILL.md`, run:

   ```bash
   node scripts/extract_scene.mjs <name>.excalidraw.svg -o /tmp/<name>.excalidraw
   ```

   The script also reads `.excalidraw.png`. If it reports that the file does
   not embed a scene, build a new scene.
3. Edit the working scene.
4. If shapes moved, run `node scripts/rebind_scene.mjs /tmp/<name>.excalidraw`.
   It moves the arrows that are bound in the `"inside"` mode at both ends.
   Move the ends of other bound arrows by hand, for example arrows with the
   `"orbit"` mode from excalidraw.com or with `focus` and `gap` only.
5. Export with `--output <name>.excalidraw.svg` to replace the delivered image,
   then inspect the preview as step 4 tells.

### 4. Export and inspect

From the directory containing this `SKILL.md`, run:

```bash
node scripts/export_excalidraw.mjs <path-to-scene.excalidraw> \
  --target-width <delivery-width> \
  --preview /tmp/excalidraw-preview.png
```

This creates the default editable SVG. For PNG:

```bash
node scripts/export_excalidraw.mjs <path-to-scene.excalidraw> --format png \
  --target-width <delivery-width>
```

`--output` sets an explicit destination and `--scale 1|2|3` controls PNG
resolution. `--target-width` scales the review preview to the real delivery
width and warns when the scene would be downscaled by more than 15%. If setup is
missing, run the single command printed by the exporter (the skill's
`scripts/setup_renderer.sh`) and retry.

View the PNG preview or exported PNG. Compare it with the intended argument and
check text fit, unintended overlaps, ambiguous labels, arrow routing, spacing,
legibility, density, and composition at the intended viewing width without
zooming. Fix the working scene and repeat until the preview passes every
applicable check.

### 5. Deliver

Confirm that the exporter completed embedded-scene verification. Deliver only
the editable image requested by the user, then remove the working scene and any
temporary theme sidecar created for the task. Preserve user-provided source
files, and retain or deliver working JSON only when the user explicitly asks.

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
- The whole diagram follows the user's style request and one resolved theme
  with compliant text contrast.
- Text is readable and unclipped; spacing is balanced; arrows connect cleanly.
- Main text remains readable at the intended viewing width, and containers are
  sized from their content rather than oversized fixed cards.
- The exported width is at most `1.15 ×` the delivery width, and the preview was
  inspected at that delivery width rather than at 100% scene scale.
- The output suffix is `.excalidraw.svg` or `.excalidraw.png` as requested.
- The exported image contains a scene that the exporter successfully reloaded.
- Exactly one new deliverable remains unless the user explicitly requested the
  working JSON or additional formats.
