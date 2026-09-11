import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LessonView } from "@/components/LessonView";
import { ApiError, api } from "@/lib/api";
import { getCurrentUser } from "@/lib/session.server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ module: string; lesson: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { module: moduleSlug, lesson: lessonSlug } = await params;
  try {
    const lesson = await api.lesson(moduleSlug, lessonSlug);
    return { title: lesson.title };
  } catch {
    return { title: "Lesson" };
  }
}

export default async function LessonPage({ params }: Params) {
  const { module: moduleSlug, lesson: lessonSlug } = await params;

  // Only the fetch is guarded. Rendering happens outside the try, so a genuine
  // rendering error reaches an error boundary rather than being mistaken here
  // for a missing lesson.
  let lesson;
  let moduleData;
  let user;
  try {
    // Lesson prose is server-rendered so it is readable immediately and
    // indexable; only the interactive parts hydrate. The session comes from the
    // request cache the layout already populated, not a second API call.
    [lesson, moduleData, user] = await Promise.all([
      api.lesson(moduleSlug, lessonSlug),
      api.module(moduleSlug),
      getCurrentUser(),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <LessonView
      lesson={lesson}
      moduleSlug={moduleSlug}
      moduleTitle={moduleData.title}
      siblings={moduleData.lessons}
      signedIn={user !== null}
    />
  );
}
