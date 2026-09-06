from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


REFERENCES_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REFERENCES_DIR))

from render_excalidraw import default_output_path, export_diagram


SCENE = {
    "type": "excalidraw",
    "version": 2,
    "source": "https://excalidraw.com",
    "elements": [
        {
            "id": "test_rectangle",
            "type": "rectangle",
            "x": 20,
            "y": 20,
            "width": 180,
            "height": 90,
            "angle": 0,
            "strokeColor": "#1e1e1e",
            "backgroundColor": "#a5d8ff",
            "fillStyle": "solid",
            "strokeWidth": 2,
            "strokeStyle": "solid",
            "roughness": 0,
            "opacity": 100,
            "groupIds": [],
            "frameId": None,
            "roundness": {"type": 3},
            "seed": 1,
            "version": 1,
            "versionNonce": 1,
            "isDeleted": False,
            "boundElements": [],
            "updated": 1,
            "link": None,
            "locked": False,
        }
    ],
    "appState": {"viewBackgroundColor": "#ffffff", "gridSize": 20},
    "files": {},
}


class ExportTest(unittest.TestCase):
    def test_default_output_uses_excalidraw_svg_suffix(self) -> None:
        source = Path("architecture.excalidraw")
        self.assertEqual(
            default_output_path(source, "svg"),
            Path("architecture.excalidraw.svg"),
        )

    def test_svg_and_png_round_trip_through_excalidraw(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            source = directory / "diagram.excalidraw"
            preview = directory / "preview.png"
            source.write_text(json.dumps(SCENE), encoding="utf-8")

            svg_path = export_diagram(source, preview_path=preview)
            png_path = export_diagram(source, output_format="png")

            self.assertEqual(svg_path.name, "diagram.excalidraw.svg")
            self.assertIn("<metadata", svg_path.read_text(encoding="utf-8"))
            self.assertEqual(preview.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(png_path.name, "diagram.excalidraw.png")
            self.assertEqual(png_path.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")


if __name__ == "__main__":
    unittest.main()
