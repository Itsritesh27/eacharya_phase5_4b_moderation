import type { Role } from "@/types/app";

export interface AuthorCard {
  id: string;
  name: string;
  role: Role;
}

export interface DiscussionSummary {
  id: string;
  title: string;
  excerpt: string;
  grade: number;
  category: string;
  authorId: string;
  createdAt: string;
  replyCount: number;
  likeCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
}

export interface DiscussionDetail {
  id: string;
  title: string;
  body: string;
  grade: number;
  category: string;
  links: string[];
  authorId: string;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
}

export interface ReplyItem {
  id: string;
  discussionId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
}

export interface BookmarkedDiscussion {
  id: string;
  title: string;
  grade: number;
  category: string;
  bookmarkedAt: string;
}

/** `unavailable` = the forum tables are not in the database yet (migration not applied). */
export type Loaded<T> = { status: "ok"; data: T } | { status: "unavailable" } | { status: "error" };

export type ForumResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
