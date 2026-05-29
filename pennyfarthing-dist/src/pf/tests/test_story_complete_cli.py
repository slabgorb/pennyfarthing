from pf.sprint.cli import story


def test_complete_is_registered():
    assert "complete" in story.commands
