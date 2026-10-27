/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { UtcSlot } from '../engine/observationStore.ts';
import { formatOperationalDate } from '../utils/timeSlot.ts';

interface ReportToolbarProps {
  reportTitle: string;
  reportingDate: string;
  eveningDate?: string;
  onPrint: () => void;
  reportSlot?: UtcSlot;
  onReportSlotChange?: (slot: UtcSlot) => void;
  showSlotToggle?: boolean;
}

export const ReportToolbar: React.FC<ReportToolbarProps> = ({
  reportTitle,
  reportingDate,
  eveningDate,
  onPrint,
  reportSlot = '03Z',
  onReportSlotChange,
  showSlotToggle = false,
}) => {
  return (
    <div className="report-toolbar no-print" aria-label={`${reportTitle} Actions`}>
      <div className="toolbar-info">
        <span className="toolbar-title">{reportTitle}</span>
        <span className="toolbar-meta">
          Date: <strong>{formatOperationalDate(reportingDate)}</strong>
          {eveningDate && <span> (Eve: {formatOperationalDate(eveningDate)})</span>}
        </span>
      </div>

      <div className="toolbar-actions">
        {showSlotToggle && onReportSlotChange && (
          <div className="report-slot-toggle" role="radiogroup" aria-label="Select Report Issue Slot">
            <button
              type="button"
              role="radio"
              aria-checked={reportSlot === '03Z'}
              className={`btn-slot-seg ${reportSlot === '03Z' ? 'active' : ''}`}
              onClick={() => onReportSlotChange('03Z')}
              title="03Z Report (0830 IST Morning Issue)"
            >
              03Z (0830 IST)
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={reportSlot === '12Z'}
              className={`btn-slot-seg ${reportSlot === '12Z' ? 'active' : ''}`}
              onClick={() => onReportSlotChange('12Z')}
              title="12Z Report (1730 IST Evening Issue)"
            >
              12Z (1730 IST)
            </button>
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary btn-action"
          onClick={onPrint}
          title="Print this report using A4 layout"
        >
          <svg className="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          Print
        </button>
      </div>
    </div>
  );
};
