# Element Templates

Copy-paste JSON templates for common Excalidraw elements. Colors, font family,
roughness, and stroke weights are examples or placeholders: apply the resolved
whole-diagram style from [SKILL.md](../SKILL.md#route-the-task) to every element.

## Free-Floating Text (no container)
```json
{
  "type": "text",
  "id": "label1",
  "x": 100, "y": 100,
  "width": 200, "height": 25,
  "text": "Section Title",
  "originalText": "Section Title",
  "fontSize": 20,
  "fontFamily": 3,
  "textAlign": "left",
  "verticalAlign": "top",
  "strokeColor": "<primary text from theme>",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "seed": 11111,
  "version": 1,
  "versionNonce": 22222,
  "isDeleted": false,
  "groupIds": [],
  "boundElements": null,
  "link": null,
  "locked": false,
  "containerId": null,
  "lineHeight": 1.25
}
```

## Line (structural, not arrow)
```json
{
  "type": "line",
  "id": "line1",
  "x": 100, "y": 100,
  "width": 0, "height": 200,
  "strokeColor": "<structural line color from theme>",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "seed": 44444,
  "version": 1,
  "versionNonce": 55555,
  "isDeleted": false,
  "groupIds": [],
  "boundElements": null,
  "link": null,
  "locked": false,
  "points": [[0, 0], [0, 200]]
}
```

## Small Marker Dot
```json
{
  "type": "ellipse",
  "id": "dot1",
  "x": 94, "y": 94,
  "width": 12, "height": 12,
  "strokeColor": "<marker dot color from theme>",
  "backgroundColor": "<marker dot color from theme>",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "seed": 66666,
  "version": 1,
  "versionNonce": 77777,
  "isDeleted": false,
  "groupIds": [],
  "boundElements": null,
  "link": null,
  "locked": false
}
```

## Rectangle
```json
{
  "type": "rectangle",
  "id": "elem1",
  "x": 100, "y": 100, "width": 180, "height": 90,
  "strokeColor": "<semantic stroke from theme>",
  "backgroundColor": "<semantic fill from theme>",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "seed": 12345,
  "version": 1,
  "versionNonce": 67890,
  "isDeleted": false,
  "groupIds": [],
  "boundElements": [{"id": "text1", "type": "text"}],
  "link": null,
  "locked": false,
  "roundness": {"type": 3}
}
```

## Text (centered in shape)
```json
{
  "type": "text",
  "id": "text1",
  "x": 130, "y": 132,
  "width": 120, "height": 25,
  "text": "Process",
  "originalText": "Process",
  "fontSize": 20,
  "fontFamily": 3,
  "textAlign": "center",
  "verticalAlign": "middle",
  "strokeColor": "<on-fill text color from theme>",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 1,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "seed": 11111,
  "version": 1,
  "versionNonce": 22222,
  "isDeleted": false,
  "groupIds": [],
  "boundElements": null,
  "link": null,
  "locked": false,
  "containerId": "elem1",
  "lineHeight": 1.25
}
```

## Arrow
```json
{
  "type": "arrow",
  "id": "arrow1",
  "x": 282, "y": 145, "width": 118, "height": 0,
  "strokeColor": "<arrow color from theme>",
  "backgroundColor": "transparent",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 0,
  "opacity": 100,
  "angle": 0,
  "seed": 33333,
  "version": 1,
  "versionNonce": 44444,
  "isDeleted": false,
  "groupIds": [],
  "boundElements": null,
  "link": null,
  "locked": false,
  "points": [[0, 0], [118, 0]],
  "startBinding": {"elementId": "elem1", "focus": 0, "gap": 2},
  "endBinding": {"elementId": "elem2", "focus": 0, "gap": 2},
  "startArrowhead": null,
  "endArrowhead": "arrow"
}
```

For curves: use 3+ points in `points` array.

## Type container with letter badge

Use this compound element for the type-map notation in
[application-design.md](application-design.md#letter-badge-notation), which
defines the letters and colors. Build it from native editable shapes and text.

Measure the name and every member with `scripts/layout.mjs`: the name in the
label font of the style, the members in its code font. See
[styles.md](styles.md). Let `X` be the text inset (12), `Y` the compartment
padding (8), and `D` the badge diameter (`1.25 × name size + 6`). Sort the
members into fields and methods: a member that contains `(` is a method. Set:

```text
headerHeight = max(D, name height) + 2 × Y
headerWidth = 2 × X + D + badge gap (10) + name width
compartmentHeight = 2 × Y + line count × line height
width = max(headerWidth, widest member + 2 × X)
height = headerHeight + sum of compartment heights
```

For a type at `(x, y)`, assemble:

| Element | Position / size | Binding |
| --- | --- | --- |
| Outer rectangle | `(x, y)`, `width × height` | Relationship arrows bind here |
| Header (`clean` only) | `(x, y)`, `width × headerHeight`, tone shade 2 | none |
| Badge ellipse | `(x + X, y + (headerHeight - D) / 2)`, `D × D`, white | Bound letter text |
| Type name | After the badge, centered on the header line | `containerId: null` |
| Fields, methods | One rectangle per compartment in `clean`; one rule line above each compartment in `sketch` | none |
| Member text | `(x + X, compartment top + Y + line offset)`, code font | `containerId: null` |

In `clean`, use sharp corners (`roundness: null`), the tone shade 2 for the
header, and shade 1 for the outer rectangle and the compartments. In
`sketch`, use `roundness: { "type": 3 }` on the outer rectangle, white fills,
and ink strokes. Share one `groupIds: [typeGroupId]` across all parts so
moving the type carries its badge, name, and members. Give each part its own
ID and seed. Set reciprocal `boundElements` entries on the badge for its
letter, and on the outer rectangle for relationship arrows.

For aligned examples, derive shared dimensions from the widest header and
member among peers. Inspect that badges remain circular, letters are centered,
and every member sits inside its compartment at the delivery width.

## UML relationship connectors

Choose relationship semantics from
[application-design.md](application-design.md#simplified-uml-connectors).
Apply these properties to the Arrow template; all unlisted heads are `null`.

| Relationship / point order | `strokeStyle` | `startArrowhead` | `endArrowhead` |
| --- | --- | --- | --- |
| Subtype → parent | `solid` | `null` | `triangle_outline` |
| Implementation → interface | `dashed` | `null` | `triangle_outline` |
| Client → supplier | `dashed` | `null` | `arrow` |
| Association | `solid` | `null` | `null` |
| Navigable association → target | `solid` | `null` | `arrow` |
| Whole → part (composition) | `solid` | `diamond` | `null` |
| Whole → part (shared aggregation) | `solid` | `diamond_outline` | `null` |

`triangle_outline` is the hollow inheritance head; `triangle` is filled and
has a different appearance. If the points run from part to whole, move the
diamond to `endArrowhead`. Keep heads on the semantic endpoint regardless of
screen direction. Prefer native arrowheads over separately drawn triangles or
diamonds so they follow the connector during editing.
