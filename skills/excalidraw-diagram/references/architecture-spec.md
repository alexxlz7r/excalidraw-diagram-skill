# Architecture Generator

`scripts/architecture.mjs` builds an architecture diagram scene from a compact
JSON spec. ELK (the Eclipse Layout Kernel, through `elkjs`) calculates the
positions of components and zones and routes the links.

Use the generator for system and service architectures: applications,
services, libraries, data stores, and external systems inside nested
boundaries, such as a system, a workspace, a scope, or a deployment unit.

## Workflow

1. Decide the boundaries and the roles. A role is a category of components,
   such as app, domain, and storage. Use the categories of the real design.
2. List the components in the order of the main direction of the calls: the
   callers first, the stores and the external systems last.
3. Keep the links few. If several components of one zone use components of
   another zone, draw one link between the two zones. Do not draw a link to a
   component that almost every component uses, such as a util or types
   library; say it in the footnote.
4. Write the spec to a temporary JSON file.
5. Generate the scene. The script prints the scene path and its size:

   ```bash
   node scripts/architecture.mjs /tmp/spec.json -o /tmp/scene.excalidraw
   ```

6. If the script prints a width warning, break long names and sub lines into
   lines, or split the diagram.
7. Export and inspect the scene with `scripts/export_excalidraw.mjs`.
8. If the preview fails a check, change the spec and generate again. The next
   generation overwrites manual changes to the scene.

## Spec

```json
{
  "title": "Shop checkout",
  "subtitle": "The API is the only writer of the orders table.",
  "style": "clean",
  "direction": "DOWN",
  "roles": [
    { "id": "app", "label": "application", "tone": "orange" },
    { "id": "data", "label": "storage", "tone": "yellow" }
  ],
  "zones": [
    { "id": "cloud", "label": "AWS · eu-central-1" },
    { "id": "vpc", "label": "private subnet", "parent": "cloud", "tone": "blue" }
  ],
  "components": [
    { "id": "browser", "kind": "external", "name": "Browser" },
    { "id": "api", "name": "shop-api", "sub": ["FastAPI", ":8000"], "role": "app", "zone": "vpc" },
    { "id": "worker", "name": "mailer", "sub": "Celery", "role": "app", "zone": "vpc", "proposed": true },
    { "id": "db", "kind": "store", "name": "orders", "sub": "PostgreSQL 16", "role": "data", "zone": "vpc" },
    { "id": "psp", "kind": "external", "name": ["Payment", "provider"] }
  ],
  "links": [
    { "from": "browser", "to": "cloud", "label": "HTTPS" },
    { "from": "api", "to": "db", "label": "SQL" },
    { "from": "api", "to": "worker", "kind": "async", "label": "order.paid" },
    { "from": "api", "to": "psp", "label": "charge", "tone": "red" }
  ],
  "footnote": "The mailer is proposed; the API sends mail itself today."
}
```

Every text field accepts a string or an array of lines. The generator does
not wrap text: break long names and sub lines into lines in the spec.

### Top level

| Field | Default | Meaning |
| --- | --- | --- |
| `title` | none | Diagram title, 1.6 × the font size. |
| `subtitle` | none | One sentence with the conclusion of the diagram. |
| `style` | `clean` | Named style: `"clean"` or `"sketch"`, or an object with `preset` and overrides. See [styles.md](styles.md). |
| `direction` | `DOWN` | Direction of the calls: `DOWN`, `UP`, `RIGHT`, or `LEFT`. |
| `roles` | `[]` | `{ id, label, tone }`. The tone colors every component of the role in `clean`. |
| `zones` | `[]` | `{ id, label, tone, parent }`. A zone is a boundary. `parent` nests it in another zone. |
| `components` | required | Components in the order of the calls. |
| `links` | `[]` | Links between components and zones. |
| `legend` | automatic | Legend items. See below. |
| `footnote` | none | Text below the legend. |

`style` object fields: `preset`, `fontSize` (20), `fontFamily`, the name font,
`codeFontFamily`, the font of the sub lines, `roughness`, `background`, `ink`,
and `tone` (`gray`), the default tone of zones and of components without a
role. See [type-map-spec.md](type-map-spec.md#top-level) for the values of
each preset.

### Component

| Field | Default | Meaning |
| --- | --- | --- |
| `id` | required | Unique among components and zones. Links refer to it. |
| `kind` | `service` | `service`: rounded box for an application, a service, or a library. `store`: cylinder for a database, a file store, or a cache. `external`: ellipse for a person or a system outside the design. |
| `name` | `id` | Name in the label font. |
| `sub` | none | Technology, port, module, or responsibility lines under the name, in the code font. |
| `role` | none | Role ID. |
| `tone` | role tone or style tone | Palette hue in `clean`. Overrides the role. |
| `zone` | none | Zone ID. |
| `proposed` | `false` | Dashed outline: the component does not exist yet. |

### Link

| Field | Default | Meaning |
| --- | --- | --- |
| `from`, `to` | required | Component or zone IDs, from the caller to the callee, or from the source to the target of the data. |
| `kind` | `call` | `call`: solid, for a call, a request, or an import. `async`: dashed, for a message, an event, or a lazy load. `generated`: dotted, for a generated artifact. |
| `label` | none | Protocol, endpoint, topic, or purpose. |
| `both` | `false` | Arrowheads at both ends. |
| `tone` | ink | Palette hue in `clean`, to mark a path, such as the path of personal data. |

### Legend

Without `legend`, the legend shows a swatch for every role (in `clean`) and a
sample for every link kind in use, when there are two kinds or more. To write
the legend, list the items:

- `{ "role": "app" }`: the swatch of a role, with the role label. `sketch`
  has no colors, so a role item is an error in `sketch`.
- `{ "link": "async", "label": "lazy route" }`: the sample of a link kind.

`"legend": []` removes the legend.

## Layout

- The component order sets the direction: a link to the same or an earlier
  component is a back link. It leaves and enters across the direction.
- Links leave on the side of the direction and enter on the opposite side.
  The ports on a side keep the order of the other ends, so links do not
  cross at a component.
- Link labels sit on their links. ELK keeps space around each label.
- A zone label is drawn over the links that cross it, on a plate. In
  `clean`, an outer zone is hatched and a nested zone is cross-hatched.

## Editing a generated scene

Links are bound to the components and zones. Each binding holds two formats:
`focus` and `gap` for Excalidraw 0.18, and `fixedPoint` with
`mode: "inside"` for later releases, such as excalidraw.com. Link labels are
bound to their links.

- When a user drags a component in Excalidraw, its parts and text move with
  it (group `<component>-component`), and the ends of its links follow. A bent
  link keeps its bend points.
- To move a component in the scene JSON, move every element of its group,
  then put the links and labels back:

  ```bash
  node scripts/rebind_scene.mjs /tmp/scene.excalidraw
  ```

Element IDs are stable: `<component>` for the shape that takes the bindings
(for a store, a transparent box over the cylinder), `<component>-name` and
`<component>-sub` for the text, `<store>-top`, `<store>-body`,
`<store>-bottom`, `<store>-left`, and `<store>-right` for the cylinder parts,
`l<n>` for links in spec order with `l<n>-label`, and `zone-<zone>` for zones
with `zone-<zone>-plate` and `zone-<zone>-label`.

## Limits

- The generator does not wrap text. It prints a warning when the scene is
  wider than 1200 px.
- A dense graph, such as a full import graph, gives long parallel links.
  Show only the links that carry the argument of the diagram, and link zones
  instead of their components (step 3 of the workflow).
- The layout cannot mirror two similar structures. Author such a scene by
  hand.
