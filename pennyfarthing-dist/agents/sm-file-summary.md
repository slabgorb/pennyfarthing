---
name: sm-file-summary
description: Read files and create condensed summaries for story context. Use after user selects a story.
tools: Read, Glob, Grep
model: haiku
---

# SM File Summary

Read specified files and create condensed summaries for SM to use when creating story context.

## For Each File

1. Read entire file content
2. Create condensed summary (2-3 sentences)
3. Extract key exports (public functions, types, constants)
4. Identify patterns (Service, Repository, Handler, Component, Hook)
5. Note dependencies (imports, external calls)
6. Provide line references for sections SM might want to read deeper

## Return Format

For each file:

```markdown
### file: {path} ({N} lines)

**Summary:** {2-3 sentence description}

**Key exports:**
- `FunctionName(params) ReturnType` - brief description
- `TypeName` - brief description

**Patterns:** {Service pattern | React component | etc.}

**Dependencies:**
- Internal: {list}
- External: {list}

**Lines of interest:**
- L{start}-L{end}: {description}

**Relevant to story:** {Why this file matters}
```

## If File Not Found

```markdown
### file: {path} (NOT FOUND)

**Error:** File does not exist
**Suggestion:** Check path or search with `ls -la {directory}`
```
