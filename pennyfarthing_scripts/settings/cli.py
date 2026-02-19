"""
Settings CLI group — view and manage .pennyfarthing/config.local.yaml.

Usage:
    pf settings show          # Pretty-print interesting settings
    pf settings get <key>     # Get value by dot-path
    pf settings set <key> <value>  # Set value by dot-path
"""

import click


@click.group()
def settings():
    """View and manage .pennyfarthing/config.local.yaml settings."""
    pass


@settings.command()
def show():
    """Pretty-print all interesting settings."""
    from pennyfarthing_scripts.settings.settings import show_settings

    click.echo(show_settings())


@settings.command()
@click.argument("key")
def get(key: str):
    """Get a setting value by dot-path (e.g. workflow.relay_mode)."""
    from pennyfarthing_scripts.settings.settings import get_setting

    try:
        value = get_setting(key)
    except KeyError:
        click.echo(f"Key not found: {key}", err=True)
        raise SystemExit(1) from None

    if isinstance(value, dict):
        import yaml

        click.echo(yaml.dump(value, default_flow_style=False, sort_keys=False).rstrip())
    else:
        click.echo(value)


@settings.command()
@click.argument("key")
@click.argument("value")
def set(key: str, value: str):
    """Set a setting value by dot-path (e.g. workflow.bell_mode true)."""
    from pennyfarthing_scripts.settings.settings import set_setting

    set_setting(key, value)
    click.echo(f"{key} = {value}")
