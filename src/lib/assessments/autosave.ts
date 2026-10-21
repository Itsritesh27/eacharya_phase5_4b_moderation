import type { AnswerPayload, RestoredAnswer, SaveFailureKind, SavedAnswer } from "./answers";

/**
 * Autosave engine for a student's answers (Phase D). Framework-free and free of any browser API, so it runs in
 * a React component later (Phase E), in tests, and on the server without change. The network call is injected.
 *
 * What it guarantees
 *  - One request in flight per question at a time, and only the LATEST value is ever sent (rapid edits coalesce).
 *  - Every edit gets a higher revision than the one before it; the database keeps the highest revision, so a late
 *    or repeated request can never overwrite a newer answer.
 *  - A failed request is retried with the SAME data (the save is idempotent) after an exponential, jittered delay,
 *    up to `maxRetries` times. After that the question is `failed` until retryNow(), notifyOnline() or a new edit.
 *  - A failure that can never succeed stops the retrying: `closed` (attempt submitted / expired / access lost / signed
 *    out) stops everything; `rejected` (this one answer was refused) marks only that question.
 *  - flush() sends everything outstanding now and tells the caller whether every answer reached the server. Phase E
 *    must await it before submitting.
 *  - hasUnsaved() / snapshot().unsaved say whether something typed has NOT been confirmed by the server, so the UI can
 *    warn before the student leaves the page.
 *
 * What it does NOT do: it does not decide whether an answer is allowed (the database does), it does not keep answers
 * across a page close (unsaved answers live in memory only), and it does not submit.
 */

export interface SaveRequest {
  questionId: string;
  answer: AnswerPayload | null;
  revision: number;
}

export type SaveOutcome =
  | { ok: true; saved: SavedAnswer }
  | { ok: false; kind: SaveFailureKind; error: string };

export type SaveFn = (req: SaveRequest) => Promise<SaveOutcome>;

/**
 * idle      nothing typed, nothing stored
 * pending   typed, waiting to be sent (debounce)
 * saving    request in flight
 * retrying  the last request failed; waiting to try again
 * saved     the server has this answer
 * failed    gave up retrying (or the attempt closed with this answer unsaved); retryNow() / a new edit tries again
 * rejected  the server refused this answer; a new edit tries afresh
 */
export type QuestionSaveState = "idle" | "pending" | "saving" | "retrying" | "saved" | "failed" | "rejected";

export interface QuestionStatus {
  state: QuestionSaveState;
  /** The newest value (what the student sees). After a conflict with a newer stored value it is that stored value. */
  answer: AnswerPayload | null;
  revision: number;
  /** A fixed, student-safe message when `state` is failed / rejected / retrying, otherwise null. */
  error: string | null;
}

export interface AutosaveSnapshot {
  /** true once the server said the attempt can no longer take answers. Nothing more will be sent. */
  closed: boolean;
  closedReason: string | null;
  /** Number of questions whose newest answer the server has NOT confirmed. */
  unsaved: number;
  questions: Readonly<Record<string, QuestionStatus>>;
}

export interface FlushResult {
  /** true only if the attempt is open and every answer is confirmed by the server. */
  ok: boolean;
  closed: boolean;
  /** Question ids whose newest answer is not confirmed. */
  unsaved: string[];
}

export interface AutosaveOptions {
  save: SaveFn;
  /** Quiet time after the last keystroke before sending. Default 800 ms. */
  debounceMs?: number;
  /** A question that keeps changing is still sent at least this often. Default 5000 ms. */
  maxWaitMs?: number;
  /** Consecutive failed requests before giving up. Default 10. */
  maxRetries?: number;
  /** First retry delay; doubles each time. Default 1000 ms. */
  baseDelayMs?: number;
  /** Cap on the retry delay. Default 30000 ms. */
  maxDelayMs?: number;
  /** 0..1, injected for deterministic tests. Default Math.random. */
  random?: () => number;
}

export const GENERIC_SAVE_ERROR = "Something went wrong. Please try again.";
const OFFLINE_HINT = "We could not reach the server. Your answer will be sent again automatically.";
const GAVE_UP = "We could not save this answer. Check your connection and try again.";
/** After this many "your revision was stale" replies for one edit, stop re-sending and take the stored answer. */
const MAX_STALE_RESENDS = 3;

interface Rec {
  questionId: string;
  answer: AnswerPayload | null;
  /** Newest local revision. */
  revision: number;
  /** Highest revision the server has confirmed. */
  acked: number;
  state: QuestionSaveState;
  error: string | null;
  /** The newest local value has not been confirmed by the server. */
  dirty: boolean;
  inFlight: boolean;
  attempts: number;
  staleResends: number;
  flushing: boolean;
  flushRetried: boolean;
  firstPendingAt: number | null;
  debounce: ReturnType<typeof setTimeout> | null;
  retry: ReturnType<typeof setTimeout> | null;
}

type Listener = () => void;

/** Canonical form for comparing what was sent with what is stored (the server normalizes: blank text and [] clear). */
function canon(a: AnswerPayload | null): string {
  if (a === null) return "null";
  if ("optionId" in a) return `o:${a.optionId}`;
  if ("optionIds" in a) return a.optionIds.length === 0 ? "null" : `m:${[...a.optionIds].sort().join(",")}`;
  if ("value" in a) return `v:${a.value}`;
  return a.text.trim() === "" ? "null" : `t:${a.text}`;
}

export class AnswerAutosaver {
  private readonly save: SaveFn;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly random: () => number;

  private readonly recs = new Map<string, Rec>();
  private readonly listeners = new Set<Listener>();
  private waiters: Array<(r: FlushResult) => void> = [];
  private closed = false;
  private closedReason: string | null = null;
  private disposed = false;
  private snap: AutosaveSnapshot;

  constructor(options: AutosaveOptions) {
    this.save = options.save;
    this.debounceMs = Math.max(0, options.debounceMs ?? 800);
    this.maxWaitMs = Math.max(this.debounceMs, options.maxWaitMs ?? 5000);
    this.maxRetries = Math.max(0, options.maxRetries ?? 10);
    this.baseDelayMs = Math.max(1, options.baseDelayMs ?? 1000);
    this.maxDelayMs = Math.max(this.baseDelayMs, options.maxDelayMs ?? 30_000);
    this.random = options.random ?? Math.random;
    this.snap = this.build();
  }

  // ---------------------------------------------------------------- public API

  /**
   * Records the student's newest answer for a question and schedules a save.
   * Pass `immediate: true` for choices (radio / checkbox / true-false) and leave it off for typing.
   * Returns false (and does nothing) once the attempt is closed or the saver is disposed.
   */
  setAnswer(questionId: string, answer: AnswerPayload | null, opts: { immediate?: boolean } = {}): boolean {
    if (this.closed || this.disposed) return false;
    const rec = this.rec(questionId);
    rec.answer = answer;
    rec.revision += 1;
    rec.attempts = 0;
    rec.staleResends = 0;
    rec.flushRetried = false;
    rec.error = null;
    this.clearTimer(rec, "retry");
    if (!rec.dirty) rec.firstPendingAt = Date.now();
    rec.dirty = true;
    // While a request is in flight the newest value waits; the completion handler sends it.
    rec.state = rec.inFlight ? "saving" : "pending";

    if (opts.immediate || this.debounceMs === 0) {
      this.clearTimer(rec, "debounce");
      void this.run(rec);
    } else {
      this.clearTimer(rec, "debounce");
      const waited = Date.now() - (rec.firstPendingAt ?? Date.now());
      const delay = Math.max(0, Math.min(this.debounceMs, this.maxWaitMs - waited));
      rec.debounce = setTimeout(() => {
        rec.debounce = null;
        void this.run(rec);
      }, delay);
    }
    this.emit();
    return true;
  }

  /**
   * Loads answers restored from the server (get_attempt_answers). Never overwrites something the student has
   * already typed in this session: for such a question it only makes sure the next revision is higher than the stored one.
   */
  hydrate(restored: readonly RestoredAnswer[]): void {
    if (this.disposed) return;
    for (const r of restored) {
      const rec = this.rec(r.questionId);
      rec.acked = Math.max(rec.acked, r.revision);
      if (rec.dirty || rec.inFlight) {
        if (!rec.inFlight) rec.revision = Math.max(rec.revision, r.revision + 1);
        continue;
      }
      rec.answer = r.answer;
      rec.revision = Math.max(rec.revision, r.revision);
      rec.state = r.answer === null ? "idle" : "saved";
      rec.error = null;
    }
    this.emit();
  }

  /** The newest answer for a question (what the student sees), or undefined if none was ever set or restored. */
  getAnswer(questionId: string): AnswerPayload | null | undefined {
    return this.recs.get(questionId)?.answer;
  }

  hasUnsaved(): boolean {
    return this.snap.unsaved > 0;
  }

  /** Stable between changes (safe for useSyncExternalStore). */
  snapshot(): AutosaveSnapshot {
    return this.snap;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Sends everything outstanding NOW (skipping debounce and backoff, with one immediate retry per question on a
   * transient failure) and resolves when nothing is waiting any more. `ok` is true only if the attempt is still open
   * and every answer is confirmed. Call and await this before submitting.
   */
  flush(): Promise<FlushResult> {
    if (this.disposed) return Promise.resolve(this.result());
    return new Promise<FlushResult>((resolve) => {
      this.waiters.push(resolve);
      if (!this.closed) {
        for (const rec of this.recs.values()) {
          if (!rec.dirty) continue;
          rec.flushing = true;
          rec.flushRetried = false;
          rec.attempts = 0;
          this.clearTimer(rec, "debounce");
          this.clearTimer(rec, "retry");
          void this.run(rec);
        }
      }
      this.checkIdle();
    });
  }

  /** Try again now for every question that gave up or is waiting to retry. (Not for `rejected`: that needs a new edit.) */
  retryNow(): void {
    if (this.closed || this.disposed) return;
    for (const rec of this.recs.values()) {
      if (rec.dirty && (rec.state === "failed" || rec.state === "retrying")) {
        rec.attempts = 0;
        this.clearTimer(rec, "retry");
        void this.run(rec);
      }
    }
  }

  /** Call when the browser reports it is back online. */
  notifyOnline(): void {
    this.retryNow();
  }

  /** Stops all timers and ignores results that arrive later. */
  dispose(): void {
    this.disposed = true;
    for (const rec of this.recs.values()) {
      this.clearTimer(rec, "debounce");
      this.clearTimer(rec, "retry");
    }
    this.listeners.clear();
    this.settle();
  }

  // ---------------------------------------------------------------- internals

  private rec(questionId: string): Rec {
    let r = this.recs.get(questionId);
    if (!r) {
      r = {
        questionId,
        answer: null,
        revision: 0,
        acked: 0,
        state: "idle",
        error: null,
        dirty: false,
        inFlight: false,
        attempts: 0,
        staleResends: 0,
        flushing: false,
        flushRetried: false,
        firstPendingAt: null,
        debounce: null,
        retry: null,
      };
      this.recs.set(questionId, r);
    }
    return r;
  }

  private clearTimer(rec: Rec, which: "debounce" | "retry") {
    const t = rec[which];
    if (t !== null) {
      clearTimeout(t);
      rec[which] = null;
    }
  }

  private async run(rec: Rec): Promise<void> {
    if (this.closed || this.disposed || rec.inFlight || !rec.dirty) return;
    this.clearTimer(rec, "debounce");
    this.clearTimer(rec, "retry");
    rec.inFlight = true;
    rec.state = "saving";
    const sent: SaveRequest = { questionId: rec.questionId, answer: rec.answer, revision: rec.revision };
    this.emit();

    let outcome: SaveOutcome;
    try {
      outcome = await this.save(sent);
    } catch {
      // A thrown error is a network-level failure: the same request is safe to send again.
      outcome = { ok: false, kind: "retry", error: OFFLINE_HINT };
    }
    rec.inFlight = false;
    if (this.disposed) return;
    if (outcome.ok && outcome.saved.questionId !== sent.questionId) {
      // A reply about a different question is a bug somewhere; never apply it.
      outcome = { ok: false, kind: "retry", error: GENERIC_SAVE_ERROR };
    }

    if (outcome.ok) this.onSaved(rec, sent, outcome.saved);
    else this.onFailed(rec, sent, outcome);
    this.emit();
    this.checkIdle();
  }

  private newerEditExists(rec: Rec, sent: SaveRequest) {
    return rec.revision !== sent.revision;
  }

  private onSaved(rec: Rec, sent: SaveRequest, saved: SavedAnswer) {
    rec.attempts = 0;
    rec.acked = Math.max(rec.acked, saved.revision);

    if (this.newerEditExists(rec, sent)) {
      // The student typed again while this request was in flight. Make sure the next one outranks what is stored.
      if (saved.revision >= rec.revision) rec.revision = saved.revision + 1;
      rec.state = "pending";
      if (rec.debounce === null) void this.run(rec);
      return;
    }

    if (!saved.applied && canon(saved.answer) !== canon(sent.answer)) {
      // The server holds a NEWER revision with a different answer (another tab, or state restored late).
      // The student's latest edit is the one they just made here, so send it again with a higher revision.
      if (rec.staleResends < MAX_STALE_RESENDS) {
        rec.staleResends += 1;
        rec.revision = saved.revision + 1;
        rec.state = "pending";
        void this.run(rec);
        return;
      }
      // Kept losing the race: take what the server has rather than fight.
      rec.answer = saved.answer;
      rec.revision = saved.revision;
    } else if (!saved.applied) {
      // A repeat of a request that had already succeeded (for example the reply was lost): nothing to do,
      // but keep our revision in step with the server's.
      rec.revision = Math.max(rec.revision, saved.revision);
    }
    rec.dirty = false;
    rec.firstPendingAt = null;
    rec.error = null;
    rec.state = canon(rec.answer) === "null" ? "idle" : "saved";
    // A cleared answer that the server has confirmed is "saved" as far as the student is concerned.
    if (rec.state === "idle") rec.state = "saved";
  }

  private onFailed(rec: Rec, sent: SaveRequest, f: { kind: SaveFailureKind; error: string }) {
    if (f.kind === "closed") {
      this.close(f.error);
      return;
    }
    if (f.kind === "rejected") {
      if (this.newerEditExists(rec, sent)) {
        // The student already changed it again: that newer value gets its own chance.
        rec.state = "pending";
        if (rec.debounce === null) void this.run(rec);
        return;
      }
      rec.dirty = true; // the server does not have this answer
      rec.state = "rejected";
      rec.error = f.error;
      return;
    }

    // retry
    if (this.newerEditExists(rec, sent)) {
      rec.state = "pending";
      if (rec.debounce === null) void this.run(rec);
      return;
    }
    rec.attempts += 1;
    if (rec.flushing && !rec.flushRetried) {
      rec.flushRetried = true;
      void this.run(rec);
      return;
    }
    if (rec.flushing || rec.attempts > this.maxRetries) {
      rec.state = "failed";
      rec.error = GAVE_UP;
      return;
    }
    rec.state = "retrying";
    rec.error = f.error || OFFLINE_HINT;
    const exp = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (rec.attempts - 1));
    const delay = Math.round(exp * (0.5 + this.random() * 0.5));
    rec.retry = setTimeout(() => {
      rec.retry = null;
      void this.run(rec);
    }, delay);
  }

  private close(reason: string) {
    if (this.closed) return;
    this.closed = true;
    this.closedReason = reason;
    for (const rec of this.recs.values()) {
      this.clearTimer(rec, "debounce");
      this.clearTimer(rec, "retry");
      if (rec.dirty) {
        rec.state = "failed";
        rec.error = reason;
      }
    }
  }

  private isUnsaved(rec: Rec) {
    return rec.dirty;
  }

  private busy(rec: Rec) {
    return rec.inFlight || rec.debounce !== null || rec.retry !== null || (rec.dirty && (rec.state === "pending" || rec.state === "saving"));
  }

  private result(): FlushResult {
    const unsaved = [...this.recs.values()].filter((r) => this.isUnsaved(r)).map((r) => r.questionId);
    return { ok: !this.closed && unsaved.length === 0, closed: this.closed, unsaved };
  }

  /** Resolves flush() promises once nothing is waiting or in flight. */
  private checkIdle() {
    if (this.waiters.length === 0) return;
    for (const rec of this.recs.values()) if (this.busy(rec)) return;
    this.settle();
  }

  private settle() {
    const r = this.result();
    for (const rec of this.recs.values()) {
      rec.flushing = false;
      rec.flushRetried = false;
    }
    const w = this.waiters;
    this.waiters = [];
    for (const resolve of w) resolve(r);
  }

  private build(): AutosaveSnapshot {
    const questions: Record<string, QuestionStatus> = {};
    let unsaved = 0;
    for (const rec of this.recs.values()) {
      if (this.isUnsaved(rec)) unsaved += 1;
      questions[rec.questionId] = {
        state: rec.state,
        answer: rec.answer,
        revision: rec.revision,
        error: rec.state === "failed" || rec.state === "rejected" || rec.state === "retrying" ? rec.error : null,
      };
    }
    return { closed: this.closed, closedReason: this.closedReason, unsaved, questions };
  }

  private emit() {
    this.snap = this.build();
    for (const l of [...this.listeners]) l();
  }
}

/**
 * Calls notifyOnline() when the browser fires "online". Takes the event target as a parameter (pass `window`)
 * so this file never touches a browser global. Returns a function that removes the listener.
 */
export function bindOnlineEvents(
  saver: Pick<AnswerAutosaver, "notifyOnline">,
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
): () => void {
  const handler = () => saver.notifyOnline();
  target.addEventListener("online", handler);
  return () => target.removeEventListener("online", handler);
}
