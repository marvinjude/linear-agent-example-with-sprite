import { createLinearClient } from "../services/linear.js";
import { createSpriteClient } from "../services/sprite.js";
import {
  spriteName,
  addClaudeConfigToSprite,
  runClaudeOnSprite,
} from "../services/spriteRunner.js";
import type { AgentSessionEvent } from "../types.js";

const sprites = createSpriteClient();

/**
 * Handles a new agent session: provisions a fresh Sprite sandbox
 * and runs the initial prompt.
 */
async function handleSessionCreated(event: AgentSessionEvent): Promise<void> {
  const linearAgentSessionId = event.agentSession.id;

  const name = spriteName(linearAgentSessionId);
  const linear = await createLinearClient();

  try {
    console.log(
      `Creating sprite "${name}" for session ${linearAgentSessionId}…`,
    );
    await sprites.createSprite(name);
    
    await addClaudeConfigToSprite(name);

    console.log(`Sprite ready, starting initial prompt…`);

    const initialPrompt =
      event.promptContext ??
      `<issue>${event.agentSession.issue?.identifier ?? "unknown"}</issue>`;

    await runClaudeOnSprite(linear, linearAgentSessionId, name, initialPrompt);
  } catch (err) {
    const message = (err as Error).message;
    console.error("Error handling session created:", message);
    await linear.createAgentActivity({
      agentSessionId: linearAgentSessionId,
      content: { type: "error", body: message },
    });
  }
}

/**
 * Handles a follow-up message in an existing session: resumes Claude
 * Code in the same sandbox with the new prompt.
 */
async function handleSessionPrompted(event: AgentSessionEvent): Promise<void> {
  const linearAgentSessionId = event.agentSession.id;
  const issueRef = event.agentSession.issue;

  const name = spriteName(linearAgentSessionId);
  const linear = await createLinearClient();

  try {
    const userMessage = event.agentActivity?.content?.body;
    if (!userMessage) return;

    console.log(`Resuming session "${name}" with new prompt…`);
    await runClaudeOnSprite(linear, linearAgentSessionId, name, userMessage, {
      resume: true,
    });
    console.log(
      `Finished streaming response for issue ${issueRef?.identifier ?? "unknown"}`,
    );
  } catch (err) {
    const message = (err as Error).message;
    console.error("Error handling session prompted:", message);
    await linear.createAgentActivity({
      agentSessionId: linearAgentSessionId,
      content: { type: "error", body: message },
    });
  }
}

/**
 * Entry point for all AgentSessionEvents from Linear.
 * Routes to the appropriate handler by action.
 */
export async function handleAgentSessionEvent(
  event: AgentSessionEvent,
): Promise<void> {
  if (event.action === "created") {
    await handleSessionCreated(event);
  } else if (event.action === "prompted") {
    await handleSessionPrompted(event);
  }
}
