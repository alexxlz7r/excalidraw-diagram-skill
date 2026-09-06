"""Export Excalidraw JSON as an editable SVG or PNG image.

Usage:
    uv run python render_excalidraw.py diagram.excalidraw
    uv run python render_excalidraw.py diagram.excalidraw --format png

The default output is ``diagram.excalidraw.svg``. Both formats embed the scene
and can be reopened in Excalidraw or the Excalidraw VS Code extension.
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path


def validate_excalidraw(data: dict) -> list[str]:
    """Validate Excalidraw JSON structure. Returns list of errors (empty = valid)."""
    errors: list[str] = []

    if data.get("type") != "excalidraw":
        errors.append(f"Expected type 'excalidraw', got '{data.get('type')}'")

    if "elements" not in data:
        errors.append("Missing 'elements' array")
    elif not isinstance(data["elements"], list):
        errors.append("'elements' must be an array")
    elif len(data["elements"]) == 0:
        errors.append("'elements' array is empty — nothing to render")

    return errors


def default_output_path(input_path: Path, output_format: str) -> Path:
    """Return VS Code Excalidraw's editable-image filename for an input scene."""
    name = input_path.name
    for suffix in (".excalidraw.json", ".excalidraw"):
        if name.lower().endswith(suffix):
            name = name[: -len(suffix)]
            break
    else:
        name = input_path.stem
    return input_path.with_name(f"{name}.excalidraw.{output_format}")


def infer_format(output_path: Path) -> str | None:
    """Infer an image format from an explicit output filename."""
    suffix = output_path.suffix.lower()
    return suffix.removeprefix(".") if suffix in {".svg", ".png"} else None


def compute_bounding_box(elements: list[dict]) -> tuple[float, float, float, float]:
    """Compute bounding box (min_x, min_y, max_x, max_y) across all elements."""
    min_x = float("inf")
    min_y = float("inf")
    max_x = float("-inf")
    max_y = float("-inf")

    for el in elements:
        if el.get("isDeleted"):
            continue
        x = el.get("x", 0)
        y = el.get("y", 0)
        w = el.get("width", 0)
        h = el.get("height", 0)

        # For arrows/lines, points array defines the shape relative to x,y
        if el.get("type") in ("arrow", "line") and "points" in el:
            for px, py in el["points"]:
                min_x = min(min_x, x + px)
                min_y = min(min_y, y + py)
                max_x = max(max_x, x + px)
                max_y = max(max_y, y + py)
        else:
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x + abs(w))
            max_y = max(max_y, y + abs(h))

    if min_x == float("inf"):
        return (0, 0, 800, 600)

    return (min_x, min_y, max_x, max_y)


def export_diagram(
    excalidraw_path: Path,
    output_path: Path | None = None,
    output_format: str | None = None,
    scale: int = 1,
    max_width: int = 1920,
    preview_path: Path | None = None,
) -> Path:
    """Export an editable image and verify that its embedded scene can be loaded."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: playwright not installed.", file=sys.stderr)
        print("Run: ./setup_renderer.sh", file=sys.stderr)
        sys.exit(1)

    raw = excalidraw_path.read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON in {excalidraw_path}: {e}", file=sys.stderr)
        sys.exit(1)

    errors = validate_excalidraw(data)
    if errors:
        print("ERROR: Invalid Excalidraw file:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        sys.exit(1)

    explicit_format = infer_format(output_path) if output_path else None
    if output_format and explicit_format and output_format != explicit_format:
        print(
            f"ERROR: --format {output_format} conflicts with output file {output_path}",
            file=sys.stderr,
        )
        sys.exit(1)
    output_format = output_format or explicit_format or "svg"
    if output_format not in {"svg", "png"}:
        print("ERROR: Output format must be svg or png", file=sys.stderr)
        sys.exit(1)
    if scale not in {1, 2, 3}:
        print("ERROR: Scale must be 1, 2, or 3", file=sys.stderr)
        sys.exit(1)
    output_path = output_path or default_output_path(excalidraw_path, output_format)
    expected_suffix = f".excalidraw.{output_format}"
    if not output_path.name.lower().endswith(expected_suffix):
        print(
            f"ERROR: Output filename must end with {expected_suffix} for VS Code compatibility",
            file=sys.stderr,
        )
        sys.exit(1)
    if preview_path is not None and preview_path.suffix.lower() != ".png":
        print("ERROR: Preview filename must end with .png", file=sys.stderr)
        sys.exit(1)

    elements = [e for e in data["elements"] if not e.get("isDeleted")]
    min_x, min_y, max_x, max_y = compute_bounding_box(elements)
    padding = 80
    diagram_w = max_x - min_x + padding * 2
    diagram_h = max_y - min_y + padding * 2
    vp_width = max(320, min(int(diagram_w), max_width))
    vp_height = max(int(diagram_h), 600)

    template_path = Path(__file__).parent / "render_template.html"
    if not template_path.exists():
        print(f"ERROR: Template not found at {template_path}", file=sys.stderr)
        sys.exit(1)

    bundle_path = template_path.parent / "vendor" / "excalidraw-bundle.js"
    if not bundle_path.exists():
        print(f"ERROR: Excalidraw bundle not found at {bundle_path}", file=sys.stderr)
        print("Run: ./setup_renderer.sh", file=sys.stderr)
        sys.exit(1)

    template_url = template_path.as_uri()

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(headless=True)
        except Exception as e:
            if "Executable doesn't exist" in str(e) or "browserType.launch" in str(e):
                print("ERROR: Chromium not installed for Playwright.", file=sys.stderr)
                print("Run: ./setup_renderer.sh", file=sys.stderr)
                sys.exit(1)
            raise

        page = browser.new_page(
            viewport={"width": vp_width, "height": vp_height},
            device_scale_factor=1,
        )
        page.goto(template_url)
        page.wait_for_function("window.__moduleReady === true", timeout=15000)

        result = page.evaluate(
            "([data, format, scale, preview]) => "
            "window.exportDiagram(data, format, scale, preview)",
            [data, output_format, scale, preview_path is not None],
        )

        if not result or not result.get("success"):
            error_msg = (
                result.get("error", "Unknown export error")
                if result
                else "exportDiagram returned null"
            )
            print(f"ERROR: Export failed: {error_msg}", file=sys.stderr)
            browser.close()
            sys.exit(1)

        page.wait_for_function("window.__renderComplete === true", timeout=15000)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        if output_format == "svg":
            output_path.write_text(result["payload"], encoding="utf-8")
        else:
            output_path.write_bytes(base64.b64decode(result["payload"], validate=True))

        if preview_path is not None:
            svg_element = page.query_selector("#root svg")
            if svg_element is None:
                print("ERROR: No SVG element found for preview", file=sys.stderr)
                browser.close()
                sys.exit(1)
            preview_path.parent.mkdir(parents=True, exist_ok=True)
            svg_element.screenshot(path=str(preview_path))
        browser.close()

    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export Excalidraw JSON to an editable .excalidraw.svg or .excalidraw.png"
    )
    parser.add_argument("input", type=Path, help="Path to .excalidraw JSON file")
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=None,
        help="Output path ending in .excalidraw.svg or .excalidraw.png",
    )
    parser.add_argument(
        "--format",
        "-f",
        choices=("svg", "png"),
        default=None,
        help="Output format (default: svg; inferred from --output when supplied)",
    )
    parser.add_argument(
        "--scale",
        "-s",
        type=int,
        choices=(1, 2, 3),
        default=1,
        help="PNG export scale (default: 1, matching the VS Code extension)",
    )
    parser.add_argument(
        "--preview",
        type=Path,
        default=None,
        help="Also write a PNG preview for visual inspection (use a temporary path)",
    )
    parser.add_argument(
        "--width",
        "-w",
        type=int,
        default=1920,
        help="Maximum browser viewport width used for previews (default: 1920)",
    )
    args = parser.parse_args()

    if not args.input.exists():
        print(f"ERROR: File not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    output_path = export_diagram(
        args.input,
        output_path=args.output,
        output_format=args.format,
        scale=args.scale,
        max_width=args.width,
        preview_path=args.preview,
    )
    print(str(output_path))


if __name__ == "__main__":
    main()
