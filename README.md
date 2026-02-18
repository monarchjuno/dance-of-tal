# Dance of Tal - mcp

Local MCP server + CLI for Tal x Dance architecture.
Includes a workflow layer: `initialize -> recommend next combo -> set active combo -> run`.
Open-source rollout plan: `OPEN_SOURCE_STRATEGY.md`.

## Repo
- MCP repo: `https://github.com/monarchjuno/dance-of-tal.git`
- npm package: `dance-of-tal`

## Quick Start

```bash
npm install -g dance-of-tal
dot init --project /ABSOLUTE/PATH/TO/YOUR/PROJECT --target windsurf
dot doctor --project /ABSOLUTE/PATH/TO/YOUR/PROJECT --target windsurf
```

No global install mode:
```bash
npx --yes --package dance-of-tal dot init --project /ABSOLUTE/PATH/TO/YOUR/PROJECT --target windsurf
npx --yes --package dance-of-tal dot doctor --project /ABSOLUTE/PATH/TO/YOUR/PROJECT --target windsurf
```

Starter prompt for AI hosts:
```text
Set my Tal and Dance.
```

If you want a richer setup in one sentence:
```text
Set my Tal and Dance for [my goal]. Use preset first, then ask if I want custom tuning.
```

## Install and run (package users)
```bash
npm install -g dance-of-tal
dot --help
```

No global install mode:
```bash
npx --yes --package dance-of-tal dot --help
```

## Install and run (local development)
```bash
npm install
npm run dev
```

CLI usage right after install:
```bash
npx dot --help
npx dot help
```

If you want to run `dot` directly (without `npx`), link once:
```bash
npm link
dot --help
```

Optional CLI-first flow (skip MCP host setup):
```bash
dot init
dot use --tal <tal-slug> --dance <dance-slug> --name "My Combo"
dot run --task "Your real task"
```

## dot setup flow
Use `dot init` as the onboarding entrypoint for each project:

If you prefer GUI onboarding, open [`/connect`](https://dance-of-tal.vercel.app/connect) (host selection + copy/paste config snippets).

```bash
# 1) interactive step-by-step setup (recommended)
dot init

# optional: choose target project path in wizard
dot init --project .

# wizard supports numbered Tal/Dance selection
# and colorized CLI output in TTY terminals
# wizard also supports Custom generate (text/file/url) during init
# wizard host targets: Windsurf / Claude Desktop / OpenClaw / Cursor / GPTs / Other

# 2) non-interactive setup with flags (CI/script friendly)
dot init --tal elon-musk-case-tal --dance boardroom-brief --name "Founder Combo"
dot init --tal elon-musk-case-tal --name "Thinking Only"
dot init --dance boardroom-brief --name "Output Only"
dot init --tal elon-musk-case-tal --dance boardroom-brief --target openclaw --no-interactive
dot init --tal elon-musk-case-tal --dance boardroom-brief --target gpts --no-interactive
dot init --project . --no-interactive

# 3) run with current active mode
dot run --task "Draft this week's board summary"

# 4) host connection diagnostics
dot doctor --target windsurf
```

Build and run:
```bash
npm run build
npm run start
```

## Server code layout
- `src/server/index.ts`: entrypoint and tool registration bootstrap.
- `src/server/tools/workflow-tools.ts`: workflow session + local-config-first activation/run logic.
- `src/server/tools/catalog-tools.ts`: Tal/Dance catalog and prompt/profile tools.
- `src/server/tools/custom-tools.ts`: custom Tal/Dance generation tools.
- `src/server/tools/gpts-tools.ts`: compact GPTs query/recommend tools.
- `src/server/setup-mode.ts`: preset/custom/hybrid mode advisor.
- `src/server/project-target.ts`: project directory resolution for `.dance-of-tal`.
- `src/server/toolset.ts`: tool loading sets (`core`, `standard`, `all`, custom list).
- `src/cli/dot-config.ts` / `src/cli/dot-session-config.ts`: project-local persistence handlers used by MCP.

## Workflow-first MCP tools

### Core workflow (recommended)
1. `workflow_overview`
2. `advise_setup_mode`
3. `initialize_styling_session`
4. `next_combo`
5. `set_active_combo`
6. `run_active_combo`

Helper tools:
- `get_session`
- `list_sessions`
- `clear_session`

### Catalog and prompt tools
- `list_tals`
- `get_tal`
- `list_dances`
- `get_dance`
- `build_prompt`
- `quick_apply`
- `recommend_gpts`

### Extended tools
- `list_dance_categories`
- `recommend_dance_categories`
- `get_recommended_combos`
- `get_data_summary`
- `get_gpts_bootstrap`
- `list_gpts_tals`
- `list_gpts_dances`
- `build_openclaw_profile`
- `build_custom_tal`
- `build_custom_dance`
- `build_custom_tal_dance`

## Recommended UX flow (host/agent)

1. Call `advise_setup_mode` with user goal.
2. Ask the returned clarifying questions (preset vs custom vs hybrid).
3. Call `initialize_styling_session` (or `next_combo`) using the selected setup mode.
4. Confirm combo (or Tal-only / Dance-only mode) with user, then call `set_active_combo`.
5. For each user request, call `run_active_combo` (session optional).
6. If user wants a different style, call `next_combo` and re-apply.

This provides a clear state-machine flow tuned for Tal x Dance behavior control.

### MCP + CLI hybrid persistence
- Local config is the source of truth: `.dance-of-tal/config.json`.
- Workflow sessions are persisted in `.dance-of-tal/sessions.json`.
- `set_active_combo` persists the active selection by default.
- `set_active_combo` can be called without `sessionId` (auto-session bootstrap).
- If persistence fails, response status becomes `active_combo_set_not_persisted` with a `warning` field.
- `get_session`, `list_sessions`, `next_combo`, `set_active_combo`, `clear_session` read/write the persisted session file.
- `run_active_combo` can run from:
  1) active session (`sessionId`)
  2) local config (`projectDir` / env / discovered `.dance-of-tal/config.json`)
- Resolution order for target project directory:
  1) `projectDir` argument
  2) `session.projectDir`
  3) workspace envs (`DANCE_OF_TAL_PROJECT_DIR`, `WORKSPACE_ROOT`, `WORKSPACE_FOLDER`, `VSCODE_WORKSPACE_FOLDER`, `CURSOR_WORKSPACE_PATH`, `WINDSURF_WORKSPACE_PATH`, `CLAUDE_PROJECT_DIR`, `OPENCLAW_PROJECT_DIR`)
  4) fallback discovery from existing `.dance-of-tal/config.json` in `PWD` / `INIT_CWD` / server cwd
- To disable persistence for a call: set `persist: false`.
- Workflow tools now return concise, user-facing payloads by default (to reduce noisy outputs like session IDs).
- If you need debugging/internal fields, pass `verbose: true`.
- `advise_setup_mode`, `initialize_styling_session`, and `next_combo` support setup hints:
  - `mode`: `auto|preset|custom|hybrid`
  - `hasUserSources`: boolean
  - `sourceTypes`: `text|file|url`
- `set_active_combo` supports Tal-only and Dance-only modes.

Recommended for all hosts:
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

## Hardcoded catalog (open-source friendly)
- Tal, Dance, and recommendation data are hardcoded in code:
  - `src/data/hardcoded-catalog.ts`
- Derived summary/GPT indexes are built at runtime from hardcoded constants:
  - `src/data/catalog.ts`
- No runtime dependency on external catalog fetch or front-project sync.

For GPTs HTTP access, use the front app endpoints:
- `/data/tals.json`
- `/data/dances.json`
- `/data/recommended-combos.json`
- `/data/summary.json`
- `/api/data/tals`
- `/api/data/dances`
- `/api/data/recommended`
- `/api/data/summary`

## CLI (`dot`)

Primary command is `dot` (Dance of Tal).  
Per-project combo config is stored at `.dance-of-tal/config.json`.

```bash
# preset combo
dot use elon-musk-case-tal --dance boardroom-brief --name "Founder Decision Combo"

# tal-only / dance-only
dot use --tal elon-musk-case-tal --name "Thinking Only"
dot use --dance boardroom-brief --name "Output Only"

# inspect / run active combo
dot current
dot run --task "Draft a pricing memo"
dot prompt --mode combined
dot doctor --target claude

# switch active layer quickly
dot switch tal
dot switch dance
dot switch combo
dot switch tal elon-musk-case-tal
dot switch dance none            # Tal-only mode
dot switch tal none              # Dance-only mode

# combo management
dot combo list
dot combo rename <combo-id> --name "Board Weekly Combo"
dot combo use <combo-id>
dot clear

# custom Tal + Dance combo from user sources
dot combo custom \
  --name "My Investor Combo" \
  --tal-name "Investor Operator Tal" \
  --dance-name "Board Brief Dance" \
  --text "Think in first principles and constraints." \
  --file ./notes.md \
  --url https://example.com/reference

# custom tal-only or dance-only
dot combo custom --name "Only Thinking" --tal-only --text "first principles + risk checklist"
dot combo custom --name "Only Output" --dance-only --text "concise executive bullets"

# include custom items in list
dot list tal --include-custom
dot list dance --include-custom
```

Optional project target:

```bash
dot use elon-musk-case-tal --dance boardroom-brief --name "Project A Combo" --project /path/to/project
dot config path --project /path/to/project
```

Legacy commands are still available for compatibility:

```bash
tal list
dance list
```

## Customization input sources

`build_custom_tal`, `build_custom_dance`, and `build_custom_tal_dance` accept mixed sources:

```json
{
  "sources": [
    { "type": "text", "value": "I want concise, evidence-first responses for board updates." },
    { "type": "file", "value": "/absolute/or/relative/path/to/notes.md" },
    { "type": "url", "value": "https://example.com/reference-article" }
  ]
}
```

The server extracts reusable thinking/output patterns from these inputs and returns structured Tal/Dance JSON plus prompts.
By default, custom generation tools also persist created data to `.dance-of-tal/config.json` using CLI persistence handlers:
- `build_custom_tal`: saves custom Tal + Tal-only combo
- `build_custom_dance`: saves custom Dance + Dance-only combo
- `build_custom_tal_dance`: saves custom Tal + custom Dance + combo

Optional inputs for custom tools:
- `projectDir`
- `comboName`
- `persist` (default `true`)
- `activate` (default `true`)

## OpenClaw integration (openclaw.ai Personal AI Assistant)

Use this MCP server to inject Tal x Dance personas into an [OpenClaw.ai](https://openclaw.ai) assistant profile.
OpenClaw's tooling is ACP-based and commonly uses the `mcporter` CLI to call MCP servers.

Suggested flow:
1. `list_tals` and `list_dances` to choose slugs.
2. `build_openclaw_profile` to generate an OpenClaw-ready payload.
3. Copy `profile.systemPrompt` into your OpenClaw assistant system/persona instruction field.
4. Save and run your assistant in your preferred channels.

### Tested local call path (mcporter stdio)

```bash
# list available tools from this MCP server
npx -y mcporter list --stdio "npx -y dance-of-tal" --schema

# generate OpenClaw profile payload
npx -y mcporter call --stdio "npx -y dance-of-tal" \
  build_openclaw_profile \
  talSlug="elon-musk-case-tal" \
  danceSlug="boardroom-brief" \
  assistantName="OpenClaw Founder Copilot" \
  personaGoal="Decide faster with constraints"
```

Example tool call payload:

```json
{
  "talSlug": "elon-musk-case-tal",
  "danceSlug": "boardroom-brief",
  "assistantName": "Founder Ops Assistant",
  "personaGoal": "Help me make faster product and hiring decisions.",
  "userContext": "Seed-stage B2B SaaS founder. Team of 8.",
  "includeTaskStarter": true
}
```
