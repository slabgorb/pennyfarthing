# Contributing to Pennyfarthing

## Publishing

**Always use `pnpm publish` in this workspace. Never use `npm publish`.**

This is a pnpm workspace. Several packages use the `workspace:*` protocol in their
`package.json` dependencies (e.g., `"@pennyfarthing/core": "workspace:*"`). When you
run `pnpm publish`, pnpm automatically resolves these to real version numbers before
publishing. `npm publish` does not understand this protocol and will publish the literal
string `workspace:*`, breaking installations for consumers.

```bash
# Correct
cd packages/core && pnpm publish --access public

# WRONG - leaks workspace:* refs into the published tarball
cd packages/core && npm publish --access public
```

The `scripts/deploy.sh` script handles publishing for releases. If you need to publish
manually, always use `pnpm publish` from the package directory.
