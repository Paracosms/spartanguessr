# Image migration tool

This tool creates opaque, metadata-stripped JPEG copies of legacy SpartanGuessr images and generates records to add to Render's private `image_catalog.json` secret file. It does not upload images or access any server credentials.

## Legacy image names

Place one difficulty/location group of images in a folder. Each JPEG filename must contain its minimap coordinates in exactly this format:

```text
(647,425).JPG
(981,516).jpg
```

Spaces, descriptive text, and coordinates outside the 1428-by-1503 minimap are rejected. The folder may contain non-JPEG files, but every `.jpg` or `.jpeg` file in it must use the legacy naming format.

## Setup

From the repository root:

```powershell
python -m pip install -r migrate/requirements.txt
```

## Run the migration

Open PowerShell in the folder containing the legacy images. Run the script by its path and provide the group shared by those images:

```powershell
python C:\path\to\spartanguessr\migrate\migrate.py --difficulty easy --location inside
```

Allowed values are:

- `--difficulty`: `easy`, `medium`, or `hard`
- `--location`: `inside` or `outside`

The script validates all input filenames before creating:

- `migrated-images/`: JPEG copies named with random 128-bit identifiers, such as `009caf4849c5aec7fe96c3a355a7ad01.jpg`
- `image_catalog_additions.json`: the matching private catalog records

Original images are never changed. To prevent accidental replacement, the script stops if either output already exists.

## Upload and update Render

1. Upload every file inside `migrated-images/` to the active R2 image bucket. Use the filename as the object key.
2. Set each object's metadata to:
   - `Content-Type: image/jpeg`
   - `Cache-Control: public, max-age=31536000, immutable`
3. Open `image_catalog_additions.json`.
4. Merge all top-level entries from that file into the existing `"images"` object in Render's `image_catalog.json` secret file. Do not replace the catalog's `"version": 1` field.

For example, change:

```json
{
  "version": 1,
  "images": {
    "existing-id": {
      "object_key": "existing-id.jpg",
      "difficulty": "easy",
      "location": "outside",
      "x": 100,
      "y": 200
    }
  }
}
```

to:

```json
{
  "version": 1,
  "images": {
    "existing-id": {
      "object_key": "existing-id.jpg",
      "difficulty": "easy",
      "location": "outside",
      "x": 100,
      "y": 200
    },
    "009caf4849c5aec7fe96c3a355a7ad01": {
      "object_key": "009caf4849c5aec7fe96c3a355a7ad01.jpg",
      "difficulty": "easy",
      "location": "inside",
      "x": 647,
      "y": 425
    }
  }
}
```

After saving the Render secret file, redeploy or restart the backend so it loads the updated catalog.
