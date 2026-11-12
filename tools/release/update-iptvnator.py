#!/usr/bin/env python3
"""Update the fork's amd64 Debian installation using its latest stable release."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request


REPOSITORY = "gpardon-alo/iptvnator"
API_URL = f"https://api.github.com/repos/{REPOSITORY}/releases/latest"


def command(*args):
    return subprocess.run(args, check=True, text=True, capture_output=True).stdout.strip()


def download(url, destination):
    request = urllib.request.Request(url, headers={"User-Agent": "iptvnator-deb-update"})
    with urllib.request.urlopen(request, timeout=60) as response:
        with destination.open("wb") as output:
            shutil.copyfileobj(response, output)


def release_assets(release):
    tag = release.get("tag_name", "")
    if release.get("draft") or release.get("prerelease") or not re.fullmatch(
        r"v\d+\.\d+\.\d+", tag
    ):
        raise ValueError("The latest release is not a stable numeric version.")
    version = tag[1:]
    names = [f"iptvnator-{version}-linux-amd64.deb", "SHA256SUMS"]
    selected = {}
    for name in names:
        matches = [asset for asset in release.get("assets", []) if asset.get("name") == name]
        expected = f"https://github.com/{REPOSITORY}/releases/download/{tag}/{name}"
        if len(matches) != 1 or matches[0].get("browser_download_url") != expected:
            raise ValueError(f"Release is missing a valid {name} asset.")
        selected[name] = expected
    return version, selected


def verify_package(package, checksums, version):
    matches = []
    for line in checksums.read_text(encoding="utf-8").splitlines():
        match = re.fullmatch(r"([0-9a-fA-F]{64}) [ *](.+)", line)
        if match and match[2] == package.name:
            matches.append(match[1].lower())
    if len(matches) != 1:
        raise ValueError("SHA256SUMS must contain exactly one checksum for the installer.")
    digest = hashlib.sha256()
    with package.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    if digest.hexdigest() != matches[0]:
        raise ValueError("Installer checksum mismatch; nothing was installed.")
    for field, expected in [("Package", "iptvnator"), ("Version", version), ("Architecture", "amd64")]:
        if command("dpkg-deb", "-f", str(package), field) != expected:
            raise ValueError(f"Unexpected installer {field}; nothing was installed.")


def installed_version():
    result = subprocess.run(
        ["dpkg-query", "-W", "-f=${Status}\n${Version}", "iptvnator"],
        text=True, capture_output=True, check=False,
    )
    lines = result.stdout.splitlines()
    if result.returncode or len(lines) != 2 or lines[0] != "install ok installed":
        raise ValueError("No installed IPTVnator DEB found. Install the DEB first.")
    return lines[1]


def require_closed():
    result = subprocess.run(["pgrep", "-ix", r"iptvnator([.]bin)?"], capture_output=True, check=False)
    if result.returncode == 0:
        raise ValueError("Close IPTVnator completely, then run this script again.")
    if result.returncode != 1:
        raise ValueError("Could not check whether IPTVnator is running; nothing was installed.")


def update(check_only=False):
    if sys.platform != "linux":
        raise ValueError("Run this script on your Xubuntu/Ubuntu desktop.")
    for name in ["dpkg", "dpkg-query", "dpkg-deb", "apt", "pgrep"]:
        if not shutil.which(name):
            raise ValueError(f"Required command is missing: {name}")
    if command("dpkg", "--print-architecture") != "amd64":
        raise ValueError("This updater supports amd64 DEB installations only.")
    current = installed_version()
    with tempfile.TemporaryDirectory(prefix="iptvnator-update-") as directory:
        work = Path(directory)
        metadata = work / "release.json"
        download(API_URL, metadata)
        version, assets = release_assets(json.loads(metadata.read_text(encoding="utf-8")))
        comparison = subprocess.run(
            ["dpkg", "--compare-versions", version, "gt", current], check=False,
        )
        if comparison.returncode == 1:
            print(f"Already current: installed {current}; latest stable {version}.")
            return
        if comparison.returncode != 0:
            raise ValueError("Could not compare installed and release versions.")
        print(f"Update available: {current} → {version}.", flush=True)
        if check_only:
            return
        require_closed()
        for name, url in assets.items():
            print(f"Downloading {name}…", flush=True)
            download(url, work / name)
        package = work / f"iptvnator-{version}-linux-amd64.deb"
        verify_package(package, work / "SHA256SUMS", version)
        # Let apt's unprivileged download helper read the local installer.
        work.chmod(0o755)
        package.chmod(0o644)
        prefix = [] if os.geteuid() == 0 else ["sudo"]
        if prefix:
            subprocess.run(["sudo", "-v"], check=True)
        require_closed()
        print("Checksum and package identity verified. Keep IPTVnator closed during installation.", flush=True)
        subprocess.run(prefix + ["apt", "install", str(package)], check=True)
        if installed_version() != version:
            raise ValueError("Installation did not complete; the expected version is not installed.")
        print(f"IPTVnator {version} installed. Open it from the application menu.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check only; do not download or install the DEB")
    args = parser.parse_args()
    try:
        update(args.check)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"Update stopped: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nUpdate interrupted.", file=sys.stderr)
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
