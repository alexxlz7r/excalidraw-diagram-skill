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

## Styles and themes

The skill has two named styles. Name one in the request, for example "draw it
in the sketch style":

- `clean` (default): smooth lines, Nunito labels, Cascadia code, colored
  type headers, and hatched zones;
- `sketch`: rough lines, Excalifont for all text, and ink outlines without
  color.

The style applies to the whole diagram, across all diagram types. The theme
sets the colors: the ink, the plates, the canvas, and twelve hues with five
shades each. The generators and hand-built scenes use the same theme:

- standalone diagram or unknown destination: the default theme, which is the
  Excalidraw color picker palette;
- known presentation, document, site, or brand system: a theme file that
  changes only what the host needs. The generators read it with `--theme`.

`scripts/theme.mjs` checks a theme: text must reach 4.5:1 contrast on every
fill that holds text. Theme files stay beside the working artifact, never in
the installed skill.

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

The agent writes a type map as a compact JSON spec. `scripts/type_map.mjs`
lays the spec out with ELK and draws the notation, so the agent does not
calculate coordinates by hand. A sequence diagram works the same way through
`scripts/sequence.mjs`: participants, messages, self-calls, fragments, notes,
and activation bars. Its arrows stay bound to the lifelines when a user moves
a participant in Excalidraw.

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
    theme.md                    Theme format, shade levels, and adaptation
    default-theme.json          Default theme: the Excalidraw palette
    application-design.md       Lightweight UML-like application diagrams
    type-map-spec.md            Spec format for the type map generator
    sequence-spec.md            Spec format for the sequence generator
    styles.md                   The clean and sketch styles
    design-guidance.md          Visual patterns and quality criteria
    element-templates.md        Excalidraw element examples
    json-schema.md              Scene and binding contract
  scripts/
    export_excalidraw.mjs       Editable SVG/PNG exporter
    theme.mjs                   Theme loader, contrast check, and CLI
    setup_renderer.sh           Pinned setup, bundle build, dependency prune
    render_template.html        Browser export bridge
    package.json                Runtime and build dependencies
    layout.mjs                 Shared text and container sizing helpers
    font-metrics.json           Measured character widths per font family
    measure_fonts.mjs           Measures font-metrics.json in the renderer
    scene.mjs                   Shared styles, element builder, and CLI for generators
    type_map.mjs                Type map generator with ELK layout
    sequence.mjs                Sequence diagram generator
    rebind_scene.mjs            Puts bound arrows back after a scene edit
    extract_scene.mjs           Reads the scene embedded in an SVG or PNG export
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
