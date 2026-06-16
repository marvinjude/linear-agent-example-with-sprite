import crypto from "node:crypto";
import type { Response, NextFunction } from "express";
import type { RawBodyRequest } from "../types.js";
import { config } from "../config.js";

export function verifyLinearSignature(
  req: RawBodyRequest,
  res: Response,
  next: NextFunction,
): void {
  const secret = config.linear.webhookSecret;
  if (!secret) {
    console.warn("LINEAR_WEBHOOK_SECRET not set — skipping signature check");
    return next();
  }

  const signature = req.headers["linear-signature"];
  if (!signature || typeof signature !== "string") {
    res.status(400).json({ error: "Missing Linear-Signature header" });
    return;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("hex");

  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  next();
}
