import type { LinearClient } from "@linear/sdk";
import { getLinearAccessToken } from "./linear.js";
import { createSpriteClient } from "./sprite.js";
import { SYSTEM_PROMPT } from "../constants.js";
import { config } from "../config.js";

const sprites = createSpriteClient();

/**
 * Derives a short, stable sandbox name from the session ID.
 */
export function spriteName(linearAgentSessionId: string): string {
  return `linear-${linearAgentSessionId.slice(0, 8)}`;
}

/**
 * Builds the environment variables injected into the Claude Code
 * process inside the sandbox.
 */
async function buildSpawnEnv({
  includeCLIEnvs,
}: {
  includeCLIEnvs: boolean;
}): Promise<Record<string, string>> {
  const linearAccessToken = await getLinearAccessToken();
  return {
    CLAUDE_CODE_OAUTH_TOKEN: config.claude.oauthToken,

    /**
     * Tokens needs by linear cli and gh cli inside the sandbox.
     */
    ...(includeCLIEnvs
      ? { GH_TOKEN: config.github.token, LINEAR_API_TOKEN: linearAccessToken }
      : {}),
  };
}

/**
 * Runs a shell command inside a Sprite and waits for it to exit.
 * Rejects if the process exits with a non-zero code.
 */
async function runOnSprite(
  spriteName: string,
  command: string,
  args: string[],
): Promise<void> {
  const cmd = sprites.sprite(spriteName).spawn(command, args);
  await new Promise<void>((resolve, reject) => {
    cmd.on("exit", (code: number) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with code ${code}`)),
    );
    cmd.on("error", reject);
  });
}

/**
 * Prepares a freshly created Sprite for Claude Code.
 *
 * Adds MCP server configurations to ~/.claude.json
 */
export async function addClaudeConfigToSprite(spriteName: string): Promise<void> {
  const linearApiToken = await getLinearAccessToken();

  const claudeConfig = {
    autoUpdaterStatus: "disabled",
    dontCrawlDirectory: true,
    mcpServers: {
      linear: {
        type: "http",
        url: "https://mcp.linear.app/mcp",
        headers: {
          Authorization: `Bearer ${linearApiToken}`,
        },
      },
      github: {
        type: "http",
        url: "https://api.githubcopilot.com/mcp/",
        headers: {
          Authorization: `Bearer ${config.github.token}`,
        },
      },
    },
  };

  // Write MCP config to the home directory of the sandbox so that Claude Code can pick it up.
  const script = `
    const fs = require('fs'), os = require('os');
    fs.writeFileSync(
      os.homedir() + '/.claude.json',
      ${JSON.stringify(JSON.stringify(claudeConfig, null, 2))}
    );
  `;

  await runOnSprite(spriteName, "node", ["-e", script]);
}

/**
 * Spawns Claude Code inside a named Sprite sandbox and streams its
 * stdout back to Linear as agent activities.
 *
 * Pass resume=true to continue an existing session; omit it for a
 * fresh session with a system prompt.
 */
export async function runClaudeOnSprite(
  linear: LinearClient,
  linearAgentSessionId: string,
  spriteName: string,
  prompt: string,
  { resume = false }: { resume?: boolean } = {},
): Promise<void> {
  const baseArgs = [
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
  ];

  const promptWithContext = `<agent_session_id>${linearAgentSessionId}</agent_session_id>\n\n${prompt}`;

  const args = resume
    ? [...baseArgs, "--resume", linearAgentSessionId, "-p", promptWithContext]
    : [
        ...baseArgs,
        "--session-id",
        linearAgentSessionId,
        "-p",
        promptWithContext,
        "--system-prompt",
        SYSTEM_PROMPT,
      ];

  console.log(`[claude → ${spriteName}] prompt: ${prompt}`);

  const env = await buildSpawnEnv({ includeCLIEnvs: true });
  const cmd = sprites.sprite(spriteName).spawn("claude", args, { env });

  const pending: Promise<void>[] = [];

  let buffer = "";
  let elicitationSent = false;

  // Maps tool_use_id → { name, parameter, isElicitation }.
  const pendingTools = new Map<
    string,
    { name: string; parameter: string; isElicitation: boolean }
  >();

  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "thinking"; thinking: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | {
        type: "tool_result";
        tool_use_id: string;
        content: string | Array<{ type: string; text?: string }>;
      };

  // Claude Code emits newline-delimited JSON events on stdout.
  // We accumulate chunks in a buffer and process complete lines as they arrive.
  cmd.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    // Keep any trailing incomplete line in the buffer for the next chunk.
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      if (event.type === "assistant") {
        // Drop all assistant output once an elicitation has been sent — the
        // agent is supposed to stop, and any stray messages would confuse the user.
        if (elicitationSent) continue;

        const blocks =
          (event.message as { content: ContentBlock[] })?.content ?? [];
        for (const block of blocks) {
          if (block.type === "thinking" && block.thinking?.trim()) {
            // Internal reasoning — shown as a "thought" bubble in Linear.
            console.log(
              `[claude ← ${spriteName}] thinking: ${block.thinking.slice(0, 120)}`,
            );
            pending.push(
              linear
                .createAgentActivity({
                  agentSessionId: linearAgentSessionId,
                  content: { type: "thought", body: block.thinking } as never,
                })
                .then(() => undefined),
            );
          } else if (block.type === "text" && block.text?.trim()) {
            // Final text response — shown as a message in Linear.
            console.log(
              `[claude ← ${spriteName}] text: ${block.text.trimEnd()}`,
            );
            pending.push(
              linear
                .createAgentActivity({
                  agentSessionId: linearAgentSessionId,
                  content: { type: "response", body: block.text } as never,
                })
                .then(() => undefined),
            );
          } else if (block.type === "tool_use") {
            const parameter = JSON.stringify(block.input, null, 2);
            console.log(
              `[claude ← ${spriteName}] tool start: ${block.name}(${parameter})`,
            );
            // Detect elicitation calls so we can suppress their Linear activities so that linear can show request for input
            // The agent sends elicitations by running a node script that calls agentActivityCreate directly.
            const isElicitation = parameter.includes("agentActivityCreate");
            pendingTools.set(block.id, {
              name: block.name,
              parameter,
              isElicitation,
            });
            if (!isElicitation) {
              // Post an ephemeral placeholder that disappears once the result arrives.
              pending.push(
                linear
                  .createAgentActivity({
                    agentSessionId: linearAgentSessionId,
                    ephemeral: true,
                    content: {
                      type: "action",
                      action: block.name,
                      parameter,
                    } as never,
                  } as never)
                  .then(() => undefined),
              );
            }
          }
        }
      } else if (event.type === "user") {
        // "user" events carry tool results back to the model.
        const blocks =
          (event.message as { content: ContentBlock[] })?.content ?? [];
        for (const block of blocks) {
          if (block.type === "tool_result") {
            const tool = pendingTools.get(block.tool_use_id);
            if (!tool) continue;
            pendingTools.delete(block.tool_use_id);
            const result =
              typeof block.content === "string"
                ? block.content
                : block.content.map((c) => c.text ?? "").join("\n");
            console.log(
              `[claude ← ${spriteName}] tool result: ${tool.name} → ${result.slice(0, 120)}`,
            );

            if (tool.isElicitation) {
              // Elicitation was posted directly by the agent script — nothing to
              // forward to Linear. Suppress all further activities.
              elicitationSent = true;
              continue;
            }

            if (elicitationSent) continue;

            // Replace the ephemeral tool_use placeholder with the completed action.
            pending.push(
              linear
                .createAgentActivity({
                  agentSessionId: linearAgentSessionId,
                  content: {
                    type: "action",
                    action: tool.name,
                    parameter: tool.parameter,
                    result,
                  } as never,
                })
                .then(() => undefined),
            );
          }
        }
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    cmd.on("exit", () =>
      Promise.all(pending)
        .then(() => resolve())
        .catch(reject),
    );
    cmd.on("error", reject);
  });
}
