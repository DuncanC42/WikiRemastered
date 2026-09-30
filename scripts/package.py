"""Build the installable folder and ZIP: python3 scripts/package.py."""

import json
from pathlib import Path
import shutil
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "extension"
DIST = ROOT / "dist"
NAME = "WikiMasterEnhancer"


def package():
    DIST.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="wme-package-", dir=DIST) as temporary:
        staged = Path(temporary) / NAME
        staged.mkdir()
        # Ship runtime assets only; personal notes and development labs stay out.
        for source in sorted(SOURCE.iterdir()):
            if source.is_file() and source.suffix in {".js", ".css", ".json", ".svg", ".png"}:
                shutil.copy2(source, staged / source.name)
        manifest = json.loads((staged / "manifest.json").read_text())
        required = [manifest["background"]["service_worker"]]
        for content_script in manifest["content_scripts"]:
            required.extend(content_script.get("js", []))
            required.extend(content_script.get("css", []))
        for resource_group in manifest["web_accessible_resources"]:
            required.extend(resource_group["resources"])
        missing = [name for name in required if not (staged / name).is_file()]
        if missing:
            raise ValueError(f"Ressources manquantes : {', '.join(missing)}")
        manifest_icons = list(manifest.get("icons", {}).values())
        missing_icons = [name for name in manifest_icons if not (staged / name).is_file()]
        if missing_icons:
            raise ValueError(f"Icônes manquantes : {', '.join(missing_icons)}")
        # The Chrome Web Store wants manifest.json at the root of the archive: a separate ZIP,
        # made before the installation note is added (the store does not need it).
        store_zip = DIST / f"WikiRemastered-{manifest['version']}-chrome-web-store.zip"
        with zipfile.ZipFile(store_zip, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(staged.iterdir()):
                archive.write(path, path.name)
        (staged / "INSTALLATION.txt").write_text(
            "WikiRemastered pour Wiki Masters — " + manifest["version"] + "\n\n"
            "1. Ouvrir arc://extensions (ou chrome://extensions / edge://extensions).\n"
            "2. Activer le mode développeur.\n"
            "3. Charger l’extension non empaquetée et sélectionner ce dossier\n"
            "   WikiMasterEnhancer, qui contient directement manifest.json.\n"
            "4. Recharger les onglets Wiki Masters.\n",
            encoding="utf-8",
        )
        staged_zip = Path(temporary) / f"{NAME}.zip"
        with zipfile.ZipFile(staged_zip, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(staged.iterdir()):
                archive.write(path, f"{NAME}/{path.name}")
        # Both outputs are generated together, so the extracted folder cannot lag
        # behind the archive. Replace the old nested distribution completely.
        target = DIST / NAME
        if target.exists():
            shutil.rmtree(target)
        shutil.move(str(staged), target)
        staged_zip.replace(DIST / f"{NAME}.zip")
    print(f"Version {manifest['version']} : {target}")
    print(f"Archive : {DIST / (NAME + '.zip')}")
    print(f"Chrome Web Store : {store_zip}")


if __name__ == "__main__":
    package()
