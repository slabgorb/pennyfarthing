"""Entry point for python -m pf.tui."""
from pf.tui.app import TuiApp


def main():
    app = TuiApp()
    app.run()

if __name__ == "__main__":
    main()
