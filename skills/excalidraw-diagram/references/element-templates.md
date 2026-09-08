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

Measure the name and optional body first, using `scripts/layout.mjs` for
monospace or actual font measurements for another family. Let `P` be the outer
padding (start at 20), `G` the circle-to-name gap (12–16), and `D` the shared
badge diameter/header height (start at 56–64 for a 24 px name). Grow `D` if the
name wraps and needs more height. Set:

```text
nameWidth = measured name width + 2 × name padding
innerWidth = max(D + G + nameWidth, measured body width)
outerWidth = innerWidth + 2 × P
outerHeight = 2 × P + D + (body present ? body gap + body height : 0)
```

For an outer container at `(x, y)`, assemble:

| Element | Position / size | Binding |
| --- | --- | --- |
| Rounded outer rectangle | `(x, y)`, `outerWidth × outerHeight` | Relationship arrows bind here |
| Badge ellipse | `(x + P, y + P)`, `D × D` | Bound letter text |
| Badge letter | Centered in the ellipse; size about `D / 2` | `containerId: badge.id` |
| Rounded name rectangle | `(x + P + D + G, y + P)`, remaining inner width × `D` | Bound name text |
| Type name | Centered in the name rectangle | `containerId: header.id` |
| Optional body text | `(x + P, y + P + D + body gap)`, measured size | `containerId: null` |

Use `roundness: { "type": 3 }` for both rectangles and solid badge fills.
Resolve the name rectangle's subtle fill from the same role accent as the
outer container, using the type-kind strengths in `application-design.md`.
Keep the letter within the ellipse's inscribed text area. Share one
`groupIds: [typeGroupId]` across all parts so moving the type carries its badge,
name, and body. Give each part its own ID and seed. Set reciprocal
`boundElements` entries on the badge and header for their text, and on the
outer rectangle for relationship arrows. The body uses explicit positioning
inside the group so binding it does not recenter it across the whole type.

For aligned examples, derive shared dimensions from the widest header/body
and tallest content among peers. Inspect that badges remain circular, letters
are centered, headers do not collide with badges, and body text stays below
the header at the delivery width.

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
