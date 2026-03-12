"""Tests for file-overlap independence check."""

import json
import subprocess
import sys

import pytest

from pf.preflight.independence import (
    UnitDefinition,
    check_independence,
    parse_units_from_json,
)


class TestCheckIndependence:
    """Core independence check logic."""

    def test_empty_units(self):
        result = check_independence([])
        assert result.status == "pass"
        assert result.independent is True

    def test_single_unit(self):
        units = [UnitDefinition(id="1", files=["a.ts", "b.ts"])]
        result = check_independence(units)
        assert result.status == "pass"
        assert result.independent is True
        assert result.unit_count == 1
        assert result.file_count == 2

    def test_independent_units(self):
        units = [
            UnitDefinition(id="1", files=["a.ts", "b.ts"]),
            UnitDefinition(id="2", files=["c.ts", "d.ts"]),
            UnitDefinition(id="3", files=["e.ts", "f.ts"]),
        ]
        result = check_independence(units)
        assert result.status == "pass"
        assert result.independent is True
        assert result.unit_count == 3
        assert result.file_count == 6
        assert result.overlaps == []

    def test_overlapping_units(self):
        units = [
            UnitDefinition(id="1", files=["a.ts", "b.ts"]),
            UnitDefinition(id="2", files=["b.ts", "c.ts"]),
        ]
        result = check_independence(units)
        assert result.status == "fail"
        assert result.independent is False
        assert len(result.overlaps) == 1
        assert result.overlaps[0].file == "b.ts"
        assert result.overlaps[0].units == ["1", "2"]

    def test_multiple_overlaps(self):
        units = [
            UnitDefinition(id="1", files=["a.ts", "b.ts", "shared.ts"]),
            UnitDefinition(id="2", files=["c.ts", "shared.ts"]),
            UnitDefinition(id="3", files=["b.ts", "d.ts"]),
        ]
        result = check_independence(units)
        assert result.status == "fail"
        assert result.independent is False
        assert len(result.overlaps) == 2
        # Overlaps sorted by file path
        assert result.overlaps[0].file == "b.ts"
        assert result.overlaps[0].units == ["1", "3"]
        assert result.overlaps[1].file == "shared.ts"
        assert result.overlaps[1].units == ["1", "2"]

    def test_three_units_same_file(self):
        units = [
            UnitDefinition(id="1", files=["shared.ts"]),
            UnitDefinition(id="2", files=["shared.ts"]),
            UnitDefinition(id="3", files=["shared.ts"]),
        ]
        result = check_independence(units)
        assert result.status == "fail"
        assert len(result.overlaps) == 1
        assert result.overlaps[0].units == ["1", "2", "3"]

    def test_path_normalization(self):
        units = [
            UnitDefinition(id="1", files=["./src/a.ts"]),
            UnitDefinition(id="2", files=["src/a.ts"]),
        ]
        result = check_independence(units)
        assert result.status == "fail"
        assert result.independent is False

    def test_to_dict(self):
        units = [
            UnitDefinition(id="1", files=["a.ts"]),
            UnitDefinition(id="2", files=["b.ts"]),
        ]
        result = check_independence(units)
        d = result.to_dict()
        assert d["status"] == "pass"
        assert d["independent"] is True
        assert d["unit_count"] == 2
        assert d["file_count"] == 2
        assert "overlaps" not in d

    def test_to_dict_with_overlaps(self):
        units = [
            UnitDefinition(id="1", files=["a.ts"]),
            UnitDefinition(id="2", files=["a.ts"]),
        ]
        result = check_independence(units)
        d = result.to_dict()
        assert d["status"] == "fail"
        assert len(d["overlaps"]) == 1
        assert d["overlaps"][0]["file"] == "a.ts"
        assert d["overlaps"][0]["units"] == ["1", "2"]


class TestParseUnitsFromJson:
    """JSON parsing for unit definitions."""

    def test_parse_with_units_key(self):
        json_str = json.dumps(
            {
                "units": [
                    {"id": "1", "files": ["a.ts"], "description": "Unit 1"},
                    {"id": "2", "files": ["b.ts"], "description": "Unit 2"},
                ]
            }
        )
        units = parse_units_from_json(json_str)
        assert len(units) == 2
        assert units[0].id == "1"
        assert units[0].files == ["a.ts"]

    def test_parse_bare_array(self):
        json_str = json.dumps(
            [
                {"id": "1", "files": ["a.ts"]},
                {"id": "2", "files": ["b.ts"]},
            ]
        )
        units = parse_units_from_json(json_str)
        assert len(units) == 2

    def test_parse_numeric_id(self):
        json_str = json.dumps({"units": [{"id": 1, "files": ["a.ts"]}]})
        units = parse_units_from_json(json_str)
        assert units[0].id == "1"

    def test_parse_missing_files(self):
        json_str = json.dumps({"units": [{"id": "1"}]})
        units = parse_units_from_json(json_str)
        assert units[0].files == []

    def test_parse_invalid_json(self):
        with pytest.raises(json.JSONDecodeError):
            parse_units_from_json("not json")

    def test_parse_invalid_structure(self):
        with pytest.raises(ValueError):
            parse_units_from_json(json.dumps({"not_units": []}))


class TestCli:
    """CLI integration smoke test."""

    def test_cli_with_independent_units(self):
        units_json = json.dumps(
            {
                "units": [
                    {"id": "1", "files": ["a.ts"]},
                    {"id": "2", "files": ["b.ts"]},
                ]
            }
        )
        result = subprocess.run(
            [sys.executable, "-m", "pf.preflight", "independence", "--units", units_json],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0
        output = json.loads(result.stdout)
        assert output["independent"] is True

    def test_cli_with_overlapping_units(self):
        units_json = json.dumps(
            {
                "units": [
                    {"id": "1", "files": ["a.ts"]},
                    {"id": "2", "files": ["a.ts"]},
                ]
            }
        )
        result = subprocess.run(
            [sys.executable, "-m", "pf.preflight", "independence", "--units", units_json],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 1
        output = json.loads(result.stdout)
        assert output["independent"] is False
        assert len(output["overlaps"]) == 1
