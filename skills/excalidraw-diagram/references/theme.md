# Diagram Theme

The theme sets the colors of a diagram. The named style sets the fonts, the
roughness, the corners, and the fills (see [styles.md](styles.md)). The
generators and a hand-built scene use the same theme and the same shade rules.

## Default theme

[default-theme.json](default-theme.json) holds the Excalidraw color picker
palette. Use it when the user names no colors and the diagram has no host
artifact. Do not edit the installed file: a theme for a task goes in a separate
file (see "Adapt the theme").

## Format

| Field | Meaning |
| --- | --- |
| `black` | The ink: all text, plain arrows and lines, and every stroke in `sketch`. |
| `white` | Plates under labels, badges, and the fills of `sketch`. |
| `background` | The canvas: `appState.viewBackgroundColor`. |
| `exportBackground` | `appState.exportBackground`. Set `false` to let the host background show through, for example on a slide. |
| `hues` | Named hues. Each hue has five shades, from the palest to the strongest. |

Every theme has the twelve Excalidraw hues: `gray`, `red`, `pink`, `grape`,
`violet`, `blue`, `cyan`, `teal`, `green`, `yellow`, `orange`, and `bronze`.
The generators name these hues in their defaults, for example orange classes
and red failure paths. A theme can change their shades and add other hues,
such as `brand`. A `tone` in a spec names any hue of the theme.

## Shade levels

Use each level for one purpose, in generated and hand-built scenes:

| Level | Use |
| --- | --- |
| 1 | Fill of a box, a nested zone, or a tinted operand |
| 2 | Header, stronger fill for the primary element, hatch of an outer zone |
| 3 | Highlighted row; thin dividers in `gray` |
| 4 | Zone border; reply arrows in `gray` |
| 5 | Outline of a colored box, a colored arrow; secondary text in `gray` |

Text is always `black`. Put text only on `background`, `white`, or levels 1 to
3. The Excalidraw picker fills with level 2 by default; the diagrams fill
ordinary boxes with level 1, so that text and outlines stand out, and keep
level 2 for emphasis.

`sketch` uses only `black`, `white`, and `background`.

## Use the theme

For a generator, pass the theme file with `--theme`. Without the flag, the
generator uses the default theme:

```bash
node <skill-dir>/scripts/flow.mjs /tmp/spec.json --theme /tmp/diagram-theme.json -o /tmp/scene.excalidraw
```

For a hand-built scene, print the resolved theme and take every color from it
with the shade levels above:

```bash
node <skill-dir>/scripts/theme.mjs /tmp/diagram-theme.json
```

Without a file, the command prints the default theme. Use one theme for every
diagram of one artifact.

## Adapt the theme

Adapt the theme to a user style brief, a visual reference, or a host
presentation, document, site, application, or brand system.

1. Read the style brief and the reference. If a host artifact is available,
   read its presentation master, document styles, site tokens, or brand colors.
2. Write a theme file that holds only the changes. The file goes on top of the
   default theme: a hue in the file replaces that hue, and the other hues stay.
3. To change the default colors of the generators, replace the shades of a
   standard hue: for example, give `blue` the shades of the brand primary. To
   add a color, add a hue with a new name and give it as a `tone` in the spec.
4. Make five shades per brand color. Put a strong brand color at level 4 or 5.
   Make levels 1 to 3 pale tints of the same hue, so that `black` text stays
   readable on them.
5. Keep the meaning of the semantic hues: `red` for errors and failures,
   `green` for success and recovery, `yellow` for highlights and warnings. If
   the host defines these colors, use its values.
6. For a slide or a page that shows through, set `exportBackground` to `false`
   and set `background` to the host background, so that previews show the
   diagram in context.
7. For a dark background, make `black` a light ink and `white` a dark plate.
   Keep level 1 closest to the background and level 5 the strongest.
8. Run `scripts/theme.mjs` on the file. Correct every error before use.

Store the theme file beside the working artifact or in a temporary directory,
never inside the installed skill. Deliver it only if it is useful to the user.

Example: a brand theme that changes the canvas and the primary hue, and adds a
second brand color:

```json
{
  "background": "#fbfaf7",
  "hues": {
    "blue": ["#e6f7f5", "#b3e6df", "#5cc4b6", "#1a9e8c", "#0f6b5f"],
    "brand": ["#fdf0e8", "#f9d3bd", "#f0a47a", "#d9703a", "#a34a1c"]
  }
}
```

## Contrast

`scripts/theme.mjs` uses the WCAG contrast ratio:

- Error: `black` on `background`, on `white`, or on levels 1 to 3 of a hue is
  below 4.5:1. Text on that color is hard to read.
- Warning: level 5 of a hue on `background` is below 3:1. An outline or an
  arrow in that hue is faint. The Excalidraw `yellow` gives this warning; if
  the boundary is important, use a darker hue.

Contrast between a stroke and a fill helps boundaries. It does not replace the
text contrast.
