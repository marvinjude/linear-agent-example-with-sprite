import type { Request } from "express";

export interface RawBodyRequest extends Request {
  rawBody: Buffer;
}

export interface AgentSessionEvent {
  action: string;
  type: string;
  agentSession: {
    id: string;
    issue?: { id: string; identifier: string };
  };
  agentActivity?: {
    content?: { body?: string };
  };
  promptContext?: string;
}
