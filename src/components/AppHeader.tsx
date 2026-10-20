/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface AppHeaderProps {
  onToggleMenu: () => void;
  clockString: string;
  currentIdentity?: string | null;
  onLogout?: () => void;
  onOpenAbout?: () => void;
  dbStatus?: { configured: boolean; healthy: boolean; provider: string; error?: string } | null;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onToggleMenu,
  clockString,
  currentIdentity,
  onLogout,
  onOpenAbout,
  dbStatus,
}) => {
  return (
    <header className="app-header no-print" aria-label="Workstation Header">
      <div className="header-left">
        <div className="brand-block">
          <div className="brand-title-row">
            <h1 className="app-title">WXOps Synop Report</h1>
            <span className="station-badge">IMD MET-REP</span>
          </div>
          <p className="app-subtitle">
            Operational 03Z / 12Z Meteorological Report Generator
          </p>
        </div>
      </div>

      <div className="header-right">
        {/* Compact Operational Clock: DD/MM/YYYY HH:MM IST | HH:MM UTC */}
        <div
          className="operational-clock"
          title="Operational Clock (Asia/Kolkata IST | UTC)"
          aria-label={`Operational Clock: ${clockString}`}
        >
          {clockString.includes(' | ') ? (
            (() => {
              const [istPart, utcPart] = clockString.split(' | ');
              return (
                <>
                  <span className="clock-ist">{istPart}</span>
                  <span className="clock-divider" aria-hidden="true">|</span>
                  <span className="clock-utc">{utcPart}</span>
                </>
              );
            })()
          ) : (
            clockString
          )}
        </div>

        {dbStatus && (
          <div
            className={`header-storage-pill ${dbStatus.configured && dbStatus.healthy ? 'is-connected' : 'is-local'}`}
            title={
              dbStatus.configured
                ? dbStatus.healthy
                  ? 'Authoritative PostgreSQL Database (Connected & Synced across devices)'
                  : `PostgreSQL connection error: ${dbStatus.error}`
                : 'Local Buffer Mode (Supabase PostgreSQL not configured)'
            }
          >
            <span aria-hidden="true">{dbStatus.configured && dbStatus.healthy ? '☁️' : '💾'}</span>
            <span>{dbStatus.configured && dbStatus.healthy ? 'PostgreSQL' : 'Local'}</span>
          </div>
        )}

        {currentIdentity && (
          <div className="header-identity-pill" title="Active Meteorological Workstation Identity">
            <span aria-hidden="true">👤</span>
            <span>{currentIdentity}</span>
          </div>
        )}

        {onOpenAbout && (
          <button
            type="button"
            className="btn-header-about"
            onClick={onOpenAbout}
            title="About WXOps & System Credits"
            aria-label="About WXOps"
          >
            <span aria-hidden="true" style={{ marginRight: '0.25rem', fontSize: '0.8125rem' }}>ℹ️</span>
            <span>About</span>
          </button>
        )}

        {onLogout && (
          <button
            type="button"
            className="btn-header-logout"
            onClick={onLogout}
            title="Log out from workstation and return to login screen"
          >
            Logout
          </button>
        )}

        {/* Primary Hamburger Control on Top-Right */}
        <button
          type="button"
          className="btn-hamburger"
          onClick={onToggleMenu}
          aria-label="Toggle navigation menu"
          title="Open Reports & Settings menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>
    </header>
  );
};
