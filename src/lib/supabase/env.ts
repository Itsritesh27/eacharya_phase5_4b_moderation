function clean(v: string | undefined) {
  return v?.trim().replace(/^["']|["']$/g, "");
}

export function getSupabaseEnv() {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (!url || !key || url.includes("YOUR-PROJECT-REF") || key.startsWith("YOUR-")) {
    return null;
  }
  try {
    new URL(url); // must be a full https://... URL
  } catch {
    return null;
  }
  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}
