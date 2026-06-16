import { Router } from "express";
import type { Request, Response, RequestHandler } from "express";
import { verifyLinearSignature } from "../middleware/signature.js";
import { handleAgentSessionEvent } from "../handlers/agentSession.js";
import type { AgentSessionEvent } from "../types.js";

const router = Router();

router.use(verifyLinearSignature as RequestHandler);

router.post("/", async (req: Request, res: Response) => {
  res.sendStatus(200);

  const event = req.body as AgentSessionEvent;
  if (event.type === "AgentSessionEvent") {
    await handleAgentSessionEvent(event);
  }
});

export { router as webhookRouter };
