# Named Styles

The skill has two named styles: `clean` and `sketch`. The user selects one
when the user asks for a diagram. If the request names no style, use `clean`.

A named style sets the typography, roughness, corners, fills, and zones. The
theme ([default-theme.md](default-theme.md) or a resolved theme) sets the
colors. The style overrides `style.roughness` and `style.fontFamily` of the
theme. Apply one style to the whole diagram, in every diagram mode.

For a type map or a sequence diagram, pass the style name in the spec:
`"style": "clean"` or `"style": "sketch"`. See
[type-map-spec.md](type-map-spec.md#top-level) and
[sequence-spec.md](sequence-spec.md#top-level).

## clean

A smooth, colored diagram for documents and slides.

| Property | Value |
| --- | --- |
| Roughness | `0` |
| Label font | `fontFamily: 6` (Nunito): titles, names, labels, and prose |
| Code font | `fontFamily: 3` (Cascadia): class members, identifiers in rows, payloads |
| Box corners | Sharp (`roundness: null`) for type boxes; rounded for zones and plates |
| Fills | Solid, from the Excalidraw palette. Pale shades for headers, lighter shades below them |

A type box is a stack of rectangles: a header in the kind color, then one
compartment for the fields and one for the methods, in a lighter shade of the
same hue. The header holds a white letter badge and the type name.

Zones are large areas that group other elements, such as `ui` and `backend`:

1. Put the zone rectangle before its content in the `elements` array, so it
   renders below the content.
2. Fill every box inside a zone with an opaque color. A transparent box shows
   the hatch through.
3. Put the zone title on a small solid plate in the top-left corner, never on
   the hatch.
4. Use `hachure` for an outer zone and `cross-hatch` for a nested zone. Deeper
   zones use a solid pale fill.
5. The hatch color is the zone `backgroundColor`: a pale palette shade. Use
   `strokeWidth: 1` on zones for a fine hatch. Keep the boxes inside a zone
   lighter than the zone, or in its hue.

## sketch

A hand-drawn, ink-only diagram for whiteboard explanations.

| Property | Value |
| --- | --- |
| Roughness | `1` |
| Font | `fontFamily: 5` (Excalifont) for all text |
| Box corners | Rounded (`roundness: { "type": 3 }`) |
| Fills | None: white inside boxes, transparent zones. Strokes in ink `#1e1e1e` |

A type box is one rounded outline. Horizontal rules divide the header, the
fields, and the methods. Zones have a dashed ink outline and a plain title. A
highlight is a gray hachure, not a color. If the argument depends on color,
such as a legend of tones, use `clean`.

## Text measurement

`scripts/layout.mjs` measures text with the advance width of each character,
per font family. `scripts/font-metrics.json` holds the widths for families 1,
3, 5, 6, 7, 8, and 9. Helvetica (2) has no table: the export does not embed
it. After an Excalidraw upgrade, measure again with
`node scripts/measure_fonts.mjs`.
