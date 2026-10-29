/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import type { UtcSlot } from '../engine/observationStore.ts';
import { SynopInput } from './SynopInput.tsx';
import type { ValidationContext } from '../parser/synopValidator.ts';
import type { OverwriteStationItem } from './OverwriteConfirmationModal.tsx';

interface ObservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  slot: UtcSlot;
  reportingDate: string;
  onReportingDateChange: (date: string) => void;
  synopText: string;
  onSynopTextChange: (text: string) => void;
  onGenerate: () => void;
  onClear: () => void;
  isGenerating: boolean;
  errorMessage: string | null;
  allowHistoricalEdits?: boolean;
  syntaxHighlightingEnabled?: boolean;
  validationContext?: ValidationContext;
  slotStatusLabel?: string;
  pendingOverwrites?: OverwriteStationItem[];
  onConfirmOverwrite?: () => void;
  onCancelOverwrite?: () => void;
}

export const ObservationModal: React.FC<ObservationModalProps> = ({
  isOpen,
  onClose,
  slot,
  reportingDate,
  onReportingDateChange,
  synopText,
  onSynopTextChange,
  onGenerate,
  onClear,
  isGenerating,
  errorMessage,
  allowHistoricalEdits = false,
  syntaxHighlightingEnabled = true,
  validationContext,
  slotStatusLabel,
  pendingOverwrites = [],
  onConfirmOverwrite,
  onCancelOverwrite,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const [isSearchOpen, setIsSearchOpen] = React.useState<boolean>(false);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    setIsSearchOpen(false);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus modal when opened
  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const slotTitle = slot === '03Z' ? '03Z (0830 IST)' : '12Z (1730 IST)';

  return (
    <div
      className="obs-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        className="obs-modal-container"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="obs-modal-title"
      >
        <header className="obs-modal-header">
          <div className="obs-modal-header-info">
            <h2 id="obs-modal-title" className="obs-modal-title">
              Submit {slotTitle} Observation
            </h2>
            <div className="obs-modal-header-meta">
              <span className="obs-modal-date-tag">Date: {reportingDate}</span>
              {slotStatusLabel && (
                <span className="obs-modal-status-tag">{slotStatusLabel}</span>
              )}
            </div>
          </div>
          <div className="obs-modal-header-actions">
            <button
              type="button"
              className={`obs-modal-search-btn ${isSearchOpen ? 'active' : ''}`}
              onClick={() => setIsSearchOpen((prev) => !prev)}
              title="Search stations or codes in bulletin (Ctrl+F)"
              aria-label="Search stations or codes in bulletin"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              className="obs-modal-close-btn"
              onClick={onClose}
              aria-label="Close observation input window"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="obs-modal-body">
          <SynopInput
            reportingDate={reportingDate}
            onReportingDateChange={onReportingDateChange}
            utcSlot={slot}
            synopText={synopText}
            onSynopTextChange={onSynopTextChange}
            onGenerate={onGenerate}
            onClear={onClear}
            isGenerating={isGenerating}
            errorMessage={errorMessage}
            allowHistoricalEdits={allowHistoricalEdits}
            syntaxHighlightingEnabled={syntaxHighlightingEnabled}
            validationContext={validationContext}
            isModalMode={true}
            isSearchOpen={isSearchOpen}
            onToggleSearch={() => setIsSearchOpen((prev) => !prev)}
            pendingOverwrites={pendingOverwrites}
            onConfirmOverwrite={onConfirmOverwrite}
            onCancelOverwrite={onCancelOverwrite}
          />
        </div>
      </div>
    </div>
  );
};
