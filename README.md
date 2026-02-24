# Dance of Tal

> *"We don't just speak to the machine; we choreograph its mind."*

**Dance of Tal** is a composable cognitive behavior engine for modern LLMs.

For too long, developers and teams have crammed everything—the expert persona, the formatting rules, the step-by-step logic, and the target platform constraints—into a single, monolithic "mega-prompt." This is the AI equivalent of spaghetti code: brittle, unversionable, and impossible to reuse when the context shifts.

Dance of Tal introduces true separation of concerns to language models. It treats AI behavior as a choreographed performance governed by four distinct, decoupled primitives:

1. **Tal (The Mind / Data Model):** Your analytical profile. How the AI digests problems, weighs risks, processes constraints, and deduces conclusions. (The *What* and *Why*).
2. **Dance (The Movement / View):** Your output geometry. The tone, structural matrix, pacing, and punctuation density of the final artifact. (The *How*).
3. **Act (The Sequence / Controller):** Your workflow logic. A deterministic, step-by-step pipeline ensuring the model doesn't skip necessary logical milestones. (The *When*).
4. **Stage (The Arena / Environment):** Your deployment target. Are you rendering to an IDE context (MCP), an autonomous agent (OpenClaw), or publishing a micro-blog (Threads)? (The *Where*).

By decoupling these elements, you can mix and match behaviors per project and deploy them anywhere.

[Website: dance-of-tal-web.vercel.app](https://dance-of-tal-web.vercel.app/)

---

## The Core Philosophy at Work

### Decoupling Thought from Expression
Sometimes you need the analytical rigor of a *Strategy Chief* (**Tal**), but the output format of a *Concise Bulleted List* (**Dance**). Other times, you need that same Strategy Chief to output an *Interactive Web App Specification*.

With legacy prompting, you rewrite the whole instruction set. With Dance of Tal, you simply swap the Dance while keeping the Tal intact. You pivot outputs without changing the underlying cognitive engine.

### Deterministic Workflows (`Act`)
LLMs are prone to wandering. The **Act** primitive forces the LLM through a specific sequence of operations—such as [1. Analyze constraints -> 2. Draft hypotheses -> 3. Formulate response].

This guarantees that whether you are using a *Creative Writer* or a *Data Scientist* Tal, the operational pipeline remains predictable and debuggable.

### Stage-Aware Deployments (`Stage`)
Once your choreography (Tal + Dance + Act) is locked, you "deploy" it to a **Stage**. Each stage compiles and packages the exact same cognitive instructions differently based on the medium's constraints:

- **`--stage mcp`**: Returns a SYSTEM/USER package optimized for IDE context windows (Windsurf, Cursor, Claude Desktop).
- **`--stage gpts`**: Consolidates instructions to be pasted straight into the Custom GPT Builder.
- **`--stage openclaw`**: Returns system prompts optimized for intelligent agent boundaries and tool-use.
- **`--stage threads`**: Formats output for micro-blogging and can **publish directly** via Graph API (`--publish`), automatically segmenting the payload into a reply chain.

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
dot deploy --stage mcp --task "Draft this week's board summary"
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
- Predefined behaviors live within the package catalog.
- Your actual usage, custom generations, and active configurations live entirely within your codebase in `.dance-of-tal/`.
- **No central server tracks your prompts.** It is completely local. Check it into git, version it, and share it with your team.

### MCP Integration (stdio)
Dance of Tal acts as a standalone tool provider for your AI code editor. To integrate into Claude Desktop or standard MCP clients, simply inject the engine:

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

---

## License

MIT

*Choreograph your intelligence.*
