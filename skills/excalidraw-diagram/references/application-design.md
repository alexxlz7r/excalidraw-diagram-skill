# Application Design Diagrams

Read this reference for lightweight UML-like diagrams used to design or explain
software. Preserve the semantics developers need while favoring clarity,
composition, and the resolved visual theme over strict UML notation.

## Choose one primary question

| Question | Diagram mode |
| --- | --- |
| What exists and how is it related? | Type map |
| Who can accomplish which goals? | Use-case map |
| What happens across components over time? | Sequence |
| How does control or state move? | Flow/state |

Use one mode per visual region. When a request needs more than one question,
prefer separate diagrams; otherwise separate the modes into clearly titled
regions with distinct reading directions.

## Type map: classes, interfaces, and abstract classes

Use a type map to explain the design surface, not to inventory every symbol in
the codebase.

- Use the letter-badge notation below for classes, interfaces, and abstract
  classes. Keep an explicit `protocol` tag for protocols when that distinction
  matters in the source language.
- Give each type a strong name and one short responsibility. Add only fields or
  operations that explain a relationship, constraint, or extension point.
- Use two compact compartments at most: responsibility, then essential API.
- Use the UML connector vocabulary below. Keep labels short and omit
  multiplicities or member detail unless they explain the design.
- Emphasize the stable abstraction or domain center; place adapters and
  implementations around it. Keep incidental utilities out.

A good type map lets a developer identify the extension point, the concrete
implementations, and the direction of dependency without reading source code.

### Letter-badge notation

Use the same rounded type container for all three kinds. Inside its top row,
place a colored circle at the left and the type name in a separate rounded
rectangle at the right. Put the optional responsibility, fields, or methods
below this row. The letter identifies the kind of type; in role-colored maps,
the fill hue identifies architectural role and its strength distinguishes type
kind, as described below.

| Kind | Badge | Badge-only palette (when role colors are unused) |
| --- | --- | --- |
| Concrete class | `C` | Pale pink `#FECACA` |
| Interface | `I` | Pale blue `#A5D8FF` |
| Abstract class | `A` | Pale violet `#DDD6FE` |

Keep the letters and their meanings stable across themes, with dark readable
text and outlines. When role colors are active, tint each badge with a stronger
shade of its container's role color instead of the badge-only palette; the
letter carries the kind independently. Inherit typography, roughness, corner
treatment, and stroke weights from the diagram's resolved style. Add a compact
letter legend when the audience may not know the notation.

Center a single uppercase letter in each true circle (`width === height`).
Align the circle and name box on one horizontal centerline, fully inside the
outer boundary. Size the header from the name and the body from its content;
an empty body should collapse to a compact header-only type. Use the compound
element recipe in
[element-templates.md](element-templates.md#type-container-with-letter-badge)
for sizing, grouping, and text bindings.

The `A` badge describes the type; mark individual abstract operations only when
the distinction matters, for example `render() {abstract}`. Add relationships
and members only when supported by the source, or clearly label them as
illustrative/proposed.

### Color by architectural role

Choose the role categories from the actual design: components/controllers/
services, domain/adapters/infrastructure, or another useful partition. Assign
one base hue per role and explain the mapping in a small legend or labeled
regions. Within each role, use lighter fills for interfaces, intermediate fills
for abstract classes, and stronger fills for concrete classes. Keep the same
ordering across roles; retain C/I/A letters as the explicit, non-color cue.

Aim for translucent washes with a noticeable difference between type kinds.
These are starting blend strengths, adjustable to the requested style and
actual canvas:

| Type kind | Outer fill | Name-box fill | Badge fill |
| --- | --- | --- | --- |
| Interface (`I`) | 8% | 3% | 20% |
| Abstract class (`A`) | 16% | 5% | 32% |
| Concrete class (`C`) | 26% | 7% | 44% |

For a stable SVG/PNG result, preblend each RGB channel as
`fill = round(canvas × (1 - strength) + roleAccent × strength)`. Keep element
`opacity: 100` so outlines and text stay crisp. Give the name box a barely
visible wash of the same role accent, using the name-box strengths above. This
keeps the header visually connected to the type while remaining lighter than
its body. Recheck contrast on every resulting fill. Example base accents on
white, adjustable to the host theme:

| Illustrative role | Base accent |
| --- | --- |
| Component | Blue `#3B82F6` |
| Controller | Orange `#F97316` (peach when blended) |
| Service | Green `#10B981` (mint when blended) |

Compare I/A/C fills side by side at delivery width: they should remain one
recognizable color family while their strengths are visibly distinct. Adjust
the spacing between strengths if the export makes them look identical. A
compact same-hue I/A/C swatch legend can explain this second visual dimension.
If the user prefers the same wash for interfaces and abstract classes, retain
their separate I/A badges.

Store these as scene-local role accents, independent of success/error states.
For transparent exports, blend against the known destination background. If
the background is unknown, use the normal opaque canvas for predictable tints.

### Simplified UML connectors

Simplify the amount of notation while preserving the meaning of the line,
endpoint, and direction. Use these relationships when the design supports them:

| Relationship | Line and endpoints | Direction |
| --- | --- | --- |
| Generalization (`extends`) | Solid, hollow triangle | Subtype → parent |
| Realization (`implements`) | Dashed, hollow triangle | Implementation → interface |
| Dependency (`uses`, `creates`) | Dashed, open arrowhead | Client → supplier |
| Association | Solid, plain ends; open arrowhead only for explicit navigability | Arrow, if present, points to the navigable type |
| Composition | Solid, filled diamond at the whole | Whole ◆— part |
| Shared aggregation | Solid, hollow diamond at the whole | Whole ◇— part |

This is the compact relationship vocabulary used in
[PlantUML's class-diagram documentation](https://plantuml.com/class-diagram).
Use composition for exclusive whole/part ownership with lifecycle semantics;
a reference or injected service alone justifies an association or dependency.
Use shared aggregation only when that distinction is explicit and useful.
Label an otherwise ambiguous line with a short verb or role name. Include
multiplicity only when known and relevant. C/I/A badges and role tints are the
visual shorthand; connector semantics remain UML.

Use native Excalidraw arrowheads and reciprocal bindings to the outer type
rectangles, as mapped in
[element-templates.md](element-templates.md#uml-relationship-connectors).
Keep connectors dark and visually quieter than type headers. Route clear of
badges, labels, and unrelated boxes; inspect that hollow heads stay visibly
open and diamond ends stay on the whole when a line changes direction.

## Use-case map

Use a use-case map to show user goals and product scope before implementation
details.

- Place actors outside one visible product or subsystem boundary.
- Name use cases as verb phrases: `Create workspace`, `Invite member`,
  `Approve refund`.
- Group goals by journey or capability instead of making an undifferentiated
  field of ovals. Rounded capsules are acceptable when they fit the theme.
- Connect an actor only to goals they initiate or materially participate in.
- Show `includes`, prerequisites, or exceptional paths only when they change
  product understanding; label them in plain language.
- Keep services, databases, endpoints, and internal classes out of this mode.

Make the principal actor and primary journey visually dominant. Supporting
roles and administrative cases should read as secondary.

## Sequence

Use a sequence diagram for a real request, command, event, or background job.

- Order participants left to right from initiator to entry point, domain logic,
  integrations, and persistence. Collapse participants that do not affect the
  explanation.
- Use a labeled header and vertical lifeline for each participant. Five to seven
  participants is a useful default ceiling for one readable scene.
- Draw messages top to bottom with actual method, command, event, or response
  names when the source material provides them.
- Use solid arrows for calls or emitted events and lighter dashed arrows for
  returns or acknowledgements. Label asynchronous boundaries explicitly.
- Show one dominant success path. Put alternatives, retries, and failures in
  lightly tinted regions aligned to the messages they affect.
- Replace activation-box formalism with subtle emphasis only when execution
  ownership would otherwise be ambiguous.

Verify that chronological order remains obvious even when message labels are
hidden and that crossing arrows are unnecessary.

## Flow/state

Use flow/state for decisions, lifecycle changes, validation, orchestration, and
recovery logic.

- Use rounded rectangles for actions or states, diamonds for consequential
  decisions, and small ellipses for entry and terminal outcomes.
- Put a short question in each decision and put outcomes such as `valid`,
  `timeout`, or `retry` on outgoing arrows.
- Make the happy path the strongest continuous route. Give failure and recovery
  paths a quieter semantic color, then reconnect them visibly or terminate
  them.
- For state-focused diagrams, name nodes as conditions (`Pending`, `Paid`) and
  arrows as events (`payment.confirmed`). For process-focused diagrams, name
  nodes as actions (`Validate payment`).
- Show loops only when their exit condition is explicit. Mark timeouts,
  queues, and human waits as meaningful boundaries rather than ordinary steps.

Use a single left-to-right or top-to-bottom direction. A path passes review when
every decision has labeled outcomes and every reachable branch has a visible
continuation or terminal state.

## Shared visual language

- Treat UML symbols as a compact vocabulary, not a compliance target. Prefer a
  short label or tiny legend when a symbol could be read two ways.
- Keep domain elements prominent and notation quiet. Theme color should encode
  role, boundary, or state rather than decorate every node differently.
- Prefer meaningful whitespace and direct connectors over dense grids.
- Use verified names from the code, issue, specification, or product model.
  Mark proposed elements as `proposed` or visually distinguish them from
  implemented behavior.
- Title the diagram with the scenario or design question, not only the notation
  type: `Checkout authorization sequence` is stronger than `Sequence diagram`.

## Review criteria

Before export, verify that the diagram answers its primary question, uses one
consistent notation per region, distinguishes implemented facts from proposals,
and remains understandable to a developer who does not know formal UML.
