export type CaptionSource = "captions" | "transcription";
export type LoopMode = "single" | "range";
export type TabID = "lessons" | "library" | "practice";
export type SegmentPickerMode = "current" | "rangeStart" | "rangeEnd";

export interface SentenceSegment {
  index: number;
  startTime: number;
  endTime: number;
  textEn: string;
  textKo: string | null;
  sourceType: CaptionSource;
}

export interface Lesson {
  youtubeVideoID: string;
  title: string;
  sourceURL: string;
  duration: number;
  summary: string;
  segments: SentenceSegment[];
}

export interface LessonCatalog {
  lessons: Lesson[];
}

export interface LessonSessionState {
  lastPracticedSegmentIndex: number;
  loopMode: LoopMode;
  loopStartIndex: number;
  loopEndIndex: number;
  autoAdvanceRepeatCount: number;
  showTranscript: boolean;
  showKorean: boolean;
  bookmarkedSegmentIndices: number[];
  lastPracticedAt: string | null;
}

export interface AppStorage {
  sessions: Record<string, LessonSessionState>;
}

export type PlayerCommand =
  | { sequence: number; kind: "idle" }
  | { sequence: number; kind: "stop" }
  | { sequence: number; kind: "cue"; videoId: string; startTime: number }
  | {
      sequence: number;
      kind: "playLoop";
      videoId: string;
      startTime: number;
      endTime: number;
    }
  | {
      sequence: number;
      kind: "playSegment";
      videoId: string;
      startTime: number;
      endTime: number;
    };

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export type PlayerCommandInput = DistributiveOmit<PlayerCommand, "sequence">;
