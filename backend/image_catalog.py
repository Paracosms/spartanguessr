import json
import math
import re


MAP_WIDTH = 1428
MAP_HEIGHT = 1503
ALLOWED_DIFFICULTIES = {"easy", "medium", "hard"}
ALLOWED_LOCATIONS = {"inside", "outside"}
IMAGE_ID_PATTERN = re.compile(r"^[0-9a-f]{32,}$")
OBJECT_KEY_PATTERN = re.compile(r"^[0-9a-f]{32,}\.jpg$")


def load_image_catalog(path):
    if not path:
        raise RuntimeError("IMAGE_CATALOG_PATH is required.")

    try:
        with open(path, "r", encoding="utf-8") as catalog_file:
            catalog = json.load(catalog_file, object_pairs_hook=_reject_duplicate_keys)
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Unable to load image catalog: {exc}") from exc

    if not isinstance(catalog, dict) or catalog.get("version") != 1:
        raise RuntimeError("Image catalog version must be 1.")

    images = catalog.get("images")
    if not isinstance(images, dict) or not images:
        raise RuntimeError("Image catalog must contain a nonempty images object.")

    image_by_id = {}
    image_ids_by_bucket = {
        difficulty: {location: [] for location in ALLOWED_LOCATIONS}
        for difficulty in ALLOWED_DIFFICULTIES
    }
    object_keys = set()

    for image_id, record in images.items():
        if not isinstance(image_id, str) or not IMAGE_ID_PATTERN.fullmatch(image_id):
            raise RuntimeError(f"Invalid image ID: {image_id!r}.")
        if not isinstance(record, dict):
            raise RuntimeError(f"Image record {image_id!r} must be an object.")

        object_key = record.get("object_key")
        if not isinstance(object_key, str) or not OBJECT_KEY_PATTERN.fullmatch(object_key):
            raise RuntimeError(f"Invalid object key for image {image_id!r}.")
        if object_key in object_keys:
            raise RuntimeError(f"Duplicate object key: {object_key!r}.")
        object_keys.add(object_key)

        difficulty = record.get("difficulty")
        location = record.get("location")
        if difficulty not in ALLOWED_DIFFICULTIES:
            raise RuntimeError(f"Invalid difficulty for image {image_id!r}.")
        if location not in ALLOWED_LOCATIONS:
            raise RuntimeError(f"Invalid location for image {image_id!r}.")

        x = record.get("x")
        y = record.get("y")
        if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x):
            raise RuntimeError(f"Invalid x coordinate for image {image_id!r}.")
        if isinstance(y, bool) or not isinstance(y, (int, float)) or not math.isfinite(y):
            raise RuntimeError(f"Invalid y coordinate for image {image_id!r}.")
        if not 0 <= x <= MAP_WIDTH or not 0 <= y <= MAP_HEIGHT:
            raise RuntimeError(f"Coordinates out of bounds for image {image_id!r}.")

        private_record = {
            "object_key": object_key,
            "difficulty": difficulty,
            "location": location,
            "x": x,
            "y": y,
        }
        image_by_id[image_id] = private_record
        image_ids_by_bucket[difficulty][location].append(image_id)

    return image_by_id, image_ids_by_bucket


def _reject_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise RuntimeError(f"Duplicate catalog key: {key!r}.")
        result[key] = value
    return result
