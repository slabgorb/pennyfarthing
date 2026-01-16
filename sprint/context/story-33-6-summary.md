# Story 33-6: Display Permission Denials in Cyclist Result Messages

## What Was Built

Added visual display of permission denials in Cyclist's result messages. When Claude's tool calls are blocked by permission settings, users now see which tools were denied, what they tried to access, and how to grant permission.

## Key Technical Decisions

1. **Integrated into existing result renderer** rather than creating a new message type - keeps the codebase simpler and follows established patterns
2. **Target extraction uses fallback chain** (`file_path || url || command || JSON.stringify(input)`) to handle all tool types without explicit tool-type checking
3. **100-character truncation** prevents DOM bloat from long file paths or URLs while still providing actionable context
4. **HTML escaping via existing `escapeHtml()` utility** - no new security surface, consistent with rest of codebase

## Implementation Patterns

- **Defensive extraction pattern:** `denial.tool_name || 'Unknown'` and `denial.tool_input || {}` ensure robustness against malformed data
- **Conditional class application:** `has-denials` class only added when denials present, allowing CSS to conditionally style the result message
- **Help text with code examples:** Shows both config file path and `/permissions grant` command for remediation

## Files Modified

| File | Changes |
|------|---------|
| `packages/cyclist/src/public/js/components/message-view/message-renderers.js` | +28 lines - denial extraction and HTML generation |
| `packages/cyclist/src/public/styles.css` | +43 lines - warning styling with CSS variables |
| `packages/cyclist/tests/B-14-message-display.test.ts` | +94 lines - 5 new tests covering denial scenarios |

## Lessons for Future Work

1. **CSS variable usage** (`--status-error`, `--font-mono`) ensures consistency with theme and makes future theme updates automatic
2. **Test structure** groups related tests in describe blocks, making it easy to add more denial scenarios later
3. **Target resolution chain** is extensible - add more `input.property` checks for new tool types without breaking existing ones
