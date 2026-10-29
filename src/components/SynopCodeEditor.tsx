/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef, useRef, useImperativeHandle, useMemo, useState, useEffect, useCallback } from 'react';
import type { UtcSlot } from '../engine/observationStore.ts';
import {
  validateSynopBulletin,
  DEFAULT_CENTRAL_INDIA_LIMITS,
  type SynopValidationIssue,
  type ValidationContext,
} from '../parser/synopValidator.ts';
import { getStation, getAllStations } from '../constants/stationRegistry.ts';

interface SynopCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  utcSlot?: UtcSlot;
  reportingDate?: string;
  validationContext?: ValidationContext;
  syntaxHighlightingEnabled?: boolean;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
  height?: string | number;
  isModalMode?: boolean;
  isSearchOpen?: boolean;
  onToggleSearch?: () => void;
}

interface HighlightedToken {
  text: string;
  type: 'header' | 'station' | 'temp-dry' | 'temp-dew' | 'pressure' | 'rainfall' | 'sec333' | 'sec555' | 'tmax' | 'tmin' | 'terminator' | 'anomaly' | 'normal';
  anomalyMessage?: string;
  severity?: 'error' | 'warning';
  isCurrentSearchMatch?: boolean;
  isSearchMatch?: boolean;
}

interface SearchMatch {
  start: number;
  end: number;
  text: string;
}

export const SynopCodeEditor = forwardRef<HTMLTextAreaElement, SynopCodeEditorProps>(({
  value,
  onChange,
  utcSlot = '03Z',
  reportingDate,
  validationContext,
  syntaxHighlightingEnabled = true,
  disabled = false,
  placeholder,
  rows = 5,
  height,
  isModalMode = false,
  isSearchOpen: controlledSearchOpen,
  onToggleSearch,
}, forwardedRef) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(forwardedRef, () => textareaRef.current!);

  // Internal search state
  const [internalSearchOpen, setInternalSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);

  const searchOpen = controlledSearchOpen !== undefined ? controlledSearchOpen : internalSearchOpen;

  const handleToggleSearch = useCallback(() => {
    if (onToggleSearch) {
      onToggleSearch();
    } else {
      setInternalSearchOpen((prev) => !prev);
    }
  }, [onToggleSearch]);

  const handleCloseSearch = useCallback(() => {
    if (onToggleSearch && controlledSearchOpen) {
      onToggleSearch();
    } else {
      setInternalSearchOpen(false);
    }
    textareaRef.current?.focus();
  }, [onToggleSearch, controlledSearchOpen]);

  // Focus search input when search opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
    }
  }, [searchOpen]);

  // Synchronize scroll between textarea and syntax highlight backdrop
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (backdropRef.current) {
      backdropRef.current.scrollTop = e.currentTarget.scrollTop;
      backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  // Run validation on the current bulletin to identify anomalies
  const validationReport = useMemo(() => {
    if (!value.trim()) return null;
    return validateSynopBulletin(value, utcSlot, DEFAULT_CENTRAL_INDIA_LIMITS, validationContext);
  }, [value, utcSlot, validationContext]);

  // Extract map of anomalies by station and rawGroup
  const anomalyMap = useMemo(() => {
    const map = new Map<string, SynopValidationIssue>();
    if (!validationReport) return map;
    for (const issue of validationReport.allIssues) {
      if (issue.rawGroup) {
        map.set(`${issue.stationId}_${issue.rawGroup}`, issue);
      }
      if (issue.field) {
        map.set(`${issue.stationId}_field_${issue.field}`, issue);
      }
    }
    return map;
  }, [validationReport]);

  // Station name to ID map for search (e.g. "Nagpur" -> "42867")
  const stationNameToIdMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const stn of getAllStations()) {
      map.set(stn.name.toLowerCase(), stn.id);
    }
    return map;
  }, []);

  // Compute search matches in bulletin text
  const searchMatches = useMemo((): SearchMatch[] => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || !value) return [];

    const matches: SearchMatch[] = [];
    const valLower = value.toLowerCase();

    // 1. Direct text matches
    let startIndex = 0;
    while (startIndex < valLower.length) {
      const idx = valLower.indexOf(query, startIndex);
      if (idx === -1) break;
      matches.push({
        start: idx,
        end: idx + query.length,
        text: value.slice(idx, idx + query.length),
      });
      startIndex = idx + Math.max(1, query.length);
    }

    // 2. Also check if search query matches a station name (e.g. "Nagpur" -> search for code "42867")
    const matchedStationId = stationNameToIdMap.get(query);
    if (matchedStationId && matchedStationId !== query) {
      let stnStartIndex = 0;
      while (stnStartIndex < valLower.length) {
        const idx = valLower.indexOf(matchedStationId, stnStartIndex);
        if (idx === -1) break;
        // Don't add duplicate if already matched
        if (!matches.some((m) => m.start === idx)) {
          matches.push({
            start: idx,
            end: idx + matchedStationId.length,
            text: value.slice(idx, idx + matchedStationId.length),
          });
        }
        stnStartIndex = idx + matchedStationId.length;
      }
    }

    // Sort chronologically by starting character index
    matches.sort((a, b) => a.start - b.start);
    return matches;
  }, [searchQuery, value, stationNameToIdMap]);

  // Reset or clamp current match index
  useEffect(() => {
    if (searchMatches.length === 0) {
      setCurrentMatchIndex(0);
    } else if (currentMatchIndex >= searchMatches.length) {
      setCurrentMatchIndex(0);
    }
  }, [searchMatches, currentMatchIndex]);

  // Scroll and select active match
  const jumpToMatch = useCallback((index: number) => {
    if (searchMatches.length === 0 || !textareaRef.current) return;
    const safeIndex = (index + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(safeIndex);

    const match = searchMatches[safeIndex];
    const textarea = textareaRef.current;
    textarea.focus();
    textarea.setSelectionRange(match.start, match.end);

    // Approximate line offset for vertical scroll
    const textBefore = value.slice(0, match.start);
    const lineCount = textBefore.split('\n').length - 1;
    const targetScrollTop = Math.max(0, lineCount * 20 - 60);
    textarea.scrollTop = targetScrollTop;
    if (backdropRef.current) {
      backdropRef.current.scrollTop = targetScrollTop;
    }
  }, [searchMatches, value]);

  const handleNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    jumpToMatch(currentMatchIndex + 1);
  }, [searchMatches, currentMatchIndex, jumpToMatch]);

  const handlePrevMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    jumpToMatch(currentMatchIndex - 1);
  }, [searchMatches, currentMatchIndex, jumpToMatch]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrevMatch();
      } else {
        handleNextMatch();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCloseSearch();
    }
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+F or Cmd+F opens search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      if (!searchOpen) {
        handleToggleSearch();
      } else {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }
  };

  // Tokenize lines for backdrop highlighting
  const tokenizedLines = useMemo(() => {
    if (!syntaxHighlightingEnabled || !value) return null;

    const lines = value.split('\n');
    let currentStationId = 'UNKNOWN';
    let inSec333 = false;
    let inSec555 = false;
    let charOffset = 0;

    const activeMatch = searchMatches[currentMatchIndex];

    return lines.map((line) => {
      const lineStartOffset = charOffset;
      charOffset += line.length + 1; // +1 for the \n

      // Split preserving whitespace
      const tokensWithWhitespace = line.split(/(\s+|=[^\s]*)/g).filter(Boolean);
      let tokenOffsetInLine = 0;

      return tokensWithWhitespace.map((token, tIdx): HighlightedToken => {
        const tokenStart = lineStartOffset + tokenOffsetInLine;
        const tokenEnd = tokenStart + token.length;
        tokenOffsetInLine += token.length;

        // Check if token overlaps search match
        const isCurrentSearchMatch = Boolean(
          activeMatch &&
          activeMatch.start < tokenEnd &&
          activeMatch.end > tokenStart
        );
        const isSearchMatch = Boolean(
          searchMatches.some((m) => m.start < tokenEnd && m.end > tokenStart)
        );

        const trimmed = token.trim();
        if (!trimmed) {
          return { text: token, type: 'normal', isCurrentSearchMatch, isSearchMatch };
        }

        // Bulletin header
        if (/^AAXX$/i.test(trimmed) || (/^\d{4,5}$/.test(trimmed) && tIdx <= 2 && line.includes('AAXX'))) {
          return { text: token, type: 'header', isCurrentSearchMatch, isSearchMatch };
        }

        // Section markers
        if (trimmed === '333') {
          inSec333 = true;
          inSec555 = false;
          return { text: token, type: 'sec333', isCurrentSearchMatch, isSearchMatch };
        }
        if (trimmed === '555') {
          inSec555 = true;
          inSec333 = false;
          return { text: token, type: 'sec555', isCurrentSearchMatch, isSearchMatch };
        }

        // Telegram terminator
        if (trimmed === '=') {
          inSec333 = false;
          inSec555 = false;
          currentStationId = 'UNKNOWN';
          return { text: token, type: 'terminator', isCurrentSearchMatch, isSearchMatch };
        }

        // 5-digit station code
        if (/^\d{5}$/.test(trimmed) && (currentStationId === 'UNKNOWN' || tIdx === 0 || inSec333 || inSec555)) {
          const stn = getStation(trimmed);
          if (stn) {
            currentStationId = trimmed;
            inSec333 = false;
            inSec555 = false;
            return { text: token, type: 'station', isCurrentSearchMatch, isSearchMatch };
          }
        }

        // Check for identified anomaly on this group
        const groupAnomaly = anomalyMap.get(`${currentStationId}_${trimmed}`);
        if (groupAnomaly) {
          return {
            text: token,
            type: 'anomaly',
            anomalyMessage: groupAnomaly.message,
            severity: groupAnomaly.severity,
            isCurrentSearchMatch,
            isSearchMatch,
          };
        }

        // Group syntax classification
        if (!inSec333 && !inSec555) {
          if (/^1[01]\d{3}$/.test(trimmed)) {
            const ttt = parseInt(trimmed.substring(2), 10) / 10;
            const sign = trimmed[1] === '1' ? -1 : 1;
            const temp = sign * ttt;
            if (temp < 10 || temp > 50) {
              return { text: token, type: 'anomaly', anomalyMessage: `Abnormal Dry-Bulb Temp: ${temp}°C`, severity: 'error', isCurrentSearchMatch, isSearchMatch };
            }
            return { text: token, type: 'temp-dry', isCurrentSearchMatch, isSearchMatch };
          }
          if (/^2[01]\d{3}$/.test(trimmed)) {
            return { text: token, type: 'temp-dew', isCurrentSearchMatch, isSearchMatch };
          }
          if (/^[34]\d{4}$/.test(trimmed)) {
            return { text: token, type: 'pressure', isCurrentSearchMatch, isSearchMatch };
          }
          if (/^6\d{3}[1-9/]$/.test(trimmed)) {
            const rrr = parseInt(trimmed.substring(1, 4), 10);
            if (rrr > 600) {
              return { text: token, type: 'anomaly', anomalyMessage: `Abnormal Rainfall: ${rrr} mm (> 600 mm)`, severity: 'error', isCurrentSearchMatch, isSearchMatch };
            }
            return { text: token, type: 'rainfall', isCurrentSearchMatch, isSearchMatch };
          }
        } else if (inSec333) {
          if (/^1[01]\d{3}$/.test(trimmed)) {
            const ttt = parseInt(trimmed.substring(2), 10) / 10;
            const sign = trimmed[1] === '1' ? -1 : 1;
            const tmax = sign * ttt;
            if (tmax < 10 || tmax > 55) {
              return { text: token, type: 'anomaly', anomalyMessage: `Abnormal Tmax: ${tmax}°C (limits: 10-55°C)`, severity: 'error', isCurrentSearchMatch, isSearchMatch };
            }
            return { text: token, type: 'tmax', isCurrentSearchMatch, isSearchMatch };
          }
          if (/^2[01]\d{3}$/.test(trimmed)) {
            const ttt = parseInt(trimmed.substring(2), 10) / 10;
            const sign = trimmed[1] === '1' ? -1 : 1;
            const tmin = sign * ttt;
            if (tmin < -5 || tmin > 42) {
              return { text: token, type: 'anomaly', anomalyMessage: `Abnormal Tmin: ${tmin}°C (limits: -5 to 42°C)`, severity: 'error', isCurrentSearchMatch, isSearchMatch };
            }
            return { text: token, type: 'tmin', isCurrentSearchMatch, isSearchMatch };
          }
        } else if (inSec555) {
          if (/^0\d{4}$/.test(trimmed)) {
            const rVal = parseInt(trimmed.substring(1), 10) / 10;
            if (rVal > 600) {
              return { text: token, type: 'anomaly', anomalyMessage: `Abnormal Rainfall: ${rVal} mm (> 600 mm)`, severity: 'error', isCurrentSearchMatch, isSearchMatch };
            }
            return { text: token, type: 'rainfall', isCurrentSearchMatch, isSearchMatch };
          }
        }

        return { text: token, type: 'normal', isCurrentSearchMatch, isSearchMatch };
      });
    });
  }, [value, syntaxHighlightingEnabled, anomalyMap, searchMatches, currentMatchIndex]);

  // Extract anomaly summary list
  const anomalies = useMemo(() => {
    if (!validationReport) return [];
    return validationReport.allIssues.filter((i) => i.severity === 'error' || i.severity === 'warning');
  }, [validationReport]);

  const defaultHeight = isModalMode ? '460px' : (rows ? `${Math.max(rows * 24, 140)}px` : '150px');
  const boxHeight = height || defaultHeight;
  const minHeight = isModalMode ? '360px' : '110px';
  const maxHeight = isModalMode ? '64vh' : '260px';

  return (
    <div className="synop-code-editor-container" style={{ width: '100%', position: 'relative' }}>
      {/* Top Action Bar for Editor: Search Toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
        <button
          type="button"
          className={`synop-editor-search-toggle ${searchOpen ? 'active' : ''}`}
          onClick={handleToggleSearch}
          title="Search bulletin text (Ctrl+F)"
          aria-label="Search bulletin text"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Find (Ctrl+F)</span>
        </button>
      </div>

      {/* Editor Box */}
      <div
        className="synop-editor-box"
        style={{
          position: 'relative',
          width: '100%',
          height: boxHeight,
          minHeight,
          maxHeight,
          border: '1.5px solid var(--border-light)',
          borderRadius: '6px',
          backgroundColor: 'var(--bg-input, #ffffff)',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Floating Minimal Search Bar */}
        {searchOpen && (
          <div className="synop-search-bar" role="search" aria-label="Find in bulletin">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="synop-search-icon" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              className="synop-search-input"
              placeholder="Find code or station (e.g. 42867, Nagpur, 333)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              aria-label="Search text"
            />
            <span className="synop-search-count">
              {searchMatches.length > 0
                ? `${currentMatchIndex + 1}/${searchMatches.length}`
                : searchQuery.trim()
                ? '0/0'
                : ''}
            </span>
            <button
              type="button"
              className="synop-search-btn"
              onClick={handlePrevMatch}
              disabled={searchMatches.length === 0}
              title="Previous match (Shift+Enter)"
              aria-label="Previous match"
            >
              ▲
            </button>
            <button
              type="button"
              className="synop-search-btn"
              onClick={handleNextMatch}
              disabled={searchMatches.length === 0}
              title="Next match (Enter)"
              aria-label="Next match"
            >
              ▼
            </button>
            <button
              type="button"
              className="synop-search-close-btn"
              onClick={handleCloseSearch}
              title="Close search (Esc)"
              aria-label="Close search"
            >
              ✕
            </button>
          </div>
        )}

        {/* Syntax Highlighting Backdrop (Behind text, transparent glyphs with colored tinted pills/underlines) */}
        {syntaxHighlightingEnabled && tokenizedLines && (
          <div
            ref={backdropRef}
            aria-hidden="true"
            className="synop-highlight-backdrop"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              margin: 0,
              padding: '10px 12px',
              border: 'none',
              boxSizing: 'border-box',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: '13px',
              lineHeight: '20px',
              letterSpacing: '0px',
              tabSize: 4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              overflowWrap: 'break-word',
              overflowY: 'scroll',
              overflowX: 'hidden',
              scrollbarWidth: 'thin',
              scrollbarColor: 'transparent transparent',
              pointerEvents: 'none',
              color: 'transparent',
              zIndex: 1,
            }}
          >
            {tokenizedLines.map((lineTokens, lIdx) => (
              <div
                key={lIdx}
                style={{
                  margin: 0,
                  padding: 0,
                  lineHeight: '20px',
                  minHeight: '20px',
                }}
              >
                {lineTokens.length === 0 ? (
                  '\u00A0'
                ) : (
                  lineTokens.map((t, tIdx) => {
                    // Check search match styling first
                    if (t.isCurrentSearchMatch) {
                      return (
                        <mark
                          key={tIdx}
                          style={{
                            backgroundColor: 'rgba(245, 158, 11, 0.85)',
                            color: 'transparent',
                            borderRadius: '2px',
                            padding: '0 1px',
                          }}
                        >
                          {t.text}
                        </mark>
                      );
                    }
                    if (t.isSearchMatch) {
                      return (
                        <mark
                          key={tIdx}
                          style={{
                            backgroundColor: 'rgba(250, 204, 21, 0.45)',
                            color: 'transparent',
                            borderRadius: '2px',
                            padding: '0 1px',
                          }}
                        >
                          {t.text}
                        </mark>
                      );
                    }

                    if (t.type === 'normal') {
                      return <span key={tIdx}>{t.text}</span>;
                    }

                    if (t.type === 'anomaly') {
                      return (
                        <mark
                          key={tIdx}
                          style={{
                            backgroundColor: t.severity === 'error' ? 'rgba(239, 68, 68, 0.22)' : 'rgba(245, 158, 11, 0.22)',
                            color: 'transparent',
                            textDecoration: `underline wavy ${t.severity === 'error' ? '#ef4444' : '#f59e0b'}`,
                            textDecorationSkipInk: 'none',
                            padding: '0 1px',
                            margin: 0,
                            borderRadius: '2px',
                          }}
                          title={t.anomalyMessage}
                        >
                          {t.text}
                        </mark>
                      );
                    }

                    let bgTint = 'transparent';
                    if (t.type === 'header') bgTint = 'rgba(59, 130, 246, 0.12)';
                    else if (t.type === 'station') bgTint = 'rgba(2, 132, 199, 0.15)';
                    else if (t.type === 'sec333' || t.type === 'sec555') bgTint = 'rgba(217, 119, 6, 0.18)';
                    else if (t.type === 'temp-dry') bgTint = 'rgba(217, 119, 6, 0.12)';
                    else if (t.type === 'temp-dew') bgTint = 'rgba(13, 148, 136, 0.12)';
                    else if (t.type === 'tmax') bgTint = 'rgba(220, 38, 38, 0.12)';
                    else if (t.type === 'tmin') bgTint = 'rgba(37, 99, 235, 0.12)';
                    else if (t.type === 'rainfall') bgTint = 'rgba(21, 128, 61, 0.12)';
                    else if (t.type === 'pressure') bgTint = 'rgba(124, 58, 237, 0.12)';

                    return (
                      <mark
                        key={tIdx}
                        style={{
                          backgroundColor: bgTint,
                          color: 'transparent',
                          borderRadius: '2px',
                          padding: '0 1px',
                          margin: 0,
                        }}
                      >
                        {t.text}
                      </mark>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        )}

        {/* Primary Input Textarea: Fully visible text, native cursor locked directly to characters */}
        <textarea
          ref={textareaRef}
          id="synop-bulletin"
          className="control-textarea-synop"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleTextareaKeyDown}
          disabled={disabled}
          spellCheck={false}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            margin: 0,
            padding: '10px 12px',
            border: 'none',
            outline: 'none',
            boxSizing: 'border-box',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: '13px',
            lineHeight: '20px',
            letterSpacing: '0px',
            tabSize: 4,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            overflowWrap: 'break-word',
            overflowY: 'scroll',
            overflowX: 'hidden',
            scrollbarWidth: 'thin',
            resize: 'none',
            backgroundColor: 'transparent',
            color: 'var(--text-main, #1e293b)',
            caretColor: 'var(--text-main, #1e293b)',
            zIndex: 2,
          }}
        />
      </div>

      {/* Pre-submission Anomaly Warning Strip */}
      {anomalies.length > 0 && (
        <div
          className="synop-anomaly-strip"
          role="alert"
          style={{
            marginTop: '6px',
            padding: '6px 10px',
            backgroundColor: anomalies.some((a) => a.severity === 'error') ? '#fef2f2' : '#fffbeb',
            border: `1px solid ${anomalies.some((a) => a.severity === 'error') ? '#fca5a5' : '#fde68a'}`,
            borderRadius: '4px',
            fontSize: '0.75rem',
            color: anomalies.some((a) => a.severity === 'error') ? '#991b1b' : '#92400e',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 600 }}>
            <span>
              ⚠️ {anomalies.length} Anomaly{anomalies.length === 1 ? '' : 'ies'} Detected in SYNOP Bulletin:
            </span>
            <span style={{ fontSize: '0.6875rem' }}>
              {anomalies.filter((a) => a.severity === 'error').length} Error(s) &bull;{' '}
              {anomalies.filter((a) => a.severity === 'warning').length} Warning(s)
            </span>
          </div>
          <div style={{ maxHeight: '60px', overflowY: 'auto' }}>
            {anomalies.slice(0, 3).map((a, idx) => (
              <div key={idx} style={{ lineHeight: '1.3' }}>
                &bull; <strong>{a.stationId}{a.stationName ? ` (${a.stationName})` : ''}:</strong> {a.message}
              </div>
            ))}
            {anomalies.length > 3 && (
              <div style={{ fontStyle: 'italic', color: 'var(--text-muted, #64748b)' }}>
                ...and {anomalies.length - 3} more. Check SYNOP button below for complete breakdown.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

SynopCodeEditor.displayName = 'SynopCodeEditor';
