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
import { SynopInput, shiftDateString } from './components/SynopInput.tsx';
import { MinimalInputView } from './components/MinimalInputView.tsx';
import { ObservationModal } from './components/ObservationModal.tsx';
import { Report1StationTable } from './components/Report1StationTable.tsx';
import { Report2SummaryTable } from './components/Report2SummaryTable.tsx';
import { Report3SubdivisionView } from './components/Report3SubdivisionView.tsx';
import { AppHeader } from './components/AppHeader.tsx';
import {
  HamburgerMenu,
  type ReportViewType,
  type BackupFormat,
  type WorkstationTheme,
  type OperationalViewMode,
  resolveWorkstationTheme,
} from './components/HamburgerMenu.tsx';
import { getSlotObservationStatus, formatMinimalDateParts } from './utils/observationStatus.ts';
import { ReportToolbar } from './components/ReportToolbar.tsx';
import { ObservationReminderModal } from './components/ObservationReminderModal.tsx';
import { AboutModal } from './components/AboutSection.tsx';
import type { EditableStationField } from './components/Report1StationTable.tsx';
import {
  getAutoUtcSlot,
  getDefaultReportSlot,
  getTodayKolkata,
  formatOperationalClock,
  checkObservationReminder,
  type ObservationReminderInfo,
} from './utils/timeSlot.ts';
import { LoginScreen } from './components/LoginScreen.tsx';
import { authClient } from './auth/authClient.ts';
import type { WorkstationIdentity } from './server/authService.ts';
import { sharedObservationClient, type StorageStatus } from './engine/sharedObservationClient.ts';
import {
  OverwriteConfirmationModal,
  type OverwriteStationItem,
} from './components/OverwriteConfirmationModal.tsx';
import { parseSynopBulletin, parse12ZBulletin } from './parser/synopDecoder.ts';
import { getStation } from './constants/stationRegistry.ts';
import './styles/reports.css';

type GenerationState = 'idle' | 'generating' | 'success' | 'error';

function detectOverwrites(
  slot: UtcSlot,
  bulletin: string,
  date: string,
  store: typeof defaultObservationStore
): OverwriteStationItem[] {
  const overwrittenItems: OverwriteStationItem[] = [];
  if (!bulletin.trim()) return overwrittenItems;

  if (slot === '03Z') {
    const parsedObsList = parseSynopBulletin(bulletin);
    for (const parsed of parsedObsList) {
      const existing = store.getStationObservation(parsed.stationId, date);
      if (existing) {
        const hasExisting03Z =
          (existing.tmin !== null && existing.tmin !== undefined) ||
          (existing.dryBulb0830 !== null && existing.dryBulb0830 !== undefined) ||
          (existing.rainfall0830 !== null && existing.rainfall0830 !== undefined) ||
          (existing.rainfall !== null && existing.rainfall !== undefined) ||
          (existing.mslPressure0830 !== null && existing.mslPressure0830 !== undefined);

        if (hasExisting03Z) {
          const diffs: OverwriteStationItem['diffs'] = [];
          if (parsed.tmin !== null && parsed.tmin !== undefined) {
            diffs.push({
              field: 'tmin',
              label: 'Min Temp (Tmin)',
              currentValue: existing.tmin !== null && existing.tmin !== undefined ? `${existing.tmin}°C` : null,
              incomingValue: `${parsed.tmin}°C`,
            });
          }
          if (parsed.dryBulb !== null && parsed.dryBulb !== undefined) {
            diffs.push({
              field: 'dryBulb',
              label: 'Dry Bulb Temp',
              currentValue: existing.dryBulb0830 !== null && existing.dryBulb0830 !== undefined ? `${existing.dryBulb0830}°C` : null,
              incomingValue: `${parsed.dryBulb}°C`,
            });
          }
          if (parsed.relativeHumidity !== null && parsed.relativeHumidity !== undefined) {
            diffs.push({
              field: 'relativeHumidity',
              label: 'Relative Humidity',
              currentValue: existing.rh0830 !== null && existing.rh0830 !== undefined ? `${existing.rh0830}%` : null,
              incomingValue: `${parsed.relativeHumidity}%`,
            });
          }
          if (parsed.rainfall !== null && parsed.rainfall !== undefined) {
            const curR = existing.rainfall0830 ?? existing.rainfall;
            diffs.push({
              field: 'rainfall',
              label: '24h Rainfall',
              currentValue: curR !== null && curR !== undefined ? `${curR} mm` : null,
              incomingValue: `${parsed.rainfall} mm`,
            });
          }
          if (parsed.mslPressure !== null && parsed.mslPressure !== undefined) {
            diffs.push({
              field: 'mslPressure',
              label: 'MSL Pressure',
              currentValue: existing.mslPressure0830 !== null && existing.mslPressure0830 !== undefined ? `${existing.mslPressure0830} hPa` : null,
              incomingValue: `${parsed.mslPressure} hPa`,
            });
          }

          const stn = getStation(parsed.stationId);
          overwrittenItems.push({
            stationId: parsed.stationId,
            stationName: stn?.name || parsed.stationId,
            diffs,
          });
        }
      }
    }
  } else {
    // 12Z observation
    const parsedObsList = parse12ZBulletin(bulletin);
    for (const parsed of parsedObsList) {
      const existing = store.getStationObservation(parsed.stationId, date);
      if (existing) {
        const hasExisting12Z =
          (existing.tmax !== null && existing.tmax !== undefined) ||
          (existing.rh1730 !== null && existing.rh1730 !== undefined) ||
          (existing.rainfall1730 !== null && existing.rainfall1730 !== undefined);

        if (hasExisting12Z) {
          const diffs: OverwriteStationItem['diffs'] = [];
          if (parsed.tmax !== null && parsed.tmax !== undefined) {
            diffs.push({
              field: 'tmax',
              label: 'Max Temp (Tmax)',
              currentValue: existing.tmax !== null && existing.tmax !== undefined ? `${existing.tmax}°C` : null,
              incomingValue: `${parsed.tmax}°C`,
            });
          }
          if (parsed.relativeHumidity !== null && parsed.relativeHumidity !== undefined) {
            diffs.push({
              field: 'rh1730',
              label: '17:30 IST RH',
              currentValue: existing.rh1730 !== null && existing.rh1730 !== undefined ? `${existing.rh1730}%` : null,
              incomingValue: `${parsed.relativeHumidity}%`,
            });
          }
          if (parsed.rainfall !== null && parsed.rainfall !== undefined) {
            diffs.push({
              field: 'rainfall1730',
              label: '17:30 IST Rainfall',
              currentValue: existing.rainfall1730 !== null && existing.rainfall1730 !== undefined ? `${existing.rainfall1730} mm` : null,
              incomingValue: `${parsed.rainfall} mm`,
            });
          }
          if (parsed.mslPressure !== null && parsed.mslPressure !== undefined) {
            diffs.push({
              field: 'mslPressure',
              label: 'MSL Pressure',
              currentValue: existing.mslPressure1730 !== null && existing.mslPressure1730 !== undefined ? `${existing.mslPressure1730} hPa` : null,
              incomingValue: `${parsed.mslPressure} hPa`,
            });
          }

          const stn = getStation(parsed.stationId);
          overwrittenItems.push({
            stationId: parsed.stationId,
            stationName: stn?.name || parsed.stationId,
            diffs,
          });
        }
      }
    }
  }

  return overwrittenItems;
}

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
    setDbStatus(null);
    setIsMenuOpen(false);
  }, []);

  // Shared Database & Cloud Storage Status
  const [dbStatus, setDbStatus] = useState<StorageStatus | null>(null);

  const refreshDbStatus = useCallback(async () => {
    try {
      const status = await sharedObservationClient.getStatus();
      setDbStatus(status);
      return status;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (authState === 'authenticated') {
      refreshDbStatus();
    }
  }, [authState, refreshDbStatus]);

  // 1. Single Reporting Date (strictly defaults to current Asia/Kolkata date)
  const [reportingDate, setReportingDate] = useState<string>(() => getTodayKolkata());
  // Tracks whether the user has deliberately selected a date during the active session
  const userSelectedDateRef = useRef<boolean>(false);

  const handleReportingDateChange = useCallback((newDate: string) => {
    userSelectedDateRef.current = true;
    setReportingDate(newDate);
    setPendingOverwriteStations([]);
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
    setPendingOverwriteStations([]);
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
  const [minimalActiveReport, setMinimalActiveReport] = useState<ReportViewType | null>(null);
  // Observation report issue slot (03Z vs 12Z).
  // Automatically defaults to 03Z before 14:00 IST, and 12Z at/after 14:00 IST.
  const [reportSlot, setReportSlot] = useState<UtcSlot>(() => getDefaultReportSlot());
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);

  const [synopText, setSynopText] = useState<string>('');
  const [generationState, setGenerationState] = useState<GenerationState>('idle');
  const [reportsResult, setReportsResult] = useState<OperationalReportsResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 7. Station Report Inclusion (Ashoknagar 42665 disabled by default)
  const [stationInclusion, setStationInclusion] = useState<Record<string, boolean>>(() => loadStationInclusion());

  const handleReportSlotChange = useCallback(
    (slot: UtcSlot) => {
      setReportSlot(slot);
      const dates = observationStore.getArchivedDates();
      if (dates.length > 0 && dates.includes(reportingDate)) {
        try {
          const effectiveSlot: UtcSlot =
            activeReport === 'summary' || minimalActiveReport === 'summary' ? '03Z' : slot;
          const result = generateDailyReports('', reportingDate, normalProvider, historicalProvider, {
            utcSlot: effectiveSlot,
            observationStore,
            excludedStationIds: getExcludedStationIds(stationInclusion),
          });
          if (result.enrichedObservations.length > 0) {
            setReportsResult(result);
          }
        } catch (err) {
          console.error('Failed to regenerate reports on slot change:', err);
        }
      }
    },
    [observationStore, reportingDate, normalProvider, historicalProvider, stationInclusion, activeReport, minimalActiveReport]
  );

  const handleStationInclusionChange = useCallback((stationId: string, enabled: boolean) => {
    setStationInclusion((prev) => {
      const next = { ...prev, [stationId]: enabled };
      saveStationInclusion(next);
      const excludedIds = getExcludedStationIds(next);
      const dates = observationStore.getArchivedDates();
      if (dates.length > 0 && dates.includes(reportingDate)) {
        try {
          const effectiveSlot: UtcSlot =
            activeReport === 'summary' || minimalActiveReport === 'summary' ? '03Z' : reportSlot;
          const result = generateDailyReports(
            '',
            reportingDate,
            normalProvider,
            historicalProvider,
            {
              utcSlot: effectiveSlot,
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
  }, [observationStore, normalProvider, historicalProvider, reportingDate, reportSlot, activeReport, minimalActiveReport]);

  const handleResetStationInclusion = useCallback(() => {
    const defaults = getDefaultStationInclusion();
    setStationInclusion(defaults);
    saveStationInclusion(defaults);
    const excludedIds = getExcludedStationIds(defaults);
    const dates = observationStore.getArchivedDates();
    if (dates.length > 0 && dates.includes(reportingDate)) {
      try {
        const effectiveSlot: UtcSlot =
          activeReport === 'summary' || minimalActiveReport === 'summary' ? '03Z' : reportSlot;
        const result = generateDailyReports(
          '',
          reportingDate,
          normalProvider,
          historicalProvider,
          {
            utcSlot: effectiveSlot,
            observationStore,
            excludedStationIds: excludedIds,
          }
        );
        if (result.enrichedObservations.length > 0) {
          setReportsResult(result);
        }
      } catch {}
    }
  }, [observationStore, normalProvider, historicalProvider, reportingDate, reportSlot, activeReport, minimalActiveReport]);

  // 8. Operational date synchronization = automatically load and display reports if observations exist for reporting date, or reset to idle
  useEffect(() => {
    const dates = observationStore.getArchivedDates();
    if (dates.length > 0 && dates.includes(reportingDate)) {
      try {
        const effectiveSlot: UtcSlot =
          activeReport === 'summary' || minimalActiveReport === 'summary' ? '03Z' : reportSlot;
        const result = generateDailyReports(
          '',
          reportingDate,
          normalProvider,
          historicalProvider,
          {
            utcSlot: effectiveSlot,
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
  }, [observationStore, normalProvider, historicalProvider, reportSlot, activeReport, minimalActiveReport, reportingDate, stationInclusion]);

  // Settings State inside sidebar
  const [retentionLimit, setRetentionLimit] = useState<number>(() => observationStore.getRetentionLimit());
  const [archiveDateCount, setArchiveDateCount] = useState<number>(() => observationStore.getArchiveSize());

  // Automatically fetch remote observations from PostgreSQL when reportingDate changes
  useEffect(() => {
    if (authState === 'authenticated' && dbStatus?.configured && dbStatus.healthy) {
      sharedObservationClient.loadDateObservations(reportingDate).then(() => {
        setArchiveDateCount(observationStore.getArchiveSize());
        const dates = observationStore.getArchivedDates();
        if (dates.includes(reportingDate)) {
          try {
            const effectiveSlot: UtcSlot =
              activeReport === 'summary' || minimalActiveReport === 'summary' ? '03Z' : reportSlot;
            const result = generateDailyReports(
              '',
              reportingDate,
              normalProvider,
              historicalProvider,
              {
                utcSlot: effectiveSlot,
                observationStore,
                excludedStationIds: getExcludedStationIds(stationInclusion),
              }
            );
            if (result.enrichedObservations.length > 0) {
              setReportsResult(result);
              setGenerationState('success');
            }
          } catch {}
        }
      }).catch(() => {});
    }
  }, [authState, reportingDate, dbStatus?.configured, dbStatus?.healthy, observationStore, normalProvider, historicalProvider, reportSlot, activeReport, minimalActiveReport, stationInclusion]);
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

  // Visibility Column in Reports (Default: Disabled)
  const [showVisibility, setShowVisibility] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('wxops_show_visibility_column');
      if (saved !== null) return saved === 'true';
    }
    return false;
  });

  const handleShowVisibilityChange = (val: boolean) => {
    setShowVisibility(val);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('wxops_show_visibility_column', String(val));
      } catch {}
    }
  };

  // Allow Editing Historical Dates (Default: Disabled)
  const [allowHistoricalEdits, setAllowHistoricalEdits] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('wxops_allow_historical_edits');
      if (saved !== null) return saved === 'true';
    }
    return false;
  });

  const handleAllowHistoricalEditsChange = (val: boolean) => {
    setAllowHistoricalEdits(val);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('wxops_allow_historical_edits', String(val));
      } catch {}
    }
  };

  // Syntax Highlighting (Default: Enabled)
  const [syntaxHighlightingEnabled, setSyntaxHighlightingEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('wxops_syntax_highlighting');
      if (saved !== null) return saved === 'true';
    }
    return true;
  });

  const handleSyntaxHighlightingEnabledChange = (val: boolean) => {
    setSyntaxHighlightingEnabled(val);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('wxops_syntax_highlighting', String(val));
      } catch {}
    }
  };

  // Operational View Mode (Default: Minimal)
  const [viewMode, setViewMode] = useState<OperationalViewMode>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('wxops_view_mode');
      if (saved === 'minimal' || saved === 'standard') return saved;
    }
    return 'minimal';
  });

  const handleViewModeChange = (mode: OperationalViewMode) => {
    setViewMode(mode);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('wxops_view_mode', mode);
      } catch {}
    }
  };

  // Observation Modal state for minimal view
  const [isObservationModalOpen, setIsObservationModalOpen] = useState<boolean>(false);
  const [modalSlot, setModalSlot] = useState<UtcSlot>('03Z');

  const handleOpenSlotModal = (slot: UtcSlot) => {
    setUtcSlot(slot);
    setModalSlot(slot);
    setSynopText('');
    setErrorMessage(null);
    setIsObservationModalOpen(true);
  };

  // Minimal view active report date parts
  const minimalNavDateParts = useMemo(
    () => formatMinimalDateParts(reportingDate),
    [reportingDate]
  );

  const handleViewReportFromMinimal = (report: ReportViewType) => {
    setActiveReport(report);
    setMinimalActiveReport(report);
    const effectiveSlot: UtcSlot = report === 'summary' ? '03Z' : reportSlot;
    try {
      const res = generateDailyReports('', reportingDate, normalProvider, historicalProvider, {
        utcSlot: effectiveSlot,
        observationStore,
        excludedStationIds: getExcludedStationIds(stationInclusion),
      });
      if (res.enrichedObservations.length > 0) {
        setReportsResult(res);
      }
    } catch {}
  };

  // Overwrite Confirmation Modal State
  const [pendingOverwriteStations, setPendingOverwriteStations] = useState<OverwriteStationItem[]>([]);
  const [isOverwriteModalOpen, setIsOverwriteModalOpen] = useState<boolean>(false);

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

      // Async persist to PostgreSQL if configured
      if (dbStatus?.configured && dbStatus.healthy) {
        sharedObservationClient.updateStationObservation(reportingDate, stationId, updates).catch((err) => {
          console.error('Failed to persist manual edit to PostgreSQL:', err);
        });
      }

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

  const commitBulletin = async () => {
    setIsOverwriteModalOpen(false);
    setPendingOverwriteStations([]);
    setGenerationState('generating');
    setErrorMessage(null);
    setArchiveNotification(null);

    try {
      if (dbStatus?.configured && dbStatus.healthy) {
        await sharedObservationClient.ingestBulletin(utcSlot, synopText, reportingDate);
        await refreshDbStatus();
      }

      setReportSlot(utcSlot);

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
      setIsObservationModalOpen(false);
    } catch (err: unknown) {
      setGenerationState('error');
      const detail = err instanceof Error ? ` (${err.message})` : '';
      setErrorMessage(`Unable to generate reports. Check the SYNOP bulletin and reporting date.${detail}`);
    }
  };

  const handleGenerate = async () => {
    if (!reportingDate.trim()) {
      setErrorMessage('Please select a reporting date.');
      return;
    }

    if (!synopText.trim()) {
      setErrorMessage(`Please enter or paste raw ${utcSlot} SYNOP bulletin text.`);
      return;
    }

    // Check for resubmitted stations on the same date/slot
    const overwrites = detectOverwrites(utcSlot, synopText, reportingDate, observationStore);
    if (overwrites.length > 0) {
      setPendingOverwriteStations(overwrites);
      setIsOverwriteModalOpen(false);
      return;
    }

    await commitBulletin();
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

  const handleRevisedStationCode = async () => {
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
      if (dbStatus?.configured && dbStatus.healthy) {
        await sharedObservationClient.ingestBulletin(utcSlot, synopText, reportingDate);
        await refreshDbStatus();
      }

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

  const handleMigrateToDatabase = useCallback(async () => {
    try {
      const archive = observationStore.exportArchive();
      if (archive.metadata.dateCount === 0) {
        setArchiveNotification({
          type: 'error',
          message: 'No local observations available to migrate.',
        });
        return;
      }

      // 1. Export safety backup locally before upload
      handleDownloadBackup();

      setArchiveNotification({
        type: 'success',
        message: 'Uploading local observations to shared PostgreSQL database...',
      });

      const res = await sharedObservationClient.syncToDatabase({
        archive,
        duplicatePolicy: 'merge_fields',
      });

      if (res.success) {
        await refreshDbStatus();
        setArchiveNotification({
          type: 'success',
          message: `Migration complete: ${res.datesRestored} dates (${res.stationCount} stations) synced to PostgreSQL.`,
        });
      } else {
        setArchiveNotification({
          type: 'error',
          message: 'Database migration failed. Local buffer remains intact.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setArchiveNotification({
        type: 'error',
        message: `Migration error: ${msg}`,
      });
    }
  }, [observationStore, handleDownloadBackup, refreshDbStatus]);

  const handleDeleteAllData = async () => {
    let dbPurgeError: string | null = null;
    try {
      if (dbStatus?.configured) {
        await sharedObservationClient.clearAll('DELETE');
        await refreshDbStatus();
      }
    } catch (err: unknown) {
      console.error('Failed to purge PostgreSQL observations:', err);
      dbPurgeError = err instanceof Error ? err.message : String(err);
    }
    observationStore.clear();
    setArchiveDateCount(0);
    setReportsResult(null);
    setGenerationState('idle');
    if (dbPurgeError) {
      setArchiveNotification({
        type: 'error',
        message: `Local buffer cleared, but error clearing Supabase database: ${dbPurgeError}`,
      });
    } else {
      setArchiveNotification({
        type: 'success',
        message: dbStatus?.configured
          ? 'Clean slate achieved: all stored observations have been permanently deleted from both local buffer and Supabase PostgreSQL database.'
          : 'Clean slate achieved: all stored observations have been deleted from local buffer.',
      });
    }
  };

  const handleClear = () => {
    setSynopText('');
    setErrorMessage(null);
    setPendingOverwriteStations([]);
  };

  const handlePrint = () => {
    window.print();
  };

  const status03Z = useMemo(() => {
    return getSlotObservationStatus(reportingDate, '03Z', observationStore);
  }, [reportingDate, observationStore, archiveDateCount, reportsResult]);

  const status12Z = useMemo(() => {
    return getSlotObservationStatus(reportingDate, '12Z', observationStore);
  }, [reportingDate, observationStore, archiveDateCount, reportsResult]);

  const reportTitleMap: Record<ReportViewType, string> = {
    consolidated: 'Consolidated Observation Report',
    summary: 'Weather Summary Report',
    subdivision: 'Subdivision-wise Observation Report',
  };

  const getPrintReportTitle = (reportType: ReportViewType | null): string => {
    if (reportType === 'consolidated') {
      return 'CONSOLIDATED DAILY WEATHER REPORT — STATION OBSERVATIONS';
    }
    if (reportType === 'summary') {
      return 'DAILY WEATHER REPORT — Weather Summary and 7-Day Forecast';
    }
    if (reportType === 'subdivision') {
      return 'SUBDIVISION-WISE DAILY WEATHER OBSERVATIONS';
    }
    return 'DAILY OPERATIONAL METEOROLOGICAL REPORT';
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
        onSelectReport={(report) => {
          setActiveReport(report);
          if (minimalActiveReport !== null) {
            setMinimalActiveReport(report);
          }
          const effectiveSlot: UtcSlot = report === 'summary' ? '03Z' : reportSlot;
          const dates = observationStore.getArchivedDates();
          if (dates.includes(reportingDate)) {
            try {
              const res = generateDailyReports('', reportingDate, normalProvider, historicalProvider, {
                utcSlot: effectiveSlot,
                observationStore,
                excludedStationIds: getExcludedStationIds(stationInclusion),
              });
              if (res.enrichedObservations.length > 0) {
                setReportsResult(res);
              }
            } catch {}
          }
        }}
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
        showVisibility={showVisibility}
        onShowVisibilityChange={handleShowVisibilityChange}
        allowHistoricalEdits={allowHistoricalEdits}
        onAllowHistoricalEditsChange={handleAllowHistoricalEditsChange}
        syntaxHighlightingEnabled={syntaxHighlightingEnabled}
        onSyntaxHighlightingEnabledChange={handleSyntaxHighlightingEnabledChange}
        onDeleteAllData={handleDeleteAllData}
        currentIdentity={currentIdentity}
        onLogout={handleLogout}
        dbStatus={dbStatus}
        onMigrateToDatabase={handleMigrateToDatabase}
        onOpenAbout={() => setIsAboutOpen(true)}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
      />

      {/* Confirm Overwrite Modal */}
      <OverwriteConfirmationModal
        isOpen={isOverwriteModalOpen}
        onClose={() => {
          setIsOverwriteModalOpen(false);
          setPendingOverwriteStations([]);
        }}
        onConfirm={commitBulletin}
        reportingDate={reportingDate}
        utcSlot={utcSlot}
        overwrittenStations={pendingOverwriteStations}
      />

      {/* Observation Modal for 03Z and 12Z Submission */}
      <ObservationModal
        isOpen={isObservationModalOpen}
        onClose={() => setIsObservationModalOpen(false)}
        slot={modalSlot}
        reportingDate={reportingDate}
        onReportingDateChange={handleReportingDateChange}
        synopText={synopText}
        onSynopTextChange={setSynopText}
        onGenerate={handleGenerate}
        onClear={handleClear}
        isGenerating={generationState === 'generating'}
        errorMessage={errorMessage}
        allowHistoricalEdits={allowHistoricalEdits}
        syntaxHighlightingEnabled={syntaxHighlightingEnabled}
        validationContext={{
          reportingDate,
          normalProvider,
          observationStore,
        }}
        slotStatusLabel={modalSlot === '03Z' ? status03Z.statusLabel : status12Z.statusLabel}
        pendingOverwrites={pendingOverwriteStations}
        onConfirmOverwrite={commitBulletin}
        onCancelOverwrite={() => setPendingOverwriteStations([])}
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

      {/* Operational View: Minimal vs Standard */}
      {viewMode === 'minimal' ? (
        minimalActiveReport === null ? (
          <MinimalInputView
            reportingDate={reportingDate}
            onReportingDateChange={handleReportingDateChange}
            status03Z={status03Z}
            status12Z={status12Z}
            onOpenSlot={handleOpenSlotModal}
            onViewReport={handleViewReportFromMinimal}
            isGenerating={generationState === 'generating'}
          />
        ) : (
          <div className="minimal-report-page-container">
            {/* Top Return & Navigation Toolbar */}
            <div className="minimal-report-nav-bar no-print">
              <div className="minimal-report-nav-left">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm btn-return-minimal"
                  onClick={() => setMinimalActiveReport(null)}
                  title="Back to Minimal Observation Entry"
                  aria-label="Back to Minimal Observation Entry"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                </button>

                {/* Inline Date Selector with Stepper Arrows, Large Day, Month in MMMM in grey, and Calendar Icon */}
                <div className="minimal-nav-date-selector" aria-label="Switch Report Date">
                  <button
                    type="button"
                    className="minimal-arrow-btn minimal-nav-arrow-btn"
                    onClick={() => handleReportingDateChange(shiftDateString(reportingDate, -1))}
                    disabled={generationState === 'generating' || !reportingDate}
                    title="Previous Day Report"
                    aria-label="Previous Day Report"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>

                  <div className="minimal-nav-date-display" title={`Observation Date: ${reportingDate}`}>
                    <span className="minimal-nav-day-number">{minimalNavDateParts.day}</span>
                    <span className="minimal-nav-month-name">{minimalNavDateParts.monthName}</span>
                  </div>

                  <button
                    type="button"
                    className="minimal-arrow-btn minimal-nav-arrow-btn"
                    onClick={() => handleReportingDateChange(shiftDateString(reportingDate, 1))}
                    disabled={generationState === 'generating' || !reportingDate}
                    title="Next Day Report"
                    aria-label="Next Day Report"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>

                  <label
                    className={`minimal-calendar-btn minimal-nav-calendar-btn ${generationState === 'generating' ? 'disabled' : ''}`}
                    title="Select Date from Calendar"
                    aria-label="Select Date from Calendar"
                  >
                    <input
                      type="date"
                      className="minimal-native-date-overlay"
                      value={reportingDate}
                      onChange={(e) => {
                        if (e.target.value) {
                          handleReportingDateChange(e.target.value);
                        }
                      }}
                      disabled={generationState === 'generating'}
                      aria-label="Choose Report Date"
                    />
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </label>
                </div>
              </div>

              <div className="minimal-report-tabs" role="tablist" aria-label="Switch Report View">
                <button
                  type="button"
                  role="tab"
                  aria-selected={minimalActiveReport === 'consolidated'}
                  className={`btn-seg ${minimalActiveReport === 'consolidated' ? 'active' : ''}`}
                  onClick={() => {
                    setMinimalActiveReport('consolidated');
                    setActiveReport('consolidated');
                    try {
                      const res = generateDailyReports('', reportingDate, normalProvider, historicalProvider, {
                        utcSlot: reportSlot,
                        observationStore,
                        excludedStationIds: getExcludedStationIds(stationInclusion),
                      });
                      if (res.enrichedObservations.length > 0) setReportsResult(res);
                    } catch {}
                  }}
                  title="Consolidated Observation Report"
                >
                  <span className="tab-text-full">Consolidated Report</span>
                  <span className="tab-text-compact">Consolidated</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={minimalActiveReport === 'summary'}
                  className={`btn-seg ${minimalActiveReport === 'summary' ? 'active' : ''}`}
                  onClick={() => {
                    setMinimalActiveReport('summary');
                    setActiveReport('summary');
                    try {
                      const res = generateDailyReports('', reportingDate, normalProvider, historicalProvider, {
                        utcSlot: '03Z',
                        observationStore,
                        excludedStationIds: getExcludedStationIds(stationInclusion),
                      });
                      if (res.enrichedObservations.length > 0) setReportsResult(res);
                    } catch {}
                  }}
                  title="Weather Summary Report"
                >
                  <span className="tab-text-full">Weather Summary</span>
                  <span className="tab-text-compact">Summary</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={minimalActiveReport === 'subdivision'}
                  className={`btn-seg ${minimalActiveReport === 'subdivision' ? 'active' : ''}`}
                  onClick={() => {
                    setMinimalActiveReport('subdivision');
                    setActiveReport('subdivision');
                    try {
                      const res = generateDailyReports('', reportingDate, normalProvider, historicalProvider, {
                        utcSlot: reportSlot,
                        observationStore,
                        excludedStationIds: getExcludedStationIds(stationInclusion),
                      });
                      if (res.enrichedObservations.length > 0) setReportsResult(res);
                    } catch {}
                  }}
                  title="Subdivision-wise Observation Report (Vidarbha default)"
                >
                  <span className="tab-text-full">Subdivision-wise (Vidarbha)</span>
                  <span className="tab-text-compact">Vidarbha</span>
                </button>
              </div>

              {/* 03Z / 12Z Report Slot Switcher for Consolidated & Subdivision Reports */}
              {(minimalActiveReport === 'consolidated' || minimalActiveReport === 'subdivision') && (
                <div className="report-slot-toggle" role="radiogroup" aria-label="Select Observation Report Slot">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={reportSlot === '03Z'}
                    className={`btn-slot-seg ${reportSlot === '03Z' ? 'active' : ''}`}
                    onClick={() => handleReportSlotChange('03Z')}
                    title="03Z Report (Previous day Tmax, current day Tmin, 0830 IST observations)"
                  >
                    03Z (0830 IST)
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={reportSlot === '12Z'}
                    className={`btn-slot-seg ${reportSlot === '12Z' ? 'active' : ''}`}
                    onClick={() => handleReportSlotChange('12Z')}
                    title="12Z Report (Current day Tmax, 03Z Tmin, 0830 & 1730 IST observations)"
                  >
                    12Z (1730 IST)
                  </button>
                </div>
              )}

              <div className="minimal-report-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm btn-print-minimal"
                  onClick={handlePrint}
                  title="Print current operational report"
                  aria-label="Print current operational report"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  <span className="print-btn-text">Print Report</span>
                  <span className="print-btn-text-compact">Print</span>
                </button>
              </div>
            </div>

            {/* Dedicated Formal Operational Print Header */}
            {reportsResult && (
              <header className="print-only operational-print-header" aria-hidden="true">
                <div className="oph-top">
                  <span className="oph-org">INDIA METEOROLOGICAL DEPARTMENT</span>
                  <span className="oph-centre">REGIONAL METEOROLOGICAL CENTRE, NAGPUR</span>
                </div>
                <div className="oph-title">
                  {getPrintReportTitle(minimalActiveReport)}
                </div>
                <div className="oph-meta">
                  <span><strong>Observation Date:</strong> {reportsResult.reportingDate} {reportSlot === '12Z' && minimalActiveReport !== 'summary' ? '(1730 IST)' : '(0830 IST)'}</span>
                </div>
              </header>
            )}

            {/* Render selected report */}
            {reportsResult ? (
              <>
                {minimalActiveReport === 'consolidated' && (
                  <div className="active-report-view">
                    <Report1StationTable
                      subdivisions={reportsResult.subdivisions}
                      reportingDate={reportsResult.reportingDate}
                      eveningDate={reportsResult.eveningDate}
                      reportSlot={reportSlot}
                      isEditMode={isEditMode}
                      showVisibility={showVisibility}
                      onUpdateStationValue={handleUpdateStationValue}
                    />
                  </div>
                )}
                {minimalActiveReport === 'summary' && (
                  <div className="active-report-view">
                    <Report2SummaryTable
                      subdivisions={reportsResult.subdivisions}
                      reportingDate={reportsResult.reportingDate}
                      showHeatWaveCount={showHeatWaveCount}
                      showColdWaveCount={showColdWaveCount}
                    />
                  </div>
                )}
                {minimalActiveReport === 'subdivision' && (
                  <div className="active-report-view">
                    <Report3SubdivisionView
                      subdivisions={reportsResult.subdivisions}
                      reportingDate={reportsResult.reportingDate}
                      eveningDate={reportsResult.eveningDate}
                      reportSlot={reportSlot}
                      isEditMode={isEditMode}
                      showVisibility={showVisibility}
                      onUpdateStationValue={handleUpdateStationValue}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="minimal-empty-report-card">
                <div className="minimal-empty-report-icon" aria-hidden="true">📊</div>
                <h3>No Observations Recorded for {reportingDate}</h3>
                <p>Please submit 03Z or 12Z observation bulletins to generate this report.</p>
                <div className="minimal-empty-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleOpenSlotModal('03Z')}
                  >
                    Submit 03Z (0830 IST)
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleOpenSlotModal('12Z')}
                  >
                    Submit 12Z (1730 IST)
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        <>
          {/* Dedicated Formal Operational Print Header */}
          {reportsResult && (
            <header className="print-only operational-print-header" aria-hidden="true">
              <div className="oph-top">
                <span className="oph-org">INDIA METEOROLOGICAL DEPARTMENT</span>
                <span className="oph-centre">REGIONAL METEOROLOGICAL CENTRE, NAGPUR</span>
              </div>
              <div className="oph-title">
                {getPrintReportTitle(activeReport)}
              </div>
              <div className="oph-meta">
                <span><strong>Observation Date:</strong> {reportsResult.reportingDate} {reportSlot === '12Z' && activeReport !== 'summary' ? '(1730 IST)' : '(0830 IST)'}</span>
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
            onRevisedStationCode={handleRevisedStationCode}
            onClear={handleClear}
            isGenerating={generationState === 'generating'}
            errorMessage={errorMessage}
            dueReminderText={dueReminderText}
            allowHistoricalEdits={allowHistoricalEdits}
            syntaxHighlightingEnabled={syntaxHighlightingEnabled}
            validationContext={{
              reportingDate,
              normalProvider,
              observationStore,
            }}
            pendingOverwrites={pendingOverwriteStations}
            onConfirmOverwrite={commitBulletin}
            onCancelOverwrite={() => setPendingOverwriteStations([])}
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

          {/* Report View Toolbar */}
          {reportsResult && (
            <ReportToolbar
              reportTitle={reportTitleMap[activeReport]}
              reportingDate={reportsResult.reportingDate}
              eveningDate={reportsResult.eveningDate}
              reportSlot={reportSlot}
              onReportSlotChange={handleReportSlotChange}
              showSlotToggle={activeReport === 'consolidated' || activeReport === 'subdivision'}
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
                reportSlot={reportSlot}
                isEditMode={isEditMode}
                showVisibility={showVisibility}
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
                reportSlot={reportSlot}
                isEditMode={isEditMode}
                showVisibility={showVisibility}
                onUpdateStationValue={handleUpdateStationValue}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
