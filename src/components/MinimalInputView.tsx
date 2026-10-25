/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { UtcSlot } from '../engine/observationStore.ts';
import type { ReportViewType } from './HamburgerMenu.tsx';
import { shiftDateString } from './SynopInput.tsx';
import {
  formatMinimalDateParts,
  type SlotStatusResult,
} from '../utils/observationStatus.ts';

interface MinimalInputViewProps {
  reportingDate: string;
  onReportingDateChange: (date: string) => void;
  status03Z: SlotStatusResult;
  status12Z: SlotStatusResult;
  onOpenSlot: (slot: UtcSlot) => void;
  onViewReport: (report: ReportViewType) => void;
  isGenerating?: boolean;
}

export const MinimalInputView: React.FC<MinimalInputViewProps> = ({
  reportingDate,
  onReportingDateChange,
  status03Z,
  status12Z,
  onOpenSlot,
  onViewReport,
  isGenerating = false,
}) => {
  const dateParts = formatMinimalDateParts(reportingDate);

  const handlePrevDay = () => {
    if (isGenerating || !reportingDate) return;
    onReportingDateChange(shiftDateString(reportingDate, -1));
  };

  const handleNextDay = () => {
    if (isGenerating || !reportingDate) return;
    onReportingDateChange(shiftDateString(reportingDate, 1));
  };

  return (
    <main className="minimal-view-container" aria-label="Minimal Operational Entry View">
      <div className="minimal-view-content">
        {/* ROW 1: All three elements side-by-side on wide screens, stacked on mobile */}
        <section className="minimal-top-grid" aria-label="Operational Date and Observation Submissions">
          {/* ELEMENT 1: Large Date Selector with Day, Month, Stepper Arrows & Calendar Icon */}
          <div
            className="minimal-date-card"
            aria-label="Operational Date Selection"
          >
            <div className="minimal-date-selector">
              <button
                type="button"
                className="minimal-arrow-btn"
                onClick={handlePrevDay}
                disabled={isGenerating || !reportingDate}
                title="Previous Day"
                aria-label="Previous Day"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <div className="minimal-date-display">
                <span className="minimal-day-number" aria-label={`Day ${dateParts.day}`}>
                  {dateParts.day}
                </span>
                <span className="minimal-month-name" aria-label={`Month ${dateParts.monthName} ${dateParts.year}`}>
                  {dateParts.monthName}
                </span>
              </div>

              <button
                type="button"
                className="minimal-arrow-btn"
                onClick={handleNextDay}
                disabled={isGenerating || !reportingDate}
                title="Next Day"
                aria-label="Next Day"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              <label
                className={`minimal-calendar-btn ${isGenerating ? 'disabled' : ''}`}
                title="Choose Custom Date"
                aria-label="Choose Custom Date"
              >
                <input
                  type="date"
                  className="minimal-native-date-overlay"
                  value={reportingDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      onReportingDateChange(e.target.value);
                    }
                  }}
                  disabled={isGenerating}
                  aria-label="Choose Custom Date"
                />
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </label>
            </div>
          </div>

          {/* ELEMENT 2: Submit 03Z (0830 IST) Observation */}
          <div className="minimal-action-section">
            <button
              type="button"
              className="minimal-submit-card"
              onClick={() => onOpenSlot('03Z')}
              disabled={isGenerating}
              aria-label="Submit 03Z (0830 IST) observation"
            >
              <div className="minimal-card-header">
                <span className="minimal-card-title">
                  Submit 03Z (0830 IST) observation
                </span>
                <div
                  className={`minimal-status-badge ${status03Z.isRecorded ? 'status-recorded' : 'status-pending'}`}
                  aria-label={`03Z status: ${status03Z.statusLabel}`}
                >
                  {status03Z.isRecorded ? (
                    <>
                      <span className="status-indicator-dot" aria-hidden="true">✓</span>
                      <span>{status03Z.statusLabel}</span>
                    </>
                  ) : (
                    <>
                      <span className="status-indicator-dot" aria-hidden="true">○</span>
                      <span>Pending submission</span>
                    </>
                  )}
                </div>
              </div>
              <div className="minimal-card-chevron" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          </div>

          {/* ELEMENT 3: Submit 12Z (1730 IST) Observation */}
          <div className="minimal-action-section">
            <button
              type="button"
              className="minimal-submit-card"
              onClick={() => onOpenSlot('12Z')}
              disabled={isGenerating}
              aria-label="Submit 12Z (1730 IST) observation"
            >
              <div className="minimal-card-header">
                <span className="minimal-card-title">
                  Submit 12Z (1730 IST) observation
                </span>
                <div
                  className={`minimal-status-badge ${status12Z.isRecorded ? 'status-recorded' : 'status-pending'}`}
                  aria-label={`12Z status: ${status12Z.statusLabel}`}
                >
                  {status12Z.isRecorded ? (
                    <>
                      <span className="status-indicator-dot" aria-hidden="true">✓</span>
                      <span>{status12Z.statusLabel}</span>
                    </>
                  ) : (
                    <>
                      <span className="status-indicator-dot" aria-hidden="true">○</span>
                      <span>Pending submission</span>
                    </>
                  )}
                </div>
              </div>
              <div className="minimal-card-chevron" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          </div>
        </section>

        {/* ROW 2: Three Report Navigation Buttons below */}
        <section className="minimal-reports-section" aria-label="Operational Reports Navigation">
          <div className="minimal-reports-header">
            <h3 className="minimal-reports-heading">Operational Reports</h3>
            <span className="minimal-reports-subtext">View reports for {reportingDate}</span>
          </div>

          <div className="minimal-reports-grid">
            {/* Report 1: Consolidated Observation Report */}
            <button
              type="button"
              className="minimal-report-card"
              onClick={() => onViewReport('consolidated')}
              aria-label="View Consolidated Observation Report"
            >
              <div className="minimal-report-card-content">
                <div className="minimal-report-card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="3" y1="15" x2="21" y2="15" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                  </svg>
                </div>
                <div className="minimal-report-card-text">
                  <span className="minimal-report-card-title">Consolidated Observation Report</span>
                  <span className="minimal-report-card-desc">All observatories with 24h temp changes, departures & rainfall</span>
                </div>
              </div>
              <div className="minimal-report-card-arrow" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>

            {/* Report 2: Weather Summary Report */}
            <button
              type="button"
              className="minimal-report-card"
              onClick={() => onViewReport('summary')}
              aria-label="View Weather Summary Report"
            >
              <div className="minimal-report-card-content">
                <div className="minimal-report-card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </div>
                <div className="minimal-report-card-text">
                  <span className="minimal-report-card-title">Weather Summary Report</span>
                  <span className="minimal-report-card-desc">Subdivision weather summaries, extremes & spatial rainfall distribution</span>
                </div>
              </div>
              <div className="minimal-report-card-arrow" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>

            {/* Report 3: Subdivision-wise Observation Report */}
            <button
              type="button"
              className="minimal-report-card"
              onClick={() => onViewReport('subdivision')}
              aria-label="View Subdivision-wise Observation Report (Vidarbha default)"
            >
              <div className="minimal-report-card-content">
                <div className="minimal-report-card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                    <line x1="8" y1="2" x2="8" y2="18" />
                    <line x1="16" y1="6" x2="16" y2="22" />
                  </svg>
                </div>
                <div className="minimal-report-card-text">
                  <span className="minimal-report-card-title">Subdivision-wise Observation Report</span>
                  <span className="minimal-report-card-desc">Regional subdivision cards with Vidarbha focused by default</span>
                </div>
              </div>
              <div className="minimal-report-card-arrow" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          </div>
        </section>
      </div>
    </main>
  );
};
