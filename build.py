#!/usr/bin/env python3
"""Build the standalone offline save editor HTML."""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
import tempfile
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent
SRC_DIR = ROOT_DIR / "src"
OUT_DIR = ROOT_DIR / "dist"
OUT_PATH = OUT_DIR / "HoTuLoShu14BooksSaveEditor-v1.0.html"

INLINE_FILES = (
    "ssts-lz4-msgpack.js",
    "catalog-data.js",
    "editor-core.js",
    "editor-ui.js",
)

REMAINING_SCRIPT_SRC_RE = re.compile(r"<script\b[^>]*\bsrc\s*=", re.IGNORECASE)
EXTERNAL_URL_RE = re.compile(r"https?://|ftp://|wss?://|(?<![:\w])//", re.IGNORECASE)
HANZI_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]")
MAX_SIZE = 10 * 1024 * 1024


def build_html() -> bytes:
    html = (SRC_DIR / "editor-page.html").read_text(encoding="utf-8")

    for filename in INLINE_FILES:
        tag = re.compile(
            r"<script\b(?=[^>]*\bsrc\s*=\s*(['\"])" + re.escape(filename) + r"\1)[^>]*>\s*</script\s*>",
            re.IGNORECASE,
        )
        script_path = SRC_DIR / filename
        script = script_path.read_text(encoding="utf-8").replace("</script", r"<\/script")
        html, count = tag.subn(lambda _: "<script>\n" + script + "\n</script>", html)
        if count != 1:
            raise ValueError(
                f"Expected exactly one script tag for {filename}, found {count}"
            )

    if REMAINING_SCRIPT_SRC_RE.search(html):
        raise ValueError("Assembled HTML contains a remaining script src attribute")
    if EXTERNAL_URL_RE.search(html):
        raise ValueError("Assembled HTML contains an external URL or protocol-relative URL")
    if HANZI_RE.search(html):
        raise ValueError("Assembled HTML contains Hanzi characters")

    data = html.encode("utf-8")
    if len(data) >= MAX_SIZE:
        raise ValueError(f"Assembled HTML is too large: {len(data)} bytes")

    return data


def check_output(expected: bytes) -> bool:
    try:
        actual = OUT_PATH.read_bytes()
    except FileNotFoundError:
        print(f"Missing output: {OUT_PATH}", file=sys.stderr)
        return False

    expected_sha = hashlib.sha256(expected).hexdigest()
    actual_sha = hashlib.sha256(actual).hexdigest()
    if actual != expected:
        print(
            f"Stale output: {OUT_PATH}\n"
            f"Expected {len(expected)} bytes, sha256 {expected_sha}\n"
            f"Found    {len(actual)} bytes, sha256 {actual_sha}",
            file=sys.stderr,
        )
        return False

    print(f"OK: {OUT_PATH} ({len(actual)} bytes, sha256 {actual_sha})")
    return True


def write_output(data: bytes) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(dir=OUT_DIR)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temp_name, OUT_PATH)
    except BaseException:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
        raise

    digest = hashlib.sha256(data).hexdigest()
    print(f"{OUT_PATH}\n{len(data)} bytes\nsha256 {digest}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify the existing output matches a fresh build",
    )
    args = parser.parse_args()

    try:
        data = build_html()
        if args.check:
            return 0 if check_output(data) else 1
        write_output(data)
        return 0
    except (OSError, UnicodeError, ValueError) as exc:
        print(f"build.py: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
