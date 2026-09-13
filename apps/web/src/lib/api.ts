/**
 * Typed client for the FastAPI backend.
 *
 * Requests go to the Next.js origin and are rewritten to FastAPI, so the session
 * cookie is same-origin and travels automatically (docs/architecture.md §6).
 * Nothing here handles code execution — that never touches the network.
 */

import type { Check } from "./python/types";

export interface ApiUser {
  id: number;
  email: string;
  display_name: string | null;
  created_at: string;
}

export interface ApiExercise {
  id: number;
  slug: string;
  position: number;
  title: string;
  prompt_markdown: string;
  starter_code: string;
  scaffold_level: ScaffoldLevel;
  bloom: string;
  hints: string[];
  /** Self-assessment criteria for open-ended work, shown as a checklist. */
  rubric: string[];
  stdin: string[];
  /** Seeded into the run's working directory before the learner's code runs. */
  files: Record<string, string>;
  /** Pyodide packages loaded before the run, e.g. `["pandas"]`. Track B only. */
  packages: string[];
  checks: Check[];
}

export type ScaffoldLevel =
  "predict" | "fill_in" | "modify" | "debug" | "write_from_spec" | "open_ended";

export interface ApiLesson {
  id: number;
  slug: string;
  position: number;
  title: string;
  content_markdown: string;
  worked_example_code: string | null;
  worked_example_note: string | null;
  exercises: ApiExercise[];
}

export interface ApiLessonSummary {
  id: number;
  slug: string;
  position: number;
  title: string;
  exercise_count: number;
}

export interface ApiModule {
  id: number;
  slug: string;
  position: number;
  title: string;
  summary_markdown: string;
  objectives: Array<{ text: string; bloom: string }>;
  lessons: ApiLessonSummary[];
}

export interface ApiModuleSummary {
  id: number;
  slug: string;
  position: number;
  title: string;
  summary_markdown: string;
  lesson_count: number;
}

export interface ApiTrack {
  id: number;
  slug: string;
  position: number;
  title: string;
  summary_markdown: string;
  prerequisite_slug: string | null;
  modules: ApiModuleSummary[];
}

export type LessonStatus = "not_started" | "in_progress" | "completed";

export interface ApiProgress {
  lesson_slug: string;
  module_slug: string;
  status: LessonStatus;
  completed_at: string | null;
}

export interface ApiModuleProgress {
  module_slug: string;
  total_lessons: number;
  completed_lessons: number;
  status: LessonStatus;
}

export interface ApiReviewItem {
  id: number;
  slug: string;
  kind: string;
  prompt_markdown: string;
  code: string | null;
  options: string[];
  module_slug: string;
  module_title: string;
  reviews_module_slug: string | null;
  /** False the first time an item is asked, so the interface can say so. */
  seen_before: boolean;
  // No `answer`: quiz items are graded on the server precisely so the answer
  // is not sitting in this response while the learner is still thinking.
}

export interface ApiQuizResult {
  correct: boolean;
  answer: string;
  explanation_markdown: string;
  interval_days: number;
  next_due_at: string;
}

export interface ApiSummary {
  streak_days: number;
  last_practised_on: string | null;
  exercises_passed: number;
  completed_module_slugs: string[];
  reviews_due: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function apiBase(): string {
  // On the server there is no origin to be relative to, so address FastAPI
  // directly; in the browser, relative URLs keep the cookie same-origin.
  if (typeof window === "undefined") {
    return process.env.API_ORIGIN ?? "http://127.0.0.1:8000";
  }
  return "";
}

/**
 * How long a curriculum response may be reused.
 *
 * Curriculum is loaded from files at deploy time and does not change in between,
 * so re-reading it from the database on every page render is wasted work — and
 * on a free database tier, which caps connections and may sleep when idle, it is
 * the difference between a snappy lesson page and a cold start. Auth and
 * progress are never cached: those are per-learner and change as they work.
 *
 * Five minutes rather than forever so a content reload reaches learners without
 * a redeploy.
 */
const CURRICULUM_REVALIDATE_SECONDS = 300;

interface RequestOptions extends RequestInit {
  /** Seconds this response may be reused. Omit for per-request data. */
  revalidate?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { revalidate, ...init } = options;

  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    ...(revalidate === undefined ? { cache: "no-store" as const } : { next: { revalidate } }),
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: string | Array<{ msg: string }> };
      if (typeof body.detail === "string") {
        detail = body.detail;
      } else if (Array.isArray(body.detail) && body.detail[0]) {
        detail = body.detail[0].msg;
      }
    } catch {
      // A non-JSON error body is not worth failing over; keep the default.
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  // auth
  register: (body: { email: string; password: string; display_name?: string }) =>
    request<ApiUser>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<ApiUser>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),

  logout: () => request<void>("/api/auth/logout", { method: "POST" }),

  me: () => request<ApiUser>("/api/auth/me"),

  // curriculum — cacheable, because it only changes when content is reloaded
  tracks: () =>
    request<ApiTrack[]>("/api/curriculum/tracks", {
      revalidate: CURRICULUM_REVALIDATE_SECONDS,
    }),

  module: (moduleSlug: string) =>
    request<ApiModule>(`/api/curriculum/modules/${encodeURIComponent(moduleSlug)}`, {
      revalidate: CURRICULUM_REVALIDATE_SECONDS,
    }),

  lesson: (moduleSlug: string, lessonSlug: string) =>
    request<ApiLesson>(
      `/api/curriculum/modules/${encodeURIComponent(moduleSlug)}/lessons/${encodeURIComponent(lessonSlug)}`,
      { revalidate: CURRICULUM_REVALIDATE_SECONDS },
    ),

  // progress
  progress: () => request<ApiProgress[]>("/api/progress"),

  moduleProgress: () => request<ApiModuleProgress[]>("/api/progress/modules"),

  setLessonProgress: (moduleSlug: string, lessonSlug: string, status: LessonStatus) =>
    request<ApiProgress>(
      `/api/progress/lessons/${encodeURIComponent(moduleSlug)}/${encodeURIComponent(lessonSlug)}`,
      { method: "PUT", body: JSON.stringify({ status }) },
    ),

  recordSubmission: (body: { exercise_slug: string; code: string; passed: boolean }) =>
    request<{ id: number }>("/api/progress/submissions", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  summary: () => request<ApiSummary>("/api/progress/summary"),

  // review — per-learner and schedule-dependent, so never cached
  dueReviews: () => request<ApiReviewItem[]>("/api/quiz/due"),

  answerReview: (body: { quiz_item_id: number; answer: string }) =>
    request<ApiQuizResult>("/api/quiz/attempts", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

/** Learner-facing label for a scaffold level, used on exercise cards. */
export const SCAFFOLD_LABELS: Record<ScaffoldLevel, string> = {
  predict: "Predict the output",
  fill_in: "Fill in the blanks",
  modify: "Modify the code",
  debug: "Find the fault",
  write_from_spec: "Write it yourself",
  open_ended: "Build something",
};
