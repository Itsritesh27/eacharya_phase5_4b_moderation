/** Study materials a teacher attaches to a lesson (stored in the private "resources" bucket). */

export const RESOURCE_BUCKET = "resources";
export const MAX_RESOURCE_BYTES = 25 * 1024 * 1024; // matches the bucket's file_size_limit
export const MAX_RESOURCES_PER_LESSON = 10;

export type FileResourceType = "pdf" | "presentation" | "image";

const KINDS: Record<string, { type: FileResourceType; mime: string }> = {
  pdf: { type: "pdf", mime: "application/pdf" },
  ppt: { type: "presentation", mime: "application/vnd.ms-powerpoint" },
  pptx: { type: "presentation", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  png: { type: "image", mime: "image/png" },
  jpg: { type: "image", mime: "image/jpeg" },
  jpeg: { type: "image", mime: "image/jpeg" },
  webp: { type: "image", mime: "image/webp" },
};

export const RESOURCE_ACCEPT = ".pdf,.ppt,.pptx,.png,.jpg,.jpeg,.webp";

function ext(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
}

export function resourceKind(name: string): { type: FileResourceType; mime: string } | null {
  return KINDS[ext(name)] ?? null;
}

/** Error message, or null when the file may be uploaded. */
export function checkResourceFile(file: { name: string; size: number }): string | null {
  if (!resourceKind(file.name)) return `"${file.name}" is not supported. Use PDF, PowerPoint (.ppt/.pptx) or an image (.png/.jpg/.webp).`;
  if (file.size <= 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_RESOURCE_BYTES) return `"${file.name}" is larger than ${MAX_RESOURCE_BYTES / 1024 / 1024} MB.`;
  return null;
}

function safeName(name: string): string {
  const base = name
    .replace(/\.[a-z0-9]+$/i, "")
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base || "file"}.${ext(name)}`;
}

/** <teacher-uid>/lessons/<unit-id>/<unique>-<name>: the first folder must be the uploader's uid. */
export function buildResourcePath(userId: string, unitId: string, fileName: string, unique: string): string {
  return `${userId}/lessons/${unitId}/${unique}-${safeName(fileName)}`;
}

/** Readable default title from a file name, e.g. "river_systems-notes.pdf" -> "river systems notes". */
export function resourceTitleFromName(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** True only for a path inside the given teacher's own folder, with a supported extension. */
export function isOwnResourcePath(path: string, userId: string): boolean {
  return (
    path.length <= 500 &&
    path.startsWith(`${userId}/`) &&
    !path.includes("..") &&
    !path.startsWith("/") &&
    resourceKind(path) !== null
  );
}
