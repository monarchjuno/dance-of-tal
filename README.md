# Dance of Tal

Personal AI behavior engine for Tal x Dance.

`Tal` is your thinking profile. `Dance` is your output pattern.
Apply one, the other, or both per project.

[Website](https://dance-of-tal.vercel.app) · [Connect Guide](https://dance-of-tal.vercel.app/connect) · [MCP Guide](https://dance-of-tal.vercel.app/mcp-guide) · [OpenClaw](https://openclaw.ai)

## What this gives you

- Project-level behavior control via `.dance-of-tal/config.json`
- MCP server for hosts like Windsurf, Claude Desktop, Cursor, and OpenClaw flows
- CLI-first UX with `dot` commands (`pick`, `lock`, `deploy`, `switch`, `doctor`)
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
dot lock --tal elon-musk-case-tal --dance boardroom-brief --name "Founder Combo"
# or tal-only / dance-only
# dot lock --tal elon-musk-case-tal --name "Thinking Only"
# dot lock --dance boardroom-brief --name "Output Only"

# 3) Deploy to a stage
dot deploy --stage mcp --task "Draft this week's board summary"

# 4) (Optional) Connect Threads tester token, then publish
dot channel connect threads --token "<THREADS_LONG_LIVED_ACCESS_TOKEN>" --meta userId="<THREADS_USER_ID>"
dot deploy --stage threads --publish --text "Launching private beta now."

# 5) Validate host setup
dot doctor --project /ABSOLUTE/PATH/TO/YOUR/PROJECT --target windsurf
```

## Sensitive secrets via `.dance-of-tal/.env` (optional)

For security-sensitive users, keep Threads secrets in `.dance-of-tal/.env` instead of typing tokens in chat/CLI args.

```bash
# /ABSOLUTE/PATH/TO/YOUR/PROJECT/.dance-of-tal/.env
DANCE_OF_TAL_THREADS_ACCESS_TOKEN="<THREADS_LONG_LIVED_ACCESS_TOKEN>"
DANCE_OF_TAL_THREADS_USER_ID="<THREADS_USER_ID>"
# optional
DANCE_OF_TAL_THREADS_BASE_URL="https://graph.threads.net"
DANCE_OF_TAL_THREADS_API_VERSION="v1.0"
DANCE_OF_TAL_THREADS_FETCH_LIMIT="6"
```

Then run:

```bash
dot channel connect threads --project /ABSOLUTE/PATH/TO/YOUR/PROJECT
dot deploy --project /ABSOLUTE/PATH/TO/YOUR/PROJECT --stage threads --publish --text "Launching private beta now."
```

Value resolution priority:
- CLI flag
- saved channel value in `.dance-of-tal/channels.json`
- runtime env
- `.dance-of-tal/.env` / `.dance-of-tal/.env.local`

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
        "DANCE_OF_TAL_PROJECT_DIR": "/ABSOLUTE/PATH/TO/YOUR/PROJECT",
        "DANCE_OF_TAL_TOOLS": "core"
      }
    }
  }
}
```

Tool profile guidance:

- `core` (default): workflow-first minimal toolset to reduce MCP context load
- `standard`: adds list/get and custom build/update tools
- `all`: exposes every tool, including GPTs/data helper tools
- custom CSV: `DANCE_OF_TAL_TOOLS="initialize_styling_session,next_combo,set_active_combo,run_active_combo"`

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
dot pick tal --query founder
dot lock --tal <tal-slug> [--dance <dance-slug>] --name "My Combo"
dot deploy --stage mcp --task "Your real task"
```

Useful commands:

```bash
dot help
dot list tal --include-custom
dot list dance --include-custom
dot show tal <slug>
dot show dance <slug>
dot lock --tal <tal-slug> [--dance <dance-slug>]
dot deploy --stage gpts --task "..."
dot deploy --stage threads --publish --text "..."
dot channel list
dot channel connect threads --token "<TOKEN>" --meta userId="<THREADS_USER_ID>"
dot channel connect threads                   # reads token/userId from .dance-of-tal/.env if present
dot current
dot prompt --mode combined
dot switch tal
dot switch dance
dot switch combo
dot combo list
dot combo rename <combo-id> --name "New Name"
dot combo custom --name "Creator Combo" --input "High-retention creator style" --input "/Users/me/script.md"
dot combo custom --name "Threads Combo" --dance-only --stage threads --example "Hook topic => Example output cadence"
dot clear
dot config show
dot config path
dot doctor --target windsurf
```

Deploy stage notes:

- `dot deploy --stage gpts`: returns GPT instructions payload
- `dot deploy --stage mcp`: returns SYSTEM/USER package and runnable command
- `dot deploy --stage openclaw`: returns OpenClaw-ready system prompt hints
- `dot deploy --stage threads`: returns post brief
- `dot deploy --stage threads --publish --text "..."`
  posts directly via Threads Graph API using token/userId from `.dance-of-tal/channels.json` or `.dance-of-tal/.env`

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
- `update_custom_tal`
- `update_custom_dance`
- `update_combo`
- `abstract_tal_dance`

Example: apply a general style policy (reference scope + expression rules + avoid/prefer constraints).

```json
{
  "name": "Job Application Legacy Voice",
  "goal": "Use successful examples before 2023 and avoid AI-like writing patterns.",
  "inputs": [
    "Use proven successful examples and keep language natural.",
    "Avoid overly formulaic phrasing."
  ],
  "stylePolicy": {
    "referenceWindow": {
      "mode": "historical",
      "cutoffYear": 2022
    },
    "expression": {
      "structure": "paragraph",
      "punctuationDiscipline": "strict",
      "templateStrictness": "strict"
    },
    "constraints": {
      "prefer": [
        "cohesive narrative flow with concrete examples"
      ],
      "avoid": [
        "formulaic transition scaffolding",
        "separator-heavy punctuation chains"
      ]
    }
  }
}
```

By default, custom outputs are persisted to `.dance-of-tal/config.json` and can be auto-activated.

You can also inject example outputs manually and let the engine auto-parse them:

```bash
dot combo custom \
  --name "My Job Application Dance" \
  --dance-only \
  --input "Natural Korean letter voice, no AI-like templates." \
  --example "Input: 지원 동기 요약\nOutput: 회사 미션과 내 경험을 한 문단으로 연결한다." \
  --example "경험 정리 => 문제-행동-결과 순으로 압축"
```

Stage-aware example generation:

- Add `--stage threads` to tune rules for Threads output patterns.
- If Threads channel credentials exist in `.dance-of-tal/channels.json`,
  custom dance generation attempts to pull recent live posts as exemplar references automatically.

## MCP tools

Note: default MCP startup loads the `core` profile only. Lists below show the full catalog.

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
- `update_custom_tal`
- `update_custom_dance`
- `update_combo`
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

- Catalog is stored as JSON in repo:
  - `src/data/tals.json`
  - `src/data/dances.json`
  - `src/data/recommended-combos.json`
  - derived indexes in `src/data/catalog.ts`
- Project-local runtime state:
  - `.dance-of-tal/config.json`
  - `.dance-of-tal/sessions.json`
  - `.dance-of-tal/channels.json`

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
