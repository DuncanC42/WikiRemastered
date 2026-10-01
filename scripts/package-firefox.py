"""Build the Firefox version from the same sources: python3 scripts/package-firefox.py.

Only the manifest differs from Chrome:
- background: Firefox runs an event page (`scripts`), not a `service_worker`;
- browser_specific_settings.gecko: an add-on ID (needed for storage and for AMO), the minimum
  version (140: MAIN-world content scripts, install-time host permissions, data-collection key)
  and the data-collection declaration required by addons.mozilla.org;
- minimum_chrome_version is dropped (Firefox warns about the unknown key).
"""

import json
from pathlib import Path
import shutil
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "extension"
DIST = ROOT / "dist"
NAME = "WikiRemastered-firefox"
GECKO_ID = "wikiremastered@lypningeuh"
MIN_FIREFOX = "140.0"


def firefox_manifest(manifest):
    manifest = dict(manifest)
    manifest.pop("minimum_chrome_version", None)
    background = manifest.pop("background")
    manifest["background"] = {"scripts": [background["service_worker"]], "type": background.get("type", "classic")}
    manifest["browser_specific_settings"] = {
        "gecko": {
            "id": GECKO_ID,
            "strict_min_version": MIN_FIREFOX,
            # Everything stays in the browser, on wiki-masters.com only (store/privacy.md).
            "data_collection_permissions": {"required": ["none"]},
        }
    }
    return manifest


def package():
    target = DIST / NAME
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    for source in sorted(SOURCE.iterdir()):
        if source.is_file() and source.suffix in {".js", ".css", ".json", ".svg", ".png"}:
            shutil.copy2(source, target / source.name)
    manifest = firefox_manifest(json.loads((target / "manifest.json").read_text()))
    (target / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    required = list(manifest["background"]["scripts"])
    for content_script in manifest["content_scripts"]:
        required += content_script.get("js", []) + content_script.get("css", [])
    for group in manifest["web_accessible_resources"]:
        required += group["resources"]
    required += list(manifest.get("icons", {}).values())
    missing = [name for name in required if not (target / name).is_file()]
    if missing:
        raise ValueError(f"Ressources manquantes : {', '.join(missing)}")

    # AMO and about:debugging both want manifest.json at the root of the archive.
    archive_path = DIST / f"WikiRemastered-{manifest['version']}-firefox.zip"
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(target.iterdir()):
            archive.write(path, path.name)
    print(f"Dossier Firefox : {target}")
    print(f"Archive Firefox : {archive_path}")


if __name__ == "__main__":
    package()