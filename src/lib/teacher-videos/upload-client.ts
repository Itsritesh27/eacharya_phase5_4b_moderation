"use client";

import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  LESSON_BUCKET,
  buildStoragePath,
  checkUploadFile,
  mimeFor,
  pathFromPublicUrl,
  publicUrlFor,
} from "./uploads";
import { RESOURCE_BUCKET, buildResourcePath, checkResourceFile, resourceKind } from "./resource-files";

export interface UploadHandle {
  promise: Promise<{ url: string; path: string }>;
  abort: () => void;
}

interface Target {
  bucket: string;
  problem: string | null;
  mime: string;
  buildPath: (userId: string, unique: string) => string;
  /** Public bucket -> public URL; private bucket -> empty string (the path is what gets stored). */
  publicUrl: boolean;
}

/**
 * Uploads straight from the browser to Supabase Storage with the teacher's own session
 * (no service-role key, nothing passes through our server, so there is no server size limit).
 * Storage policies only allow writes inside the teacher's own <uid>/ folder.
 */
function upload(file: File, target: Target, onProgress: (pct: number) => void): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = (async () => {
    if (target.problem) throw new Error(target.problem);
    const env = getSupabaseEnv();
    if (!env) throw new Error("Supabase is not configured.");
    const { data } = await createClient().auth.getSession();
    const session = data.session;
    if (!session) throw new Error("Please sign in again.");

    const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const path = target.buildPath(session.user.id, unique);

    await new Promise<void>((resolve, reject) => {
      xhr.open("POST", `${env.url.replace(/\/$/, "")}/storage/v1/object/${target.bucket}/${path}`);
      xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
      xhr.setRequestHeader("apikey", env.key);
      xhr.setRequestHeader("Content-Type", target.mime);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.setRequestHeader("cache-control", "max-age=3600");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let msg = "Upload failed.";
        try {
          const body = JSON.parse(xhr.responseText) as { message?: string };
          if (/exceeded the maximum allowed size/i.test(body.message ?? "")) {
            msg = "This file is larger than the upload limit set in your Supabase project (Storage settings).";
          } else if (xhr.status === 401 || xhr.status === 403) {
            msg = "You are not allowed to upload here. Please sign in again, and make sure the latest database migrations have been run.";
          } else if (body.message) msg = `Upload failed: ${body.message}`;
        } catch {
          /* keep generic message */
        }
        reject(new Error(msg));
      };
      xhr.onerror = () => reject(new Error("Network error while uploading. Please try again."));
      xhr.onabort = () => reject(new Error("Upload cancelled."));
      xhr.send(file);
    });

    onProgress(100);
    return { url: target.publicUrl ? publicUrlFor(env.url, path) : "", path };
  })();
  return { promise, abort: () => xhr.abort() };
}

/** A lesson video (public bucket): returns a public URL. */
export function uploadLessonFile(file: File, unitId: string, onProgress: (pct: number) => void): UploadHandle {
  return upload(
    file,
    {
      bucket: LESSON_BUCKET,
      problem: checkUploadFile(file),
      mime: mimeFor(file.name) ?? "application/octet-stream",
      buildPath: (uid, unique) => buildStoragePath(uid, unitId, file.name, unique),
      publicUrl: true,
    },
    onProgress,
  );
}

/** A study material (private bucket): returns the storage path to save with the resource. */
export function uploadResourceFile(file: File, unitId: string, onProgress: (pct: number) => void): UploadHandle {
  return upload(
    file,
    {
      bucket: RESOURCE_BUCKET,
      problem: checkResourceFile(file),
      mime: resourceKind(file.name)?.mime ?? "application/octet-stream",
      buildPath: (uid, unique) => buildResourcePath(uid, unitId, file.name, unique),
      publicUrl: false,
    },
    onProgress,
  );
}

/** Best-effort cleanup when a teacher discards a video that was uploaded but never saved. */
export async function discardUpload(url: string): Promise<void> {
  const path = pathFromPublicUrl(url);
  if (!path) return;
  try {
    await createClient().storage.from(LESSON_BUCKET).remove([path]);
  } catch {
    /* an orphaned file is harmless */
  }
}

/** Same, for a study material that was uploaded but never saved. */
export async function discardResourceUpload(path: string): Promise<void> {
  try {
    await createClient().storage.from(RESOURCE_BUCKET).remove([path]);
  } catch {
    /* an orphaned file is harmless */
  }
}
