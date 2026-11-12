"""Offline updater checks; never invoke apt, sudo, or the network."""

import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "updater", Path(__file__).with_name("update-iptvnator.py")
)
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)
VERSION = "1.2.3"
PACKAGE = f"iptvnator-{VERSION}-linux-amd64.deb"
PAYLOAD = b"synthetic installer"


def release():
    return {
        "tag_name": f"v{VERSION}", "draft": False, "prerelease": False,
        "assets": [
            {"name": name, "browser_download_url":
             f"https://github.com/{updater.REPOSITORY}/releases/download/v{VERSION}/{name}"}
            for name in [PACKAGE, "SHA256SUMS"]
        ],
    }


class UpdateTests(unittest.TestCase):
    def test_rejects_unpublished_or_nonstable_releases(self):
        for change in [{"draft": True}, {"prerelease": True}, {"tag_name": "v1.2.3-nightly.1"}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                updater.release_assets({**release(), **change})

    def test_rejects_missing_duplicate_or_foreign_assets(self):
        for assets in [[], release()["assets"] * 2,
                       [{"name": PACKAGE, "browser_download_url": "https://example.test/file"}]]:
            with self.subTest(assets=assets), self.assertRaises(ValueError):
                updater.release_assets({**release(), "assets": assets})

    def test_validates_checksum_and_each_package_identity_field(self):
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory) / PACKAGE
            package.write_bytes(PAYLOAD)
            sums = Path(directory) / "SHA256SUMS"
            line = f"{hashlib.sha256(PAYLOAD).hexdigest()}  {PACKAGE}\n"
            sums.write_text(line)
            fields = {"Package": "iptvnator", "Version": VERSION, "Architecture": "amd64"}
            with patch.object(updater, "command", side_effect=lambda *args: fields[args[-1]]):
                updater.verify_package(package, sums, VERSION)
                for field in fields:
                    original = fields[field]
                    fields[field] = "wrong"
                    with self.subTest(field=field), self.assertRaises(ValueError):
                        updater.verify_package(package, sums, VERSION)
                    fields[field] = original
            for contents in [line * 2, "", line.replace(line[:64], "0" * 64)]:
                sums.write_text(contents)
                with self.subTest(contents=contents), self.assertRaises(ValueError):
                    updater.verify_package(package, sums, VERSION)

    def test_process_check_fails_closed(self):
        for status in [0, 2]:
            with patch.object(updater.subprocess, "run", return_value=subprocess.CompletedProcess([], status)):
                with self.subTest(status=status), self.assertRaises(ValueError):
                    updater.require_closed()

    def simulate_update(self, *, comparison=0, check=False, running=False,
                        corrupt=False, apt_fails=False, user_id=0, opens_later=False):
        downloads = []
        installed = False

        def download(url, destination):
            downloads.append(destination.name)
            if destination.name == "release.json":
                destination.write_text(json.dumps(release()))
            elif destination.name == PACKAGE:
                destination.write_bytes(b"corrupt" if corrupt else PAYLOAD)
            else:
                destination.write_text(f"{hashlib.sha256(PAYLOAD).hexdigest()}  {PACKAGE}\n")

        def run(args, **kwargs):
            nonlocal installed
            if "apt" in args:
                if apt_fails:
                    raise subprocess.CalledProcessError(100, args)
                installed = True
            status = comparison if args[:2] == ["dpkg", "--compare-versions"] else 0
            return subprocess.CompletedProcess(args, status)

        def command(*args):
            return {"--print-architecture": "amd64", "Package": "iptvnator",
                    "Version": VERSION, "Architecture": "amd64"}[args[-1]]

        with patch.object(updater.sys, "platform", "linux"), \
                patch.object(updater.shutil, "which", return_value="/usr/bin/mock"), \
                patch.object(updater, "command", side_effect=command), \
                patch.object(updater, "installed_version", side_effect=lambda: VERSION if installed else "1.2.2"), \
                patch.object(updater, "download", side_effect=download), \
                patch.object(updater, "require_closed", side_effect=(
                    [None, ValueError("Close IPTVnator")] if opens_later
                    else ValueError("Close IPTVnator") if running else None
                )) as closed, \
                patch.object(updater.os, "geteuid", return_value=user_id), \
                patch.object(updater.subprocess, "run", side_effect=run) as commands:
            error = None
            try:
                updater.update(check)
            except (ValueError, subprocess.CalledProcessError) as caught:
                error = caught
            return installed, downloads, error, closed.call_count, commands.call_args_list

    def test_verified_update_installs_and_checks_process_twice(self):
        installed, downloads, error, checks, calls = self.simulate_update()
        self.assertTrue(installed)
        self.assertIsNone(error)
        self.assertEqual(downloads, ["release.json", PACKAGE, "SHA256SUMS"])
        self.assertEqual(checks, 2)
        self.assertEqual(calls[-1].args[0][:2], ["apt", "install"])

    def test_check_and_up_to_date_do_not_install_or_download_installer(self):
        for options in [{"check": True}, {"comparison": 1}]:
            installed, downloads, error, checks, _ = self.simulate_update(**options)
            self.assertFalse(installed)
            self.assertIsNone(error)
            self.assertEqual(downloads, ["release.json"])
            self.assertEqual(checks, 0)

    def test_normal_user_authenticates_then_installs_with_sudo(self):
        installed, _, error, _, calls = self.simulate_update(user_id=1000)
        self.assertTrue(installed)
        self.assertIsNone(error)
        self.assertEqual(calls[-2].args[0], ["sudo", "-v"])
        self.assertEqual(calls[-1].args[0][:3], ["sudo", "apt", "install"])

    def test_running_app_corruption_and_apt_failure_never_report_success(self):
        for options in [{"running": True}, {"opens_later": True},
                        {"corrupt": True}, {"apt_fails": True}]:
            installed, _, error, _, _ = self.simulate_update(**options)
            self.assertFalse(installed)
            self.assertIsNotNone(error)


if __name__ == "__main__":
    unittest.main()
