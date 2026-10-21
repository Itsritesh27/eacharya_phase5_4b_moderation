/** Shared rules for teacher uploads to the public "lesson-videos" storage bucket. */

export const LESSON_BUCKET = "lesson-videos";
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // keep in step with the bucket's file_size_limit
export const MAX_DOWNLOADS_PER_VIDEO = 4;

const TYPES: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", ogv: "video/ogg" };

export const QUALITY_OPTIONS = [
  { label: "Original", height: 0 },
  { label: "1080p", height: 1080 },
  { label: "720p", height: 720 },
  { label: "480p", height: 480 },
  { label: "360p", height: 360 },
] as const;

export function extensionOf(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
}

export function mimeFor(name: string): string | null {
  return TYPES[extensionOf(name)] ?? null;
}

/** Returns an error message, or null when the file may be uploaded. */
export function checkUploadFile(file: { name: string; size: number }): string | null {
  if (!mimeFor(file.name)) return `"${file.name}" is not a supported video. Use .mp4, .webm or .ogv.`;
  if (file.size <= 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_UPLOAD_BYTES) return `"${file.name}" is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
  return null;
}

/** ASCII-only, URL-safe file name that keeps the extension. */
export function safeFileName(name: string): string {
  const ext = extensionOf(name);
  const base = name
    .replace(/\.[a-z0-9]+$/i, "")
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base || "video"}.${ext}`;
}

/** Storage path: <teacher-uid>/<unit-id>/<unique>-<name>. The first folder must be the uploader's uid. */
export function buildStoragePath(userId: string, unitId: string, fileName: string, unique: string): string {
  return `${userId}/${unitId}/${unique}-${safeFileName(fileName)}`;
}

export function publicUrlFor(supabaseUrl: string, path: string): string {
  return `${new URL(supabaseUrl).origin}/storage/v1/object/public/${LESSON_BUCKET}/${path}`;
}

/** True only for a public URL of OUR bucket inside the given teacher's own folder. */
export function isOwnUploadUrl(raw: string, supabaseUrl: string, userId: string): boolean {
  try {
    const u = new URL(raw);
    return (
      u.origin === new URL(supabaseUrl).origin &&
      u.pathname.startsWith(`/storage/v1/object/public/${LESSON_BUCKET}/${userId}/`) &&
      !u.pathname.includes("..")
    );
  } catch {
    return false;
  }
}

/** Reverse of publicUrlFor, used to delete an upload the teacher discarded. */
export function pathFromPublicUrl(raw: string): string | null {
  try {
    const marker = `/storage/v1/object/public/${LESSON_BUCKET}/`;
    const p = new URL(raw).pathname;
    const i = p.indexOf(marker);
    return i === -1 ? null : decodeURIComponent(p.slice(i + marker.length));
  } catch {
    return null;
  }
}
