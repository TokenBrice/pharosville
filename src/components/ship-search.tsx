"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import Search from "lucide-react/dist/esm/icons/search";

export interface ShipSearchOption {
  detailId: string;
  title: string;
}

const MAX_VISIBLE_MATCHES = 8;

/**
 * Fleet search box: type a stablecoin name or id, pick a match, and the
 * world selects (and follows) that ship. All key events stop propagating so
 * typing never reaches the canvas camera/keyboard-cycling handlers.
 */
export function ShipSearch({
  options,
  onSelect,
}: {
  options: readonly ShipSearchOption[];
  onSelect: (detailId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return options
      .filter((option) => (
        option.title.toLowerCase().includes(needle)
        || option.detailId.toLowerCase().includes(needle)
      ))
      .slice(0, MAX_VISIBLE_MATCHES);
  }, [options, query]);

  const commitSelection = useCallback((option: ShipSearchOption) => {
    onSelect(option.detailId);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
  }, [onSelect]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    // Never let search keystrokes reach the world shell (camera pan/zoom and
    // Tab target-cycling listen on the shared onKeyDown).
    event.stopPropagation();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, matches.length - 1)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Enter") {
      const match = matches[activeIndex] ?? matches[0];
      if (match) {
        event.preventDefault();
        commitSelection(match);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      setOpen(false);
    }
  }, [activeIndex, commitSelection, matches]);

  const listboxId = "pharosville-ship-search-listbox";
  const showList = open && matches.length > 0;
  return (
    <div className="pharosville-ship-search" data-testid="pharosville-ship-search">
      <Search aria-hidden="true" size={15} className="pharosville-ship-search__icon" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Find a ship"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listboxId}-option-${activeIndex}` : undefined}
        placeholder="Find a ship…"
        value={query}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />
      <span className="sr-only" aria-live="polite">
        {query.trim() ? `${matches.length} matching ships` : ""}
      </span>
      {showList && (
        <ul className="pharosville-ship-search__results" id={listboxId} role="listbox" aria-label="Matching ships">
          {matches.map((option, index) => (
            <li
              key={option.detailId}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "pharosville-ship-search__option pharosville-ship-search__option--active" : "pharosville-ship-search__option"}
              // pointerdown (not click) so selection beats the input blur.
              onPointerDown={(event) => {
                event.preventDefault();
                commitSelection(option);
              }}
              onPointerEnter={() => setActiveIndex(index)}
            >
              {option.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
