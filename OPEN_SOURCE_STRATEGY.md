# Dance of Tal Open Source Strategy

## Positioning
- `front/`: product surface (discovery + onboarding UI).
- `mcp/`: open-source engine (MCP server + CLI).
- Default story: "GUI-first onboarding, code-first extensibility."

## Release Model
- Keep `front` and `mcp` as independent repos/releases.
- Version `mcp` with semver and changelog per release.
- Tag host-related compatibility in release notes:
  - Windsurf
  - Claude Desktop
  - Cursor
  - OpenClaw
  - GPTs (knowledge flow)

## Onboarding Funnel
1. User lands on `/connect` and picks host.
2. User copies config snippet and runs `dot init`.
3. User runs `dot doctor` to validate setup.
4. User starts workflow tools (`initialize_styling_session`, `next_combo`, `run_active_combo`).

## Contribution Model
- Accept contributions in these tracks:
  - new Tal/Dance data packs
  - host integration docs
  - CLI UX and diagnostics
  - safety and prompt quality improvements
- Require PR template fields:
  - behavior change summary
  - backward compatibility impact
  - test evidence (`npm run build` + command/output samples)

## Quality Gates
- Required before merge:
  - `npm run build` in `mcp`
  - `npm run build` in `front`
  - no breaking changes to core MCP tool contracts without migration notes

## Trust and Safety
- Keep public-figure styles abstracted into reusable operating patterns.
- No direct identity cloning or deceptive impersonation workflows.
- Document prohibited usage in README and issue templates.

## Ecosystem Growth
- Publish `mcp` to npm as the canonical install path.
- Keep copy/paste host configs in docs and `/connect` in sync.
- Add monthly "starter combos" and "top use-cases" updates to drive adoption.
