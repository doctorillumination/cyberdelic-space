"""One preservation contract for the core ZIP and existing offline audio parts."""
from __future__ import annotations

import hashlib
from html import escape
import json
from pathlib import Path, PurePosixPath
import re
import zipfile

ARCHIVE = "cyberdelic-space.zip"
MAX_ASSET_BYTES = 25 * 1024 * 1024
IGNORED = {".git", ".gitignore", ".gitattributes", ".github", ".nojekyll",
           ".assetsignore", ".DS_Store", "__pycache__"}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def public_files(site: Path) -> list[Path]:
    return sorted(p for p in site.rglob("*") if p.is_file()
                  and p != site / ARCHIVE
                  and not set(p.relative_to(site).parts).intersection(IGNORED))


def separate_audio(path: Path) -> bool:
    return ((path.parts[0] == "audio" and path.suffix == ".mp3")
            or (path.parts[0] == "audio-bundles" and path.suffix == ".zip"))


def tracking_assets(site: Path) -> list[Path]:
    return sorted(p for p in (site / "fieldwork-runtime").rglob("*")
                  if p.is_file() and p.suffix in {".wasm", ".task"})


def prepare_artwork_parts(site: Path) -> None:
    """Keep optional local tracking models in complete, portable download parts."""
    assets = tracking_assets(site)
    if not assets:
        return
    groups = {}
    for path in assets:
        require(path.stat().st_size < MAX_ASSET_BYTES, "Static asset exceeds hosting limit")
        groups.setdefault(path.relative_to(site).parts[1], []).append(path)
    folder = site / "artwork-bundles"
    folder.mkdir(exist_ok=True)
    parts = []
    for slug, paths in sorted(groups.items()):
        target = folder / (slug + "-hand-tracking.zip")
        files = []
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in paths:
                data = path.read_bytes()
                name = path.relative_to(site).as_posix()
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o644 << 16
                archive.writestr(info, data)
                files.append({"path": name, "length": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        data = target.read_bytes()
        require(len(data) < MAX_ASSET_BYTES, "Artwork part exceeds hosting limit")
        parts.append({"artwork": slug, "path": target.relative_to(site).as_posix(),
                      "length": len(data), "sha256": hashlib.sha256(data).hexdigest(), "files": files})
    (site / "artwork-bundles.json").write_text(json.dumps({
        "schema": "cyberdelic.space/artwork-bundles-v1", "parts": parts}, indent=2) + "\n")
    mirror = site / "mirror/index.html"
    if mirror.exists():
        links = " ".join('<a href="../' + escape(p["path"]) + '" download>' +
                         escape(p["artwork"].title()) + ' hand tracking</a>' for p in parts)
        section = ('<section id="artwork-mirror"><h2>Copy the artwork tracking models</h2>'
                   '<p>For a complete offline copy, also download and extract these parts '
                   'into the core archive folder. They contain the local hand-tracking '
                   'models. The artworks open without enabling a camera.</p><p>' + links + '</p></section>')
        html = mirror.read_text()
        if 'id="artwork-mirror"' in html:
            html = re.sub(r'<section id="artwork-mirror">.*?</section>', section, html, flags=re.S)
        else:
            html = html.replace("</article>", section + "</article>", 1)
        mirror.write_text(html)


def validate_artwork_parts(site: Path) -> set[str]:
    catalog = site / "artwork-bundles.json"
    assets = {p.relative_to(site).as_posix() for p in tracking_assets(site)}
    if not catalog.exists():
        return set()
    data = json.loads(catalog.read_text())
    require(data["schema"] == "cyberdelic.space/artwork-bundles-v1", "Invalid artwork parts")
    packaged, parts = set(), set()
    for part in data["parts"]:
        path = safe_path(site, part["path"])
        require(path.relative_to(site).parts[0] == "artwork-bundles", "Invalid artwork part path")
        content = path.read_bytes()
        require(len(content) == part["length"] and len(content) < MAX_ASSET_BYTES and
                hashlib.sha256(content).hexdigest() == part["sha256"], "Artwork part digest differs")
        require(part["path"] not in parts, "Duplicated artwork part")
        parts.add(part["path"])
        records = {record["path"]: record for record in part["files"]}
        require(len(records) == len(part["files"]), "Duplicate artwork assets")
        with zipfile.ZipFile(path) as archive:
            require(len(archive.namelist()) == len(records) and set(archive.namelist()) == set(records),
                    "Artwork part inventory differs")
            for name, record in records.items():
                require(name in assets and name not in packaged, "Unexpected or duplicate tracking asset")
                raw = safe_path(site, name).read_bytes()
                require(len(raw) == record["length"] and hashlib.sha256(raw).hexdigest() == record["sha256"]
                        and archive.read(name) == raw, "Packaged artwork bytes differ: " + name)
                packaged.add(name)
    actual_parts = {p.relative_to(site).as_posix() for p in (site / "artwork-bundles").glob("*.zip")}
    require(packaged == assets and parts == actual_parts, "Artwork parts do not cover every tracking asset")
    return packaged | parts


def safe_path(site: Path, name: str) -> Path:
    path = PurePosixPath(name)
    require(bool(name) and not path.is_absolute() and ".." not in path.parts
            and "\\" not in name and str(path) == name, "Unsafe mirror path: " + name)
    target = site / path
    require(target.resolve().is_relative_to(site.resolve()), "Mirror path escapes site: " + name)
    require(target.is_file(), "Missing mirror resource: " + name)
    return target


def checked_bytes(site: Path, record: dict, prefix: str) -> bytes:
    name = record[prefix + "_path"]
    data = safe_path(site, name).read_bytes()
    require(len(data) == record[prefix + "_length"], "Resource length differs: " + name)
    require(hashlib.sha256(data).hexdigest() == record[prefix + "_sha256"],
            "Resource digest differs: " + name)
    return data


def validate_audio_parts(site: Path) -> int:
    """Prove every MP3 survives in a declared, byte-verified downloadable part.

    Audio parts are reused, not regenerated, by the daily offices. The union
    of the core and these parts is the portable site, not the core ZIP alone.
    """
    actual = {p.relative_to(site).as_posix() for p in public_files(site)
              if p.relative_to(site).parts[0] == "audio" and p.suffix == ".mp3"}
    parts_on_disk = {p.relative_to(site).as_posix() for p in public_files(site)
                     if p.relative_to(site).parts[0] == "audio-bundles" and p.suffix == ".zip"}
    if not actual and not parts_on_disk and not (site / "narrations.json").exists():
        return 0
    require((site / "narrations.json").is_file(), "Audio requires a narration catalog")
    catalog = json.loads((site / "narrations.json").read_text())
    items = catalog["items"]
    expected = {item["audio_path"] for item in items}
    require(len(expected) == len(items), "Duplicated audio catalog paths")
    require(actual == expected, "Catalog does not cover every MP3")
    for item in items:
        path = PurePosixPath(item["audio_path"])
        require(path.parts[0] == "audio" and path.suffix == ".mp3", "Invalid audio path")
        data = checked_bytes(site, item, "audio")
        require(len(data) < MAX_ASSET_BYTES, "Recording exceeds hosting limit")
        checked_bytes(site, item, "reading")
    parts = catalog["mirror_audio_bundles"]
    declared = {part["path"] for part in parts}
    require(len(declared) == len(parts) and declared == parts_on_disk,
            "Audio part inventory differs from catalog")
    packaged = set()
    for part in parts:
        target = safe_path(site, part["path"])
        data = target.read_bytes()
        require(len(data) == part["length"] and len(data) < MAX_ASSET_BYTES,
                "Audio part length or hosting limit failed: " + part["path"])
        require(hashlib.sha256(data).hexdigest() == part["sha256"],
                "Audio part digest differs: " + part["path"])
        with zipfile.ZipFile(target) as archive:
            names = archive.namelist()
            require(len(set(names)) == len(names), "Duplicate entries within audio part")
            require(not packaged.intersection(names), "Duplicate audio across parts")
            require(set(names).issubset(expected), "Unexpected resource in audio part")
            for name in names:
                require(archive.read(name) == safe_path(site, name).read_bytes(),
                        "Packaged audio bytes differ: " + name)
            packaged.update(names)
    require(packaged == expected, "Offline parts do not preserve every recording")
    return len(expected)


def build_core_mirror(site: Path) -> None:
    """Write only the core ZIP after checking the complete multipart audio set."""
    validate_audio_parts(site)
    prepare_artwork_parts(site)
    separate_artwork = validate_artwork_parts(site)
    members = public_files(site)
    for path in members:
        require(path.stat().st_size < MAX_ASSET_BYTES,
                "Static asset exceeds hosting limit: " + path.relative_to(site).as_posix())
    with zipfile.ZipFile(site / ARCHIVE, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in members:
            relative = path.relative_to(site)
            if separate_audio(relative) or relative.as_posix() in separate_artwork:
                continue
            info = zipfile.ZipInfo(relative.as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())
    require((site / ARCHIVE).stat().st_size < MAX_ASSET_BYTES,
            "Core mirror exceeds hosting limit")


def validate_mirror(site: Path) -> int:
    require((site / ARCHIVE).stat().st_size < MAX_ASSET_BYTES,
            "Core mirror exceeds hosting limit")
    separate_artwork = validate_artwork_parts(site)
    expected = {p.relative_to(site).as_posix() for p in public_files(site)
                if not separate_audio(p.relative_to(site)) and p.relative_to(site).as_posix() not in separate_artwork}
    with zipfile.ZipFile(site / ARCHIVE) as archive:
        require(len(archive.namelist()) == len(set(archive.namelist())), "Duplicate core entries")
        require(set(archive.namelist()) == expected, "Core mirror inventory differs")
        for info in archive.infolist():
            require(info.file_size < MAX_ASSET_BYTES,
                    "Static asset exceeds hosting limit: " + info.filename)
            require(info.date_time == (1980, 1, 1, 0, 0, 0), "Nondeterministic mirror timestamp")
            require(archive.read(info.filename) == safe_path(site, info.filename).read_bytes(),
                    "Core mirror bytes differ: " + info.filename)
    return validate_audio_parts(site)
