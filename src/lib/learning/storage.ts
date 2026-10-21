import { createClient } from "@/lib/supabase/server";

export const RESOURCE_BUCKET = "resources";
const SIGNED_URL_SECONDS = 300;

/**
 * Creates a short-lived signed URL for a file in the PRIVATE "resources" bucket.
 * It runs with the signed-in user's own session, so the storage policy decides
 * whether they may read it (published resources only). Returns null when the
 * file is missing or not permitted, so pages can show a friendly message.
 */
export async function getSignedResourceUrl(
  storagePath: string | null,
  options: { download?: boolean } = {},
): Promise<string | null> {
  if (!storagePath) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(RESOURCE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_SECONDS, options.download ? { download: true } : undefined);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
