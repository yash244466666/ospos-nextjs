# Execution conventions

## Branches

`port/p<N>-<slug>` per phase. One obligation (or small coherent group) per commit.
Merge `--ff-only` to `main` only after the phase gate is green. Never force-push,
never rewrite `main`.

## Commits

Conventional commits: `feat(<module>):`, `fix(<module>):`, `test(<module>):`,
`docs(plan):`, `chore(<area>):`. Every commit ends with:

```
Co-Authored-By: Claude Code <noreply@anthropic.com>
```

## Phase gate

A phase is complete only when **all** of the following pass on that branch:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test` (unit + repository integration, SQLite; MySQL when reachable)
4. `npm run build`
5. `npm run test:e2e` (Playwright, when the phase has UI)
6. `npm run parity` (the applicable subset: schema, seed, config, permissions,
   locale, routes, reports, no-stubs, SQL safety)
7. Differential subset against the PHP oracle (when the phase touches behavior the
   harness covers)

Gate evidence is recorded in `PROGRESS.md`.

## Definition of done for an obligation

- Behavior implemented from the appendix's cited `file:line`, not from memory.
- Acceptance tests named by the appendix exist and pass.
- Permission enforcement identical to upstream.
- No stubs, TODOs, placeholder data, or hard-coded user-visible English.
- Traceability row updated; deviations recorded in plan §11.3.

## Environment

- SQLite is the default dev driver; MySQL is a first-class production target.
- `DB_DRIVER=mysql` must work for every path (no `getDbSync()` on server paths).
- Sudo password for system packages: see workspace `CLAUDE.md`.
