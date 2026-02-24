# Dance of Tal

> *"We don't just speak to the machine; we choreograph its mind."*

**Dance of Tal** is a composable cognitive behavior engine for modern LLMs.

For too long, developers and teams have crammed everything—the expert persona, the formatting rules, the step-by-step logic, and the target platform constraints—into a single, monolithic "mega-prompt." This is the AI equivalent of spaghetti code: brittle, unversionable, and impossible to reuse when the context shifts.

Dance of Tal introduces true separation of concerns to language models. It treats AI behavior as a choreographed performance governed by four distinct, decoupled primitives:

1. **Tal (The Mind / Data Model):** Your analytical profile. How the AI digests problems, weighs risks, processes constraints, and deduces conclusions. (The *What* and *Why*).
2. **Dance (The Movement / View):** Your output geometry. The tone, structural matrix, pacing, and punctuation density of the final artifact. (The *How*).
3. **Act (The Sequence / Controller):** Your workflow logic. A deterministic, step-by-step pipeline ensuring the model doesn't skip necessary logical milestones. (The *When*).
4. **Stage (The Arena / Environment):** Your deployment target. Are you rendering to a custom backend (`my-aws-server`), an autonomous agent (`openclaw`), or publishing a micro-blog (`threads`)? (The *Where*).

By decoupling these elements, you can mix and match behaviors per project and deploy them anywhere.

[Website: dance-of-tal-web.vercel.app](https://dance-of-tal-web.vercel.app/)

---

## The Core Philosophy at Work

### Decoupling Thought from Expression
Sometimes you need the analytical rigor of a *Strategy Chief* (**Tal**), but the output format of a *Concise Bulleted List* (**Dance**). Other times, you need that same Strategy Chief to output an *Interactive Web App Specification*.

With legacy prompting, you rewrite the whole instruction set. With Dance of Tal, you simply swap the Dance while keeping the Tal intact. You pivot outputs without changing the underlying cognitive engine.

### Deterministic Workflows (`Act`)
LLMs are prone to wandering. The **Act** primitive forces the LLM through a specific sequence of operations—such as [1. Analyze constraints -> 2. Draft hypotheses -> 3. Formulate response].

This guarantees that whether you are using a *Creative Writer* or a *Data Scientist* Tal, the operational pipeline remains predictable and debuggable. Act maintains state using strictly managed step transitions within `.dance-of-tal/sessions.json`.

### Stage-Aware Deployments (`Stage`)
Once your choreography (Tal + Dance + Act) is locked, you "deploy" it to a **Stage**. Each stage compiles and packages the exact same cognitive instructions differently based on the medium's constraints:

- **`--stage my-aws-server`**: Packages the choreography into a custom JSON envelope required by your proprietary backend service.
- **`--stage openclaw`**: Returns payload fragments and system prompts optimized for intelligent agent boundaries (using MCP tools like `build_openclaw_profile`).
- **`--stage threads`**: Formats output for micro-blogging and can **publish directly** via Graph API (`--publish`), automatically segmenting the payload into a reply chain if it exceeds 500 characters.

---

## Quick Start

Runtime Requirements: Node.js 18+

```bash
# Install globally
npm install -g dance-of-tal

# 1) Initialize a project workspace
dot init --project /ABSOLUTE/PATH/TO/YOUR/PROJECT --target windsurf

# 2) Pick and lock your behavior modes (The Choreography)
dot lock --tal strategy-chief --dance boardroom-brief --name "Founder Combo"

# 3) Deploy the configuration to your stage
dot deploy --stage my-aws-server --task "Draft this week's board summary"
```

*Don't want to install globally? Just use npx:*
```bash
npx --yes --package dance-of-tal dot --help
```

---

## The CLI Surface (`dot`)

The command line interface is designed to feel like a package manager for AI personas.

```bash
# Explore presets
dot list tal
dot list dance

# Inspect a specific behavior
dot show tal strategy-chief

# Combine custom files/links into a new behavior using local AI abstraction
dot combo custom --name "My Internal Voice" --input "Keep it blunt and technical." --input "./my-old-emails.md"

# Switch contexts seamlessly
dot switch combo

# Check diagnostics
dot doctor --target windsurf

# Example: Draft and publish directly to Threads using your choreography
dot channel connect threads --token "<ACCESS_TOKEN>" --meta userId="<USER_ID>"
dot deploy --stage threads --publish --text "Launching the private beta now. Here's what we learned..."
```

---

## Under the Hood

### Data Storage & Portability
- Predefined behaviors live within the package catalog (`src/data/`).
- Your actual usage, custom generations, active configurations, and API credentials live entirely within your codebase in `.dance-of-tal/`.
  - `.dance-of-tal/config.json`: Stores your Tals, Dances, and saved Combos.
  - `.dance-of-tal/sessions.json`: Holds stateful Act session histories.
  - `.dance-of-tal/channels.json`: Encrypted/local API keys (like Threads variables).
- **No central server tracks your prompts.** It is completely local. Check it into git, version it, and share it with your team.

### Extensible MCP Integration (stdio)
Dance of Tal acts as a standalone tool provider for your AI code editor. To integrate into Claude Desktop or standard MCP clients, simply inject the engine.

```json
{
  "mcpServers": {
    "dance-of-tal": {
      "command": "npx",
      "args": ["-y", "dance-of-tal"],
      "env": {
        "DANCE_OF_TAL_PROJECT_DIR": "/ABSOLUTE/PATH/TO/YOUR/PROJECT",
        "DANCE_OF_TAL_TOOLS": "core" // Access mode: "core", "standard", or "all"
      }
    }
  }
}
```

#### Supported MCP Tool Namespaces
- `act`: Session lifecycle management (`run_active_combo`, `get_session`, `clear_session`)
- `catalog`: Discovery mapping (`list_tals`, `list_acts`, `get_recommended_combos`)
- `custom`: Abstracting logic from raw text or URLs (`build_custom_tal_dance`, `update_combo`)
- `gpts`: Fast export to custom GPT builder (`get_gpts_bootstrap`)

---

## License

MIT

*Choreograph your intelligence.*
