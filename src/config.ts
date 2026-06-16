function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  linear: {
    oauthClientId: required("LINEAR_OAUTH_APP_CLIENT_ID"),
    oauthClientSecret: required("LINEAR_OAUTH_APP_CLIENT_SECRET"),
    webhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
  },
  sprites: {
    token: required("SPRITES_TOKEN"),
  },
  claude: {
    oauthToken: required("CLAUDE_CODE_OAUTH_TOKEN"),
  },
  github: {
    token: required("GH_TOKEN"),
  },
};
