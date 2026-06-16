import { SpritesClient } from "@fly/sprites";
import { config } from "../config.js";

export function createSpriteClient() {
  return new SpritesClient(config.sprites.token);
}
