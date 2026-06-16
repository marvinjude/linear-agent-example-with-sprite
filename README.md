# Linear Agent Example with Claude Code + Sprite.dev



https://github.com/user-attachments/assets/b53c2748-2341-439d-91dd-a488331bfd7a



Assign a Linear issue to this agent and it spins up an isolated [Sprite](https://sprites.dev) sandbox, runs [Claude Code](https://claude.ai/code) inside it to do the work, and streams the agent's thoughts, tool calls, and results back into the issue in real time.

It's a small, readable example you can fork and shape into your own [Linear agent](https://linear.app/docs/agent-sdk). There's a full walkthrough in the article: [Building a Sandboxed Linear Agent Powered by Claude Code and Sprite](https://dev.to/marvinjude/building-a-sandboxed-linear-agent-powered-by-claude-code-and-sprite-24db).


## How it works

1. A Linear agent session is created (e.g. someone assigns or @-mentions the agent on an issue).
2. Linear sends an `AgentSessionEvent` webhook to this server.
3. The server spawns a Sprite and runs `claude` inside it with the session context.
4. Claude's streamed output is posted back to the issue as agent activity.
5. Follow-up messages resume the same Claude session with the new prompt.

## Stack

- **[Linear Agent SDK](https://linear.app/docs/agent-sdk)** — agent session webhooks and activity reporting
- **[Sprite](https://sprites.dev)** — ephemeral cloud VMs for running Claude Code
- **[Claude Code](https://claude.ai/code)** — the agent that performs the work
- **Express** — webhook server

## Setup

### 1. Create a Linear OAuth app

In your Linear workspace, go to **Settings → API → OAuth applications** and create an app. Copy the **Client ID** and **Client Secret**. (See the [article](https://dev.to/marvinjude/building-a-sandboxed-linear-agent-powered-by-claude-code-and-sprite-24db) for scopes and the client-credentials flow.)

### 2. Configure the webhook

Point the webhook URL at `https://<your-domain>/webhook` and enable the **Agent Session** event. Copy the signing secret.

### 3. Environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
SPRITES_TOKEN=            # from sprites.dev
CLAUDE_CODE_OAUTH_TOKEN=  # run: claude setup-token
GH_TOKEN=                 # GitHub token for repo access

LINEAR_OAUTH_APP_CLIENT_ID=
LINEAR_OAUTH_APP_CLIENT_SECRET=
LINEAR_WEBHOOK_SECRET=    # webhook signing secret

PORT=3000                 # optional, defaults to 3000
```

### 4. Run

```bash
bun install
bun run dev
```

The server starts on `PORT`. Expose it with a tunnel (e.g. `ngrok http 3000`) and point your Linear webhook at that URL.

## Project structure

```
index.ts                   entry point
src/
  app.ts                   express app
  config.ts                env var validation
  constants.ts             agent system prompt
  types.ts                 shared types
  routes/
    webhook.ts             POST /webhook
  handlers/
    agentSession.ts        agent session logic
  middleware/
    signature.ts           webhook HMAC verification
  services/
    linear.ts              Linear OAuth client
    sprite.ts              Sprite client
    spriteRunner.ts        spawns + streams Claude inside a Sprite
```
