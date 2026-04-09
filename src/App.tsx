import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import lessonCatalog from "./data/lesson-catalog.json";
import { SegmentPickerModal } from "./components/SegmentPickerModal";
import { YouTubePlayer, type YouTubePlayerHandle } from "./components/YouTubePlayer";
import {
  autoAdvanceDecision,
  clampIndex,
  effectiveLoopRange,
  effectivePlaybackEndTime,
  formatTimestamp,
  playbackStartIndex,
  sanitizeSession,
  shouldAutoplaySentenceNavigation
} from "./lib/practice";
import { getLessonSession, loadStorage, saveStorage, updateLessonSession } from "./lib/storage";
import type {
  AppStorage,
  Lesson,
  LessonCatalog,
  PlayerCommand,
  PlayerCommandInput,
  SegmentPickerMode,
  TabID
} from "./lib/types";

const lessons = (lessonCatalog as LessonCatalog).lessons;

function App(): JSX.Element {
  const [tab, setTab] = useState<TabID>("lessons");
  const [storage, setStorage] = useState<AppStorage>(() => loadStorage());
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(() => {
    const initialStorage = loadStorage();
    const recentLesson = lessons
      .map((lesson) => ({
        lesson,
        session: getLessonSession(initialStorage, lesson)
      }))
      .filter((item) => item.session.lastPracticedAt)
      .sort((left, right) =>
        (right.session.lastPracticedAt ?? "").localeCompare(left.session.lastPracticedAt ?? "")
      )[0];

    return recentLesson?.lesson.youtubeVideoID ?? lessons[0]?.youtubeVideoID ?? null;
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<SegmentPickerMode>("current");
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playerAutoplayBlocked, setPlayerAutoplayBlocked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [completedLoopIterations, setCompletedLoopIterations] = useState(0);
  const [playerCommand, setPlayerCommand] = useState<PlayerCommand>({ sequence: 0, kind: "idle" });
  const [pendingSentenceSelection, setPendingSentenceSelection] = useState<{
    kind: "cue" | "play";
    index: number;
  } | null>(null);
  const commandSequenceRef = useRef(0);
  const playerHandleRef = useRef<YouTubePlayerHandle | null>(null);

  const selectedLesson = useMemo(
    () => lessons.find((lesson) => lesson.youtubeVideoID === selectedLessonId) ?? null,
    [selectedLessonId]
  );

  const selectedSession = useMemo(() => {
    if (!selectedLesson) {
      return null;
    }

    return sanitizeSession(selectedLesson, storage.sessions[selectedLesson.youtubeVideoID]);
  }, [selectedLesson, storage]);

  const currentIndex = selectedSession?.lastPracticedSegmentIndex ?? 0;
  const loopMode = selectedSession?.loopMode ?? "single";
  const loopStartIndex = selectedSession?.loopStartIndex ?? currentIndex;
  const loopEndIndex = selectedSession?.loopEndIndex ?? currentIndex;
  const autoAdvanceRepeatCount = selectedSession?.autoAdvanceRepeatCount ?? 0;
  const showTranscript = selectedSession?.showTranscript ?? false;
  const showKorean = selectedSession?.showKorean ?? false;
  const bookmarkedSegmentIndices = selectedSession?.bookmarkedSegmentIndices ?? [];
  const segments = selectedLesson?.segments ?? [];
  const currentSegment = segments[clampIndex(currentIndex, segments.length)] ?? null;
  const hasKorean = segments.some((segment) => Boolean(segment.textKo?.trim()));
  const currentRange = effectiveLoopRange(loopMode, currentIndex, loopStartIndex, loopEndIndex);

  const recentLesson = useMemo(() => {
    return lessons
      .map((lesson) => ({
        lesson,
        session: getLessonSession(storage, lesson)
      }))
      .filter((item) => item.session.lastPracticedAt)
      .sort((left, right) =>
        (right.session.lastPracticedAt ?? "").localeCompare(left.session.lastPracticedAt ?? "")
      )[0]?.lesson;
  }, [storage]);

  const bookmarkedItems = useMemo(() => {
    return lessons
      .flatMap((lesson) => {
        const session = getLessonSession(storage, lesson);
        return session.bookmarkedSegmentIndices.map((index) => ({
          lesson,
          segment: lesson.segments[index],
          lastPracticedAt: session.lastPracticedAt
        }));
      })
      .filter(
        (
          item
        ): item is {
          lesson: Lesson;
          segment: Lesson["segments"][number];
          lastPracticedAt: string | null;
        } => Boolean(item.segment)
      )
      .sort((left, right) => {
        const dateComparison = (right.lastPracticedAt ?? "").localeCompare(left.lastPracticedAt ?? "");
        if (dateComparison !== 0) {
          return dateComparison;
        }

        return left.segment.index - right.segment.index;
      });
  }, [storage]);

  useEffect(() => {
    saveStorage(storage);
  }, [storage]);

  useEffect(() => {
    setCompletedLoopIterations(0);
    setIsPlaying(false);
    setPlayerError(null);
    setPlayerAutoplayBlocked(false);

    if (!selectedLesson || !currentSegment) {
      issueCommand({ kind: "stop" });
      return;
    }

    issueCommand({
      kind: "cue",
      videoId: selectedLesson.youtubeVideoID,
      startTime: currentSegment.startTime
    });
  }, [selectedLessonId]);

  useEffect(() => {
    if (!selectedLesson || !pendingSentenceSelection || currentIndex !== pendingSentenceSelection.index) {
      return;
    }

    if (pendingSentenceSelection.kind === "play") {
      issuePlaybackForIndex(pendingSentenceSelection.index);
    } else {
      issueCueForIndex(pendingSentenceSelection.index);
    }

    setPendingSentenceSelection(null);
  }, [pendingSentenceSelection, selectedLesson, currentIndex, loopMode, autoAdvanceRepeatCount]);

  function issueCommand(
    command: PlayerCommandInput,
    options?: { preferImmediate?: boolean }
  ): void {
    if (options?.preferImmediate && playerHandleRef.current?.runCommand(command)) {
      return;
    }

    commandSequenceRef.current += 1;
    setPlayerCommand({
      sequence: commandSequenceRef.current,
      ...command
    } as PlayerCommand);
  }

  function openLesson(lesson: Lesson, segmentIndex?: number): void {
    const nextIndex = segmentIndex ?? getLessonSession(storage, lesson).lastPracticedSegmentIndex;
    const clampedIndex = clampIndex(nextIndex, lesson.segments.length);

    setStorage((previousStorage) =>
      updateLessonSession(previousStorage, lesson, (session) => ({
        ...session,
        lastPracticedSegmentIndex: clampedIndex,
        lastPracticedAt: new Date().toISOString()
      }))
    );

    setSelectedLessonId(lesson.youtubeVideoID);
    setPlayerError(null);
    setPlayerAutoplayBlocked(false);
    setCompletedLoopIterations(0);
    setIsPlaying(false);
    setPendingSentenceSelection(null);
    setTab("practice");
    issueCommand({
      kind: "cue",
      videoId: lesson.youtubeVideoID,
      startTime: lesson.segments[clampedIndex]?.startTime ?? 0
    });
  }

  function handleIterationCompleted(): void {
    if (!selectedLesson || !selectedSession || !currentSegment) {
      return;
    }

    if (loopMode === "range") {
      const nextIndex =
        currentIndex >= currentRange.endIndex ? currentRange.startIndex : currentIndex + 1;

      setStorage((previousStorage) =>
        updateLessonSession(previousStorage, selectedLesson, (session) => ({
          ...session,
          lastPracticedSegmentIndex: nextIndex,
          lastPracticedAt: new Date().toISOString()
        }))
      );

      const nextSegment = selectedLesson.segments[nextIndex];
      issueCommand({
        kind: "playSegment",
        videoId: selectedLesson.youtubeVideoID,
        startTime: nextSegment.startTime,
        endTime: effectivePlaybackEndTime(selectedLesson.segments, nextIndex)
      });
      return;
    }

    if (autoAdvanceRepeatCount <= 0) {
      return;
    }

    const decision = autoAdvanceDecision(
      loopMode,
      autoAdvanceRepeatCount,
      completedLoopIterations,
      currentIndex,
      selectedLesson.segments.length
    );

    if (decision.kind === "continue") {
      setCompletedLoopIterations(decision.completedIterations);
      issueCommand({
        kind: "playSegment",
        videoId: selectedLesson.youtubeVideoID,
        startTime: currentSegment.startTime,
        endTime: effectivePlaybackEndTime(selectedLesson.segments, currentIndex)
      });
      return;
    }

    if (decision.kind === "advance") {
      setCompletedLoopIterations(0);
      setStorage((previousStorage) =>
        updateLessonSession(previousStorage, selectedLesson, (session) => ({
          ...session,
          lastPracticedSegmentIndex: decision.nextIndex,
          lastPracticedAt: new Date().toISOString()
        }))
      );

      const nextSegment = selectedLesson.segments[decision.nextIndex];
      issueCommand({
        kind: "playSegment",
        videoId: selectedLesson.youtubeVideoID,
        startTime: nextSegment.startTime,
        endTime: effectivePlaybackEndTime(selectedLesson.segments, decision.nextIndex)
      });
      return;
    }

    setCompletedLoopIterations(0);
    setIsPlaying(false);
    issueCommand({ kind: "stop" });
  }

  function handlePlay(): void {
    if (!selectedLesson || !selectedSession || !currentSegment) {
      return;
    }

    const startIndex = playbackStartIndex(
      currentRange,
      selectedLesson.segments.length,
      currentIndex
    );

    setStorage((previousStorage) =>
      updateLessonSession(previousStorage, selectedLesson, (session) => ({
        ...session,
        lastPracticedSegmentIndex: startIndex,
        lastPracticedAt: new Date().toISOString()
      }))
    );

    issuePlaybackForIndex(startIndex, { preferImmediate: true });
  }

  function handleStop(): void {
    setCompletedLoopIterations(0);
    setIsPlaying(false);
    setPendingSentenceSelection(null);
    setPlayerAutoplayBlocked(false);
    issueCommand({ kind: "stop" });
  }

  function issuePlaybackForIndex(index: number, options?: { preferImmediate?: boolean }): void {
    if (!selectedLesson) {
      return;
    }

    const nextIndex = clampIndex(index, selectedLesson.segments.length);
    const nextSegment = selectedLesson.segments[nextIndex];

    setPlayerError(null);
    setCompletedLoopIterations(0);

    if (loopMode === "single" && autoAdvanceRepeatCount <= 0) {
      issueCommand({
        kind: "playLoop",
        videoId: selectedLesson.youtubeVideoID,
        startTime: nextSegment.startTime,
        endTime: effectivePlaybackEndTime(selectedLesson.segments, nextIndex)
      }, options);
    } else {
      issueCommand({
        kind: "playSegment",
        videoId: selectedLesson.youtubeVideoID,
        startTime: nextSegment.startTime,
        endTime: effectivePlaybackEndTime(selectedLesson.segments, nextIndex)
      }, options);
    }

    setIsPlaying(true);
  }

  function issueCueForIndex(index: number): void {
    if (!selectedLesson) {
      return;
    }

    const nextIndex = clampIndex(index, selectedLesson.segments.length);
    setCompletedLoopIterations(0);
    setIsPlaying(false);
    issueCommand({
      kind: "cue",
      videoId: selectedLesson.youtubeVideoID,
      startTime: selectedLesson.segments[nextIndex].startTime
    });
  }

  function selectCurrentSentence(index: number, options?: { autoplay?: boolean }): void {
    if (!selectedLesson) {
      return;
    }

    const nextIndex = clampIndex(index, selectedLesson.segments.length);
    const applySelection = (): void => {
      setStorage((previousStorage) =>
        updateLessonSession(previousStorage, selectedLesson, (session) => ({
          ...session,
          lastPracticedSegmentIndex: nextIndex,
          loopStartIndex: session.loopMode === "single" ? nextIndex : session.loopStartIndex,
          loopEndIndex: session.loopMode === "single" ? nextIndex : session.loopEndIndex,
          lastPracticedAt: new Date().toISOString()
        }))
      );
    };

    if (options?.autoplay) {
      setPendingSentenceSelection(null);
      flushSync(() => {
        applySelection();
      });
      issuePlaybackForIndex(nextIndex, { preferImmediate: true });
      return;
    }

    applySelection();
    setPendingSentenceSelection({
      kind: "cue",
      index: nextIndex
    });
  }

  function setLoopMode(nextMode: "single" | "range"): void {
    if (!selectedLesson) {
      return;
    }

    setStorage((previousStorage) =>
      updateLessonSession(previousStorage, selectedLesson, (session) => ({
        ...session,
        loopMode: nextMode,
        loopStartIndex: session.lastPracticedSegmentIndex,
        loopEndIndex: session.lastPracticedSegmentIndex
      }))
    );
    setCompletedLoopIterations(0);
  }

  function setRangeStart(index: number): void {
    if (!selectedLesson) {
      return;
    }

    const nextIndex = clampIndex(index, selectedLesson.segments.length);
    setStorage((previousStorage) =>
      updateLessonSession(previousStorage, selectedLesson, (session) => ({
        ...session,
        loopStartIndex: nextIndex,
        loopEndIndex: Math.max(session.loopEndIndex, nextIndex),
        lastPracticedSegmentIndex: nextIndex,
        lastPracticedAt: new Date().toISOString()
      }))
    );
    setIsPlaying(false);
    issueCommand({
      kind: "cue",
      videoId: selectedLesson.youtubeVideoID,
      startTime: selectedLesson.segments[nextIndex].startTime
    });
  }

  function setRangeEnd(index: number): void {
    if (!selectedLesson) {
      return;
    }

    const nextIndex = clampIndex(index, selectedLesson.segments.length);
    const anchorIndex = loopStartIndex;

    setStorage((previousStorage) =>
      updateLessonSession(previousStorage, selectedLesson, (session) => ({
        ...session,
        loopEndIndex: Math.max(nextIndex, session.loopStartIndex),
        lastPracticedSegmentIndex: session.loopStartIndex,
        lastPracticedAt: new Date().toISOString()
      }))
    );
    setIsPlaying(false);
    issueCommand({
      kind: "cue",
      videoId: selectedLesson.youtubeVideoID,
      startTime: selectedLesson.segments[anchorIndex].startTime
    });
  }

  function moveToPrevious(): void {
    if (!selectedLesson) {
      return;
    }

    selectCurrentSentence(currentIndex - 1, {
      autoplay: shouldAutoplaySentenceNavigation(isPlaying, loopMode)
    });
  }

  function moveToNext(): void {
    if (!selectedLesson) {
      return;
    }

    selectCurrentSentence(currentIndex + 1, {
      autoplay: shouldAutoplaySentenceNavigation(isPlaying, loopMode)
    });
  }

  function toggleBookmark(index = currentIndex): void {
    if (!selectedLesson) {
      return;
    }

    setStorage((previousStorage) =>
      updateLessonSession(previousStorage, selectedLesson, (session) => {
        const nextBookmarks = new Set(session.bookmarkedSegmentIndices);
        if (nextBookmarks.has(index)) {
          nextBookmarks.delete(index);
        } else {
          nextBookmarks.add(index);
        }

        return {
          ...session,
          bookmarkedSegmentIndices: Array.from(nextBookmarks).sort((left, right) => left - right),
          lastPracticedAt: new Date().toISOString()
        };
      })
    );
  }

  function toggleKorean(): void {
    if (!selectedLesson) {
      return;
    }

    setStorage((previousStorage) =>
      updateLessonSession(previousStorage, selectedLesson, (session) => ({
        ...session,
        showKorean: !session.showKorean && hasKorean
      }))
    );
  }

  function toggleTranscript(): void {
    if (!selectedLesson) {
      return;
    }

    setStorage((previousStorage) =>
      updateLessonSession(previousStorage, selectedLesson, (session) => ({
        ...session,
        showTranscript: !session.showTranscript
      }))
    );
  }

  function renderLessons(): JSX.Element {
    return (
      <div className="tab-panel lessons-panel">
        {recentLesson ? (
          <section className="continue-section">
            <div className="section-heading">
              <span className="section-overline">Last Activity</span>
              <h2>Continue</h2>
            </div>
            <button type="button" className="feature-lesson-card" onClick={() => openLesson(recentLesson)}>
              <div className="feature-lesson-media">
                <img
                  src={lessonThumbnailURL(recentLesson)}
                  alt={recentLesson.title}
                  className="feature-lesson-image"
                />
                <div className="feature-lesson-overlay">
                  <div className="feature-progress">
                    <div className="feature-progress-row">
                      <span className="pill-badge warm">Current Lesson</span>
                      <span className="feature-progress-copy">
                        {lessonProgressPercent(storage, recentLesson)}% Complete
                      </span>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill tertiary"
                        style={{ width: `${lessonProgressPercent(storage, recentLesson)}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="feature-play-badge">
                  <span className="material-symbols-outlined filled-icon">play_arrow</span>
                </div>
              </div>
              <div className="feature-lesson-body">
                <div className="feature-lesson-title">{recentLesson.title}</div>
                <div className="feature-lesson-meta">
                  <span className="meta-pill">
                    <span className="material-symbols-outlined">layers</span>
                    {recentLesson.segments.length} Segments
                  </span>
                  <span className="meta-pill">
                    <span className="material-symbols-outlined">schedule</span>
                    {formatDuration(recentLesson.duration)}
                  </span>
                </div>
              </div>
            </button>
          </section>
        ) : null}

        <section className="list-section">
          <div className="section-heading">
            <span className="section-overline">Catalog</span>
            <h2>All Lessons</h2>
          </div>
          <div className="lesson-list">
            {lessons.map((lesson) => (
              <button
                type="button"
                key={lesson.youtubeVideoID}
                className={`lesson-row-card ${lesson.youtubeVideoID === selectedLessonId ? "selected" : ""}`}
                onClick={() => openLesson(lesson)}
              >
                <div className="lesson-row-thumb">
                  <img src={lessonThumbnailURL(lesson)} alt={lesson.title} className="lesson-row-image" />
                </div>
                <div className="lesson-row-copy">
                  <div className="lesson-row-title">{lesson.title}</div>
                  <div className="lesson-row-meta">
                    <span>{lesson.segments.length} Segments</span>
                    <span className="dot-divider" />
                    <span>{formatDuration(lesson.duration)}</span>
                  </div>
                </div>
                <span className="material-symbols-outlined lesson-row-icon">play_circle</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderLibrary(): JSX.Element {
    return (
      <div className="tab-panel library-panel">
        {bookmarkedItems.length === 0 ? (
          <section className="empty-state editorial-empty">
            <span className="material-symbols-outlined empty-icon filled-icon">star</span>
            <h2>No bookmarks yet</h2>
            <p>Save a sentence in Practice and it will appear here.</p>
          </section>
        ) : (
          <section className="list-section">
            <div className="section-heading">
              <span className="section-overline">Saved</span>
              <h2>Bookmarked Sentences</h2>
            </div>
            <div className="bookmark-list">
              {bookmarkedItems.map((item) => (
                <div
                  key={`${item.lesson.youtubeVideoID}-${item.segment.index}`}
                  className="bookmark-story-card"
                >
                  <button
                    type="button"
                    className="bookmark-card-main editorial"
                    onClick={() => openLesson(item.lesson, item.segment.index)}
                  >
                    <div className="bookmark-card-eyebrow">{item.lesson.title}</div>
                    <div className="bookmark-card-text">{item.segment.textEn}</div>
                    <div className="bookmark-card-meta">
                      Sentence {item.segment.index + 1}
                      <span className="dot-divider" />
                      {formatTimestamp(item.segment.startTime)}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="bookmark-card-action icon"
                    onClick={() => {
                      setSelectedLessonId(item.lesson.youtubeVideoID);
                      setStorage((previousStorage) =>
                        updateLessonSession(previousStorage, item.lesson, (session) => ({
                          ...session,
                          bookmarkedSegmentIndices: session.bookmarkedSegmentIndices.filter(
                            (value) => value !== item.segment.index
                          )
                        }))
                      );
                    }}
                    aria-label="Remove bookmark"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  function renderPractice(): JSX.Element {
    if (!selectedLesson || !selectedSession || !currentSegment) {
      return (
        <div className="tab-panel">
          <section className="empty-state editorial-empty">
            <span className="material-symbols-outlined empty-icon filled-icon">school</span>
            <h2>Select a lesson</h2>
            <p>Pick a lesson first, then practice from there.</p>
          </section>
        </div>
      );
    }

    return (
      <>
        <div className="tab-panel practice-panel">
          <section className="player-card editorial-player-card">
            {playerError ? (
              <div className="player-message">
                <strong>Embedded Playback Unavailable</strong>
                <p>{playerError}</p>
              </div>
            ) : (
              <YouTubePlayer
                ref={playerHandleRef}
                initialVideoId={selectedLesson.youtubeVideoID}
                command={playerCommand}
                onAutoplayBlocked={() => {
                  setPlayerAutoplayBlocked(true);
                  setIsPlaying(false);
                }}
                onPlayerError={(code) =>
                  setPlayerError(
                    code === 101 || code === 150 || code === 152
                      ? "This video's owner does not allow embedded playback."
                      : `YouTube embed error ${code}.`
                  )
                }
                onIterationCompleted={handleIterationCompleted}
              />
            )}
          </section>

          {playerAutoplayBlocked ? (
            <section className="practice-blocked-note">
              <p>Safari blocked scripted playback. Tap the video once, then use the controls again.</p>
            </section>
          ) : null}

          <section className="practice-meta-row">
            <div className="practice-meta-copy">
              <span className="section-overline">Sentence {currentIndex + 1} / {segments.length}</span>
              <span className="practice-timecopy">
                {formatTimestamp(currentSegment.startTime)} / {formatTimestamp(selectedLesson.duration)}
              </span>
            </div>
            <div className="practice-meta-actions">
              <a
                href={selectedLesson.sourceURL}
                target="_blank"
                rel="noreferrer"
                className="round-icon-button"
                aria-label="Open lesson on YouTube"
              >
                <span className="material-symbols-outlined">open_in_new</span>
              </a>
              <button
                type="button"
                className={`round-icon-button ${showTranscript ? "active" : ""}`}
                onClick={toggleTranscript}
                aria-label={showTranscript ? "Hide sentence" : "Reveal sentence"}
              >
                <span className="material-symbols-outlined">
                  {showTranscript ? "visibility" : "visibility_off"}
                </span>
              </button>
              <button
                type="button"
                className={`round-icon-button ${bookmarkedSegmentIndices.includes(currentIndex) ? "active" : ""}`}
                onClick={() => toggleBookmark()}
                aria-label="Toggle bookmark"
              >
                <span className="material-symbols-outlined">
                  {bookmarkedSegmentIndices.includes(currentIndex) ? "star" : "star_outline"}
                </span>
              </button>
              <button
                type="button"
                className="round-icon-button"
                onClick={() => {
                  setPickerMode("current");
                  setPickerOpen(true);
                }}
                aria-label="Open sentence list"
              >
                <span className="material-symbols-outlined">format_list_bulleted</span>
              </button>
            </div>
          </section>

          <section className={`sentence-card story-card ${showTranscript ? "" : "transcript-hidden"}`.trim()}>
            {showTranscript ? (
              <>
                <div className="sentence-text">{currentSegment.textEn}</div>
                {showKorean && currentSegment.textKo ? (
                  <div className="sentence-subtext">{currentSegment.textKo}</div>
                ) : null}
              </>
            ) : (
              <div className="sentence-hidden-state">
                <div className="sentence-hidden-copy">
                  <span className="material-symbols-outlined filled-icon">hearing</span>
                  <div className="sentence-hidden-copytext">
                    <strong>Listen first.</strong>
                  </div>
                </div>
                <button type="button" className="reveal-button compact" onClick={toggleTranscript}>
                  <span className="material-symbols-outlined">visibility</span>
                  Reveal
                </button>
              </div>
            )}

            <div className="sentence-chip-row">
              <span className="info-chip">
                <span className="material-symbols-outlined">replay</span>
                {loopMode === "single" ? "Single" : `Range ${loopStartIndex + 1}-${loopEndIndex + 1}`}
              </span>
              <span className="info-chip">
                <span className="material-symbols-outlined">schedule</span>
                {formatTimestamp(currentSegment.startTime)} - {formatTimestamp(currentSegment.endTime)}
              </span>
            </div>
          </section>

          <section className="settings-card editorial-settings">
            <div className="mode-switch">
              <button
                type="button"
                className={loopMode === "single" ? "selected" : ""}
                onClick={() => setLoopMode("single")}
              >
                Single
              </button>
              <button
                type="button"
                className={loopMode === "range" ? "selected" : ""}
                onClick={() => setLoopMode("range")}
              >
                Range
              </button>
            </div>

            <div className="editorial-settings-grid">
              {loopMode === "single" ? (
                <label className="field-card">
                  <span className="field-card-label">Auto Next</span>
                  <select
                    value={autoAdvanceRepeatCount}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      setStorage((previousStorage) =>
                        updateLessonSession(previousStorage, selectedLesson, (session) => ({
                          ...session,
                          autoAdvanceRepeatCount: nextValue
                        }))
                      );
                    }}
                  >
                    <option value={0}>Manual</option>
                    {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                      <option key={value} value={value}>
                        {value} repeats
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="range-controls">
                  <button
                    type="button"
                    className="range-button editorial"
                    onClick={() => {
                      setPickerMode("rangeStart");
                      setPickerOpen(true);
                    }}
                  >
                    <span>From</span>
                    <strong>Sentence {loopStartIndex + 1}</strong>
                  </button>
                  <button
                    type="button"
                    className="range-button editorial"
                    onClick={() => {
                      setPickerMode("rangeEnd");
                      setPickerOpen(true);
                    }}
                  >
                    <span>To</span>
                    <strong>Sentence {loopEndIndex + 1}</strong>
                  </button>
                </div>
              )}

              <label className={`toggle-card ${hasKorean ? "" : "disabled"}`}>
                <span className="field-card-label">Korean Subtitle</span>
                <div className={`toggle-chip ${hasKorean ? "" : "disabled"}`}>
                  <input
                    type="checkbox"
                    checked={showKorean}
                    disabled={!hasKorean}
                    onChange={toggleKorean}
                  />
                  <span>KO</span>
                </div>
              </label>
            </div>
          </section>
        </div>

        <div className="bottom-controls editorial-loop-bar">
          <div className="loop-bar-shell">
            <button type="button" className="secondary-control editorial" onClick={moveToPrevious}>
              <span className="material-symbols-outlined">skip_previous</span>
              <span>Previous</span>
            </button>
            <button
              type="button"
              className="primary-control editorial"
              onClick={isPlaying ? handleStop : handlePlay}
            >
              <span className="material-symbols-outlined filled-icon">
                {isPlaying ? "stop" : "replay"}
              </span>
              <span>{isPlaying ? "Stop" : "Loop"}</span>
            </button>
            <button type="button" className="secondary-control editorial" onClick={moveToNext}>
              <span className="material-symbols-outlined">skip_next</span>
              <span>Next</span>
            </button>
          </div>
        </div>

        <SegmentPickerModal
          open={pickerOpen}
          mode={pickerMode}
          segments={segments}
          currentIndex={currentIndex}
          loopStartIndex={loopStartIndex}
          loopEndIndex={loopEndIndex}
          bookmarkedSegmentIndices={bookmarkedSegmentIndices}
          showKorean={showKorean}
          onClose={() => setPickerOpen(false)}
          onSelect={(index) => {
            if (pickerMode === "current") {
              selectCurrentSentence(index);
            } else if (pickerMode === "rangeStart") {
              setRangeStart(index);
            } else {
              setRangeEnd(index);
            }
            setPickerOpen(false);
          }}
        />
      </>
    );
  }

  return (
    <div className="app-shell">
      <header className="top-app-bar">
        <div className="top-app-bar-copy">
          <span className="top-app-bar-overline">{tab === "practice" ? "Now Practicing" : "Shadowing"}</span>
          <h1>{tab === "lessons" ? "Lessons" : tab === "library" ? "Library" : "Practice"}</h1>
          {tab === "practice" && selectedLesson ? (
            <p className="top-app-bar-subtitle">{selectedLesson.title}</p>
          ) : null}
        </div>
        <div className="top-app-bar-actions">
          {tab === "practice" && selectedLesson ? (
            <a
              href={selectedLesson.sourceURL}
              target="_blank"
              rel="noreferrer"
              className="top-icon-button"
              aria-label="Open on YouTube"
            >
              <span className="material-symbols-outlined">open_in_new</span>
            </a>
          ) : null}
        </div>
      </header>

      <main className="app-content">
        {tab === "lessons" ? renderLessons() : null}
        {tab === "library" ? renderLibrary() : null}
        {tab === "practice" ? renderPractice() : null}
      </main>

      <nav className="tab-bar">
        <button type="button" className={tab === "lessons" ? "selected" : ""} onClick={() => setTab("lessons")}>
          <span className="material-symbols-outlined">school</span>
          <span>Lessons</span>
        </button>
        <button type="button" className={tab === "library" ? "selected" : ""} onClick={() => setTab("library")}>
          <span className="material-symbols-outlined">menu_book</span>
          <span>Library</span>
        </button>
        <button type="button" className={tab === "practice" ? "selected" : ""} onClick={() => setTab("practice")}>
          <span className="material-symbols-outlined">rebase_edit</span>
          <span>Practice</span>
        </button>
      </nav>
    </div>
  );
}

function lessonThumbnailURL(lesson: Lesson): string {
  return `https://i.ytimg.com/vi/${lesson.youtubeVideoID}/hqdefault.jpg`;
}

function lessonProgressPercent(storage: AppStorage, lesson: Lesson): number {
  const session = getLessonSession(storage, lesson);
  if (lesson.segments.length <= 1) {
    return 100;
  }

  const rawProgress = ((session.lastPracticedSegmentIndex + 1) / lesson.segments.length) * 100;
  return Math.max(4, Math.min(100, Math.round(rawProgress)));
}

function formatDuration(duration: number): string {
  const totalSeconds = Math.max(0, Math.floor(duration));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default App;
