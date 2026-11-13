"""The committed engine data must be exactly what tools/tax_data/build.py produces."""
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ENGINE = BACKEND / "app" / "engine"
BUILD = BACKEND / "tools" / "tax_data" / "build.py"


def test_engine_data_matches_the_build(tmp_path):
    result = subprocess.run([sys.executable, str(BUILD), str(tmp_path)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    for name in ("countries.json", "legal_forms.json"):
        assert (tmp_path / name).read_bytes() == (ENGINE / name).read_bytes(), (
            name + " differs from the build: run python3 backend/tools/tax_data/build.py"
        )


def test_sources_are_plain_ascii():
    for path in sorted((BUILD.parent / "sources").glob("*.json")):
        path.read_bytes().decode("ascii")
    BUILD.read_bytes().decode("ascii")
