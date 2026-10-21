/**
 * Server-side diagnostics for failed attempt RPCs. Never imported by client code.
 *
 * The browser only ever receives the fixed, student-safe message from attemptErrorMessage(). This logger keeps
 * the real Postgres/PostgREST failure visible to operators, without leaking anything sensitive:
 *   - logs the operation name, SQLSTATE code and (outside production) the message;
 *   - never logs details/hint (constraint violations can echo row values), ids, answers or credentials;
 *   - the message is truncated and whitespace-collapsed.
 */
export interface RpcErrorLike {
  code?: string | null;
  message?: string | null;
}

const MAX_MESSAGE = 300;

export function describeRpcError(operation: string, error: RpcErrorLike, production: boolean): string {
  const code = error.code ?? "unknown";
  if (production) return `[attempt:${operation}] database error code=${code}`;
  const message = (error.message ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE);
  return `[attempt:${operation}] database error code=${code} message=${message}`;
}

export function logAttemptError(operation: string, error: RpcErrorLike | null | undefined): void {
  if (!error) return;
  console.error(describeRpcError(operation, error, process.env.NODE_ENV === "production"));
}
