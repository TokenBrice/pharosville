"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import Search from "lucide-react/dist/esm/icons/search";
import { matchQuickFindCandidates, type QuickFindCandidate } from "../systems/quick-find-match";

export interface QuickFindProps {
  candidates: readonly QuickFindCandidate[];
  onClose: () => void;
  /** Selects the entity in the world; the caller owns camera and announcement. */
  onSelect: (detailId: string) => void;
}

const INPUT_ID = "pharosville-quick-find-input";
const LIST_ID = "pharosville-quick-find-results";

const optionId = (index: number): string => `pharosville-quick-find-option-${index}`;

/**
 * Typeahead over the fleet and the harbours. Mounted only while open, so
 * focus lands on the field on mount and returns to the world shell on close.
 * Keys it handles stop propagating: the world shell's own Escape and arrow
 * handlers sit on the same subtree.
 */
export function QuickFind({ candidates, onClose, onSelect }: QuickFindProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    return () => {
      document.querySelector<HTMLElement>('[data-testid="pharosville-world"]')?.focus({ preventScroll: true });
    };
  }, []);

  const matches = useMemo(() => matchQuickFindCandidates(candidates, query), [candidates, query]);
  const activeMatchIndex = matches.length === 0 ? -1 : Math.min(activeIndex, matches.length - 1);

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setActiveIndex(0);
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const match = matches[activeMatchIndex];
      if (match) onSelect(match.detailId);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      if (matches.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(Math.max(0, Math.min(matches.length - 1, activeMatchIndex + step)));
    }
  }, [activeMatchIndex, matches, onClose, onSelect]);

  const hasQuery = query.trim().length > 0;

  return (
    <div
      className="pharosville-quick-find"
      data-testid="pharosville-quick-find"
      onKeyDown={handleKeyDown}
    >
      <div className="pharosville-quick-find__field">
        <Search className="pharosville-quick-find__icon" aria-hidden="true" size={14} />
        <label className="sr-only" htmlFor={INPUT_ID}>Find a ship or harbor by name</label>
        <input
          ref={inputRef}
          id={INPUT_ID}
          className="pharosville-quick-find__input"
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          placeholder="Find a ship or harbor"
          aria-autocomplete="list"
          aria-controls={LIST_ID}
          aria-expanded={matches.length > 0}
          {...(activeMatchIndex >= 0 ? { "aria-activedescendant": optionId(activeMatchIndex) } : {})}
          value={query}
          onChange={handleChange}
        />
      </div>
      <ul
        id={LIST_ID}
        className="pharosville-quick-find__results"
        role="listbox"
        aria-label="Matching ships and harbors"
        hidden={matches.length === 0}
      >
        {matches.map((match, index) => (
          <li
            key={match.detailId}
            id={optionId(index)}
            className={index === activeMatchIndex
              ? "pharosville-quick-find__result pharosville-quick-find__result--active"
              : "pharosville-quick-find__result"}
            role="option"
            aria-selected={index === activeMatchIndex}
            onClick={() => onSelect(match.detailId)}
          >
            <span className="pharosville-quick-find__name">{match.symbol ?? match.label}</span>
            <span className="pharosville-quick-find__meta">
              {match.symbol ? `${match.label} · ${match.kindLabel}` : match.kindLabel}
            </span>
          </li>
        ))}
      </ul>
      {hasQuery && matches.length === 0 && (
        <p className="pharosville-quick-find__empty">No ship or harbor by that name.</p>
      )}
      {/* The listbox alone leaves non-visual readers without a count; this
          says how many matches the typing produced and how to walk them. */}
      <p className="sr-only" role="status">
        {hasQuery ? quickFindResultSummary(matches.length) : ""}
      </p>
    </div>
  );
}

function quickFindResultSummary(count: number): string {
  if (count === 0) return "No matches.";
  const noun = count === 1 ? "match" : "matches";
  return `${count} ${noun}. Use the up and down arrows to move, Enter to select.`;
}
