"""Package CLI — theme package installation and portrait downloads.

Usage:
    pf package list              # Show all theme packages with status
    pf package install comedy    # Install package + download portraits
    pf package install-portraits comedy  # Download portraits for installed package
"""

from __future__ import annotations

import json
import sys

import click


@click.group()
def package():
    """Theme package management.

    \b
    Commands:
      list               - Show all theme packages with status
      install            - Install a theme package (npm + portraits)
      install-portraits  - Download portraits for installed packages
    """
    pass


@package.command("list")
@click.option("--json", "output_json", is_flag=True, help="Output as JSON.")
def list_cmd(output_json: bool):
    """Show all theme packages with installation status.

    Displays each of the 7 theme packages with their current state:
    installed, not installed, and whether portraits are downloaded.
    """
    from pf.package.discovery import get_package_status

    statuses = get_package_status()

    if output_json:
        click.echo(json.dumps(statuses, indent=2))
        return

    click.echo("Theme Packages")
    click.echo("=" * 50)
    click.echo("")

    for pkg in statuses:
        name = pkg["name"]
        if not pkg["installed"]:
            status = "not installed"
        elif pkg["portraits"]:
            status = "installed + portraits"
        else:
            status = "installed (no portraits)"
        click.echo(f"  {name:<22} {status}")

    click.echo("")
    installed = sum(1 for p in statuses if p["installed"])
    with_portraits = sum(1 for p in statuses if p["portraits"])
    click.echo(f"{installed}/{len(statuses)} installed, {with_portraits} with portraits")


@package.command()
@click.argument("name")
@click.option("--skip-portraits", is_flag=True, help="Skip portrait download after install.")
@click.option(
    "--all-sizes", is_flag=True, help="Download all portrait sizes (default: large only)."
)
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes.")
def install(name: str, skip_portraits: bool, all_sizes: bool, dry_run: bool):
    """Install a theme package and download its portraits.

    Runs npm install for the package, then downloads portraits from
    the GitHub monorepo via the gh CLI. Portraits are saved into the
    package's node_modules directory where the portrait-resolver
    already looks for them.

    \b
    Arguments:
      NAME  - Theme package name (comedy, literary, mythology-fantasy,
              prestige-tv, realistic, scifi, superheroes)
    """
    from pf.package.discovery import is_package_installed, npm_install
    from pf.package.portraits import download_portraits

    # Step 1: theme package is already shipped with pf CLI
    if is_package_installed(name) and not dry_run:
        click.echo(f"@pennyfarthing/themes-{name} already installed")
    else:
        if dry_run:
            click.echo(f"[DRY-RUN] Would install theme package: @pennyfarthing/themes-{name}")
        else:
            click.echo(f"Installing @pennyfarthing/themes-{name}...")

        result = npm_install(name, dry_run=dry_run)
        if not result["success"]:
            click.echo(f"Error: {result['error']}", err=True)
            sys.exit(1)

        if dry_run:
            click.echo(f"  Command: {result['data']['command']}")
        else:
            click.echo("  Installed successfully")

    # Step 2: download portraits
    if skip_portraits:
        if not dry_run:
            click.echo("Skipping portrait download (--skip-portraits)")
        return

    if dry_run:
        click.echo(
            f"[DRY-RUN] Would download portraits (sizes: {'all' if all_sizes else 'large only'})"
        )
    else:
        click.echo(f"Downloading portraits ({'all sizes' if all_sizes else 'large only'})...")

    result = download_portraits(name, all_sizes=all_sizes, dry_run=dry_run)
    if not result["success"]:
        click.echo(f"Error: {result['error']}", err=True)
        sys.exit(1)

    data = result["data"]
    if dry_run:
        click.echo(f"  {data['total_files']} files to download")
        click.echo(f"  Destination: {data['destination']}")
        if data.get("files"):
            for f in data["files"]:
                click.echo(f"    {f}")
            if data.get("truncated"):
                click.echo("    ...")
    else:
        click.echo(
            f"  Downloaded: {data['downloaded']}, Skipped: {data['skipped']}, Total: {data['total']}"
        )
        if data.get("error_count"):
            click.echo(f"  Errors: {data['error_count']}")


@package.command("install-portraits")
@click.argument("name", required=False)
@click.option(
    "--all", "install_all", is_flag=True, help="Download portraits for all installed packages."
)
@click.option(
    "--all-sizes", is_flag=True, help="Download all portrait sizes (default: large only)."
)
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes.")
def install_portraits(name: str | None, install_all: bool, all_sizes: bool, dry_run: bool):
    """Download portraits for already-installed theme packages.

    Requires either a package NAME or --all. Downloads portrait images
    from the GitHub monorepo and saves them into the package's
    node_modules directory.

    \b
    Arguments:
      NAME  - Theme package name (optional if --all is used)
    """
    from pf.package.discovery import THEME_PACKAGES, is_package_installed
    from pf.package.portraits import download_portraits

    if not name and not install_all:
        click.echo("Error: provide a package name or use --all", err=True)
        sys.exit(1)

    packages = THEME_PACKAGES if install_all else [name]

    for pkg_name in packages:
        if not is_package_installed(pkg_name):
            if install_all:
                continue  # silently skip uninstalled packages in --all mode
            click.echo(
                f"Error: @pennyfarthing/themes-{pkg_name} is not installed. "
                f"Run: pf package install {pkg_name}",
                err=True,
            )
            sys.exit(1)

        click.echo(
            f"Downloading portraits for {pkg_name} ({'all sizes' if all_sizes else 'large only'})..."
        )

        result = download_portraits(pkg_name, all_sizes=all_sizes, dry_run=dry_run)
        if not result["success"]:
            click.echo(f"  Error: {result['error']}", err=True)
            if not install_all:
                sys.exit(1)
            continue

        data = result["data"]
        if dry_run:
            click.echo(f"  [DRY-RUN] {data['total_files']} files would be downloaded")
        else:
            click.echo(
                f"  Downloaded: {data['downloaded']}, Skipped: {data['skipped']}, Total: {data['total']}"
            )
