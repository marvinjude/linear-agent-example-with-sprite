import { LinearClient } from "@linear/sdk";
import { config } from "../config.js";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getLinearAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const body = new URLSearchParams({
    client_id: config.linear.oauthClientId,
    client_secret: config.linear.oauthClientSecret,
    grant_type: "client_credentials",
    scope: "read,write,app:mentionable,app:assignable",
  });

  const res = await fetch("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linear OAuth token request failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

export async function createLinearClient(): Promise<LinearClient> {
  const accessToken = await getLinearAccessToken();
  return new LinearClient({ accessToken });
}
