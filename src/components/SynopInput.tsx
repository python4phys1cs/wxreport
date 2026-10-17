/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef, useState, useEffect, useCallback } from 'react';
import type { UtcSlot } from '../engine/observationStore.ts';
import {
  validateSynopBulletin,
  DEFAULT_CENTRAL_INDIA_LIMITS,
  type SynopBulletinValidationReport,
  type SynopValidationLimits,
} from '../parser/synopValidator.ts';

interface SynopInputProps {
  reportingDate: string;
  onReportingDateChange: (date: string) => void;
  utcSlot?: UtcSlot;
  onUtcSlotChange?: (slot: UtcSlot) => void;
  synopText: string;
  onSynopTextChange: (text: string) => void;
  onGenerate: () => void;
  onRevisedStationCode?: () => void;
  onClear: () => void;
  isGenerating: boolean;
  errorMessage: string | null;
  dueReminderText?: string | null;
}

/**
 * Offsets a YYYY-MM-DD date string by a given number of days.
 * Uses UTC arithmetic to avoid local browser timezone anomalies,
 * handling month, year, and leap-year transitions deterministically.
 */
export function shiftDateString(dateStr: string, dayDelta: number): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const parts = dateStr.split('-').map(Number);
  const [year, month, day] = parts;
  const d = new Date(Date.UTC(year, month - 1, day + dayDelta));
  const newYear = d.getUTCFullYear();
  const newMonth = String(d.getUTCMonth() + 1).padStart(2, '0');
  const newDay = String(d.getUTCDate()).padStart(2, '0');
  return `${newYear}-${newMonth}-${newDay}`;
}

export const SynopInput = forwardRef<HTMLTextAreaElement, SynopInputProps>(({
  reportingDate,
  onReportingDateChange,
  utcSlot = '03Z',
  onUtcSlotChange,
  synopText,
  onSynopTextChange,
  onGenerate,
  onRevisedStationCode,
  onClear,
  isGenerating,
  errorMessage,
  dueReminderText,
}, ref) => {
  const is03Z = utcSlot === '03Z';

  // SYNOP Checker state
  const [isCheckerOpen, setIsCheckerOpen] = useState<boolean>(false);
  const [validationReport, setValidationReport] = useState<SynopBulletinValidationReport | null>(null);
  const [limits, setLimits] = useState<SynopValidationLimits>(DEFAULT_CENTRAL_INDIA_LIMITS);
  const [showConfigLimits, setShowConfigLimits] = useState<boolean>(false);

  const runValidation = useCallback(
    (text: string, slot: UtcSlot, currentLimits: SynopValidationLimits) => {
      if (!text.trim()) {
        setValidationReport(null);
        return;
      }
      const report = validateSynopBulletin(text, slot, currentLimits);
      setValidationReport(report);
    },
    []
  );

  const handleToggleChecker = () => {
    if (!isCheckerOpen) {
      setIsCheckerOpen(true);
      runValidation(synopText, utcSlot, limits);
    } else {
      setIsCheckerOpen(false);
    }
  };

  const handleRecheck = () => {
    runValidation(synopText, utcSlot, limits);
  };

  // Re-run validation if checker is open and synopText / utcSlot changes
  useEffect(() => {
    if (isCheckerOpen) {
      runValidation(synopText, utcSlot, limits);
    }
  }, [synopText, utcSlot, limits, isCheckerOpen, runValidation]);

  const handleLocalClear = () => {
    setValidationReport(null);
    setIsCheckerOpen(false);
    onClear();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate();
  };

  return (
    <section className="controls-panel no-print" aria-label="Operational Data Entry">
      <form onSubmit={handleSubmit}>
        <div className="controls-top-row">
          {/* Single Reporting Date Control with Day Arrows */}
          <div className="control-group date-group">
            <label htmlFor="reporting-date" className="control-label">
              Reporting Date:
            </label>
            <div className="date-input-nav-wrapper">
              <button
                type="button"
                className="btn-date-nav btn-date-prev"
                onClick={() => onReportingDateChange(shiftDateString(reportingDate, -1))}
                disabled={isGenerating || !reportingDate}
                title="Previous Day (Back 1 day)"
                aria-label="Previous Day"
              >
                ◀
              </button>
              <input
                id="reporting-date"
                type="date"
                className="control-input-date"
                value={reportingDate}
                onChange={(e) => onReportingDateChange(e.target.value)}
                disabled={isGenerating}
                required
              />
              <button
                type="button"
                className="btn-date-nav btn-date-next"
                onClick={() => onReportingDateChange(shiftDateString(reportingDate, 1))}
                disabled={isGenerating || !reportingDate}
                title="Next Day (Forward 1 day)"
                aria-label="Next Day"
              >
                ▶
              </button>
            </div>
          </div>

          {/* Observation Slot Selection */}
          <div className="control-group slot-group">
            <div className="slot-label-row">
              <label className="control-label">
                Observation Slot:
              </label>
              {dueReminderText && (
                <span className="due-observation-hint" role="status">
                  &bull; {dueReminderText}
                </span>
              )}
            </div>
            <div className="utc-toggle" role="radiogroup" aria-label="Observation Slot">
              <button
                type="button"
                role="radio"
                aria-checked={is03Z}
                className={`btn-utc-toggle ${is03Z ? 'active' : ''}`}
                onClick={() => onUtcSlotChange?.('03Z')}
                disabled={isGenerating}
              >
                03 UTC (0830 IST)
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!is03Z}
                className={`btn-utc-toggle ${!is03Z ? 'active' : ''}`}
                onClick={() => onUtcSlotChange?.('12Z')}
                disabled={isGenerating}
              >
                12 UTC (1730 IST)
              </button>
            </div>
          </div>
        </div>

        {/* Monospace SYNOP Bulletin Textarea */}
        <div className="control-group textarea-group">
          <div className="textarea-header-row">
            <label htmlFor="synop-bulletin" className="control-label">
              {is03Z ? '03 UTC SYNOP Bulletin (0830 IST Observation):' : '12 UTC SYNOP Bulletin (1730 IST Observation):'}
            </label>
          </div>
          <textarea
            ref={ref}
            id="synop-bulletin"
            className="control-textarea-synop"
            rows={5}
            placeholder={
              is03Z
                ? 'Paste raw 03 UTC SYNOP bulletin here (AAXX 01034 42933 ...)...'
                : 'Paste raw 12 UTC SYNOP bulletin here (AAXX 01124 42933 ...)...'
            }
            value={synopText}
            onChange={(e) => onSynopTextChange(e.target.value)}
            disabled={isGenerating}
            spellCheck={false}
          />
        </div>

        {/* Compact SYNOP Checker Utility Panel */}
        {isCheckerOpen && (
          <div className="synop-checker-panel" role="region" aria-label="SYNOP Validation Results">
            <div className="checker-panel-top">
              <div className="checker-panel-title">
                <strong>SYNOP Checker ({utcSlot})</strong>
                {validationReport && (
                  <span className="checker-summary-stats">
                    {validationReport.totalTelegrams} telegram{validationReport.totalTelegrams === 1 ? '' : 's'} &bull;{' '}
                    <span className={validationReport.errorCount > 0 ? 'text-danger' : 'text-success'}>
                      {validationReport.errorCount} Error{validationReport.errorCount === 1 ? '' : 's'}
                    </span>{' '}
                    &bull;{' '}
                    <span className={validationReport.warningCount > 0 ? 'text-warning' : 'text-muted'}>
                      {validationReport.warningCount} Warning{validationReport.warningCount === 1 ? '' : 's'}
                    </span>
                  </span>
                )}
              </div>
              <div className="checker-panel-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={handleRecheck}
                  disabled={!synopText.trim()}
                  title="Revalidate bulletin after editing text above"
                >
                  ↻ Recheck
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setShowConfigLimits(!showConfigLimits)}
                  title="Configure Central India plausibility limits"
                >
                  ⚙ Limits
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs btn-close-checker"
                  onClick={() => setIsCheckerOpen(false)}
                  aria-label="Close SYNOP checker"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Configurable Central India Plausibility Limits Expander */}
            {showConfigLimits && (
              <div className="checker-limits-config">
                <div className="limits-config-subhead">
                  Central India Plausibility Limits (Editable):
                </div>
                <div className="limits-config-grid">
                  <label className="limit-input-label">
                    <span>Tmax Lower Bound:</span>
                    <input
                      type="number"
                      step="1"
                      className="limit-input"
                      value={limits.tmaxMinPlausible}
                      onChange={(e) =>
                        setLimits((prev) => ({ ...prev, tmaxMinPlausible: parseFloat(e.target.value) || 10 }))
                      }
                    />
                    <small>°C (Error)</small>
                  </label>
                  <label className="limit-input-label">
                    <span>Tmax Upper Bound:</span>
                    <input
                      type="number"
                      step="1"
                      className="limit-input"
                      value={limits.tmaxMaxPlausible}
                      onChange={(e) =>
                        setLimits((prev) => ({ ...prev, tmaxMaxPlausible: parseFloat(e.target.value) || 55 }))
                      }
                    />
                    <small>°C (Error)</small>
                  </label>
                  <label className="limit-input-label">
                    <span>Tmax Warning High:</span>
                    <input
                      type="number"
                      step="1"
                      className="limit-input"
                      value={limits.tmaxWarningHigh}
                      onChange={(e) =>
                        setLimits((prev) => ({ ...prev, tmaxWarningHigh: parseFloat(e.target.value) || 48 }))
                      }
                    />
                    <small>°C (Warn)</small>
                  </label>
                  <label className="limit-input-label">
                    <span>Tmin Upper Bound:</span>
                    <input
                      type="number"
                      step="1"
                      className="limit-input"
                      value={limits.tminMaxPlausible}
                      onChange={(e) =>
                        setLimits((prev) => ({ ...prev, tminMaxPlausible: parseFloat(e.target.value) || 42 }))
                      }
                    />
                    <small>°C (Error)</small>
                  </label>
                  <label className="limit-input-label">
                    <span>Tmin Lower Bound:</span>
                    <input
                      type="number"
                      step="1"
                      className="limit-input"
                      value={limits.tminMinPlausible}
                      onChange={(e) =>
                        setLimits((prev) => ({ ...prev, tminMinPlausible: parseFloat(e.target.value) || -5 }))
                      }
                    />
                    <small>°C (Error)</small>
                  </label>
                  <label className="limit-input-label">
                    <span>Rainfall Max Limit:</span>
                    <input
                      type="number"
                      step="10"
                      className="limit-input"
                      value={limits.rainfallMaxPlausible}
                      onChange={(e) =>
                        setLimits((prev) => ({ ...prev, rainfallMaxPlausible: parseFloat(e.target.value) || 600 }))
                      }
                    />
                    <small>mm (Error)</small>
                  </label>
                </div>
                <div style={{ marginTop: '0.25rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => setLimits(DEFAULT_CENTRAL_INDIA_LIMITS)}
                  >
                    Reset Defaults
                  </button>
                </div>
              </div>
            )}

            {/* Validation Findings */}
            {validationReport ? (
              validationReport.allIssues.length === 0 ? (
                <div className="checker-clean-message" role="status">
                  ✓ All {validationReport.totalTelegrams} station telegrams passed syntax &amp; plausibility checks.
                </div>
              ) : (
                <div className="checker-issues-scroll">
                  <table className="checker-issues-table">
                    <thead>
                      <tr>
                        <th style={{ width: '70px' }}>Level</th>
                        <th style={{ width: '130px' }}>Station</th>
                        <th style={{ width: '80px' }}>Group</th>
                        <th style={{ width: '110px' }}>Decoded</th>
                        <th>Diagnostic Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationReport.allIssues.map((issue, idx) => (
                        <tr key={idx} className={`issue-row-${issue.severity}`}>
                          <td>
                            <span className={`checker-badge checker-badge-${issue.severity}`}>
                              {issue.severity.toUpperCase()}
                            </span>
                          </td>
                          <td className="station-cell">
                            <strong>{issue.stationId}</strong>
                            {issue.stationName && (
                              <span className="station-subname"> ({issue.stationName})</span>
                            )}
                          </td>
                          <td>
                            {issue.rawGroup ? (
                              <code className="checker-group-code">{issue.rawGroup}</code>
                            ) : (
                              <span className="text-muted">---</span>
                            )}
                          </td>
                          <td>
                            {issue.decodedValue !== undefined && issue.decodedValue !== null ? (
                              <span className="checker-decoded-val">{String(issue.decodedValue)}</span>
                            ) : (
                              <span className="text-muted">---</span>
                            )}
                          </td>
                          <td className="reason-cell">{issue.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div className="checker-clean-message text-muted">
                Enter SYNOP bulletin text to check syntax and plausibility.
              </div>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="alert-error" role="alert">
            {errorMessage}
          </div>
        )}

        <div className="button-row">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isGenerating || !synopText.trim() || !reportingDate.trim()}
          >
            {isGenerating ? 'Processing...' : `Process ${utcSlot} & Generate`}
          </button>

          <button
            type="button"
            className={`btn btn-secondary ${isCheckerOpen ? 'active' : ''}`}
            onClick={handleToggleChecker}
            disabled={isGenerating || !synopText.trim()}
            title="Validate syntax, temperature limits, rainfall plausibility, and duplicate station codes before committing"
          >
            <span>🔍 Check SYNOP</span>
            {validationReport && validationReport.errorCount > 0 && (
              <span className="checker-pill-error">{validationReport.errorCount}</span>
            )}
            {validationReport && validationReport.errorCount === 0 && validationReport.warningCount > 0 && (
              <span className="checker-pill-warning">{validationReport.warningCount}</span>
            )}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleLocalClear}
            disabled={isGenerating || (!synopText && !errorMessage && !isCheckerOpen)}
          >
            Clear
          </button>
        </div>
      </form>
    </section>
  );
});

SynopInput.displayName = 'SynopInput';
