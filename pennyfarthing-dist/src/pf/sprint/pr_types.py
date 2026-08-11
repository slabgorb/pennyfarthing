"""Shared Literal type aliases for GitHub PR API string values.

These are defined here (production code) so both story_finish.py and the test
helper ``pf.tests.helpers.gh_pr_fake`` can import from one canonical source.
"""
from typing import Literal

GhPrState = Literal["MERGED", "OPEN", "CLOSED"]
GhMergeable = Literal["MERGEABLE", "CONFLICTING", "UNKNOWN"]
GhMergeStateStatus = Literal["CLEAN", "DIRTY", "BLOCKED", "UNKNOWN"]
