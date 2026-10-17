/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { ObservationReminderInfo } from '../utils/timeSlot.ts';

interface ObservationReminderModalProps {
  reminder: ObservationReminderInfo | null;
  onEnterObservation: (slot: '03Z' | '12Z') => void;
  onLater: () => void;
}

export const ObservationReminderModal: React.FC<ObservationReminderModalProps> = ({
  reminder,
  onEnterObservation,
  onLater,
}) => {
  if (!reminder) return null;

  return (
    <>
      <div className="reminder-backdrop no-print" onClick={onLater} aria-hidden="true" />
      <div
        className="reminder-modal no-print"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-title"
      >
        <div className="reminder-header">
          <span className="reminder-bell-icon" aria-hidden="true">⏱</span>
          <h2 id="reminder-title" className="reminder-title">
            {reminder.title}
          </h2>
        </div>

        <p className="reminder-message">{reminder.message}</p>

        <div className="reminder-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onEnterObservation(reminder.slot)}
            autoFocus
          >
            Enter Observation
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onLater}
          >
            Later
          </button>
        </div>
      </div>
    </>
  );
};
