/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CANONICAL_STATIONS, getSubdivision } from '../constants/stationRegistry.ts';
import { DEFAULT_DISABLED_STATION_IDS, getExcludedStationIds } from '../utils/stationInclusion.ts';
import type {
  ArchiveImportOptions,
  ArchiveImportSummary,
  DuplicateHandlingPolicy,
} from '../engine/observationStore.ts';

export type ReportViewType = 'consolidated' | 'summary' | 'subdivision';
export type BackupFormat = 'JSON' | 'CSV';
export type OperationalViewMode = 'standard' | 'minimal';

export type WorkstationTheme =
  | 'theme-green'
  | 'theme-orange'
  | 'theme-blue'
  | 'theme-red'
  | 'theme-grey'
  | 'theme-night';

export interface ThemeOption {
  id: WorkstationTheme;
  name: string;
  previewBg: string;
  previewAccent: string;
}

export const WORKSTATION_THEMES: ThemeOption[] = [
  { id: 'theme-green', name: 'Green', previewBg: '#15803d', previewAccent: '#166534' },
  { id: 'theme-orange', name: 'Orange', previewBg: '#ea580c', previewAccent: '#c2410c' },
  { id: 'theme-blue', name: 'Blue (default)', previewBg: '#1e40af', previewAccent: '#1e3a5f' },
  { id: 'theme-red', name: 'Red', previewBg: '#dc2626', previewAccent: '#991b1b' },
  { id: 'theme-grey', name: 'Grey', previewBg: '#4b5563', previewAccent: '#374151' },
  { id: 'theme-night', name: 'Night Duty', previewBg: '#0f172a', previewAccent: '#38bdf8' },
];

/**
 * Maps obsolete theme identifiers safely to supported modern themes.
 */
export function resolveWorkstationTheme(saved: string | null | undefined): WorkstationTheme {
  if (!saved) return 'theme-blue';
  switch (saved) {
    case 'theme-green':
    case 'theme-forest':
    case 'theme-light-green':
      return 'theme-green';
    case 'theme-orange':
    case 'theme-amber':
    case 'theme-light-amber':
      return 'theme-orange';
    case 'theme-blue':
    case 'theme-navy':
    case 'theme-light-blue':
      return 'theme-blue';
    case 'theme-red':
      return 'theme-red';
    case 'theme-grey':
    case 'theme-charcoal':
    case 'theme-light-clean':
      return 'theme-grey';
    case 'theme-night':
      return 'theme-night';
    default:
      return 'theme-blue';
  }
}

interface HamburgerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  activeReport: ReportViewType;
  onSelectReport: (report: ReportViewType) => void;
  archiveDateCount: number;
  retentionLimit: number;
  onRetentionChange: (limit: number) => void;
  backupFormat: BackupFormat;
  onBackupFormatChange: (format: BackupFormat) => void;
  currentTheme: WorkstationTheme;
  onThemeChange: (theme: WorkstationTheme) => void;
  onDownloadBackup: () => void;
  onRestoreBackup?: (file: File) => void;
  onImportHistoricalArchive?: (file: File, options?: ArchiveImportOptions) => Promise<ArchiveImportSummary> | void;
  archivedDates?: string[];
  activeReportingDate?: string;
  onSelectReportingDate?: (date: string) => void;
  stationInclusion?: Record<string, boolean>;
  onStationInclusionChange?: (stationId: string, enabled: boolean) => void;
  onResetStationInclusion?: () => void;
  archiveNotification?: { type: 'success' | 'error'; message: string } | null;
  isEditMode?: boolean;
  onEditModeChange?: (enabled: boolean) => void;
  showHeatWaveCount?: boolean;
  onShowHeatWaveCountChange?: (enabled: boolean) => void;
  showColdWaveCount?: boolean;
  onShowColdWaveCountChange?: (enabled: boolean) => void;
  allowHistoricalEdits?: boolean;
  onAllowHistoricalEditsChange?: (enabled: boolean) => void;
  syntaxHighlightingEnabled?: boolean;
  onSyntaxHighlightingEnabledChange?: (enabled: boolean) => void;
  onDeleteAllData?: () => void;
  currentIdentity?: string | null;
  onLogout?: () => void;
  dbStatus?: { configured: boolean; healthy: boolean; provider: string; error?: string; datesCount?: number } | null;
  onMigrateToDatabase?: () => Promise<void>;
  onOpenAbout?: () => void;
  viewMode?: OperationalViewMode;
  onViewModeChange?: (mode: OperationalViewMode) => void;
}

export const HamburgerMenu: React.FC<HamburgerMenuProps> = ({
  isOpen,
  onClose,
  activeReport,
  onSelectReport,
  archiveDateCount,
  retentionLimit,
  onRetentionChange,
  backupFormat,
  onBackupFormatChange,
  currentTheme,
  onThemeChange,
  onDownloadBackup,
  onRestoreBackup,
  onImportHistoricalArchive,
  archivedDates = [],
  activeReportingDate,
  onSelectReportingDate,
  stationInclusion,
  onStationInclusionChange,
  onResetStationInclusion,
  archiveNotification,
  isEditMode = false,
  onEditModeChange,
  showHeatWaveCount = true,
  onShowHeatWaveCountChange,
  showColdWaveCount = true,
  onShowColdWaveCountChange,
  allowHistoricalEdits = false,
  onAllowHistoricalEditsChange,
  syntaxHighlightingEnabled = true,
  onSyntaxHighlightingEnabledChange,
  onDeleteAllData,
  currentIdentity,
  onLogout,
  dbStatus,
  onMigrateToDatabase,
  onOpenAbout,
  viewMode = 'minimal',
  onViewModeChange,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState<boolean>(false);
  const [deleteInputText, setDeleteInputText] = useState<string>('');

  // Station Report Inclusion: locked and collapsed by default
  const [isStationInclusionExpanded, setIsStationInclusionExpanded] = useState<boolean>(false);
  const [isStationInclusionUnlocked, setIsStationInclusionUnlocked] = useState<boolean>(false);

  // Station search filter state
  const [stationSearch, setStationSearch] = useState<string>('');

  // Historical Import / Restore options
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicateHandlingPolicy>('preserve_existing');
  const [retainAllImported, setRetainAllImported] = useState<boolean>(true);
  const [importSummary, setImportSummary] = useState<ArchiveImportSummary | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);

  // Collapse and re-lock panel when drawer closes
  useEffect(() => {
    if (!isOpen) {
      setIsStationInclusionExpanded(false);
      setIsStationInclusionUnlocked(false);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="menu-backdrop no-print"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Sidebar Panel */}
      <aside
        ref={menuRef}
        className="hamburger-drawer no-print"
        aria-label="Navigation & Settings Sidebar"
        role="dialog"
        aria-modal="true"
      >
        <div className="drawer-header">
          <div className="drawer-title">
            <span className="drawer-logo">WXOps Synop Report</span>
            <span className="drawer-tagline">Reports &amp; Settings</span>
          </div>
          <button
            type="button"
            className="btn-drawer-close"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="drawer-content">
          {/* SECTION: REPORTS */}
          <div className="nav-group">
            <div className="nav-group-title">REPORTS</div>
            <ul className="nav-list">
              <li>
                <button
                  type="button"
                  className={`nav-item ${activeReport === 'consolidated' ? 'active' : ''}`}
                  onClick={() => {
                    onSelectReport('consolidated');
                    onClose();
                  }}
                >
                  <span className="nav-dot" />
                  <span className="nav-text">Consolidated Observation Report</span>
                  {activeReport === 'consolidated' && <span className="nav-active-badge">Active</span>}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`nav-item ${activeReport === 'summary' ? 'active' : ''}`}
                  onClick={() => {
                    onSelectReport('summary');
                    onClose();
                  }}
                >
                  <span className="nav-dot" />
                  <span className="nav-text">Weather Summary Report</span>
                  {activeReport === 'summary' && <span className="nav-active-badge">Active</span>}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`nav-item ${activeReport === 'subdivision' ? 'active' : ''}`}
                  onClick={() => {
                    onSelectReport('subdivision');
                    onClose();
                  }}
                >
                  <span className="nav-dot" />
                  <span className="nav-text">Subdivision-wise Observation Report</span>
                  {activeReport === 'subdivision' && <span className="nav-active-badge">Active</span>}
                </button>
              </li>
            </ul>
          </div>

          {/* SECTION: SETTINGS (Integrated directly into sidebar) */}
          <div className="nav-group">
            <div className="nav-group-title">SETTINGS</div>

            {/* 1. WORKSPACE & APPEARANCE */}
            <div className="settings-category-header">
              <span className="settings-category-icon" aria-hidden="true">🖥️</span>
              <span>Workspace &amp; Appearance</span>
            </div>

            {/* Operational View Mode (Minimal vs Standard) */}
            {onViewModeChange && (
              <div className="sidebar-setting-block">
                <div className="setting-subhead">Operational View Mode</div>
                <div className="sidebar-segmented" role="radiogroup" aria-label="Operational View Mode">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={viewMode === 'minimal'}
                    className={`btn-seg ${viewMode === 'minimal' ? 'active' : ''}`}
                    onClick={() => onViewModeChange('minimal')}
                  >
                    Minimal (Default)
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={viewMode === 'standard'}
                    className={`btn-seg ${viewMode === 'standard' ? 'active' : ''}`}
                    onClick={() => onViewModeChange('standard')}
                  >
                    Standard
                  </button>
                </div>
              </div>
            )}

            {/* Theme (Compact Swatches) */}
            <div className="sidebar-setting-block theme-setting-block">
              <div className="setting-subhead">Theme</div>
              <div className="sidebar-theme-swatches" role="radiogroup" aria-label="Workstation theme">
                {WORKSTATION_THEMES.map((t) => {
                  const isSelected = currentTheme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={t.name}
                      title={t.name}
                      className={`theme-swatch-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => onThemeChange(t.id)}
                    >
                      <span
                        className="theme-swatch-color"
                        style={{ backgroundColor: t.previewBg }}
                      >
                        {isSelected && (
                          <span className="theme-swatch-check" aria-hidden="true">✓</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. REPORT DISPLAY & TABLES */}
            <div className="settings-category-header">
              <span className="settings-category-icon" aria-hidden="true">📊</span>
              <span>Report Display &amp; Tables</span>
            </div>

            {/* Show Heatwave Count in Weather Summary */}
            {onShowHeatWaveCountChange && (
              <div className="sidebar-setting-block">
                <div className="setting-subhead">Show Heatwave Count in Weather Summary</div>
                <div className="sidebar-segmented" role="radiogroup" aria-label="Show Heatwave Count in Weather Summary">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={showHeatWaveCount}
                    className={`btn-seg ${showHeatWaveCount ? 'active' : ''}`}
                    onClick={() => onShowHeatWaveCountChange(true)}
                  >
                    Enabled
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!showHeatWaveCount}
                    className={`btn-seg ${!showHeatWaveCount ? 'active' : ''}`}
                    onClick={() => onShowHeatWaveCountChange(false)}
                  >
                    Disabled
                  </button>
                </div>
              </div>
            )}

            {/* Show Coldwave Count in Weather Summary */}
            {onShowColdWaveCountChange && (
              <div className="sidebar-setting-block">
                <div className="setting-subhead">Show Coldwave Count in Weather Summary</div>
                <div className="sidebar-segmented" role="radiogroup" aria-label="Show Coldwave Count in Weather Summary">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={showColdWaveCount}
                    className={`btn-seg ${showColdWaveCount ? 'active' : ''}`}
                    onClick={() => onShowColdWaveCountChange(true)}
                  >
                    Enabled
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!showColdWaveCount}
                    className={`btn-seg ${!showColdWaveCount ? 'active' : ''}`}
                    onClick={() => onShowColdWaveCountChange(false)}
                  >
                    Disabled
                  </button>
                </div>
              </div>
            )}

            {/* Table Edit Mode */}
            {onEditModeChange && (
              <div className="sidebar-setting-block">
                <div className="setting-subhead">Table Edit Mode</div>
                <div className="sidebar-segmented" role="radiogroup" aria-label="Table Edit Mode">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!isEditMode}
                    className={`btn-seg ${!isEditMode ? 'active' : ''}`}
                    onClick={() => onEditModeChange(false)}
                  >
                    OFF
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isEditMode}
                    className={`btn-seg ${isEditMode ? 'active' : ''}`}
                    onClick={() => onEditModeChange(true)}
                  >
                    ON
                  </button>
                </div>
                <div className="setting-help-text">
                  {isEditMode
                    ? 'In-table editing enabled for observation values with real-time recalculation.'
                    : 'Report tables remain read-only operational presentation.'}
                </div>
              </div>
            )}

            {/* 3. DATA ENTRY & VALIDATION */}
            <div className="settings-category-header">
              <span className="settings-category-icon" aria-hidden="true">✍️</span>
              <span>Data Entry &amp; Validation</span>
            </div>

            {/* SYNOP Syntax & Anomaly Highlighting */}
            {onSyntaxHighlightingEnabledChange && (
              <div className="sidebar-setting-block">
                <div className="setting-subhead">SYNOP Syntax &amp; Anomaly Highlighting</div>
                <div className="sidebar-segmented" role="radiogroup" aria-label="SYNOP Syntax & Anomaly Highlighting">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={syntaxHighlightingEnabled}
                    className={`btn-seg ${syntaxHighlightingEnabled ? 'active' : ''}`}
                    onClick={() => onSyntaxHighlightingEnabledChange(true)}
                  >
                    Enabled
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!syntaxHighlightingEnabled}
                    className={`btn-seg ${!syntaxHighlightingEnabled ? 'active' : ''}`}
                    onClick={() => onSyntaxHighlightingEnabledChange(false)}
                  >
                    Disabled
                  </button>
                </div>
                <div className="setting-help-text">
                  {syntaxHighlightingEnabled
                    ? 'Color-codes SYNOP groups and flags abnormal temperatures and rainfall.'
                    : 'Standard plain text editor.'}
                </div>
              </div>
            )}

            {/* Allow Editing Historical Dates */}
            {onAllowHistoricalEditsChange && (
              <div className="sidebar-setting-block">
                <div className="setting-subhead">Allow Editing Historical Dates</div>
                <div className="sidebar-segmented" role="radiogroup" aria-label="Allow Editing Historical Dates">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={allowHistoricalEdits}
                    className={`btn-seg ${allowHistoricalEdits ? 'active' : ''}`}
                    onClick={() => onAllowHistoricalEditsChange(true)}
                  >
                    Enabled
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!allowHistoricalEdits}
                    className={`btn-seg ${!allowHistoricalEdits ? 'active' : ''}`}
                    onClick={() => onAllowHistoricalEditsChange(false)}
                  >
                    Disabled
                  </button>
                </div>
                <div className="setting-help-text">
                  {allowHistoricalEdits
                    ? 'Forecasters can enter and update observations for past dates.'
                    : 'Modifying observations for past dates is locked.'}
                </div>
              </div>
            )}

            {/* 4. STATION REGISTRY */}
            {stationInclusion && onStationInclusionChange && (
              <>
                <div className="settings-category-header">
                  <span className="settings-category-icon" aria-hidden="true">📍</span>
                  <span>Station Registry</span>
                </div>

                <div className="sidebar-setting-block station-inclusion-block">
                  <div className="station-inclusion-header-row">
                    <div className="setting-subhead">Station Report Inclusion</div>
                    <div className="station-inclusion-lock-badge">
                      {isStationInclusionUnlocked ? (
                        <span className="badge-unlocked" title="Controls are unlocked for editing">
                          🔓 Unlocked
                        </span>
                      ) : (
                        <span className="badge-locked" title="Controls are locked to prevent accidental changes">
                          🔒 Locked
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="station-inclusion-summary">
                    {CANONICAL_STATIONS.filter((s) => stationInclusion[s.id] !== false).length} included &bull;{' '}
                    {CANONICAL_STATIONS.filter((s) => stationInclusion[s.id] === false).length} excluded
                    {stationInclusion['42665'] === false && (
                      <span style={{ display: 'block', fontSize: '0.625rem', color: 'var(--text-muted)' }}>
                        (Ashoknagar 42665 excluded by default)
                      </span>
                    )}
                  </div>

                  <div className="station-inclusion-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => setIsStationInclusionExpanded((prev) => !prev)}
                      title={isStationInclusionExpanded ? 'Collapse station list' : 'Expand station list'}
                    >
                      {isStationInclusionExpanded ? 'Collapse List ▲' : 'Expand List ▼'}
                    </button>
                    <button
                      type="button"
                      className={`btn btn-xs ${isStationInclusionUnlocked ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => setIsStationInclusionUnlocked((prev) => !prev)}
                      title={isStationInclusionUnlocked ? 'Lock controls to prevent changes' : 'Unlock station toggles for editing'}
                    >
                      {isStationInclusionUnlocked ? 'Lock Controls 🔒' : 'Unlock Toggles 🔓'}
                    </button>
                  </div>

                  {isStationInclusionExpanded && (
                    <>
                      {!isStationInclusionUnlocked && (
                        <div className="station-lock-notice" role="note">
                          Station controls are locked to prevent accidental report alterations. Click <strong>Unlock Toggles</strong> to edit station inclusion.
                        </div>
                      )}

                      <div className="station-inclusion-actions" style={{ marginTop: '0.125rem' }}>
                        {onResetStationInclusion && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            disabled={!isStationInclusionUnlocked}
                            onClick={onResetStationInclusion}
                            title="Reset station inclusion to standard defaults (Ashoknagar 42665 excluded)"
                          >
                            Reset Defaults
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          disabled={!isStationInclusionUnlocked}
                          onClick={() => {
                            for (const stn of CANONICAL_STATIONS) {
                              if (stationInclusion[stn.id] === false) {
                                onStationInclusionChange(stn.id, true);
                              }
                            }
                          }}
                          title="Include all stations in reports"
                        >
                          Select All
                        </button>
                      </div>

                      <input
                        type="text"
                        className="station-inclusion-search"
                        placeholder="Filter stations by name or code..."
                        value={stationSearch}
                        onChange={(e) => setStationSearch(e.target.value)}
                        aria-label="Filter stations"
                      />

                      <div className="station-inclusion-list" role="group" aria-label="Station list">
                        {CANONICAL_STATIONS.filter((stn) => {
                          if (!stationSearch.trim()) return true;
                          const q = stationSearch.toLowerCase().trim();
                          return (
                            stn.id.includes(q) ||
                            stn.name.toLowerCase().includes(q) ||
                            (getSubdivision(stn.subdivisionId)?.name || '').toLowerCase().includes(q)
                          );
                        }).map((stn) => {
                          const isIncluded = stationInclusion[stn.id] !== false;
                          return (
                            <label
                              key={stn.id}
                              className={`station-inclusion-item ${isIncluded ? 'enabled' : 'disabled'} ${!isStationInclusionUnlocked ? 'locked' : ''}`}
                            >
                              <input
                                type="checkbox"
                                disabled={!isStationInclusionUnlocked}
                                checked={isIncluded}
                                onChange={(e) => onStationInclusionChange(stn.id, e.target.checked)}
                                aria-label={`Include ${stn.name} (${stn.id})`}
                              />
                              <span className="stn-id-badge">{stn.id}</span>
                              <span className="stn-name-label">{stn.name}</span>
                              <span className="stn-sub-label">
                                {getSubdivision(stn.subdivisionId)?.name.replace(/^(WEST|EAST)\s+/, '')}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {/* 5. ARCHIVE, BACKUP & DATABASE */}
            <div className="settings-category-header">
              <span className="settings-category-icon" aria-hidden="true">💾</span>
              <span>Archive &amp; Cloud Database</span>
            </div>

            {/* Archive / Backup Export */}
            <div className="sidebar-setting-block">
              <div className="setting-subhead">Archive / Backup Export</div>
              <div className="setting-status-text">
                Retained: <strong>{archiveDateCount}</strong> of <strong>{retentionLimit}</strong> days
              </div>
              <div className="setting-action-row">
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={onDownloadBackup}
                  title="Download operational backup"
                >
                  Download ({backupFormat})
                </button>
              </div>
              {archiveNotification && (
                <div
                  className={`sidebar-notification ${archiveNotification.type === 'success' ? 'alert-success' : 'alert-error'}`}
                  role="status"
                >
                  {archiveNotification.message}
                </div>
              )}
            </div>

            {/* Backup Retention */}
            <div className="sidebar-setting-block">
              <div className="setting-subhead">Backup Retention</div>
              <div className="sidebar-segmented" role="radiogroup" aria-label="Backup retention days">
                {[15, 30, 60, 120].map((days) => (
                  <button
                    key={days}
                    type="button"
                    role="radio"
                    aria-checked={retentionLimit === days}
                    className={`btn-seg ${retentionLimit === days ? 'active' : ''}`}
                    onClick={() => onRetentionChange(days)}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>

            {/* Backup Format */}
            <div className="sidebar-setting-block">
              <div className="setting-subhead">Backup Format</div>
              <div className="sidebar-segmented" role="radiogroup" aria-label="Backup format">
                {(['JSON', 'CSV'] as BackupFormat[]).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    role="radio"
                    aria-checked={backupFormat === fmt}
                    className={`btn-seg ${backupFormat === fmt ? 'active' : ''}`}
                    onClick={() => onBackupFormatChange(fmt)}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            {/* Data Management & Import/Restore */}
            <div className="sidebar-setting-block data-management-block">
              <div className="setting-subhead">Data Management</div>
              <div className="setting-status-text">
                Stored Observations: <strong>{archiveDateCount}</strong> date{archiveDateCount === 1 ? '' : 's'}
              </div>

              {/* Jump to archived date selector if available */}
              {archivedDates.length > 0 && onSelectReportingDate && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <label htmlFor="archived-date-select" style={{ fontSize: '0.6875rem', fontWeight: 600 }}>
                    Select Reporting Date:
                  </label>
                  <select
                    id="archived-date-select"
                    className="import-policy-select"
                    value={activeReportingDate || ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        onSelectReportingDate(e.target.value);
                      }
                    }}
                  >
                    {archivedDates.slice().reverse().map((d) => (
                      <option key={d} value={d}>
                        {d} {d === activeReportingDate ? '★ (Active)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Unified Archive Import / Restore */}
              {(onImportHistoricalArchive || onRestoreBackup) && (
                <div className="import-archive-block">
                  <div className="setting-subhead" style={{ fontSize: '0.6875rem', marginTop: '0.375rem' }}>
                    Import &amp; Restore Archive (JSON / CSV)
                  </div>
                  <div className="setting-status-text">
                    Restore or import observations from JSON or CSV backup archives. Existing records are preserved by default.
                  </div>

                  <label htmlFor="import-dup-policy" style={{ fontSize: '0.625rem', fontWeight: 600 }}>
                    Duplicate Handling Policy:
                  </label>
                  <select
                    id="import-dup-policy"
                    className="import-policy-select"
                    value={duplicatePolicy}
                    onChange={(e) => setDuplicatePolicy(e.target.value as DuplicateHandlingPolicy)}
                  >
                    <option value="preserve_existing">Preserve Existing (Recommended)</option>
                    <option value="update_existing">Overwrite Existing</option>
                    <option value="merge_fields">Merge Non-Null Fields</option>
                  </select>

                  <label className="import-checkbox-label">
                    <input
                      type="checkbox"
                      checked={retainAllImported}
                      onChange={(e) => setRetainAllImported(e.target.checked)}
                    />
                    <span>Auto-expand retention for imported dates</span>
                  </label>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.csv,text/csv,application/json"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsImporting(true);
                      setImportSummary(null);
                      try {
                        if (onImportHistoricalArchive) {
                          const res = await onImportHistoricalArchive(file, {
                            duplicatePolicy,
                            retainAllImportedDates: retainAllImported,
                          });
                          if (res) {
                            setImportSummary(res);
                          }
                        } else if (onRestoreBackup) {
                          onRestoreBackup(file);
                        }
                      } finally {
                        setIsImporting(false);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                      }
                    }}
                  />

                  <div className="setting-action-row">
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      disabled={isImporting}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {isImporting ? 'Importing Archive...' : 'Choose Archive File (JSON / CSV)'}
                    </button>
                  </div>

                  {importSummary && (
                    <div className={`import-summary-box ${importSummary.success ? 'success' : 'error'}`}>
                      <div>
                        <strong>{importSummary.success ? '✓ Archive Import Successful' : '✗ Import Failed'}</strong>
                      </div>
                      {importSummary.success ? (
                        <>
                          <div className="import-summary-row">
                            <span>Added: {importSummary.recordsAdded}</span>
                            <span>Updated: {importSummary.recordsUpdated}</span>
                          </div>
                          <div className="import-summary-row">
                            <span>Skipped: {importSummary.recordsSkipped}</span>
                            <span>Dates: {importSummary.datesImported.length}</span>
                          </div>
                        </>
                      ) : (
                        <div>{importSummary.error}</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Shared Database Migration & Status */}
              <div className="sidebar-setting-block shared-db-block" style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                <div className="setting-subhead">Shared PostgreSQL Database</div>
                <div className="setting-status-text">
                  Storage: <strong>{dbStatus?.configured ? (dbStatus.healthy ? '☁️ PostgreSQL (Connected)' : '⚠️ Offline/Error') : '💾 Local Buffer'}</strong>
                  {dbStatus?.configured && dbStatus.datesCount !== undefined && (
                    <span> &bull; {dbStatus.datesCount} dates in cloud</span>
                  )}
                </div>

                {onMigrateToDatabase && (
                  <div style={{ marginTop: '0.375rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={onMigrateToDatabase}
                      title="Safely exports a local backup and syncs local observations into shared PostgreSQL"
                    >
                      ☁️ Migrate Local Buffer to PostgreSQL
                    </button>
                    <div className="setting-help-text" style={{ marginTop: '0.25rem' }}>
                      Exports a local safety backup before uploading to PostgreSQL.
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 6. DANGER ZONE */}
            <div className="settings-category-header danger-category">
              <span className="settings-category-icon" aria-hidden="true">⚠️</span>
              <span>Danger Zone</span>
            </div>

            {/* Destructive Data Clear Section (Kept strictly separated at bottom) */}
            <div className="sidebar-setting-block danger-setting-block">
              <div className="sidebar-destructive-section">
                {!isDeleting ? (
                  <button
                    type="button"
                    className="btn btn-destructive-action btn-xs"
                    onClick={() => {
                      setIsDeleting(true);
                      setDeleteConfirmed(false);
                      setDeleteInputText('');
                    }}
                    title="Permanently remove all cached and stored station observations"
                  >
                    <span className="destructive-indicator-icon" aria-hidden="true">⚠️</span>
                    <span>Delete All Stored Observations</span>
                  </button>
                ) : (
                  <div className="delete-confirm-box" role="alertdialog" aria-label="Confirm complete data purge">
                    <div className="delete-confirm-title">
                      <span className="destructive-indicator-icon" aria-hidden="true">⚠️</span>
                      Confirm Permanent Data Purge
                    </div>
                    <div className="delete-confirm-text">
                      Type <strong>DELETE</strong> below to permanently erase all {archiveDateCount} dates of stored observation history.
                    </div>
                    <input
                      type="text"
                      className="delete-confirm-input"
                      placeholder="Type DELETE..."
                      value={deleteInputText}
                      onChange={(e) => {
                        const txt = e.target.value;
                        setDeleteInputText(txt);
                        setDeleteConfirmed(txt.trim() === 'DELETE');
                      }}
                      autoFocus
                    />
                    <div className="delete-confirm-actions">
                      <button
                        type="button"
                        className="btn btn-danger btn-xs"
                        disabled={!deleteConfirmed}
                        onClick={() => {
                          if (deleteConfirmed && onDeleteAllData) {
                            onDeleteAllData();
                            setIsDeleting(false);
                            setDeleteConfirmed(false);
                            setDeleteInputText('');
                          }
                        }}
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={() => {
                          setIsDeleting(false);
                          setDeleteConfirmed(false);
                          setDeleteInputText('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {currentIdentity && (
          <div style={{ padding: '0.625rem 0.875rem', borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--bg-header)' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Logged in as</span>
              <strong style={{ fontSize: '0.75rem', color: 'var(--text-main)' }}>{currentIdentity}</strong>
            </div>
            {onLogout && (
              <button
                type="button"
                className="btn btn-header-logout btn-xs"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                title="Log out and return to login screen"
              >
                Log Out
              </button>
            )}
          </div>
        )}

        <div
          className="drawer-footer"
          style={{ cursor: onOpenAbout ? 'pointer' : 'default', padding: '0.625rem 0.875rem', textAlign: 'center' }}
          onClick={() => {
            if (onOpenAbout) {
              onClose();
              onOpenAbout();
            }
          }}
          title={onOpenAbout ? 'Click to view System Info & Workstation Credits' : undefined}
          role={onOpenAbout ? 'button' : undefined}
          tabIndex={onOpenAbout ? 0 : undefined}
          onKeyDown={(e) => {
            if (onOpenAbout && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onClose();
              onOpenAbout();
            }
          }}
        >
          <span style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.02em', textDecoration: onOpenAbout ? 'underline' : 'none' }}>
            System Info &amp; Workstation Credits
          </span>
        </div>
      </aside>
    </>
  );
};
