# Dance of Tal

Personal AI behavior engine for Tal x Dance.

`Tal` is your thinking profile. `Dance` is your output pattern.
Apply one, the other, or both per project.

[Website](https://dance-of-tal.vercel.app) · [Connect Guide](https://dance-of-tal.vercel.app/connect) · [MCP Guide](https://dance-of-tal.vercel.app/mcp-guide) · [OpenClaw](https://openclaw.ai)

## What this gives you

- Project-level behavior control via `.dance-of-tal/config.json`
- MCP server for hosts like Windsurf, Claude Desktop, Cursor, and OpenClaw flows
- CLI-first UX with `dot` commands (`init`, `use`, `run`, `switch`, `doctor`)
- Preset and custom Tal/Dance abstraction from one unified input (auto-detects text/file/url)

## Install (recommended)

Runtime: Node.js 18+

```bash
npm install -g dance-of-tal
```

No global install mode:

```bash
npx --yes --package dance-of-tal dot --help
```

## Quick start (TL;DR)

```bash
# 1) Initialize a project
npm install -g dance-of-tal
dot init --project /ABSOLUTE/PATH/TO/YOUR/PROJECT --target windsurf

# 2) Pick behavior mode
dot use --tal elon-musk-case-tal --dance boardroom-brief --name "Founder Combo"
# or tal-only / dance-only
# dot use --tal elon-musk-case-tal --name "Thinking Only"
# dot use --dance boardroom-brief --name "Output Only"

# 3) Run with active behavior
dot run --task "Draft this week's board summary"

# 4) Validate host setup
dot doctor --project /ABSOLUTE/PATH/TO/YOUR/PROJECT --target windsurf
```

Starter prompt for AI hosts:

```text
Set my Tal and Dance.
```

Richer one-line prompt:

```text
Set my Tal and Dance for [my goal]. Use preset first, then ask if I want custom tuning.
```

## MCP host config (stdio)

Use this for most MCP hosts:

```json
{
  "mcpServers": {
    "dance-of-tal": {
      "command": "npx",
      "args": ["-y", "dance-of-tal"],
      "env": {
        "DANCE_OF_TAL_PROJECT_DIR": "/ABSOLUTE/PATH/TO/YOUR/PROJECT"
      }
    }
  }
}
```

## Highlights

- Workflow-first MCP tools: initialize, recommend, apply, run
- Flexible modes: Combo, Tal-only, Dance-only
- Local persistence: config + sessions inside `.dance-of-tal/`
- Compact GPTs endpoints support via the web app data pipeline
- OpenClaw-friendly profile generation (`build_openclaw_profile`)

## How it works (short)

```text
Your project
  -> .dance-of-tal/config.json (active Tal/Dance/combo)
  -> .dance-of-tal/sessions.json (workflow sessions)

AI Host (Windsurf/Claude/Cursor/OpenClaw flow)
  -> MCP stdio server: npx -y dance-of-tal
  -> tools: recommend -> set_active_combo -> run_active_combo
```

## CLI surface (`dot`)

Core flow:

```bash
dot init
dot use --tal <tal-slug> [--dance <dance-slug>] --name "My Combo"
dot run --task "Your real task"
```

Useful commands:

```bash
dot help
dot list tal --include-custom
dot list dance --include-custom
dot show tal <slug>
dot show dance <slug>
dot current
dot prompt --mode combined
dot switch tal
dot switch dance
dot switch combo
dot combo list
dot combo rename <combo-id> --name "New Name"
dot combo custom --name "Creator Combo" --input "High-retention creator style" --input "/Users/me/script.md"
dot clear
dot config show
dot config path
dot doctor --target windsurf
```

Legacy compatibility:

```bash
tal list
dance list
```

## Custom Tal/Dance generation

Custom and abstraction tools use one unified input field.  
You can pass free text, file paths, URLs, or mixed context in the same request.

```json
{
  "inputs": [
    "I want concise, evidence-first responses for board updates.",
    "/absolute/or/relative/path/to/notes.md",
    "https://example.com/reference-article"
  ]
}
```

Available tools:

- `build_custom_tal`
- `build_custom_dance`
- `build_custom_tal_dance`
- `abstract_tal_dance`

By default, custom outputs are persisted to `.dance-of-tal/config.json` and can be auto-activated.

## MCP tools

Core workflow tools:

- `workflow_overview`
- `advise_setup_mode`
- `initialize_styling_session`
- `next_combo`
- `set_active_combo`
- `run_active_combo`
- `get_session`
- `list_sessions`
- `clear_session`

Catalog + prompt tools:

- `list_tals`
- `get_tal`
- `list_dances`
- `get_dance`
- `build_prompt`
- `quick_apply`
- `recommend_gpts`

Extended tools:

- `list_dance_categories`
- `recommend_dance_categories`
- `get_recommended_combos`
- `get_data_summary`
- `get_gpts_bootstrap`
- `list_gpts_tals`
- `list_gpts_dances`
- `build_openclaw_profile`
- `abstract_tal_dance`

## OpenClaw integration

Use Dance of Tal MCP to build an assistant-ready style profile for OpenClaw:

```bash
# list tools
npx -y mcporter list --stdio "npx -y dance-of-tal" --schema

# build profile
npx -y mcporter call --stdio "npx -y dance-of-tal" \
  build_openclaw_profile \
  talSlug="elon-musk-case-tal" \
  danceSlug="boardroom-brief" \
  assistantName="OpenClaw Founder Copilot" \
  personaGoal="Decide faster with constraints"
```

Then copy returned `profile.systemPrompt` into your OpenClaw assistant profile.

## Data model and storage

- Catalog is hardcoded in code for open-source portability:
  - `src/data/hardcoded-catalog.ts`
  - derived indexes in `src/data/catalog.ts`
- Project-local runtime state:
  - `.dance-of-tal/config.json`
  - `.dance-of-tal/sessions.json`

## Development (from source)

```bash
git clone https://github.com/monarchjuno/dance-of-tal.git
cd dance-of-tal/mcp
npm install
npm run build
npm run dev
```

Build output:

- `dist/server/index.js` (MCP server)
- `dist/cli/dot.js` (CLI)

## License

MIT
