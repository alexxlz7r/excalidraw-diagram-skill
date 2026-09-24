# Excalidraw Diagram Skill

An installable skill that creates and edits `.excalidraw.svg` and
`.excalidraw.png` diagrams from natural-language requests. The exported image
contains the complete scene, so it opens for editing in Excalidraw and the
Excalidraw VS Code extension.

The skill emphasizes diagrams that argue visually: fan-outs for one-to-many,
timelines for sequences, convergence for aggregation, real payloads for
technical evidence, and a render-inspect-fix loop before delivery.

## Installation

Paste this into a terminal. The installer asks whether to install for Codex,
Claude Code, or both:

```bash
curl -fsSL https://raw.githubusercontent.com/alexxlz7r/excalidraw-diagram-skill/main/install.sh | bash
```

The same command updates an existing installation. It uses each agent's native
plugin marketplace, sets up the renderer, and moves a legacy standalone skill
out of the discovery path if one exists. During Codex updates it keeps previous
cache paths readable for threads that are already open. No checkout or
`git pull` is needed.

For scripts and CI, skip the menu with a flag:

**Codex only**

```bash
curl -fsSL https://raw.githubusercontent.com/alexxlz7r/excalidraw-diagram-skill/main/install.sh | bash -s -- --codex
```

**Claude Code only**

```bash
curl -fsSL https://raw.githubusercontent.com/alexxlz7r/excalidraw-diagram-skill/main/install.sh | bash -s -- --claude
```

**Both**

```bash
curl -fsSL https://raw.githubusercontent.com/alexxlz7r/excalidraw-diagram-skill/main/install.sh | bash -s -- --all
```

### Native update commands

The installer is the recommended update command because it also rebuilds the
renderer. If an agent needs to update only its plugin package, the native
commands are:

**Codex:** refresh the marketplace snapshot, then reinstall from it.

```bash
codex plugin marketplace upgrade excalidraw-diagram-skill
codex plugin add excalidraw-diagram-skill@excalidraw-diagram-skill
```

**Claude Code:** refresh the marketplace and update the installed plugin.

```bash
claude plugin marketplace update excalidraw-diagram-skill
claude plugin update excalidraw-diagram@excalidraw-diagram-skill --scope user --yes
```

Start a new Codex thread after an update. In Claude Code, run
`/reload-plugins` or start a new session.

### Manual Claude Code installation

The Claude marketplace plugin is the canonical Claude distribution:

```text
/plugin marketplace add alexxlz7r/excalidraw-diagram-skill
/plugin install excalidraw-diagram@excalidraw-diagram-skill
```

After a manual plugin install, ask Claude: `Set up the excalidraw-diagram
exporter.` The one-line installer above performs this step automatically.

### Codex IDE extension fallback

Codex plugins are available in the Codex app and CLI, but not the IDE extension.
For the IDE extension, install the skill from a source checkout:

```bash
git clone https://github.com/alexxlz7r/excalidraw-diagram-skill.git
cd excalidraw-diagram-skill
skills/excalidraw-diagram/scripts/setup_renderer.sh
```

Then link `skills/excalidraw-diagram` into `$CODEX_HOME/skills` (or
`~/.codex/skills`). Do not keep that standalone copy alongside the plugin in
Codex app/CLI, or the skill may be discovered twice.

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

The user's style request applies to the whole diagram, across all diagram
types. If style is unspecified, the agent can offer a few directions such as
hand-drawn, clean technical, or minimal presentation. It resolves remaining
theme values before layout:

- standalone diagram or unknown destination: immutable built-in fallback;
- known presentation, document, site, or brand system: a derived theme based
  on the actual host artifact.

Theme resolution includes the canvas and transparency, text hierarchy, semantic
colors, line colors, evidence styles, roughness, and stroke widths. Normal text
must reach 4.5:1 contrast and large text 3:1. Resolved values are written to the
working scene, never back into the installed skill.

## Application design diagrams

The skill supports a deliberately small, lightweight UML-like vocabulary for
software work:

- type maps with C/I/A circle badges for classes, interfaces, and abstract
  classes, fill hues by architectural role, lighter-to-stronger fills by type
  kind, and simplified UML connectors;
- use-case maps for actors, product boundaries, and user goals;
- sequence diagrams for calls, events, responses, retries, and failures;
- flow/state diagrams for decisions, lifecycle changes, and recovery paths.

These diagrams preserve useful engineering semantics without aiming for formal
UML compliance. The scenario and domain model lead the composition; notation
stays quiet and the active theme controls the visual language.

## Usage

Ask the agent for a diagram or an edit, for example:

> Create an Excalidraw diagram showing how AG-UI events stream from an agent to
> a frontend.

SVG is the default. Ask for PNG explicitly when needed. When the diagram belongs
in an existing deck, document, or site, give the agent access to that artifact
so it can derive a matching theme. Provide the pixel width available in the
destination; if it is unknown, the agent asks for it before laying out the
scene. The exporter renders its review preview at that delivery width and warns
when the scene would be downscaled by more than 15%.

The agent draws in a subagent when the host supports one. Claude Code forks the
conversation, so the subagent has the full context. Other hosts give a new
subagent a brief of the relevant facts. The main conversation receives only the
path of the delivered file and a short summary.

## Repository layout

```text
.claude-plugin/                  Claude plugin and marketplace manifests
.codex-plugin/plugin.json       Codex plugin package manifest
install.sh                      Codex/Claude installer and updater
skills/excalidraw-diagram/
  SKILL.md                      Workflow and reference routing
  references/
    default-theme.md            Immutable standalone fallback
    default-theme.json          Machine-readable semantic theme contract
    theme-adaptation.md         Host-artifact theme derivation
    application-design.md       Lightweight UML-like application diagrams
    design-guidance.md          Visual patterns and quality criteria
    element-templates.md        Excalidraw element examples
    json-schema.md              Scene and binding contract
  scripts/
    export_excalidraw.mjs       Editable SVG/PNG exporter
    validate_theme.mjs          Theme contract and contrast validator
    setup_renderer.sh           Pinned setup, bundle build, dependency prune
    render_template.html        Browser export bridge
    package.json                Runtime and build dependencies
    layout.mjs                 Shared text and container sizing helpers
    tests/                       Export and cold-setup coverage
    vendor/entry.js             Generated-bundle entrypoint
```

## Development checks

```bash
tests/install-codex-update.sh
cd skills/excalidraw-diagram/scripts
npm test
npm run test:cold
npm audit --omit=dev
```

The full dependency audit can still report transitive findings in Excalidraw's
temporary build-only tree. Excalidraw `0.18.1` remains the latest checked npm
release; forcing npm's proposed fix would downgrade it and is intentionally not
used.
