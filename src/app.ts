import express from "express";
import type { Request, Response } from "express";
import type { RawBodyRequest } from "./types.js";
import { webhookRouter } from "./routes/webhook.js";

const app = express();

app.use(
  express.json({
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as RawBodyRequest).rawBody = buf;
    },
  }),
);

app.use("/webhook", webhookRouter);

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

export { app };
