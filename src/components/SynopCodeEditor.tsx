/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef, useRef, useImperativeHandle, useMemo, useEffect } from 'react';
import type { UtcSlot } from '../engine/observationStore.ts';
import {
  validateSynopBulletin,
  DEFAULT_CENTRAL_INDIA_LIMITS,
  type SynopValidationIssue,
  type ValidationContext,
} from '../parser/synopValidator.ts';
import { getStation } from '../constants/stationRegistry.ts';

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
}

interface HighlightedToken {
  text: string;
  type: 'header' | 'station' | 'temp-dry' | 'temp-dew' | 'pressure' | 'rainfall' | 'sec333' | 'sec555' | 'tmax' | 'tmin' | 'terminator' | 'anomaly' | 'normal';
  anomalyMessage?: string;
  severity?: 'error' | 'warning';
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
}, forwardedRef) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(forwardedRef, () => textareaRef.current!);

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

  // Tokenize and annotate tokens with syntax colors and anomaly flags
  const tokenizedLines = useMemo(() => {
    if (!syntaxHighlightingEnabled || !value) return null;

    const lines = value.split('\n');
    let currentStationId = 'UNKNOWN';
    let inSec333 = false;
    let inSec555 = false;

    return lines.map((line) => {
      // Split preserving spaces
      const tokensWithWhitespace = line.split(/(\s+|=[^\s]*)/g).filter(Boolean);

      return tokensWithWhitespace.map((token, tIdx): HighlightedToken => {
        const trimmed = token.trim();
        if (!trimmed) {
          return { text: token, type: 'normal' };
        }

        // Bulletin header
        if (/^AAXX$/i.test(trimmed) || /^\d{4,5}$/.test(trimmed) && tIdx <= 2 && line.includes('AAXX')) {
          return { text: token, type: 'header' };
        }

        // Section markers
        if (trimmed === '333') {
          inSec333 = true;
          inSec555 = false;
          return { text: token, type: 'sec333' };
        }
        if (trimmed === '555') {
          inSec555 = true;
          inSec333 = false;
          return { text: token, type: 'sec555' };
        }

        // Telegram terminator
        if (trimmed === '=') {
          inSec333 = false;
          inSec555 = false;
          currentStationId = 'UNKNOWN';
          return { text: token, type: 'terminator' };
        }

        // 5-digit station code (starts telegram)
        if (/^\d{5}$/.test(trimmed) && (currentStationId === 'UNKNOWN' || tIdx === 0)) {
          const stn = getStation(trimmed);
          if (stn) {
            currentStationId = trimmed;
            return { text: token, type: 'station' };
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
          };
        }

        // Group syntax classification
        if (!inSec333 && !inSec555) {
          if (/^1[01]\d{3}$/.test(trimmed)) {
            // Dry bulb
            const ttt = parseInt(trimmed.substring(2), 10) / 10;
            const sign = trimmed[1] === '1' ? -1 : 1;
            const temp = sign * ttt;
            if (temp < 10 || temp > 50) {
              return { text: token, type: 'anomaly', anomalyMessage: `Abnormal Dry-Bulb Temp: ${temp}°C`, severity: 'error' };
            }
            return { text: token, type: 'temp-dry' };
          }
          if (/^2[01]\d{3}$/.test(trimmed)) {
            // Dew point
            return { text: token, type: 'temp-dew' };
          }
          if (/^[34]\d{4}$/.test(trimmed)) {
            // Pressure group
            return { text: token, type: 'pressure' };
          }
          if (/^6\d{3}[1-9/]$/.test(trimmed)) {
            // Rainfall Section 1
            const rrr = parseInt(trimmed.substring(1, 4), 10);
            if (rrr > 600) {
              return { text: token, type: 'anomaly', anomalyMessage: `Abnormal Rainfall: ${rrr} mm (> 600 mm)`, severity: 'error' };
            }
            return { text: token, type: 'rainfall' };
          }
        } else if (inSec333) {
          if (/^1[01]\d{3}$/.test(trimmed)) {
            // Tmax
            const ttt = parseInt(trimmed.substring(2), 10) / 10;
            const sign = trimmed[1] === '1' ? -1 : 1;
            const tmax = sign * ttt;
            if (tmax < 10 || tmax > 55) {
              return { text: token, type: 'anomaly', anomalyMessage: `Abnormal Tmax: ${tmax}°C (limits: 10-55°C)`, severity: 'error' };
            }
            return { text: token, type: 'tmax' };
          }
          if (/^2[01]\d{3}$/.test(trimmed)) {
            // Tmin
            const ttt = parseInt(trimmed.substring(2), 10) / 10;
            const sign = trimmed[1] === '1' ? -1 : 1;
            const tmin = sign * ttt;
            if (tmin < -5 || tmin > 42) {
              return { text: token, type: 'anomaly', anomalyMessage: `Abnormal Tmin: ${tmin}°C (limits: -5 to 42°C)`, severity: 'error' };
            }
            return { text: token, type: 'tmin' };
          }
        } else if (inSec555) {
          if (/^0\d{4}$/.test(trimmed)) {
            // Rainfall Section 555
            const rVal = parseInt(trimmed.substring(1), 10) / 10;
            if (rVal > 600) {
              return { text: token, type: 'anomaly', anomalyMessage: `Abnormal Rainfall: ${rVal} mm (> 600 mm)`, severity: 'error' };
            }
            return { text: token, type: 'rainfall' };
          }
        }

        return { text: token, type: 'normal' };
      });
    });
  }, [value, syntaxHighlightingEnabled, anomalyMap]);

  // Extract anomaly summary list
  const anomalies = useMemo(() => {
    if (!validationReport) return [];
    return validationReport.allIssues.filter((i) => i.severity === 'error' || i.severity === 'warning');
  }, [validationReport]);

  return (
    <div className="synop-code-editor-container" style={{ position: 'relative', width: '100%' }}>
      {/* Syntax Highlighting Backdrop */}
      {syntaxHighlightingEnabled && tokenizedLines && (
        <div
          ref={backdropRef}
          aria-hidden="true"
          className="synop-highlight-backdrop"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            padding: '8px 12px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: '0.8125rem',
            lineHeight: '1.45',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'hidden',
            pointerEvents: 'none',
            color: 'var(--text-main, #1e293b)',
            borderRadius: '4px',
            boxSizing: 'border-box',
          }}
        >
          {tokenizedLines.map((lineTokens, lIdx) => (
            <div key={lIdx}>
              {lineTokens.map((t, tIdx) => {
                if (t.type === 'normal') {
                  return <span key={tIdx}>{t.text}</span>;
                }
                if (t.type === 'anomaly') {
                  return (
                    <mark
                      key={tIdx}
                      style={{
                        backgroundColor: t.severity === 'error' ? '#fee2e2' : '#fef3c7',
                        color: t.severity === 'error' ? '#991b1b' : '#92400e',
                        borderBottom: t.severity === 'error' ? '2px solid #ef4444' : '2px dashed #f59e0b',
                        padding: '1px 2px',
                        borderRadius: '2px',
                        fontWeight: 600,
                      }}
                      title={t.anomalyMessage}
                    >
                      {t.text}
                    </mark>
                  );
                }
                let color = 'inherit';
                let fontWeight = 400;
                if (t.type === 'header') {
                  color = '#0284c7';
                  fontWeight = 700;
                } else if (t.type === 'station') {
                  color = '#0369a1';
                  fontWeight = 700;
                } else if (t.type === 'sec333' || t.type === 'sec555') {
                  color = '#b45309';
                  fontWeight = 700;
                } else if (t.type === 'temp-dry') {
                  color = '#d97706';
                } else if (t.type === 'temp-dew') {
                  color = '#0d9488';
                } else if (t.type === 'tmax') {
                  color = '#dc2626';
                  fontWeight = 600;
                } else if (t.type === 'tmin') {
                  color = '#2563eb';
                  fontWeight = 600;
                } else if (t.type === 'rainfall') {
                  color = '#15803d';
                  fontWeight = 600;
                } else if (t.type === 'pressure') {
                  color = '#7c3aed';
                } else if (t.type === 'terminator') {
                  color = '#64748b';
                  fontWeight = 700;
                }

                return (
                  <span
                    key={tIdx}
                    style={{
                      color,
                      fontWeight,
                    }}
                  >
                    {t.text}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Primary Input Textarea */}
      <textarea
        ref={textareaRef}
        id="synop-bulletin"
        className={`control-textarea-synop ${syntaxHighlightingEnabled ? 'synop-textarea-highlighted' : ''}`}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        disabled={disabled}
        spellCheck={false}
        style={{
          position: 'relative',
          width: '100%',
          backgroundColor: syntaxHighlightingEnabled ? 'transparent' : undefined,
          color: syntaxHighlightingEnabled ? 'transparent' : undefined,
          caretColor: 'var(--text-main, #1e293b)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: '0.8125rem',
          lineHeight: '1.45',
          boxSizing: 'border-box',
          padding: '8px 12px',
          zIndex: 1,
        }}
      />

      {/* Pre-submission Anomaly Warning Strip */}
      {anomalies.length > 0 && (
        <div
          className="synop-anomaly-strip"
          role="alert"
          style={{
            marginTop: '4px',
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
              ⚠️ {anomalies.length} Anomaly{anomalies.length === 1 ? '' : 'ies'} Detected in SYNOP Bulletin before Submission:
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
