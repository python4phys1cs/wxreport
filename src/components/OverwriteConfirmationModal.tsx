/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';

export interface StationFieldDiff {
  field: string;
  label: string;
  currentValue: string | number | null | undefined;
  incomingValue: string | number | null | undefined;
}

export interface OverwriteStationItem {
  stationId: string;
  stationName: string;
  subdivisionName?: string;
  diffs: StationFieldDiff[];
}

interface OverwriteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  reportingDate: string;
  utcSlot: '03Z' | '12Z';
  overwrittenStations: OverwriteStationItem[];
}

function formatValue(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return '---';
  return String(val);
}

export const OverwriteConfirmationModal: React.FC<OverwriteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  reportingDate,
  utcSlot,
  overwrittenStations,
}) => {
  const [showDetails, setShowDetails] = useState<boolean>(false);

  if (!isOpen) return null;

  const slotLabel = utcSlot === '03Z' ? '03 UTC (08:30 IST)' : '12 UTC (17:30 IST)';
  const totalStations = overwrittenStations.length;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="overwrite-modal-title"
    >
      <div className="modal-container overwrite-modal-container" style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>⚠️</span>
            <h2 id="overwrite-modal-title" style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
              Confirm Observation Overwrite
            </h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Cancel overwrite and close"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', lineHeight: '1.4' }}>
            Data already exists for <strong>{totalStations} station{totalStations === 1 ? '' : 's'}</strong> on{' '}
            <strong>{reportingDate}</strong> ({slotLabel}).
          </p>

          <div
            style={{
              padding: '0.75rem',
              backgroundColor: 'var(--bg-panel-alt, #fef3c7)',
              color: 'var(--text-main, #92400e)',
              borderRadius: '4px',
              border: '1px solid #fde68a',
              fontSize: '0.8125rem',
              marginBottom: '1rem',
            }}
          >
            Submitting this bulletin will replace the existing station values with the newly entered observations.
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => setShowDetails((prev) => !prev)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
            >
              <span>{showDetails ? '▼ Hide Overwrite Details' : '▶ Show Overwrite Details'}</span>
              <span className="badge-station-count" style={{ fontSize: '0.6875rem' }}>
                ({totalStations} stations)
              </span>
            </button>
          </div>

          {showDetails && (
            <div
              className="overwrite-details-scroll"
              style={{
                maxHeight: '260px',
                overflowY: 'auto',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: '4px',
                marginBottom: '1rem',
                fontSize: '0.75rem',
              }}
            >
              <table className="overwrite-diff-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-table-header, #f8fafc)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>Station</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>Parameter</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-color, #e2e8f0)', color: '#b91c1c' }}>Existing</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-color, #e2e8f0)', color: '#15803d' }}>New Bulletin</th>
                  </tr>
                </thead>
                <tbody>
                  {overwrittenStations.map((item) => (
                    <React.Fragment key={item.stationId}>
                      {item.diffs.length > 0 ? (
                        item.diffs.map((diff, dIdx) => (
                          <tr
                            key={`${item.stationId}-${diff.field}`}
                            style={{
                              borderBottom: dIdx === item.diffs.length - 1 ? '1px solid var(--border-color, #e2e8f0)' : 'none',
                              backgroundColor: dIdx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)',
                            }}
                          >
                            {dIdx === 0 ? (
                              <td
                                rowSpan={item.diffs.length}
                                style={{
                                  padding: '6px 8px',
                                  verticalAlign: 'top',
                                  borderRight: '1px solid var(--border-color, #e2e8f0)',
                                  fontWeight: 600,
                                }}
                              >
                                <div>{item.stationId}</div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted, #64748b)' }}>
                                  {item.stationName}
                                </div>
                              </td>
                            ) : null}
                            <td style={{ padding: '4px 8px' }}>{diff.label}</td>
                            <td style={{ padding: '4px 8px', color: '#b91c1c', fontFamily: 'monospace' }}>
                              {formatValue(diff.currentValue)}
                            </td>
                            <td style={{ padding: '4px 8px', color: '#15803d', fontFamily: 'monospace', fontWeight: 600 }}>
                              {formatValue(diff.incomingValue)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 600 }}>
                            {item.stationId} - {item.stationName}
                          </td>
                          <td colSpan={3} style={{ padding: '6px 8px', color: 'var(--text-muted, #64748b)' }}>
                            (Identical or re-submitted telegram)
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div
          className="modal-footer"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border-color, #e2e8f0)',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            style={{
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600,
            }}
            onClick={onConfirm}
          >
            Overwrite Data
          </button>
        </div>
      </div>
    </div>
  );
};
