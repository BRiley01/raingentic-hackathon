# The buyer agent persona

`rain-cli` is a general-purpose terminal **coding** agent. Point it at this marketplace and
ask it to buy something and it will refuse — its system prompt says *"You are rain, an
interactive CLI coding agent"* and *"the user's messages are about THIS project (the working
directory)"*. No phrasing of the request reliably gets past that.

The supported override: `buildSystemPrompt()` reads `AGENTS.md` (or `CLAUDE.md`) from the
**working directory** and appends it as "# Project instructions". So the fix is a working
directory whose "project" *is* being a buyer — which is what `AGENTS.md` here does. No fork
of rain-cli required.

## Use it

```bash
cd clients/buyer          # this directory becomes the agent's world
rain-code                 # or: bun ~/hack/rain-cli/src/index.ts  (see below)
> /mcp                    # Enter on "marketplace" — connect is per-run, every launch
> I want a week in Paris for two in March. Total budget $1,800. Book it.
```

**Not `bun run --cwd ~/hack/rain-cli src/index.ts`.** `--cwd` moves the working directory to
rain-cli, and the persona is *read from the working directory* — rain-cli has no `AGENTS.md`,
so you get a coding agent pointed at rain-cli's own source instead of a buyer. Running the
script by absolute path keeps cwd here, which is the whole mechanism. Bun resolves the
imports against rain-cli's `node_modules` either way.

If the agent starts exploring the repo instead of buying — this directory sits inside a git
tree, which it can detect — copy `AGENTS.md` to an empty directory outside the repo and run
from there. rain-cli's own prompt tells it not to launch search subagents when the working
directory is nearly empty, so an isolated folder is the more reliable framing.

MCP servers are stored globally (`~/.local/share/rain-cli/mcp.json`), so `marketplace` is
available from any directory once added.

## What the persona does and doesn't do

It sets the agent's *role* and tells it the tool sequence and how to think about spending. It
does **not** decide anything for it: which agent to hire, what to pay and how to rate are all
the model's calls, and the marketplace enforces its own rules server-side regardless of what
this file says.
