# Excalidraw Diagram Skill

An installable skill that creates and edits `.excalidraw.svg` and
`.excalidraw.png` diagrams from natural-language requests. The exported image
contains the complete scene, so it opens for editing in Excalidraw and the
Excalidraw VS Code extension.

The skill emphasizes diagrams that argue visually: fan-outs for one-to-many,
timelines for sequences, convergence for aggregation, real payloads for
technical evidence, and a render-inspect-fix loop before delivery.

## Installation

### Claude Code

The Claude marketplace plugin is the canonical Claude distribution:

```text
/plugin marketplace add alexxlz7r/excalidraw-diagram-skill
/plugin install excalidraw-diagram@excalidraw-diagram-skill
```

Claude plugins do not run a renderer post-install hook in this package. Before
the first export, ask Claude: `Set up the excalidraw-diagram exporter.` The skill
runs its single setup script. If export is attempted first, the error prints the
same exact setup command.

### Codex source checkout and IDE extension

The canonical installation from this repository is:

```bash
git clone https://github.com/alexxlz7r/excalidraw-diagram-skill.git
cd excalidraw-diagram-skill
./install.sh
```

`install.sh` links the skill into `$CODEX_HOME/skills` when set, otherwise
`~/.codex/skills`, and sets up the exporter. This route also works for the Codex
IDE extension, which does not load plugins. The `.codex-plugin/plugin.json`
manifest has a distinct purpose: it packages the same skill for Codex plugin
catalogs and supported plugin surfaces; it is not a second source-checkout
installer.

## Exporter setup

From a repository checkout, the one setup command is:

```bash
skills/excalidraw-diagram/scripts/setup_renderer.sh
```

Setup installs pinned npm dependencies, builds the ignored local Excalidraw
browser bundle, removes build-only dependencies, keeps the Playwright runtime,
and installs Chromium. Exporting is offline after setup. Python and `uv` are not
required.

The generated bundle is about 8 MB and is not committed. Excalidraw, React, and
esbuild are build-only dependencies; setup prunes them after producing the
bundle, avoiding the previous persistent ~248 MB dependency tree. The browser
binary remains required for pixel rendering and embedded-scene verification.

## Themes

The skill resolves a diagram theme before layout:

- standalone diagram or unknown destination: immutable built-in default;
- known presentation, document, site, or brand system: a derived theme based
  on the actual host artifact.

Theme resolution includes the canvas and transparency, text hierarchy, semantic
colors, line colors, evidence styles, roughness, and stroke widths. Normal text
must reach 4.5:1 contrast and large text 3:1. Resolved values are written to the
working scene, never back into the installed skill.

## Usage

Ask the agent for a diagram or an edit, for example:

> Create an Excalidraw diagram showing how AG-UI events stream from an agent to
> a frontend.

SVG is the default. Ask for PNG explicitly when needed. When the diagram belongs
in an existing deck, document, or site, give the agent access to that artifact
so it can derive a matching theme.

## Repository layout

```text
.claude-plugin/                  Claude plugin and marketplace manifests
.codex-plugin/plugin.json       Codex plugin package manifest
install.sh                      Canonical Codex source-checkout installer
skills/excalidraw-diagram/
  SKILL.md                      Workflow and reference routing
  references/
    default-theme.md            Immutable standalone fallback
    default-theme.json          Machine-readable semantic theme contract
    theme-adaptation.md         Host-artifact theme derivation
    design-guidance.md          Visual patterns and quality criteria
    element-templates.md        Excalidraw element examples
    json-schema.md              Scene and binding contract
  scripts/
    export_excalidraw.mjs       Editable SVG/PNG exporter
    validate_theme.mjs          Theme contract and contrast validator
    setup_renderer.sh           Pinned setup, bundle build, dependency prune
    render_template.html        Browser export bridge
    package.json                Runtime and build dependencies
    tests/                       Export and cold-setup coverage
    vendor/entry.js             Generated-bundle entrypoint
```

## Development checks

```bash
cd skills/excalidraw-diagram/scripts
npm test
npm run test:cold
npm audit --omit=dev
```

The full dependency audit can still report transitive findings in Excalidraw's
temporary build-only tree. Excalidraw `0.18.1` remains the latest checked npm
release; forcing npm's proposed fix would downgrade it and is intentionally not
used.
