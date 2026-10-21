/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  generateDailyReports,
  recalculateReportsResult,
  type OperationalReportsResult,
} from './engine/reportOrchestrator.ts';
import {
  InMemoryHistoricalProvider,
  SAMPLE_HISTORICAL_OBSERVATIONS,
} from './providers/fixtureProvider.ts';
import { defaultPentadNormalProvider } from './providers/pentadNormalProvider.ts';
import {
  defaultObservationStore,
  type UtcSlot,
  type PersistedStationObservation,
  type ArchiveImportOptions,
  type ArchiveImportSummary,
} from './engine/observationStore.ts';
import {
  loadStationInclusion,
  saveStationInclusion,
  getExcludedStationIds,
  getDefaultStationInclusion,
} from './utils/stationInclusion.ts';
import { SynopInput } from './components/SynopInput.tsx';
import { Report1StationTable } from './components/Report1StationTable.tsx';
import { Report2SummaryTable } from './components/Report2SummaryTable.tsx';
import { Report3SubdivisionView } from './components/Report3SubdivisionView.tsx';
import { AppHeader } from './components/AppHeader.tsx';
import {
  HamburgerMenu,
  type ReportViewType,
  type BackupFormat,
  type WorkstationTheme,
  resolveWorkstationTheme,
} from './components/HamburgerMenu.tsx';
import { ReportToolbar } from './components/ReportToolbar.tsx';
import { ObservationReminderModal } from './components/ObservationReminderModal.tsx';
import { AboutModal } from './components/AboutSection.tsx';
import type { EditableStationField } from './components/Report1StationTable.tsx';
import {
  getAutoUtcSlot,
  getTodayKolkata,
  formatOperationalClock,
  checkObservationReminder,
  type ObservationReminderInfo,
} from './utils/timeSlot.ts';
import { LoginScreen } from './components/LoginScreen.tsx';
import { authClient } from './auth/authClient.ts';
import type { WorkstationIdentity } from './server/authService.ts';
import './styles/reports.css';

type GenerationState = 'idle' | 'generating' | 'success' | 'error';

export default function App() {
  // Meteorological Providers & Store (defined early for initial state calculation)
  const normalProvider = useMemo(() => defaultPentadNormalProvider, []);
  const observationStore = useMemo(() => defaultObservationStore, []);
  const historicalProvider = useMemo(() => new InMemoryHistoricalProvider(SAMPLE_HISTORICAL_OBSERVATIONS), []);
  // Authentication & Workstation Session State
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>(() => {
    // If a cached identity exists, initial state can start as 'checking' or use cached session
    return 'checking';
  });
  const [currentIdentity, setCurrentIdentity] = useState<WorkstationIdentity | null>(null);

  useEffect(() => {
    let isMounted = true;
    authClient.checkSession().then((res) => {
      if (!isMounted) return;
      if (res.authenticated && res.identity) {
        setCurrentIdentity(res.identity);
        setAuthState('authenticated');
      } else {
        setAuthState('unauthenticated');
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = useCallback(async () => {
    await authClient.logout();
    setCurrentIdentity(null);
    setAuthState('unauthenticated');
    setIsMenuOpen(false);
  }, []);

  // 1. Single Reporting Date (strictly defaults to current Asia/Kolkata date)
  const [reportingDate, setReportingDate] = useState<string>(() => getTodayKolkata());
  // Tracks whether the user has deliberately selected a date during the active session
  const userSelectedDateRef = useRef<boolean>(false);

  const handleReportingDateChange = useCallback((newDate: string) => {
    userSelectedDateRef.current = true;
    setReportingDate(newDate);
  }, []);

  // Periodic synchronization to current Asia/Kolkata date unless deliberately selected by user
  useEffect(() => {
    const syncIstDate = () => {
      if (!userSelectedDateRef.current) {
        const today = getTodayKolkata();
        setReportingDate((prev) => (prev !== today ? today : prev));
      }
    };
    syncIstDate();
    const timer = setInterval(syncIstDate, 60000);
    return () => clearInterval(timer);
  }, []);

  // 2. Observation Slot selection
  const [utcSlot, setUtcSlot] = useState<UtcSlot>(() => {
    const autoSlot = getAutoUtcSlot(new Date());
    if (autoSlot) return autoSlot;
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('wxops_last_slot') as UtcSlot | null;
      if (saved === '03Z' || saved === '12Z') return saved;
    }
    return '03Z';
  });

  const handleSlotChange = useCallback((slot: UtcSlot) => {
    setUtcSlot(slot);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('wxops_last_slot', slot);
      } catch {}
    }
  }, []);

  // 3. Theme selection with local persistence and migration
  const [currentTheme, setCurrentTheme] = useState<WorkstationTheme>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('wxops_theme');
      return resolveWorkstationTheme(saved);
    }
    return 'theme-blue';
  });

  const handleThemeChange = (theme: WorkstationTheme) => {
    setCurrentTheme(theme);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('wxops_theme', theme);
      } catch {}
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    document.title = 'WXOps Synop Report';
  }, [currentTheme]);

  // 4. Unified Operational Clock: DD/MM/YYYY HH:MM IST | HH:MM UTC
  const [clockString, setClockString] = useState<string>(() => formatOperationalClock(new Date()));

  // 5. Operational Observation Reminders (08:30 IST & 17:30 IST)
  const [dismissedReminders, setDismissedReminders] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem('wxops_dismissed_reminders');
        if (raw) return new Set(JSON.parse(raw));
      } catch {}
    }
    return new Set<string>();
  });

  const [activeReminder, setActiveReminder] = useState<ObservationReminderInfo | null>(null);
  const [dueReminderText, setDueReminderText] = useState<string | null>(null);

  // Clock interval & reminder check
  useEffect(() => {
    const checkReminder = () => {
      const now = new Date();
      setClockString(formatOperationalClock(now));

      const reminder = checkObservationReminder(now, dismissedReminders);
      if (reminder && !activeReminder) {
        setActiveReminder(reminder);
      }
    };

    checkReminder();
    const timer = setInterval(checkReminder, 1000);
    return () => clearInterval(timer);
  }, [dismissedReminders, activeReminder]);

  const recordReminderDismissal = useCallback((key: string) => {
    setDismissedReminders((prev) => {
      const next = new Set(prev);
      next.add(key);
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem('wxops_dismissed_reminders', JSON.stringify(Array.from(next)));
        } catch {}
      }
      return next;
    });
  }, []);

  const handleEnterObservation = (slot: '03Z' | '12Z') => {
    if (activeReminder) {
      recordReminderDismissal(activeReminder.reminderKey);
    }
    setActiveReminder(null);
    setDueReminderText(null);
    handleSlotChange(slot);
    // Focus textarea
    setTimeout(() => {
      synopTextareaRef.current?.focus();
    }, 50);
  };

  const handleReminderLater = () => {
    if (activeReminder) {
      recordReminderDismissal(activeReminder.reminderKey);
      setDueReminderText(`${activeReminder.timeLabel} Observation Due (${activeReminder.slot})`);
    }
    setActiveReminder(null);
  };

  // 6. Navigation: single hamburger sidebar state & about modal
  const [activeReport, setActiveReport] = useState<ReportViewType>('consolidated');
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);

  const [synopText, setSynopText] = useState<string>('');
  const [generationState, setGenerationState] = useState<GenerationState>('idle');
  const [reportsResult, setReportsResult] = useState<OperationalReportsResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 7. Station Report Inclusion (Ashoknagar 42665 disabled by default)
  const [stationInclusion, setStationInclusion] = useState<Record<string, boolean>>(() => loadStationInclusion());

  const handleStationInclusionChange = useCallback((stationId: string, enabled: boolean) => {
    setStationInclusion((prev) => {
      const next = { ...prev, [stationId]: enabled };
      saveStationInclusion(next);
      const excludedIds = getExcludedStationIds(next);
      const dates = observationStore.getArchivedDates();
      if (dates.length > 0 && dates.includes(reportingDate)) {
        try {
          const result = generateDailyReports(
            '',
            reportingDate,
            normalProvider,
            historicalProvider,
            {
              utcSlot,
              observationStore,
              excludedStationIds: excludedIds,
            }
          );
          if (result.enrichedObservations.length > 0) {
            setReportsResult(result);
          }
        } catch {}
      }
      return next;
    });
  }, [observationStore, normalProvider, historicalProvider, reportingDate, utcSlot]);

  const handleResetStationInclusion = useCallback(() => {
    const defaults = getDefaultStationInclusion();
    setStationInclusion(defaults);
    saveStationInclusion(defaults);
    const excludedIds = getExcludedStationIds(defaults);
    const dates = observationStore.getArchivedDates();
    if (dates.length > 0 && dates.includes(reportingDate)) {
      try {
        const result = generateDailyReports(
          '',
          reportingDate,
          normalProvider,
          historicalProvider,
          {
            utcSlot,
            observationStore,
            excludedStationIds: excludedIds,
          }
        );
        if (result.enrichedObservations.length > 0) {
          setReportsResult(result);
        }
      } catch {}
    }
  }, [observationStore, normalProvider, historicalProvider, reportingDate, utcSlot]);

  // 8. Operational date synchronization = automatically load and display reports if observations exist for reporting date, or reset to idle
  useEffect(() => {
    const dates = observationStore.getArchivedDates();
    if (dates.length > 0 && dates.includes(reportingDate)) {
      try {
        const result = generateDailyReports(
          '',
          reportingDate,
          normalProvider,
          historicalProvider,
          {
            utcSlot,
            observationStore,
            excludedStationIds: getExcludedStationIds(stationInclusion),
          }
        );
        if (result.enrichedObservations.length > 0) {
          setReportsResult(result);
          setGenerationState('success');
        } else {
          setReportsResult(null);
          setGenerationState('idle');
        }
      } catch {
        setReportsResult(null);
        setGenerationState('idle');
      }
    } else {
      setReportsResult(null);
      setGenerationState('idle');
    }
  }, [observationStore, normalProvider, historicalProvider, utcSlot, reportingDate, stationInclusion]);

  // Settings State inside sidebar
  const [retentionLimit, setRetentionLimit] = useState<number>(() => observationStore.getRetentionLimit());
  const [archiveDateCount, setArchiveDateCount] = useState<number>(() => observationStore.getArchiveSize());
  const [backupFormat, setBackupFormat] = useState<BackupFormat>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('wxops_backup_format') as BackupFormat | null;
      if (saved === 'JSON' || saved === 'CSV') return saved;
    }
    return 'JSON';
  });

  // Table Edit Mode: default OFF, remains disabled after page reload
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

  // Show Heatwave Count in Weather Summary (Default: Enabled)
  const [showHeatWaveCount, setShowHeatWaveCount] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('wxops_show_heat_wave_count');
      if (saved !== null) {
        return saved === 'true';
      }
      // Migrate from legacy combined key if present
      const legacy = window.localStorage.getItem('wxops_show_heat_cold_wave_count');
      if (legacy !== null) {
        return legacy === 'true';
      }
    }
    return true;
  });

  const handleShowHeatWaveCountChange = (val: boolean) => {
    setShowHeatWaveCount(val);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('wxops_show_heat_wave_count', String(val));
      } catch {}
    }
  };

  // Show Coldwave Count in Weather Summary (Default: Enabled)
  const [showColdWaveCount, setShowColdWaveCount] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('wxops_show_cold_wave_count');
      if (saved !== null) {
        return saved === 'true';
      }
      // Migrate from legacy combined key if present
      const legacy = window.localStorage.getItem('wxops_show_heat_cold_wave_count');
      if (legacy !== null) {
        return legacy === 'true';
      }
    }
    return true;
  });

  const handleShowColdWaveCountChange = (val: boolean) => {
    setShowColdWaveCount(val);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('wxops_show_cold_wave_count', String(val));
      } catch {}
    }
  };

  const [archiveNotification, setArchiveNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const synopTextareaRef = useRef<HTMLTextAreaElement>(null);

  const handleUpdateStationValue = useCallback(
    (
      stationId: string,
      field: EditableStationField,
      val: number | null
    ) => {
      // 1. Update persisted observation in store
      const updates: Partial<PersistedStationObservation> = {
        [field]: val,
      };
      if (field === 'rainfall' || field === 'rainfall0830') {
        updates.rainfall = val;
        updates.rainfall0830 = val;
      } else if (field === 'rainfall1730') {
        updates.rainfall1730 = val;
        if (utcSlot === '12Z') {
          updates.rainfall = val;
        }
      } else if (field === 'tmax') {
        updates.tmax = val;
        updates.tmaxDate = reportingDate;
      } else if (field === 'tmin') {
        updates.tmin = val;
        updates.tminDate = reportingDate;
      }
      observationStore.updateStationObservation(reportingDate, stationId, updates);

      // 2. Recalculate operational report data and summaries in real-time
      setReportsResult((prev) => {
        if (!prev) return prev;
        const stationEdits: Record<string, any> = { [field]: val };
        if (field === 'rainfall' || field === 'rainfall0830') {
          stationEdits.rainfall = val;
          stationEdits.rainfall0830 = val;
        } else if (field === 'rainfall1730') {
          stationEdits.rainfall1730 = val;
          if (utcSlot === '12Z') {
            stationEdits.rainfall = val;
          }
        }
        return recalculateReportsResult(
          prev,
          { [stationId]: stationEdits },
          normalProvider
        );
      });
    },
    [reportingDate, observationStore, normalProvider, utcSlot]
  );

  const handleRetentionChange = (limit: number) => {
    observationStore.setRetentionLimit(limit);
    setRetentionLimit(limit);
    setArchiveDateCount(observationStore.getArchiveSize());
    setArchiveNotification({
      type: 'success',
      message: `Retention updated to ${limit} days. Archive contains ${observationStore.getArchiveSize()} dates.`,
    });
  };

  const handleBackupFormatChange = (fmt: BackupFormat) => {
    setBackupFormat(fmt);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('wxops_backup_format', fmt);
      } catch {}
    }
  };

  const handleGenerate = () => {
    if (!reportingDate.trim()) {
      setErrorMessage('Please select a reporting date.');
      return;
    }

    if (!synopText.trim()) {
      setErrorMessage(`Please enter or paste raw ${utcSlot} SYNOP bulletin text.`);
      return;
    }

    setGenerationState('generating');
    setErrorMessage(null);
    setArchiveNotification(null);

    try {
      const result = generateDailyReports(
        synopText,
        reportingDate,
        normalProvider,
        historicalProvider,
        {
          utcSlot,
          observationStore,
          excludedStationIds: getExcludedStationIds(stationInclusion),
        }
      );

      setReportsResult(result);
      setGenerationState('success');
      setErrorMessage(null);
      setArchiveDateCount(observationStore.getArchiveSize());
    } catch (err: unknown) {
      setGenerationState('error');
      const detail = err instanceof Error ? ` (${err.message})` : '';
      setErrorMessage(`Unable to generate reports. Check the SYNOP bulletin and reporting date.${detail}`);
    }
  };

  const handleDownloadBackup = () => {
    try {
      const archive = observationStore.exportArchive();
      const latestDate =
        archive.metadata.dates.length > 0
          ? archive.metadata.dates[archive.metadata.dates.length - 1]
          : 'empty';

      if (backupFormat === 'CSV') {
        const csv = observationStore.exportArchiveCsv();
        const filename = `wxops_archive_${latestDate}.csv`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setArchiveNotification({
          type: 'success',
          message: `CSV downloaded: ${filename} (${archive.metadata.dateCount} dates, ${archive.metadata.stationCount} stations).`,
        });
      } else {
        const json = observationStore.exportArchiveJson(true);
        const filename = `wxops_archive_${latestDate}.json`;
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setArchiveNotification({
          type: 'success',
          message: `JSON downloaded: ${filename} (${archive.metadata.dateCount} dates, ${archive.metadata.stationCount} stations).`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      setArchiveNotification({
        type: 'error',
        message: `Download failed: ${msg}`,
      });
    }
  };

  const handleRestoreBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const result = observationStore.restoreArchive(text);
        if (result.success) {
          setArchiveDateCount(observationStore.getArchiveSize());
          const dates = result.datesRestored;
          if (dates.length > 0) {
            setReportingDate(dates[dates.length - 1]);
          }
          setArchiveNotification({
            type: 'success',
            message: `Archive restored: ${dates.length} dates, ${result.stationCount} stations.`,
          });
        } else {
          setArchiveNotification({
            type: 'error',
            message: `Restore rejected: ${result.error ?? 'Invalid archive file'}`,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Read error';
        setArchiveNotification({
          type: 'error',
          message: `Restore failed: ${msg}`,
        });
      }
    };
    reader.onerror = () => {
      setArchiveNotification({
        type: 'error',
        message: 'Failed to read the backup file.',
      });
    };
    reader.readAsText(file);
  };

  const handleImportHistoricalArchive = useCallback(
    (file: File, options?: ArchiveImportOptions): Promise<ArchiveImportSummary> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const text = e.target?.result as string;
            const summary = observationStore.importHistoricalArchive(text, options);
            if (summary.success) {
              setArchiveDateCount(observationStore.getArchiveSize());
              if (summary.datesImported.length > 0) {
                const latest = summary.datesImported[summary.datesImported.length - 1];
                userSelectedDateRef.current = true;
                setReportingDate(latest);
              }
              setArchiveNotification({
                type: 'success',
                message: `Archive import complete: ${summary.recordsAdded} added, ${summary.recordsUpdated} updated, ${summary.recordsSkipped} skipped across ${summary.datesImported.length} dates.`,
              });
              resolve(summary);
            } else {
              setArchiveNotification({
                type: 'error',
                message: `Archive import rejected: ${summary.error ?? 'Invalid archive file'}`,
              });
              resolve(summary);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Read error';
            setArchiveNotification({
              type: 'error',
              message: `Archive import failed: ${msg}`,
            });
            reject(err);
          }
        };
        reader.onerror = () => {
          setArchiveNotification({
            type: 'error',
            message: 'Failed to read the backup archive file.',
          });
          reject(new Error('Failed to read file'));
        };
        reader.readAsText(file);
      });
    },
    [observationStore]
  );

  const handleRevisedStationCode = () => {
    if (!reportingDate.trim()) {
      setErrorMessage('Please select a reporting date.');
      return;
    }

    if (!synopText.trim()) {
      setErrorMessage(`Please enter or paste raw revised ${utcSlot} SYNOP text.`);
      return;
    }

    setGenerationState('generating');
    setErrorMessage(null);
    setArchiveNotification(null);

    try {
      const result = generateDailyReports(
        synopText,
        reportingDate,
        normalProvider,
        historicalProvider,
        {
          utcSlot,
          observationStore,
          isRevision: true,
          excludedStationIds: getExcludedStationIds(stationInclusion),
        }
      );

      setReportsResult(result);
      setGenerationState('success');
      setErrorMessage(null);
      setArchiveDateCount(observationStore.getArchiveSize());
    } catch (err: unknown) {
      setGenerationState('error');
      const detail = err instanceof Error ? ` (${err.message})` : '';
      setErrorMessage(`Unable to process revised code.${detail}`);
    }
  };

  const handleDeleteAllData = () => {
    observationStore.clear();
    setArchiveDateCount(0);
    setReportsResult(null);
    setGenerationState('idle');
    setArchiveNotification({
      type: 'success',
      message: 'All stored operational observations have been deleted.',
    });
  };

  const handleClear = () => {
    setSynopText('');
    setErrorMessage(null);
  };

  const handlePrint = () => {
    window.print();
  };

  const reportTitleMap: Record<ReportViewType, string> = {
    consolidated: 'Consolidated Observation Report',
    summary: 'Weather Summary Report',
    subdivision: 'Subdivision-wise Observation Report',
  };

  // 1. Session verification in progress
  if (authState === 'checking') {
    return (
      <div className={`report-container session-loading-screen ${currentTheme}`}>
        <div style={{ textAlign: 'center' }}>
          <span className="station-badge">IMD MET-REP</span>
          <p style={{ marginTop: '0.5rem', fontWeight: 600 }}>Verifying meteorological workstation session...</p>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated: Display Login Screen
  if (authState === 'unauthenticated') {
    return (
      <LoginScreen
        currentTheme={currentTheme}
        onLoginSuccess={(identity) => {
          setCurrentIdentity(identity);
          setAuthState('authenticated');
        }}
      />
    );
  }

  // 3. Authenticated: Render protected WXOps Application
  return (
    <div className={`report-container ${currentTheme}`}>
      {/* Header: Title on Left, Clock + Hamburger on Right */}
      <AppHeader
        onToggleMenu={() => setIsMenuOpen((prev) => !prev)}
        clockString={clockString}
        currentIdentity={currentIdentity}
        onLogout={handleLogout}
      />

      {/* Hamburger Sidebar (Reports & Integrated Settings) */}
      <HamburgerMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeReport={activeReport}
        onSelectReport={setActiveReport}
        archiveDateCount={archiveDateCount}
        retentionLimit={retentionLimit}
        onRetentionChange={handleRetentionChange}
        backupFormat={backupFormat}
        onBackupFormatChange={handleBackupFormatChange}
        currentTheme={currentTheme}
        onThemeChange={handleThemeChange}
        onDownloadBackup={handleDownloadBackup}
        onRestoreBackup={handleRestoreBackup}
        onImportHistoricalArchive={handleImportHistoricalArchive}
        archivedDates={observationStore.getArchivedDates()}
        activeReportingDate={reportingDate}
        onSelectReportingDate={handleReportingDateChange}
        stationInclusion={stationInclusion}
        onStationInclusionChange={handleStationInclusionChange}
        onResetStationInclusion={handleResetStationInclusion}
        archiveNotification={archiveNotification}
        isEditMode={isEditMode}
        onEditModeChange={setIsEditMode}
        showHeatWaveCount={showHeatWaveCount}
        onShowHeatWaveCountChange={handleShowHeatWaveCountChange}
        showColdWaveCount={showColdWaveCount}
        onShowColdWaveCountChange={handleShowColdWaveCountChange}
        onDeleteAllData={handleDeleteAllData}
        currentIdentity={currentIdentity}
        onLogout={handleLogout}
        onOpenAbout={() => setIsAboutOpen(true)}
      />

      {/* About WXOps Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      {/* Operational Reminder Popup */}
      <ObservationReminderModal
        reminder={activeReminder}
        onEnterObservation={handleEnterObservation}
        onLater={handleReminderLater}
      />

      {/* Dedicated Print-only Header */}
      {reportsResult && (
        <header className="print-only">
          <div className="print-header-title">
            WXOps Operational Meteorological Reports: {reportTitleMap[activeReport]}
          </div>
          <div className="print-header-meta">
            <strong>Observation Date:</strong> {reportsResult.reportingDate} (0830 IST) &nbsp;|&nbsp;&nbsp;
            <strong>Previous Day Evening:</strong> {reportsResult.eveningDate} (1730 IST)
          </div>
        </header>
      )}

      {/* Single Reporting Date & Observation Entry */}
      <SynopInput
        ref={synopTextareaRef}
        reportingDate={reportingDate}
        onReportingDateChange={handleReportingDateChange}
        utcSlot={utcSlot}
        onUtcSlotChange={handleSlotChange}
        synopText={synopText}
        onSynopTextChange={setSynopText}
        onGenerate={handleGenerate}
        onClear={handleClear}
        isGenerating={generationState === 'generating'}
        errorMessage={errorMessage}
        dueReminderText={dueReminderText}
      />

      {/* Processing Summary Bar */}
      {reportsResult && (
        <section className="status-bar no-print" aria-label="Processing Summary">
          <div className="status-meta">
            <strong>Active Bulletin ({reportsResult.utcSlot ?? utcSlot}):</strong>{' '}
            {reportsResult.subdivisions.length} subdivisions &bull;{' '}
            {reportsResult.enrichedObservations.length} stations retained
            {reportsResult.unrecognizedStationIds.length > 0 && (
              <span className="unrecognized-warning">
                {' '}&bull; {reportsResult.unrecognizedStationIds.length} unrecognized station IDs
              </span>
            )}
          </div>
        </section>
      )}

      {/* Report View Toolbar (Print only) */}
      {reportsResult && (
        <ReportToolbar
          reportTitle={reportTitleMap[activeReport]}
          reportingDate={reportsResult.reportingDate}
          eveningDate={reportsResult.eveningDate}
          onPrint={handlePrint}
        />
      )}

      {/* Table Edit Mode Banner */}
      {isEditMode && reportsResult && (
        <aside className="edit-mode-banner no-print" role="status" aria-label="Table Edit Mode Active">
          <div className="edit-mode-banner-left">
            <span className="edit-mode-badge">Table Edit Mode Active</span>
            <span>
              Observation values are directly editable inside the table. Changes update the store and recalculate statistics in real time.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-xs btn-exit-edit"
            onClick={() => setIsEditMode(false)}
          >
            Exit Edit Mode
          </button>
        </aside>
      )}

      {/* Currently Selected Report View */}
      {reportsResult && activeReport === 'consolidated' && (
        <div className="active-report-view">
          <Report1StationTable
            subdivisions={reportsResult.subdivisions}
            reportingDate={reportsResult.reportingDate}
            eveningDate={reportsResult.eveningDate}
            isEditMode={isEditMode}
            onUpdateStationValue={handleUpdateStationValue}
          />
        </div>
      )}

      {reportsResult && activeReport === 'summary' && (
        <div className="active-report-view">
          <Report2SummaryTable
            subdivisions={reportsResult.subdivisions}
            reportingDate={reportsResult.reportingDate}
            showHeatWaveCount={showHeatWaveCount}
            showColdWaveCount={showColdWaveCount}
          />
        </div>
      )}

      {reportsResult && activeReport === 'subdivision' && (
        <div className="active-report-view">
          <Report3SubdivisionView
            subdivisions={reportsResult.subdivisions}
            reportingDate={reportsResult.reportingDate}
            eveningDate={reportsResult.eveningDate}
            isEditMode={isEditMode}
            onUpdateStationValue={handleUpdateStationValue}
          />
        </div>
      )}
    </div>
  );
}
