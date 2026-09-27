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

Generate type maps with `scripts/type_map.mjs`. The script applies the notation
below and calculates the layout. See [type-map-spec.md](type-map-spec.md).

### Letter-badge notation

Draw every type as a header and compartments. The header holds a circle with
the kind letter at the left and the type name after it. Below the header come
the optional responsibility, the fields, and the methods, each in its own
compartment. The named style sets the form: `clean` stacks filled boxes with
sharp corners, and `sketch` draws one rounded outline divided by rules. See
[styles.md](styles.md).

| Kind | Badge | `clean` header tone |
| --- | --- | --- |
| Concrete class | `C` | `orange` |
| Interface | `I` | `blue` |
| Abstract class | `A` | `violet` |

Keep the letters and their meanings stable across styles, with dark readable
text and outlines. The letter carries the kind independently of color, so a
role color can replace the kind color. Add a compact letter legend when the
audience may not know the notation.

Center a single uppercase letter in each true circle (`width === height`).
Align the circle and the name on one horizontal centerline inside the header.
Size the header from the name and each compartment from its content; a type
without members collapses to a header-only box. Use the compound element
recipe in
[element-templates.md](element-templates.md#type-container-with-letter-badge)
for sizing and grouping.

The `A` badge describes the type; mark individual abstract operations only when
the distinction matters, for example `render() {abstract}`. Add relationships
and members only when supported by the source, or clearly label them as
illustrative/proposed.

### Color by architectural role

In `clean`, a role color can replace the kind color. Choose the role
categories from the actual design: components/controllers/services,
domain/adapters/infrastructure, or another useful partition. Assign one
palette hue per role, give it to every type of the role (`tone` in a type map
spec), and explain the mapping in a small legend or labeled zones. The header
uses the second shade of the hue and the compartments the lightest shade; the
C/I/A letters keep the kind visible.

`sketch` has no color. Show roles in `sketch` with zones and their titles.

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

Generate sequence diagrams with `scripts/sequence.mjs`. See
[sequence-spec.md](sequence-spec.md).

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
