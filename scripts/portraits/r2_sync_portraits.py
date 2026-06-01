#!/usr/bin/env python3
"""Sync pennyfarthing 512px portrait masters into the ``pennyfarthing`` R2 bucket.

Modeled on the sidequest reference (`oq-1/scripts/r2_sync_packs.py`): a boto3 S3
client against the Cloudflare R2 S3 endpoint, a 1:1 key mirror, idempotent across
re-runs (compares local MD5 to remote ETag and skips matches), immutable cache.

Scope (default): the per-theme 512px masters at
``pennyfarthing-dist/personas/portraits/{theme}/*.png``.

Scope (``--variants``): the full multi-resolution LOD set under each theme's
``small/medium/large/original`` size dirs. git-lfs pointer files (unresolved
130-byte stubs) are skipped in both modes, so un-rendered themes and orphaned
slugs are never uploaded.

Key layout (served under whatever custom domain fronts the bucket):
    masters  : portraits/{theme}/{slug}-{OCEAN}.png
    variants : portraits/{theme}/{size}/{slug}-{OCEAN}.png

Env (same as the daemon / sidequest sync):
    R2_S3_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY

Usage:
    python3 r2_sync_portraits.py --dry-run
    python3 r2_sync_portraits.py --theme a-team
    python3 r2_sync_portraits.py --variants --dry-run
    python3 r2_sync_portraits.py --variants            # full LOD sync (idempotent)
"""
from __future__ import annotations

import argparse
import hashlib
import logging
import os
import sys
from collections.abc import Iterator
from pathlib import Path

import boto3
from botocore.client import BaseClient
from botocore.exceptions import ClientError

# Global flat-variant dirs (not themes) — never treated as themes.
SKIP_DIRS: frozenset[str] = frozenset({"small", "medium", "large", "original"})
# LOD size buckets, in upload order (smallest first).
LOD_SIZES: tuple[str, ...] = ("small", "medium", "large", "original")
CACHE_CONTROL_IMMUTABLE = "public, max-age=31536000, immutable"

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent  # pennyfarthing/
PORTRAITS_ROOT = PROJECT_ROOT / "pennyfarthing-dist" / "personas" / "portraits"

logger = logging.getLogger("r2_sync_portraits")


def _md5_of(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _is_lfs_pointer(path: Path) -> bool:
    """True if the file is an unresolved git-lfs pointer stub, not real image data."""
    try:
        with path.open("rb") as f:
            return f.read(44).startswith(b"version https://git-lfs")
    except OSError:
        return False


def _theme_dirs(root: Path, theme: str | None) -> list[Path]:
    dirs = [root / theme] if theme else sorted(
        d for d in root.iterdir() if d.is_dir() and d.name not in SKIP_DIRS
    )
    for tdir in dirs:
        if not tdir.is_dir():
            raise FileNotFoundError(f"theme dir not found: {tdir}")
    return dirs


def iter_master_pngs(root: Path, theme: str | None = None) -> Iterator[Path]:
    """Yield 512px theme-root masters: {root}/{theme}/*.png, skipping variant dirs."""
    for tdir in _theme_dirs(root, theme):
        for png in sorted(tdir.glob("*.png")):  # depth-1 only → masters, not subdirs
            if not _is_lfs_pointer(png):
                yield png


def iter_lod_pngs(root: Path, theme: str | None = None) -> Iterator[Path]:
    """Yield the full LOD set: {root}/{theme}/{size}/*.png for each size bucket."""
    for tdir in _theme_dirs(root, theme):
        for size in LOD_SIZES:
            size_dir = tdir / size
            if not size_dir.is_dir():
                continue
            for png in sorted(size_dir.glob("*.png")):
                if not _is_lfs_pointer(png):
                    yield png


def _remote_etag(client: BaseClient, bucket: str, key: str) -> str | None:
    try:
        resp = client.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise
    return (resp.get("ETag", "").strip('"')) or None


def _build_client() -> BaseClient:
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_S3_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def sync(
    bucket: str = "pennyfarthing",
    theme: str | None = None,
    dry_run: bool = False,
    variants: bool = False,
) -> dict[str, int]:
    if not PORTRAITS_ROOT.is_dir():
        raise FileNotFoundError(f"portraits root not found: {PORTRAITS_ROOT}")

    iterator = iter_lod_pngs if variants else iter_master_pngs
    candidates = list(iterator(PORTRAITS_ROOT, theme))
    client = None if dry_run else _build_client()
    uploaded = skipped = bytes_uploaded = 0

    for path in candidates:
        key = "portraits/" + path.relative_to(PORTRAITS_ROOT).as_posix()
        size = path.stat().st_size
        local_md5 = _md5_of(path)

        if dry_run:
            logger.info("DRY would upload key=%s size=%d md5=%s", key, size, local_md5)
            uploaded += 1
            bytes_uploaded += size
            continue

        assert client is not None
        if _remote_etag(client, bucket, key) == local_md5:
            logger.info("SKIP key=%s (matches remote)", key)
            skipped += 1
            continue

        with path.open("rb") as f:
            client.put_object(
                Bucket=bucket, Key=key, Body=f,
                ContentType="image/png", CacheControl=CACHE_CONTROL_IMMUTABLE,
            )
        logger.info("PUT key=%s size=%d md5=%s", key, size, local_md5)
        uploaded += 1
        bytes_uploaded += size

    return {"uploaded": uploaded, "skipped": skipped, "bytes_uploaded": bytes_uploaded}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bucket", default="pennyfarthing")
    parser.add_argument("--theme", default=None, help="Only this theme slug")
    parser.add_argument("--variants", action="store_true",
                        help="Upload the full small/medium/large/original LOD set")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--log-file", type=Path, default=Path("/tmp/r2-portraits-sync.log"))
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler(args.log_file, mode="w"), logging.StreamHandler(sys.stdout)],
    )
    counts = sync(bucket=args.bucket, theme=args.theme, dry_run=args.dry_run, variants=args.variants)
    logger.info("DONE uploaded=%d skipped=%d bytes=%d",
                counts["uploaded"], counts["skipped"], counts["bytes_uploaded"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
