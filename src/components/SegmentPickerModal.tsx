import { useEffect } from "react";
import { formatTimestamp } from "../lib/practice";
import type { SegmentPickerMode, SentenceSegment } from "../lib/types";

interface SegmentPickerModalProps {
  open: boolean;
  mode: SegmentPickerMode;
  segments: SentenceSegment[];
  currentIndex: number;
  loopStartIndex: number;
  loopEndIndex: number;
  bookmarkedSegmentIndices: number[];
  showKorean: boolean;
  onClose: () => void;
  onSelect: (index: number) => void;
}

export function SegmentPickerModal({
  open,
  mode,
  segments,
  currentIndex,
  loopStartIndex,
  loopEndIndex,
  bookmarkedSegmentIndices,
  showKorean,
  onClose,
  onSelect
}: SegmentPickerModalProps): JSX.Element | null {
  const scrollTarget =
    mode === "rangeStart" ? loopStartIndex : mode === "rangeEnd" ? loopEndIndex : currentIndex;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const element = document.getElementById(`segment-${scrollTarget}`);
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, scrollTarget]);

  if (!open) {
    return null;
  }

  const title =
    mode === "rangeStart" ? "Range Start" : mode === "rangeEnd" ? "Range End" : "Segments";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Done
          </button>
        </div>

        <div className="segment-list">
          {segments.map((segment) => {
            const selected =
              mode === "rangeStart"
                ? segment.index === loopStartIndex
                : mode === "rangeEnd"
                  ? segment.index === loopEndIndex
                  : segment.index === currentIndex;

            return (
              <button
                type="button"
                key={segment.index}
                id={`segment-${segment.index}`}
                className={`segment-row ${selected ? "selected" : ""}`}
                onClick={() => onSelect(segment.index)}
              >
                <div className="segment-row-main">
                  <div className="segment-row-meta">
                    <span>#{segment.index + 1}</span>
                    <span>
                      {formatTimestamp(segment.startTime)} - {formatTimestamp(segment.endTime)}
                    </span>
                  </div>
                  <div className="segment-row-text">{segment.textEn}</div>
                  {showKorean && segment.textKo ? (
                    <div className="segment-row-subtext">{segment.textKo}</div>
                  ) : null}
                </div>
                {bookmarkedSegmentIndices.includes(segment.index) ? (
                  <span className="segment-row-bookmark">★</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
