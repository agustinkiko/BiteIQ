import type { FastifyRequest } from "fastify";

import { ApiError, ErrorCode } from "../errors.js";
import type { AuthenticatedUser } from "./types.js";

const authenticatedUser = Symbol("authenticatedUser");

type RequestWithUser = FastifyRequest & {
  [authenticatedUser]?: AuthenticatedUser;
};

export function setAuthenticatedUser(
  request: FastifyRequest,
  user: AuthenticatedUser,
): void {
  (request as RequestWithUser)[authenticatedUser] = user;
}

export async function requireUser(
  request: FastifyRequest,
): Promise<AuthenticatedUser> {
  const user = (request as RequestWithUser)[authenticatedUser];
  if (!user) {
    throw new ApiError(401, ErrorCode.AUTH_REQUIRED, "Sign in to continue.");
  }

  return user;
}
