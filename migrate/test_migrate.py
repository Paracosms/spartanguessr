import json
import re
import sys
from pathlib import Path

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from migrate import CATALOG_OUTPUT, OUTPUT_DIRECTORY, migrate


def create_jpeg(path, exif=False):
    image = Image.new("RGB", (2, 2), "blue")
    metadata = Image.Exif()
    if exif:
        metadata[0x010E] = "legacy metadata"
    image.save(path, format="JPEG", exif=metadata)


def test_migration_creates_opaque_copies_and_catalog(tmp_path):
    first = tmp_path / "(647,425).JPG"
    second = tmp_path / "(981,516).jpg"
    create_jpeg(first, exif=True)
    create_jpeg(second)

    assert migrate(tmp_path, "easy", "inside") == 2

    assert first.exists()
    assert second.exists()
    output_files = list((tmp_path / OUTPUT_DIRECTORY).iterdir())
    assert len(output_files) == 2
    assert all(re.fullmatch(r"[0-9a-f]{32}\.jpg", path.name) for path in output_files)
    for path in output_files:
        with Image.open(path) as image:
            assert not image.getexif()

    records = json.loads((tmp_path / CATALOG_OUTPUT).read_text(encoding="utf-8"))
    assert len(records) == 2
    assert {record["x"] for record in records.values()} == {647, 981}
    assert {record["y"] for record in records.values()} == {425, 516}
    assert all(record["difficulty"] == "easy" for record in records.values())
    assert all(record["location"] == "inside" for record in records.values())


def test_invalid_jpeg_name_is_rejected_before_writing(tmp_path):
    create_jpeg(tmp_path / "building.jpg")

    with pytest.raises(ValueError, match="invalid legacy names"):
        migrate(tmp_path, "hard", "outside")

    assert not (tmp_path / OUTPUT_DIRECTORY).exists()
    assert not (tmp_path / CATALOG_OUTPUT).exists()


def test_out_of_bounds_coordinates_are_rejected(tmp_path):
    create_jpeg(tmp_path / "(1429,10).jpg")

    with pytest.raises(ValueError, match="outside"):
        migrate(tmp_path, "medium", "outside")


def test_existing_output_is_not_replaced(tmp_path):
    create_jpeg(tmp_path / "(10,20).jpg")
    (tmp_path / OUTPUT_DIRECTORY).mkdir()

    with pytest.raises(FileExistsError):
        migrate(tmp_path, "easy", "outside")
