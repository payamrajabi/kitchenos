#!/usr/bin/env python3
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path


SUPABASE_URL = "https://ggwqnakrqttydigdsfko.supabase.co"
SUPABASE_KEY = "sb_publishable_YMd4Z4W-tZm3JvAyyJo8cg_UFIpfeFA"

TARGET_NAMES = [
    "Sunday Night Chili",
    "Porridge",
    "Lentil Soup",
    "Coconut Curry with Shrimp",
    "Buddha Bowl with Sweet Potato & Chickpea",
    "3-6-9 dressing",
]


def load_image_map(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    image_map = {}
    for row in data.get("rows", []):
        name = (row.get("name") or "").strip()
        image_url = row.get("imageUrl")
        if not name or name.startswith("http") or not image_url:
            continue
        if name not in image_map:
            image_map[name] = image_url
    return image_map


def update_supabase_image(name, image_url):
    encoded_name = urllib.parse.quote(name)
    url = f"{SUPABASE_URL}/rest/v1/recipes?name=eq.{encoded_name}"
    payload = json.dumps({"image_url": image_url}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        method="PATCH",
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Prefer": "return=representation",
        },
    )
    with urllib.request.urlopen(request) as response:
        if response.status not in (200, 204):
            raise RuntimeError(f"Supabase update failed: {response.status}")
        body = response.read().decode("utf-8")
        return json.loads(body) if body else []


def main():
    image_path = Path(__file__).parent / "notion_recipes_images.json"
    if not image_path.exists():
        raise SystemExit(f"Missing image data: {image_path}")

    image_map = load_image_map(image_path)
    updated = []
    missing = []

    for name in TARGET_NAMES:
        image_url = image_map.get(name)
        if not image_url:
            missing.append(name)
            continue
        rows = update_supabase_image(name, image_url)
        if rows:
            updated.append(name)
        else:
            missing.append(name)

    print("Supabase image update complete.")
    if updated:
        print("Updated:")
        for name in updated:
            print(f"- {name}")
    if missing:
        print("Missing:")
        for name in missing:
            print(f"- {name}")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8")
        print(f"Supabase error: {detail}")
        sys.exit(1)
