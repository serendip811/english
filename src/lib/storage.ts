import type { AppStorage, Lesson, LessonSessionState } from "./types";
import { sanitizeSession } from "./practice";

const STORAGE_KEY = "shadowing-web-state-v1";

const DEFAULT_STORAGE: AppStorage = {
  sessions: {}
};

export function loadStorage(): AppStorage {
  if (typeof window === "undefined") {
    return DEFAULT_STORAGE;
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return DEFAULT_STORAGE;
    }

    const parsed = JSON.parse(rawValue) as AppStorage;
    if (!parsed || typeof parsed !== "object" || typeof parsed.sessions !== "object") {
      return DEFAULT_STORAGE;
    }

    return parsed;
  } catch {
    return DEFAULT_STORAGE;
  }
}

export function saveStorage(storage: AppStorage): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
}

export function getLessonSession(storage: AppStorage, lesson: Lesson): LessonSessionState {
  return sanitizeSession(lesson, storage.sessions[lesson.youtubeVideoID]);
}

export function updateLessonSession(
  storage: AppStorage,
  lesson: Lesson,
  updater: (session: LessonSessionState) => LessonSessionState
): AppStorage {
  const currentSession = getLessonSession(storage, lesson);
  const nextSession = sanitizeSession(lesson, updater(currentSession));

  return {
    ...storage,
    sessions: {
      ...storage.sessions,
      [lesson.youtubeVideoID]: nextSession
    }
  };
}
