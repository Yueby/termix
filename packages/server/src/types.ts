import type { Database } from "./db";
import type { PasswordHasher } from "./utils/crypto";

export type AppEnv = {
  Variables: {
    db: Database;
    hasher: PasswordHasher;
    jwtSecret: string;
    userId: string;
    turnstileSecret: string;
  };
};
