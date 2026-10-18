import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveLessonVideo } from "@/lib/learning/video";

export const dynamic = "force-dynamic";

function fileName(title: string, label: string, src: string): string {
  const ext = /\.(mp4|webm|ogv)$/i.exec(new URL(src).pathname)?.[1]?.toLowerCase() ?? "mp4";
  const base = title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "lesson";
  return `${base}-${label.replace(/[^\w]+/g, "")}.${ext}`;
}

/**
 * GET /api/lessons/:lessonId/download?q=<quality index>
 *
 * The browser never supplies a URL: it sends only the index of a quality, and the file URL is
 * read from lesson_content, which row-level security limits to enrolled students, the owning
 * teacher and admins. If a teacher turned downloads off, this returns 403. Then it redirects to
 * the file (no video bytes pass through this server). Supabase Storage links get a `download`
 * parameter so the browser saves them instead of playing them.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const q = z.coerce.number().int().min(0).max(7).safeParse(request.nextUrl.searchParams.get("q") ?? "0");
  if (!z.string().uuid().safeParse(lessonId).success || !q.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const { data: content, error: contentError } = await supabase
    .from("lesson_content")
    .select("video_url, video_sources, allow_download")
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (contentError) {
    console.error("[download] lesson_content query failed:", contentError.message);
    return NextResponse.json({ error: "Could not load this lesson", step: "query", detail: contentError.message }, { status: 500 });
  }
  if (!content) return NextResponse.json({ error: "No access to this lesson's video (are you enrolled?)", step: "access" }, { status: 404 });
  if (content.allow_download === false) return NextResponse.json({ error: "Downloads are turned off for this lesson" }, { status: 403 });

  const source = resolveLessonVideo(content.video_url, content.video_sources);
  const files = source?.kind === "direct" ? source.qualities : source?.kind === "youtube" ? (source.downloads ?? []) : [];
  const quality = files[q.data];
  if (!quality) return NextResponse.json({ error: "No downloadable file at this position", step: "quality" }, { status: 404 });

  const { data: lesson } = await supabase.from("lessons").select("title").eq("id", lessonId).maybeSingle();
  const name = fileName(lesson?.title ?? "lesson", quality.label, quality.src);

  const target = new URL(quality.src);
  if (target.pathname.includes("/storage/v1/object/")) target.searchParams.set("download", name);

  return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
