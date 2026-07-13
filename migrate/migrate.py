"""Convert legacy coordinate-named images into opaque catalog entries."""

import argparse
import io
import json
import re
import secrets
from pathlib import Path

from PIL import Image


MAP_WIDTH = 1428
MAP_HEIGHT = 1503
OUTPUT_DIRECTORY = "migrated-images"
CATALOG_OUTPUT = "image_catalog_additions.json"
LEGACY_FILENAME = re.compile(r"^\((\d+),(\d+)\)\.(?:jpe?g)$", re.IGNORECASE)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Copy legacy (x,y).jpg images to random names and generate catalog additions."
    )
    parser.add_argument("--difficulty", required=True, choices=("easy", "medium", "hard"))
    parser.add_argument("--location", required=True, choices=("inside", "outside"))
    return parser.parse_args()


def find_source_images(directory):
    sources = []
    invalid_images = []

    for path in sorted(directory.iterdir(), key=lambda item: item.name.lower()):
        if not path.is_file() or path.name == CATALOG_OUTPUT:
            continue
        if path.suffix.lower() not in (".jpg", ".jpeg"):
            continue

        match = LEGACY_FILENAME.fullmatch(path.name)
        if not match:
            invalid_images.append(path.name)
            continue

        x, y = (int(value) for value in match.groups())
        if not 0 <= x <= MAP_WIDTH or not 0 <= y <= MAP_HEIGHT:
            raise ValueError(
                f"Coordinates in {path.name!r} are outside the {MAP_WIDTH}x{MAP_HEIGHT} map."
            )
        sources.append((path, x, y))

    if invalid_images:
        names = ", ".join(repr(name) for name in invalid_images)
        raise ValueError(f"JPEG files with invalid legacy names: {names}")
    if not sources:
        raise ValueError("No images matching the legacy (x,y).jpg naming format were found.")

    return sources


def generate_image_id(existing_ids):
    while True:
        image_id = secrets.token_hex(16)
        if image_id not in existing_ids:
            return image_id


def reencode_jpeg(source):
    with Image.open(source) as image:
        output = io.BytesIO()
        image.convert("RGB").save(output, format="JPEG", quality=95, optimize=True)
    return output.getvalue()


def migrate(directory, difficulty, location):
    sources = find_source_images(directory)
    output_directory = directory / OUTPUT_DIRECTORY
    catalog_path = directory / CATALOG_OUTPUT

    if output_directory.exists():
        raise FileExistsError(f"Output directory already exists: {output_directory}")
    if catalog_path.exists():
        raise FileExistsError(f"Catalog output already exists: {catalog_path}")

    records = {}
    encoded_images = []
    for source, x, y in sources:
        image_id = generate_image_id(records)
        object_key = f"{image_id}.jpg"
        encoded_images.append((object_key, reencode_jpeg(source)))
        records[image_id] = {
            "object_key": object_key,
            "difficulty": difficulty,
            "location": location,
            "x": x,
            "y": y,
        }

    output_directory.mkdir()
    for object_key, image_bytes in encoded_images:
        (output_directory / object_key).write_bytes(image_bytes)

    catalog_path.write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
    return len(records)


def main():
    args = parse_args()
    try:
        count = migrate(Path.cwd(), args.difficulty, args.location)
    except (FileExistsError, OSError, ValueError) as error:
        raise SystemExit(f"Migration failed: {error}") from error

    print(f"Created {count} migrated images in {OUTPUT_DIRECTORY}/")
    print(f"Catalog additions written to {CATALOG_OUTPUT}")


if __name__ == "__main__":
    main()
