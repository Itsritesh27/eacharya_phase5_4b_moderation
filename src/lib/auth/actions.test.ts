import { beforeEach, describe, expect, it, vi } from "vitest";

const state: {
  configured: boolean;
  session: { userId: string } | null; // what requireRole("admin") returns; null = refused
  signIn: { error: { message: string } | null };
  signUp: { error: { message: string } | null };
  calls: { fn: string; args: unknown[] }[];
  user: { id: string } | null;
  updateUser: { error: { message: string } | null };
} = {
  configured: true,
  session: { userId: "admin-1" },
  signIn: { error: null },
  signUp: { error: null },
  calls: [],
  user: { id: "u1" },
  updateUser: { error: null },
};

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => state.configured }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "example.test", "x-forwarded-proto": "https" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/lib/auth/session", () => ({
  requireRole: async (area: string) => {
    state.calls.push({ fn: "requireRole", args: [area] });
    if (!state.session) throw new Error("REDIRECT:/dashboard");
    return state.session;
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async (...args: unknown[]) => {
        state.calls.push({ fn: "signInWithPassword", args });
        return state.signIn;
      },
      signUp: async (...args: unknown[]) => {
        state.calls.push({ fn: "signUp", args });
        return state.signUp;
      },
      resetPasswordForEmail: async (...args: unknown[]) => {
        state.calls.push({ fn: "resetPasswordForEmail", args });
        return {};
      },
      getUser: async () => ({ data: { user: state.user } }),
      updateUser: async (...args: unknown[]) => {
        state.calls.push({ fn: "updateUser", args });
        return state.updateUser;
      },
      signOut: async () => {
        state.calls.push({ fn: "signOut", args: [] });
      },
    },
    rpc: async (fn: string, args: unknown) => {
      state.calls.push({ fn: `rpc:${fn}`, args: [args] });
      return { data: null, error: null };
    },
  }),
}));

import { revalidatePath } from "next/cache";
import {
  forgotPasswordAction,
  resetPasswordAction,
  setUserRoleAction,
  signInAction,
  signOutAction,
  signUpAction,
} from "./actions";

const OTHER = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";

function form(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}
const rpcCalls = () => state.calls.filter((c) => c.fn.startsWith("rpc:"));

beforeEach(() => {
  state.configured = true;
  state.session = { userId: ADMIN };
  state.signIn = { error: null };
  state.signUp = { error: null };
  state.user = { id: "u1" };
  state.updateUser = { error: null };
  state.calls = [];
  delete process.env.NEXT_PUBLIC_SITE_URL;
  vi.mocked(revalidatePath).mockClear();
});

describe("setUserRoleAction (admin-only role changes)", () => {
  it("asks for the admin role before doing anything", async () => {
    await setUserRoleAction(form({ userId: OTHER, role: "teacher" }));
    expect(state.calls[0]).toEqual({ fn: "requireRole", args: ["admin"] });
  });

  it("makes no database call when the caller is not an admin", async () => {
    state.session = null;
    await expect(setUserRoleAction(form({ userId: OTHER, role: "admin" }))).rejects.toThrow(/REDIRECT/);
    expect(rpcCalls()).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("changes a role through the admin_set_user_role function only", async () => {
    await setUserRoleAction(form({ userId: OTHER, role: "teacher" }));
    expect(rpcCalls()).toEqual([{ fn: "rpc:admin_set_user_role", args: [{ target_user: OTHER, new_role: "teacher" }] }]);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/admin");
  });

  it("ignores an admin changing their own role", async () => {
    await setUserRoleAction(form({ userId: ADMIN, role: "student" }));
    expect(rpcCalls()).toHaveLength(0);
  });

  it.each([
    ["unknown role", { userId: OTHER, role: "superuser" }],
    ["empty role", { userId: OTHER, role: "" }],
    ["bad user id", { userId: "not-a-uuid", role: "teacher" }],
    ["missing fields", {}],
  ])("ignores invalid input: %s", async (_n, entries) => {
    await setUserRoleAction(form(entries));
    expect(rpcCalls()).toHaveLength(0);
  });
});

describe("signUpAction", () => {
  const valid = { fullName: "Asha Rao", email: "asha@example.com", password: "Passw0rdOK", confirmPassword: "Passw0rdOK" };

  it("sends only the display name as metadata and drops a forged role", async () => {
    const res = await signUpAction({ ...valid, role: "admin", data: { role: "admin" }, app_metadata: { role: "admin" } });
    expect(res.ok).toBe(true);
    const call = state.calls.find((c) => c.fn === "signUp")!;
    const arg = call.args[0] as { options: { data: Record<string, unknown>; emailRedirectTo: string }; [k: string]: unknown };
    expect(arg.options.data).toEqual({ full_name: "Asha Rao" });
    expect(JSON.stringify(arg)).not.toMatch(/admin|teacher/);
  });

  it("builds the redirect from the configured site URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://site.test/";
    await signUpAction(valid);
    const arg = state.calls.find((c) => c.fn === "signUp")!.args[0] as { options: { emailRedirectTo: string } };
    expect(arg.options.emailRedirectTo).toBe("https://site.test/auth/callback?next=/dashboard");
  });

  it("falls back to the request host when no site URL is set", async () => {
    await signUpAction(valid);
    const arg = state.calls.find((c) => c.fn === "signUp")!.args[0] as { options: { emailRedirectTo: string } };
    expect(arg.options.emailRedirectTo).toBe("https://example.test/auth/callback?next=/dashboard");
  });

  it.each([
    ["mismatched passwords", { ...valid, confirmPassword: "Different1" }],
    ["weak password", { ...valid, password: "short", confirmPassword: "short" }],
    ["bad email", { ...valid, email: "nope" }],
    ["short name", { ...valid, fullName: "A" }],
  ])("rejects %s without calling Supabase", async (_n, input) => {
    const res = await signUpAction(input);
    expect(res.ok).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it("does not leak the provider error", async () => {
    state.signUp = { error: { message: "User already registered" } };
    const res = await signUpAction(valid);
    expect(res).toEqual({ ok: false, error: "We could not create that account. Try a different email or sign in." });
  });

  it("reports when the service is not configured", async () => {
    state.configured = false;
    expect((await signUpAction(valid)).ok).toBe(false);
    expect(state.calls).toHaveLength(0);
  });
});

describe("signInAction", () => {
  it("passes validated credentials through", async () => {
    expect(await signInAction({ email: "a@b.co", password: "x", extra: "y" })).toEqual({ ok: true });
    expect(state.calls[0]!.args[0]).toEqual({ email: "a@b.co", password: "x" });
  });

  it("gives one generic message for wrong credentials", async () => {
    state.signIn = { error: { message: "Invalid login credentials" } };
    expect(await signInAction({ email: "a@b.co", password: "x" })).toEqual({ ok: false, error: "Incorrect email or password." });
  });

  it("asks unconfirmed users to verify their email", async () => {
    state.signIn = { error: { message: "Email not confirmed" } };
    const res = await signInAction({ email: "a@b.co", password: "x" });
    expect(res.ok === false && res.error).toMatch(/verify your email/i);
  });

  it("rejects malformed input without calling Supabase", async () => {
    expect((await signInAction({ email: "bad", password: "" })).ok).toBe(false);
    expect(state.calls).toHaveLength(0);
  });
});

describe("forgotPasswordAction", () => {
  it("returns the same message whether or not the account exists", async () => {
    const res = await forgotPasswordAction({ email: "someone@example.com" });
    expect(res.ok).toBe(true);
    expect(res.ok && res.message).toMatch(/if an account exists/i);
    const opts = state.calls[0]!.args[1] as { redirectTo: string };
    expect(opts.redirectTo).toBe("https://example.test/auth/callback?next=/auth/reset-password");
  });

  it("rejects an invalid email", async () => {
    expect((await forgotPasswordAction({ email: "x" })).ok).toBe(false);
    expect(state.calls).toHaveLength(0);
  });
});

describe("resetPasswordAction", () => {
  const pw = { password: "NewPassw0rd", confirmPassword: "NewPassw0rd" };

  it("requires a signed-in (recovery) session", async () => {
    state.user = null;
    const res = await resetPasswordAction(pw);
    expect(res.ok).toBe(false);
    expect(state.calls.some((c) => c.fn === "updateUser")).toBe(false);
  });

  it("updates the password for the signed-in user", async () => {
    expect((await resetPasswordAction(pw)).ok).toBe(true);
    expect(state.calls.find((c) => c.fn === "updateUser")!.args[0]).toEqual({ password: "NewPassw0rd" });
  });

  it("rejects mismatched passwords before touching Supabase", async () => {
    expect((await resetPasswordAction({ password: "NewPassw0rd", confirmPassword: "Other1234" })).ok).toBe(false);
    expect(state.calls).toHaveLength(0);
  });
});

describe("signOutAction", () => {
  it("signs out and redirects home", async () => {
    await expect(signOutAction()).rejects.toThrow("REDIRECT:/");
    expect(state.calls.some((c) => c.fn === "signOut")).toBe(true);
  });
});
