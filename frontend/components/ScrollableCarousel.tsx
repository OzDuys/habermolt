"use client";

import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";

interface ScrollableCarouselProps {
  children: ReactNode;
  direction?: "horizontal" | "vertical";
  maxHeight?: string;
  className?: string;
}

export default function ScrollableCarousel({
  children,
  direction = "horizontal",
  maxHeight = "400px",
  className = "",
}: ScrollableCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollStart, setCanScrollStart] = useState(false);
  const [canScrollEnd, setCanScrollEnd] = useState(false);

  const isHorizontal = direction === "horizontal";

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (isHorizontal) {
      setCanScrollStart(el.scrollLeft > 2);
      setCanScrollEnd(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
    } else {
      setCanScrollStart(el.scrollTop > 2);
      setCanScrollEnd(el.scrollTop < el.scrollHeight - el.clientHeight - 2);
    }
  }, [isHorizontal]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", checkScroll);
      observer.disconnect();
    };
  }, [checkScroll]);

  const scroll = (dir: "start" | "end") => {
    const el = scrollRef.current;
    if (!el) return;

    const amount = isHorizontal ? el.clientWidth * 0.7 : el.clientHeight * 0.7;
    const delta = dir === "end" ? amount : -amount;

    el.scrollBy({
      [isHorizontal ? "left" : "top"]: delta,
      behavior: "smooth",
    });
  };

  return (
    <div className={`relative ${className}`}>
      {/* Start fade + arrow */}
      {canScrollStart && (
        <>
          <button
            type="button"
            onClick={() => scroll("start")}
            className={`absolute z-20 hidden items-center justify-center rounded-full shadow-md sm:flex ${
              isHorizontal
                ? "left-1 top-1/2 -translate-y-1/2 h-8 w-8"
                : "top-1 left-1/2 -translate-x-1/2 h-8 w-8"
            }`}
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}
            aria-label={`Scroll ${isHorizontal ? "left" : "up"}`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {isHorizontal ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              )}
            </svg>
          </button>
        </>
      )}

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className={`${
          isHorizontal
            ? "flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 [-webkit-overflow-scrolling:touch]"
            : "flex flex-col gap-4 overflow-y-auto pr-1"
        } [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
        style={!isHorizontal ? { maxHeight } : undefined}
      >
        {children}
      </div>

      {/* End fade + arrow */}
      {canScrollEnd && (
        <>
          <button
            type="button"
            onClick={() => scroll("end")}
            className={`absolute z-20 hidden items-center justify-center rounded-full shadow-md sm:flex ${
              isHorizontal
                ? "right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                : "bottom-1 left-1/2 -translate-x-1/2 h-8 w-8"
            }`}
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}
            aria-label={`Scroll ${isHorizontal ? "right" : "down"}`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {isHorizontal ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              )}
            </svg>
          </button>
        </>
      )}

      {/* Mobile scroll hint (visible on mobile only) */}
      {(canScrollEnd || canScrollStart) && (
        <p className="mt-1 text-center text-xs text-gray-400 sm:hidden">
          {isHorizontal ? "Swipe to see more →" : "Scroll to see more ↓"}
        </p>
      )}
    </div>
  );
}
