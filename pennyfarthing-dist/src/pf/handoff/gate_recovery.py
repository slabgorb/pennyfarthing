"""Gate recovery — auto-trigger context creation on gate failure.

When a gate check fails because required context is missing (not invalid),
the recovery module identifies which context needs creation and returns
ordered recovery actions. Recovery config lives in the workflow YAML
as a `recovery:` block on the gate definition.

Story: 131-2 (SM Auto-Triggers Context Creation on Gate Failure)
Epic: 131 (Gate-Enforced Context Pipeline)

Key constraints:
- One attempt per level (Rule #6) — no retry loops
- Only "not found" failures trigger creation, not validation errors
- Recovery order: epic first, then story (cascade)
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Literal, TypedDict

from pf.handoff.session_assessment import assessment_heading


class SectionSelection(TypedDict):
    """Outcome of :func:`select_last_section`. ``section`` is non-empty only
    when ``status`` is ``"found"``; the other two states carry ``detail``."""

    status: Literal["found", "absent", "ambiguous"]
    section: str
    detail: str


class VerdictReading(TypedDict):
    """Outcome of :func:`read_agent_verdict`.

    **The invariant its caller depends on:** ``verdict`` is non-``None`` if and
    only if ``status`` is ``"found"``. ``resolve_gate`` archives or reworks a
    story on the strength of it, so the tri-state is expressed in the type rather
    than left implicit across six return paths (story 162-47, AC-A4).
    """

    status: Literal["found", "absent", "ambiguous"]
    verdict: str | None
    detail: str


class RoundTripReading(TypedDict):
    """Outcome of :func:`read_round_trip_count`.

    ``unreadable`` is deliberately distinct from ``absent``: "I cannot read the
    counter" is not "there was no rework" (story 162-28).
    """

    status: Literal["found", "absent", "unreadable"]
    count: int
    detail: str


class ReworkRecovery(TypedDict, total=False):
    """Outcome of :func:`get_rework_recovery`.

    ``total=False`` because the two states carry different payloads: ``rework``
    carries ``target_phase``, ``blocked`` carries ``reason``. The ``status``
    literal is what makes the caller's switch checkable — an unlisted value can
    no longer reach forward routing unnoticed (story 162-47, AC-A4).
    """

    status: Literal["rework", "blocked"]
    target_phase: str | None
    reason: str


# Verdict vocabulary — one place. `gates/approval.md` and the reviewer
# template cite the same words (APPROVED / CHANGES_REQUESTED / REJECTED).
# Column 0 only: every verdict line in this repo's history is unindented, so an
# indented one is an illustration inside a list or code block, not the verdict.
_VERDICT_RE = re.compile(r"^\*\*Verdict:\*\*[ \t]*(.*)$", re.MULTILINE)
# Fence opener/closer, capturing the delimiter so a ``` line cannot close a ~~~
# block. CommonMark treats the two types as non-interchangeable, and mixing them
# inside one explanation is ordinary agent output.
_FENCE_RE = re.compile(r"^[ \t]*(`{3,}|~{3,})")
# An indented code block is 4+ spaces or a tab, and only when it OPENS after a
# blank line outside a list — otherwise every wrapped bullet would be "code".
_INDENTED_CODE_RE = re.compile(r"^(?: {4,}|\t)")
_LIST_OR_TABLE_RE = re.compile(r"^ {0,3}(?:[-*+][ \t]|\d+[.)][ \t]|\|)")
# Backtick runs pair with equal-length runs (CommonMark); non-greedy so the
# shortest span wins, and same-line only.
_INLINE_CODE_RE = re.compile(r"(?<!`)(`+)(?!`).*?(?<!`)\1(?!`)")
# Rejection vocabulary is deliberately WIDER than the approval vocabulary: every
# spelling reviewers actually use (`REJECT`, `⛔ REJECT — return to Dev`,
# `REQUEST-CHANGES`, `CHANGES-REQUESTED` all appear in this repo's history) must
# reach the rework loop, whereas an unrecognized near-approval (`APPROVE`,
# `APPROVE WITH FINDINGS`) must block and be told to write `APPROVED`. The
# asymmetry is the point — widening rejections is fail-safe, widening approvals
# is how a story gets archived unreviewed. `REJECT(?:ED)?\b` refuses `REJECTION`,
# which post-rework approvals mention ("initial rejection resolved").
_REJECTION_WORDS = r"REJECT(?:ED)?|CHANGES REQUESTED|REQUEST(?:ED)? CHANGES|NOT APPROVED|BLOCKED"
# Leading-token forms decide first. A post-rework approval routinely cites the
# round it supersedes — "APPROVED (round-trip 1 — Round 1 REJECTED, rework
# verified closed)" is real verdict text from this repo's history — so a
# whole-line rejection search would send a genuine approval back to Dev until
# max_attempts blocked it. `NOT APPROVED` stays in the rejection alternation so
# it wins over the bare `APPROVED` prefix.
_LEADING_REJECTION_RE = re.compile(rf"^({_REJECTION_WORDS})\b")
_LEADING_APPROVAL_RE = re.compile(r"^APPROVED\b")
_REJECTION_RE = re.compile(rf"\b({_REJECTION_WORDS})\b")
_APPROVAL_RE = re.compile(r"\bAPPROVED\b")


def get_recovery_actions(
    gate_result: dict,
    recovery_config: dict | None,
    story_id: str,
) -> list[dict]:
    """Match failed gate checks against recovery definitions.

    Scans gate_result checks for failures that match recovery config entries.
    Only triggers recovery for "not found" failures (exit 2), not validation
    errors (exit 1).

    Args:
        gate_result: Parsed GATE_RESULT from extract_gate_result().
            Expected shape: {status, message, checks: [{name, status, detail}]}
        recovery_config: Recovery section from workflow phase gate config.
            Shape: {check_name: {action, type, max_attempts}}
            None if no recovery config exists.
        story_id: Story identifier (e.g., "131-2")

    Returns:
        Ordered list of recovery action dicts:
            check_name: str - which check failed
            context_type: str - "epic" | "story"
            target_id: str - epic number or story ID
            max_attempts: int
    """
    if not recovery_config:
        return []

    epic_id, _ = parse_story_id(story_id)
    actions: list[dict] = []

    for check in gate_result.get("checks", []):
        if check.get("status") != "fail":
            continue

        name = check.get("name", "")
        if name not in recovery_config:
            continue

        if not _is_recoverable(check):
            continue

        cfg = recovery_config[name]
        context_type = cfg["type"]
        target_id = epic_id if context_type == "epic" else story_id

        actions.append(
            {
                "check_name": name,
                "context_type": context_type,
                "target_id": target_id,
                "max_attempts": cfg.get("max_attempts", 1),
            }
        )

    return actions


def format_recovery_outcome(
    context_type: str,
    target_id: str,
    created: bool,
    validated: bool | None,
) -> dict:
    """Format outcome message for context auto-creation.

    Three scenarios per story spec:
    1. created=True, validated=True → continue silently (no message)
    2. created=True, validated=False → warning with manual fix path
    3. created=False → error with manual creation command

    Args:
        context_type: "epic" or "story"
        target_id: Epic number or story ID
        created: Whether creation succeeded
        validated: Whether re-validation passed (None if creation failed)

    Returns:
        dict with keys:
            message: str | None (None = continue silently)
            severity: "info" | "warning" | "error"
    """
    path = f"sprint/context/context-{context_type}-{target_id}.md"

    if not created:
        return {
            "message": (
                f"Context creation failed. "
                f"Run `/pf-context create {context_type} {target_id}` manually"
            ),
            "severity": "error",
        }

    if validated:
        return {"message": None, "severity": "info"}

    return {
        "message": (f"Context created but has validation errors. Manual fix needed at {path}"),
        "severity": "warning",
    }


def parse_story_id(story_id: str) -> tuple[str, str]:
    """Extract epic ID and story ID from a story identifier.

    Args:
        story_id: Story identifier (e.g., "131-2")

    Returns:
        Tuple of (epic_id, story_id) e.g., ("131", "131-2")

    Raises:
        ValueError: If story_id format is invalid
    """
    if not story_id:
        raise ValueError(f"Invalid story ID: {story_id!r}")

    match = re.match(r"^(\d+)-(\d+)$", story_id)
    if not match:
        raise ValueError(f"Invalid story ID format: {story_id!r}")

    return match.group(1), story_id


def has_rework_action(recovery_config: dict | None) -> bool:
    """Whether ``recovery_config`` declares a ``rework`` action at all.

    Checked separately from :func:`get_rework_recovery` because the attempt
    ceiling must only be consulted once the verdict says rework — an APPROVED
    verdict finishes even after max_attempts round-trips.
    """
    if not recovery_config:
        return False
    return any(
        isinstance(entry, dict) and entry.get("action") == "rework"
        for entry in recovery_config.values()
    )


def _blank(text: str) -> str:
    """Same length, no content, newlines intact — offsets must survive."""
    return "".join("\n" if ch == "\n" else " " for ch in text)


def _mask_html_comments(content: str) -> str:
    """Blank ``<!-- … -->`` spans, including multi-line ones.

    An HTML comment is invisible in the rendered session, so a verdict or cycle
    tag inside one is by definition not an operative statement — and a reader
    that honours it can be fed a decision no human reviewing the file would see
    (story 162-28). An unterminated ``<!--`` masks the remainder: content that
    cannot be read must block, never be guessed at.
    """
    out = []
    pos = 0
    while True:
        start = content.find("<!--", pos)
        if start == -1:
            out.append(content[pos:])
            return "".join(out)
        out.append(content[pos:start])
        end = content.find("-->", start)
        if end == -1:
            out.append(_blank(content[start:]))
            return "".join(out)
        end += len("-->")
        out.append(_blank(content[start:end]))
        pos = end


def _mask_inline_code(line: str) -> str:
    """Blank backtick spans within a line, delimiter runs included.

    Agents quote the format they are documenting — ``Add `**Cycle: 2**` to the
    table`` is an instruction ABOUT the tag, not the tag. Reading it as operative
    made the freshness guard satisfiable by prose describing it (story 162-28).
    """
    return _INLINE_CODE_RE.sub(lambda m: " " * len(m.group(0)), line)


def mask_quoted_blocks(content: str) -> str:
    """Blank only unambiguously quoted BLOCKS — fences and HTML comments.

    The masker for PRESENCE searches, whose failure direction is the opposite of
    the freshness tag's. ``_check_subagent_dispatch`` asks "did the reviewer
    incorporate the security specialist's findings?" and answers by looking for
    ``[SEC]`` in the assessment; masking a legitimate mention blocks a valid
    approval with a message claiming a tag is missing while it sits plainly in the
    file. Inline backticks are exactly how ``agents/reviewer.md`` and
    ``gates/approval.md`` render those tags, and an indented line under a ``###``
    heading is ordinary prose, so neither may be masked here.

    A fence or an HTML comment is still masked: those genuinely quote a whole
    block, and reading a fenced example tag as a dispatched specialist was the
    fail-open 162-21 closed. Story 162-28 split this from
    :func:`mask_illustrative_regions` after one shared masker was found serving
    two searches with opposite failure directions.
    """
    return _mask(content, code_blocks=False, inline=False)


def mask_illustrative_regions(content: str) -> str:
    """Blank out illustrative regions, preserving offsets and line structure.

    Reviewers quote the verdict format when explaining it, so a session can
    legitimately contain a ``**Verdict:**`` or ``## … Assessment`` line that is
    an EXAMPLE. Reading one as operative is fail-open: it can archive a rejected
    story, the exact defect 162-21 exists to close. Requiring agents to know
    "never let a verdict-shaped line appear in your prose" would be a rule
    enforced by goodwill (SOUL #6); masking enforces it mechanically.

    Four illustrative forms are masked — all four were confirmed forging an
    operative statement in review (story 162-28):

    - **Fenced blocks** (``` and ~~~, non-interchangeable per CommonMark).
    - **HTML comments**, including multi-line.
    - **Indented code blocks** — 4+ spaces or a tab, opened after a blank line.
      List and table continuations are NOT code: ``_check_subagent_dispatch``
      searches free-form prose for ``[SEC]``-style tags, so masking an indented
      sub-bullet would report tags missing that are plainly present (fail-CLOSED).
    - **Inline backtick spans**, which quote a format rather than assert it.

    Every masked region becomes spaces of the same length, and newlines survive,
    so downstream match offsets still index into a string of identical shape. An
    unterminated fence or comment masks everything after it — a verdict that
    cannot be read blocks, which is the safe direction.

    Use :func:`mask_quoted_blocks` for presence searches, which fail in the
    opposite direction and cannot afford this much masking.
    """
    return _mask(content, code_blocks=True, inline=True)


def _mask(content: str, *, code_blocks: bool, inline: bool) -> str:
    """Shared masking engine. See the two public wrappers for the policies."""
    masked: list[str] = []
    open_delim: str | None = None
    in_indented_code = False
    prev_blank = True
    list_context = False

    for line in _mask_html_comments(content).split("\n"):
        fence = _FENCE_RE.match(line)
        if fence:
            delim = fence.group(1)
            if open_delim is None:
                open_delim = delim
            elif delim[0] == open_delim[0] and len(delim) >= len(open_delim):
                open_delim = None
            # Otherwise this line is CONTENT of the open block, not a closer:
            # either the other delimiter type, or a run shorter than the opener.
            # CommonMark §6.1 requires the closer to match the opener's type and
            # be at least as long, which is precisely the six-backtick wrapper
            # idiom agents use to SHOW a three-backtick block. Closing on the
            # inner ``` exposed the wrapper's contents — and a real fenced
            # `**Verdict:** REJECTED` read as content while an illustrative
            # APPROVED below it read as operative archives a rejected story
            # (story 162-47, AC-A1).
            masked.append(" " * len(line))
            in_indented_code = False
            prev_blank = False
            continue

        if open_delim is not None:
            masked.append(" " * len(line))
            continue

        blank = not line.strip()
        indented = bool(_INDENTED_CODE_RE.match(line))

        if blank:
            # A blank line neither opens nor closes an indented block; CommonMark
            # allows blanks inside one.
            masked.append(line)
            prev_blank = True
            continue

        if code_blocks and in_indented_code and indented:
            masked.append(" " * len(line))
            continue

        in_indented_code = code_blocks and indented and prev_blank and not list_context
        if in_indented_code:
            masked.append(" " * len(line))
            prev_blank = False
            continue

        if not indented:
            list_context = bool(_LIST_OR_TABLE_RE.match(line))
        masked.append(_mask_inline_code(line) if inline else line)
        prev_blank = False

    return "\n".join(masked)


def _exact_heading_re(heading: str) -> re.Pattern[str]:
    """``## <heading>`` and nothing else on the line. Section identity, one place."""
    return re.compile(rf"^##[ \t]+{re.escape(heading)}[ \t]*$", re.MULTILINE | re.IGNORECASE)


def _near_miss_heading_re(heading: str) -> re.Pattern[str]:
    """``## <heading>…`` — any heading that STARTS with the phrase.

    No `\\b` after the heading: a boundary requirement leaves a hole exactly where
    the suffix starts with a word character, so `## Reviewer Assessment2` matched
    NEITHER pattern and the newer section became invisible — the older one
    governed silently (story 162-47, AC-A2). A heading that merely starts with the
    phrase is a straggler whatever follows it: plural and extended forms
    (`## Reviewer Assessments`) are reported as ambiguous rather than ignored,
    because no character class can tell a cycle marker from a different section's
    title, and blocking with an actionable message is the one outcome that neither
    reads a stale verdict nor skips a current one.
    """
    return re.compile(rf"^##[ \t]+{re.escape(heading)}.*$", re.MULTILINE | re.IGNORECASE)


_ANY_SECTION_HEADING_RE = re.compile(r"^##[ \t]+.*$", re.MULTILINE)


def candidate_section_region(
    content: str,
    heading: str,
    masker: Callable[[str], str] = mask_illustrative_regions,
) -> str:
    """Every candidate for the current ``## <heading>`` section, as one slice.

    For use ONLY when :func:`select_last_section` reports ``ambiguous``. Which
    section is current is then unknown, but the candidates are exactly the last
    exact heading and the near-miss headings that follow it, so the slice runs
    from that heading to the first ``##`` that is not itself a candidate.

    A PRESENCE search over this region can still say truthfully that something
    appears NOWHERE among the candidates, without the alternative's false claim:
    reporting every specialist tag as missing while all eight sit plainly in the
    file. That false report is a wasted reviewer cycle spent chasing tags that are
    already there — the discovery cost AC-B1 exists to remove (story 162-47
    review, F1). The region stops at the first non-candidate heading rather than
    running to EOF, so a tag mentioned in `## Delivery Findings` cannot satisfy
    the check either.

    Returns "" when there is no exact heading at all — an absent section has no
    candidates, and every required tag really is missing from it.
    """
    masked = masker(content)
    exact = list(_exact_heading_re(heading).finditer(masked))
    if not exact:
        return ""

    region = masked[exact[-1].end() :]
    near_miss = _near_miss_heading_re(heading)
    for match in _ANY_SECTION_HEADING_RE.finditer(region):
        if not near_miss.match(match.group(0)):
            return region[: match.start()]
    return region


def select_last_section(
    content: str,
    heading: str,
    masker: Callable[[str], str] = mask_illustrative_regions,
) -> SectionSelection:
    """Slice the LAST section introduced by an exact ``## <heading>`` line.

    The single selection rule for every reader of a session file. Both halves of
    the exit protocol use it — ``resolve_gate`` to find the verdict and
    ``complete_phase`` to find the specialist tags and results table — so they
    cannot disagree about which cycle is current (gh #49). A session accumulates
    one section per rework cycle by appending, so the current cycle is the last.

    Illustrative regions are masked first, so a heading quoted inside a code
    fence neither becomes the section nor moves its boundary.

    Args:
        content: Full session file text.
        heading: Heading text without the leading ``##`` (e.g. "Subagent Results").
        masker: how much of the body counts as quoted. Defaults to the aggressive
            :func:`mask_illustrative_regions`, which is right for readers whose
            fail-open direction is reading an example as operative. Presence
            searches pass :func:`mask_quoted_blocks` instead — they fail the other
            way, so over-masking blocks a valid approval (story 162-28).

    Returns:
        dict with:
            status: "found" | "absent" | "ambiguous"
            section: the section body when status is "found", else ""
            detail: human-readable reason for "absent"/"ambiguous"
    """
    exact = _exact_heading_re(heading)
    near_miss = _near_miss_heading_re(heading)

    masked = masker(content)
    matches = list(exact.finditer(masked))
    if not matches:
        return {"status": "absent", "section": "", "detail": f"no `## {heading}` section"}

    last = matches[-1]

    # A heading that merely STARTS with the phrase may be a newer cycle whose
    # content would be silently skipped, so it is neither read nor ignored. No
    # character class can tell a cycle marker `(Cycle 2)` from a section title
    # `(Summary)`, so the ambiguity is reported instead of guessed at.
    stragglers = [
        m.group(0).strip() for m in near_miss.finditer(masked) if m.start() > last.start()
    ]
    if stragglers:
        return {
            "status": "ambiguous",
            "section": "",
            "detail": (
                f"the heading {stragglers[-1]!r} follows the last exact "
                f"`## {heading}` heading. Cycles are identified by repeating the "
                f"EXACT heading, so a suffixed one is not read — and it cannot be "
                f"ignored either, since it may be the current cycle"
            ),
        }

    section = masked[last.end() :]
    # Only a SIBLING `##` ends the section. Subsections belong to it: the reviewer
    # template files its specialist tags under `### Specialist Findings` and its
    # rule audit under `### Rule Compliance`, so ending at `###` would hide the
    # very content `_check_subagent_dispatch` looks for (fail-CLOSED). Readers
    # that must NOT accept subsection content — the freshness tag, which attests
    # to the table directly above it — scope themselves with
    # :func:`section_preamble` (story 162-28).
    next_heading = re.search(r"^##[ \t]+", section, re.MULTILINE)
    if next_heading:
        section = section[: next_heading.start()]

    return {"status": "found", "section": section, "detail": ""}


def section_preamble(section: str) -> str:
    """The part of a section that precedes its first subsection.

    A subsection is content the section owns, but it is not content that speaks
    FOR the section. The freshness tag attests to the results table it sits with,
    so a ``**Cycle: N**`` written under an appended ``### Reviewer Notes`` must not
    vouch for the table above it (story 162-28).
    """
    subheading = re.search(r"^#{3,6}[ \t]+", section, re.MULTILINE)
    return section[: subheading.start()] if subheading else section


def count_exact_sections(
    content: str,
    heading: str,
    masker: Callable[[str], str] = mask_illustrative_regions,
) -> int:
    """How many exact ``## <heading>`` sections the session carries.

    A session accumulates one section per cycle by appending the EXACT heading —
    the same identity rule :func:`select_last_section` selects by — so the count
    is how many times the agent has ruled. ``resolve_gate`` compares it against
    the recorded round-trips to tell a fresh verdict from one already acted on
    (story 162-47, AC-B3).
    """
    return len(_exact_heading_re(heading).findall(masker(content)))


# The preamble ends at the first assessment section. Everything above it is the
# workflow's own bookkeeping — the only text the exit protocol writes; everything
# below is agent prose, which may legitimately quote any field it likes.
_PREAMBLE_END_RE = re.compile(r"^##[ \t]+.*Assessment", re.MULTILINE)


def preamble_end(masked_content: str) -> int:
    """Offset where the session preamble ends, in *masked* text.

    Takes masked text so a heading quoted inside a fence cannot move the
    boundary. Masking preserves offsets, so the returned index is equally valid
    against the raw content.
    """
    match = _PREAMBLE_END_RE.search(masked_content)
    return match.start() if match else len(masked_content)


def find_operative_round_trip_line(content: str) -> re.Match[str] | None:
    """The counter line the workflow owns: the LAST one in the masked preamble.

    **The single locator of that line** — :func:`read_round_trip_count` reads
    through it and ``complete_phase`` rewrites what it returns, so the reader and
    the writer cannot disagree about which occurrence is operative. A reader that
    narrowed to the preamble while the writer kept rewriting the last match
    anywhere would freeze the real counter and disarm the freshness guard, which
    is the 162-28 defect reintroduced from the other side (story 162-47, AC-A3).

    Offsets index into ``content`` unchanged: masking preserves length, and the
    preamble is a prefix.
    """
    masked = mask_illustrative_regions(content)
    scope = masked[: preamble_end(masked)]
    matches = list(ROUND_TRIP_COUNT_RE.finditer(scope))
    return matches[-1] if matches else None


def read_agent_verdict(session_content: str, agent: str) -> VerdictReading:
    """Read the operative verdict from an agent's assessment section.

    **This function never picks a winner.** Three review cycles established that
    every selection rule has a mirror failure: first-line-wins lets an
    illustrative example above the real verdict govern, last-line-wins lets a
    prose citation of a superseded verdict govern, and any accepted heading
    suffix lets a supplementary section shadow the real one. Each patch closed
    one direction and opened the other. So instead of resolving ambiguity, this
    reports it, and the caller blocks — the only outcome that cannot archive a
    rejected story.

    The rules:

    - **Section identity is the EXACT heading.** Cycles are distinguished by
      POSITION (the last exact match), never by parsing suffix prose — no
      character class can tell a cycle marker (``(Cycle 2)``) from a section
      title (``(Summary)``).
    - **A near-miss heading after the last exact one is ambiguous.** It may be a
      newer cycle whose verdict would be silently ignored, so it blocks with an
      actionable message instead of reading the older section.
    - **Exactly one column-0 verdict line** in the selected section. Zero is
      absent; two or more is ambiguous. Illustrations are excluded first (see
      :func:`mask_illustrative_regions`), and an indented verdict line is an
      example, not a verdict.

    Returns:
        dict with:
            status: "found" | "absent" | "ambiguous"
            verdict: raw verdict text when status is "found", else None
            detail: human-readable reason for "absent"/"ambiguous"
    """
    selected = select_last_section(session_content, assessment_heading(agent))
    if selected["status"] != "found":
        return {"status": selected["status"], "verdict": None, "detail": selected["detail"]}

    section = selected["section"]
    verdicts = [m.group(1) for m in _VERDICT_RE.finditer(section)]
    if not verdicts:
        return {"status": "absent", "verdict": None, "detail": "no `**Verdict:**` line"}
    if len(verdicts) > 1:
        return {
            "status": "ambiguous",
            "verdict": None,
            "detail": (
                f"{len(verdicts)} `**Verdict:**` lines in one section "
                f"({', '.join(repr(v[:40]) for v in verdicts)})"
            ),
        }

    return {"status": "found", "verdict": verdicts[0], "detail": ""}


def classify_verdict(raw: str | None) -> str | None:
    """Classify a raw verdict string.

    The verdict is the LEADING token; everything after it is the reviewer's
    prose, which frequently names the opposite outcome ("APPROVED (supersedes
    the round-1 REJECTED verdict above)"). Only when the line opens with
    neither vocabulary word do we fall back to searching the whole line, so
    free-form text still fails closed rather than reading as approval.

    Returns:
        "approved" | "rework" | None (absent or unrecognized — fail closed).
    """
    if raw is None:
        return None

    # Markdown, punctuation, emoji and underscores are noise: `**APPROVED**`,
    # `changes_requested` and `APPROVED ✅` all normalize to bare words.
    normalized = re.sub(r"[^A-Za-z0-9]+", " ", raw).upper().strip()
    if not normalized:
        return None

    # Leading token wins. Rejections are tested first so `NOT APPROVED` beats
    # the bare `APPROVED` prefix.
    if _LEADING_REJECTION_RE.match(normalized):
        return "rework"
    if _LEADING_APPROVAL_RE.match(normalized):
        return "approved"

    # No recognized opening token — fall back to a whole-line search, still
    # rejection-first, so anything ambiguous errs toward another Dev cycle.
    if _REJECTION_RE.search(normalized):
        return "rework"
    if _APPROVAL_RE.search(normalized):
        return "approved"
    return None


# Column 0, and the value is the WHOLE remainder of the line — the same doctrine
# as the verdict and cycle-tag lines. A bare `(\d+)` took the leading digits of
# anything (`2.0` read as 2, `1_000` as 1), and an unanchored pattern made an
# indented mention operative, which is a hiding place rather than a counter
# (story 162-28 review).
ROUND_TRIP_COUNT_RE = re.compile(r"^\*\*Round-Trip Count:\*\*[ \t]*(\d+)[ \t]*$", re.MULTILINE)
# The LINE, whatever its value — how :func:`read_round_trip_count` tells "no
# counter" from "a counter I cannot parse or cannot see".
COUNTER_LINE_RE = re.compile(r"^.*\*\*Round-Trip Count:\*\*.*$", re.MULTILINE)


def read_round_trip_count(session_content: str) -> RoundTripReading:
    """Tri-state read of the round-trip counter: absent, found, or unreadable.

    "I cannot read the counter" is not "there was no rework". Equating the two let
    the freshness guard be disarmed by HIDING the operative line instead of
    forging a tag — wrap it in an HTML comment, a fence or backticks and the guard
    reported "No rework cycle — initial review" on a stale table (story 162-28,
    review cycle 2). The comment form is worse than deleting the line: the
    document still renders intact, so nothing looks missing to a human.

    Hidden is detected by comparing the raw text against the masked text: a
    counter line that exists before masking and not after is quoted, and a quoted
    operative counter is unreadable, not absent. A line whose value will not parse
    (an annotation after the number, say) is unreadable too — hand-editing this
    line is live practice, so silently reading 0 is the same trap.

    Returns:
        dict with:
            status: "found" | "absent" | "unreadable"
            count: the parsed value when found, else 0
            detail: human-readable reason when unreadable
    """
    masked = mask_illustrative_regions(session_content)
    # Scoped to the preamble, because that is where `complete_phase` writes it.
    # Reading the last column-0 match over the WHOLE file let any agent override
    # the operative counter from its own prose, in both damaging directions: a
    # forged high value wedges the rework loop at the ceiling, a forged low one
    # hands out extra cycles (story 162-47, AC-A3).
    end = preamble_end(masked)
    masked_preamble = masked[:end]

    match = find_operative_round_trip_line(session_content)
    if match is not None:
        return {"status": "found", "count": int(match.group(1)), "detail": ""}

    if COUNTER_LINE_RE.search(masked_preamble):
        return {
            "status": "unreadable",
            "count": 0,
            "detail": (
                "a '**Round-Trip Count:**' line is present but its value does not "
                "parse as a plain integer ending the line"
            ),
        }

    if COUNTER_LINE_RE.search(session_content[:end]):
        return {
            "status": "unreadable",
            "count": 0,
            "detail": (
                "the '**Round-Trip Count:**' line is inside an illustrative region "
                "(code fence, HTML comment, indented block or backticks), so no "
                "reader can treat it as operative"
            ),
        }

    return {"status": "absent", "count": 0, "detail": ""}


def parse_round_trip_count(session_content: str) -> int:
    """Round-trips already recorded in the session. Absent or unparseable → 0.

    **NOT FOR PRODUCTION USE — kept only for the tests that characterise the
    reader.** This flattening is lossy in the one direction that matters:
    ``unreadable`` and ``absent`` both come back as ``0``, so a caller deciding
    whether rework has happened cannot tell a corrupt counter from a fresh
    session. ``resolve_gate`` was that caller, and one unparseable byte bought an
    unlimited rework loop (story 162-59). Production reads
    :func:`read_round_trip_count` and branches on ``["status"]``; the AC4 test in
    ``test_162_59_unreadable_counter_tristate.py`` sweeps the source by AST and
    fails on any production call to this function.

    The docstring this replaces claimed ``complete_phase._parse_rework_cycle``
    delegates here. It does not — it delegates to its own tri-state
    ``_read_rework_cycle`` — so the "single reader" reassurance was standing over
    the flattening rather than justifying it.

    Illustrative regions are masked first, so a counter quoted in a code fence,
    an HTML comment, or backticks is not mistaken for the session's real one —
    both directions bite: a fabricated counter arms the freshness guard on a
    session that never reworked, and a quoted counter read as real routes rework
    against the wrong round.

    The LAST occurrence IN THE PREAMBLE wins: the counter is written once but
    quoted freely, and the operative line is the one the workflow itself wrote,
    above the first assessment section — see
    :func:`find_operative_round_trip_line`, which the writer shares.
    """
    return read_round_trip_count(session_content)["count"]


def get_rework_recovery(
    recovery_config: dict,
    round_trip_count: int,
) -> ReworkRecovery | None:
    """Check if a recovery config contains a rework action and whether it's allowed.

    Args:
        recovery_config: Recovery section from workflow phase gate config.
        round_trip_count: How many round-trips have already occurred.

    Returns:
        Dict with status/target_phase/reason if rework action found, None otherwise.
    """
    for entry in recovery_config.values():
        if not isinstance(entry, dict) or entry.get("action") != "rework":
            continue

        max_attempts = entry.get("max_attempts", 1)
        target_phase = entry.get("target_phase")

        if round_trip_count >= max_attempts:
            return {
                "status": "blocked",
                "reason": f"Max_attempts ({max_attempts}) reached after {round_trip_count} round-trips",
            }

        return {
            "status": "rework",
            "target_phase": target_phase,
        }

    return None


def _is_recoverable(check: dict) -> bool:
    """Check if a failed gate check is recoverable (missing vs invalid).

    Returns True if the check failed because the target was not found,
    not because it had validation errors.
    """
    detail = check.get("detail", "").lower()
    if "validation error" in detail:
        return False
    return any(kw in detail for kw in ("missing", "not found", "not exist"))
