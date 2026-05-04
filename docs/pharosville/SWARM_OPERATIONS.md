# Swarm Operations

Last updated: 2026-05-04

How to safely orchestrate multiple agents working on PharosVille in parallel.

## The hazard

Multiple agents writing to the same git working tree race each other.
During the Optimizantus health-checkup swarm (see
`agents/health-checkup-2026-05-04/`), four `git reset: moving to HEAD`
events fired in the working tree mid-run and silently wiped the work of
six agents that had already reported "completed". Some agents detected
the revert and re-applied; others did not. The final reconciliation cost
roughly twice as much wall-clock time as the original implementation.

Root cause was never positively identified. Candidates: an external
linter, an editor save-on-focus, hooks running on tool calls, or a
parallel agent invoking a shell command that included a destructive git
operation. Any of those collapses the working tree under concurrent
writes; the production lesson is to isolate the working tree per agent.

## Two safe patterns

### Pattern A — Worktree per agent (preferred)

Each agent gets its own git worktree on its own branch. Use the existing
helper:

```bash
npm run worktree:new -- <agent-slug> --branch <branch-name> --install
```

The agent does its work in its worktree, the orchestrator merges the
branches back into a single integration branch (or onto `main` directly
if the changes are non-overlapping). Standard git protects against
overlap.

When using the `Agent` tool with `isolation: "worktree"`, the harness
creates a temporary worktree automatically and cleans it up when the
agent makes no changes. Otherwise the path and branch are returned in
the result for manual integration.

### Pattern B — Strict file ownership

If worktree-per-agent is too heavyweight (e.g. for a 30-second sweep),
spawn agents in the same working tree but **enforce that no two agents
write to the same file**. The orchestrator brief must call out file
ownership explicitly:

> "You exclusively own `src/foo.ts` and `src/bar.ts`. NO other agent
> will touch these files. Other agents are working on `src/baz.ts`,
> etc. — do not read or edit their files."

This worked for ~13 of 15 agents in Round 1 of the Optimizantus swarm
even with the external `git reset` events disrupting things. It does
not protect against the race itself; it just minimises the blast radius.

## Avoid

- Two agents that both touch the same file (even read+write is risky if
  one of them reformats).
- A long-running agent that holds an editor lock while a sibling agent
  edits the same file.
- Using `git reset --hard`, `git checkout --`, or `git stash` while
  agents are mid-flight; these reach across the working tree and can
  destroy untracked work.
- Spawning agents to perform very small (<30 LOC) edits — the
  orchestration cost dominates. Do those directly.

## Verification

After a parallel run, before declaring success:

1. `git status --short` — confirm every expected file change is present.
2. `npm run typecheck` — catches missing changes that broke the build.
3. `npm test` — catches missing changes that broke a test.
4. Compare the per-agent outputs to the actual file diffs (`git diff`).

If an agent reported "completed" but their file isn't in `git status`,
their work was reverted; re-apply directly or re-spawn the agent.

## See also

- `docs/pharosville/VISUAL_REGEN.md` — how to regenerate visual
  snapshots in the same Docker image CI uses.
- `agents/health-checkup-2026-05-04/00-implementation-plan.md` — the
  Optimizantus run that surfaced these lessons.
