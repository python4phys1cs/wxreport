/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HamburgerMenu,
  WORKSTATION_THEMES,
  resolveWorkstationTheme,
} from './HamburgerMenu.tsx';
import { AppHeader } from './AppHeader.tsx';
import { formatOperationalClock } from '../utils/timeSlot.ts';
import {
  InMemoryObservationStore,
  convertArchiveToCsv,
  parseCsvToArchive,
  validateArchiveData,
  type ObservationArchive,
} from '../engine/observationStore.ts';
import {
  getDefaultStationInclusion,
  getExcludedStationIds,
  loadStationInclusion,
} from '../utils/stationInclusion.ts';

describe('UI & Settings V5 Improvements Suite', () => {
  // --------------------------------------------------------------------------
  // 1. Lock Station Report Inclusion by Default
  // --------------------------------------------------------------------------
  describe('1. Station Report Inclusion Lock & Collapse', () => {
    it('renders station inclusion panel locked and collapsed by default', () => {
      const html = renderToStaticMarkup(
        React.createElement(HamburgerMenu, {
          isOpen: true,
          onClose: () => {},
          activeReport: 'consolidated',
          onSelectReport: () => {},
          archiveDateCount: 3,
          retentionLimit: 15,
          onRetentionChange: () => {},
          backupFormat: 'JSON',
          onBackupFormatChange: () => {},
          currentTheme: 'theme-blue',
          onThemeChange: () => {},
          onDownloadBackup: () => {},
          stationInclusion: getDefaultStationInclusion(),
          onStationInclusionChange: () => {},
          onResetStationInclusion: () => {},
        })
      );

      // Station inclusion block exists
      assert.ok(html.includes('Station Report Inclusion'));
      // Locked badge is shown
      assert.ok(html.includes('badge-locked'));
      assert.ok(html.includes('🔒 Locked'));
      // Action buttons to toggle state
      assert.ok(html.includes('Expand List ▼'));
      assert.ok(html.includes('Unlock Toggles 🔓'));
      // By default collapsed, so the full station list items are not rendered
      assert.ok(!html.includes('station-inclusion-list'));
      // Preserves Bhind and Ashoknagar excluded note
      assert.ok(html.includes('Bhind and Ashoknagar excluded by default'));
    });

    it('preserves default Bhind 42358 and Ashoknagar 42558 exclusion while locking only drawer controls', () => {
      const inclusion = getDefaultStationInclusion();
      assert.equal(inclusion['42358'], false);
      assert.equal(inclusion['42558'], false);
      const excluded = getExcludedStationIds(inclusion);
      assert.ok(excluded.includes('42358'));
      assert.ok(excluded.includes('42558'));

      // Locking does not alter store observation ingestion
      const store = new InMemoryObservationStore();
      const updated = store.ingest03Z(
        [
          {
            stationId: '42558',
            rainfall: 12.4,
            tmin: 21.0,
          },
        ],
        '2026-10-10'
      );
      assert.ok(updated.includes('42558'));
      const stored = store.getStationObservation('42558', '2026-10-10');
      assert.ok(stored);
      assert.equal(stored.rainfall, 12.4);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Simplify and Reorder Theme Settings
  // --------------------------------------------------------------------------
  describe('2. Theme Settings Simplification & Reordering', () => {
    it('places theme selector at the top of Settings with compact swatches only', () => {
      const html = renderToStaticMarkup(
        React.createElement(HamburgerMenu, {
          isOpen: true,
          onClose: () => {},
          activeReport: 'consolidated',
          onSelectReport: () => {},
          archiveDateCount: 1,
          retentionLimit: 15,
          onRetentionChange: () => {},
          backupFormat: 'JSON',
          onBackupFormatChange: () => {},
          currentTheme: 'theme-blue',
          onThemeChange: () => {},
          onDownloadBackup: () => {},
        })
      );

      // Theme block appears before other settings
      const themeIdx = html.indexOf('theme-setting-block');
      const backupIdx = html.indexOf('Archive / Backup Export');
      const retentionIdx = html.indexOf('Backup Retention');
      assert.ok(themeIdx !== -1, 'Theme setting block must exist');
      assert.ok(themeIdx < backupIdx, 'Theme selector must precede Archive / Backup');
      assert.ok(themeIdx < retentionIdx, 'Theme selector must precede Backup Retention');

      // Swatches container exists with radio group role
      assert.ok(html.includes('class="sidebar-theme-swatches"'));
      assert.ok(html.includes('aria-label="Workstation theme"'));

      // Compact clickable swatches have accessible labels and titles, but no text labels inside
      for (const t of WORKSTATION_THEMES) {
        assert.ok(html.includes(`aria-label="${t.name}"`));
        assert.ok(html.includes(`title="${t.name}"`));
      }

      // Check active indicator for selected theme
      assert.ok(html.includes('theme-swatch-check'));
    });

    it('retains strictly the six specified themes in canonical order', () => {
      assert.equal(WORKSTATION_THEMES.length, 6);
      const expected = [
        { id: 'theme-green', name: 'Green' },
        { id: 'theme-orange', name: 'Orange' },
        { id: 'theme-blue', name: 'Blue (default)' },
        { id: 'theme-red', name: 'Red' },
        { id: 'theme-grey', name: 'Grey' },
        { id: 'theme-night', name: 'Night Duty' },
      ];

      for (let i = 0; i < expected.length; i++) {
        assert.equal(WORKSTATION_THEMES[i].id, expected[i].id);
        assert.equal(WORKSTATION_THEMES[i].name, expected[i].name);
        assert.ok(WORKSTATION_THEMES[i].previewBg.startsWith('#'));
        assert.ok(WORKSTATION_THEMES[i].previewAccent.startsWith('#'));
      }
    });

    it('safely maps obsolete or removed themes to closest modern theme', () => {
      assert.equal(resolveWorkstationTheme('theme-navy'), 'theme-blue');
      assert.equal(resolveWorkstationTheme('theme-light-blue'), 'theme-blue');
      assert.equal(resolveWorkstationTheme('theme-forest'), 'theme-green');
      assert.equal(resolveWorkstationTheme('theme-light-green'), 'theme-green');
      assert.equal(resolveWorkstationTheme('theme-amber'), 'theme-orange');
      assert.equal(resolveWorkstationTheme('theme-light-amber'), 'theme-orange');
      assert.equal(resolveWorkstationTheme('theme-charcoal'), 'theme-grey');
      assert.equal(resolveWorkstationTheme('theme-light-clean'), 'theme-grey');
      assert.equal(resolveWorkstationTheme('theme-night'), 'theme-night');
      assert.equal(resolveWorkstationTheme('unknown'), 'theme-blue');
      assert.equal(resolveWorkstationTheme(null), 'theme-blue');
      assert.equal(resolveWorkstationTheme(undefined), 'theme-blue');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Improve IST/UTC Clock
  // --------------------------------------------------------------------------
  describe('3. Refined IST/UTC Header Clock', () => {
    it('formats accurate operational clock with clear IST and UTC components', () => {
      const dt = new Date('2026-10-14T03:30:00Z'); // 09:00 IST
      const formatted = formatOperationalClock(dt);
      assert.equal(formatted, '14/10/2026 09:00 IST | 03:30 UTC');
    });

    it('renders header clock with distinct typography and visual separation', () => {
      const clockStr = '14/10/2026 17:30 IST | 12:00 UTC';
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          onToggleMenu: () => {},
          clockString: clockStr,
        })
      );

      assert.ok(html.includes('class="operational-clock"'));
      assert.ok(html.includes('class="clock-ist">14/10/2026 17:30 IST</span>'));
      assert.ok(html.includes('class="clock-divider"'));
      assert.ok(html.includes('class="clock-utc">12:00 UTC</span>'));
    });
  });

  // --------------------------------------------------------------------------
  // 4. Rename the Application to WXOps Synop Report
  // --------------------------------------------------------------------------
  describe('4. Application Renaming', () => {
    it('displays WXOps Synop Report in AppHeader', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          onToggleMenu: () => {},
          clockString: '14/10/2026 17:30 IST | 12:00 UTC',
        })
      );
      assert.ok(html.includes('WXOps Synop Report'));
    });

    it('displays WXOps Synop Report in Hamburger drawer header', () => {
      const html = renderToStaticMarkup(
        React.createElement(HamburgerMenu, {
          isOpen: true,
          onClose: () => {},
          activeReport: 'consolidated',
          onSelectReport: () => {},
          archiveDateCount: 1,
          retentionLimit: 15,
          onRetentionChange: () => {},
          backupFormat: 'JSON',
          onBackupFormatChange: () => {},
          currentTheme: 'theme-blue',
          onThemeChange: () => {},
          onDownloadBackup: () => {},
        })
      );
      assert.ok(html.includes('WXOps Synop Report'));
    });

    it('specifies WXOps Synop Report in metadata.json', () => {
      const metadata = JSON.parse(readFileSync(join(process.cwd(), 'metadata.json'), 'utf-8'));
      assert.equal(metadata.name, 'WXOps Synop Report');
    });

    it('specifies WXOps Synop Report in index.html title and meta tags', () => {
      const html = readFileSync(join(process.cwd(), 'index.html'), 'utf-8');
      assert.ok(html.includes('<title>WXOps Synop Report</title>'));
      assert.ok(html.includes('<meta property="og:title" content="WXOps Synop Report" />'));
    });
  });

  // --------------------------------------------------------------------------
  // 5. Unified Archive Import and Restore
  // --------------------------------------------------------------------------
  describe('5. Unified Archive Import & Restore', () => {
    it('parses exported CSV archive into ObservationArchive successfully', () => {
      const mockArchive = {
        metadata: {
          version: '1.0',
          system: 'WXOps',
          exportedAt: '2026-10-14T10:00:00.000Z',
          retentionLimit: 15,
          dateCount: 1,
          dates: ['2026-10-14'],
          stationCount: 2,
        },
        records: {
          '2026-10-14': {
            '42933': {
              stationId: '42933',
              reportingDate: '2026-10-14',
              tmax: 33.4,
              tmin: 21.3,
              rainfall: 4.2,
              has03Z: true,
              rawSynop03Z: 'AAXX 14034 42933 ...',
            },
            '42809': {
              stationId: '42809',
              reportingDate: '2026-10-14',
              tmax: 31.8,
              tmin: 20.0,
              rainfall: 0.0,
              has03Z: true,
            },
          },
        },
      } as unknown as ObservationArchive;

      const csv = convertArchiveToCsv(mockArchive);
      assert.ok(csv.includes('Reporting Date,Station ID'));
      assert.ok(csv.includes('42933'));

      const parsed = parseCsvToArchive(csv);
      assert.equal(parsed.valid, true);
      assert.ok(parsed.archive);
      assert.equal(parsed.archive.metadata.dates.length, 1);
      assert.equal(parsed.archive.metadata.dates[0], '2026-10-14');

      const stn42933 = parsed.archive.records['2026-10-14']['42933'];
      assert.ok(stn42933);
      assert.equal(stn42933.tmax, 33.4);
      assert.equal(stn42933.tmin, 21.3);
      assert.equal(stn42933.rainfall, 4.2);
      assert.equal(stn42933.rawSynop03Z, 'AAXX 14034 42933 ...');
    });

    it('imports CSV archive into store non-destructively by default', () => {
      const store = new InMemoryObservationStore();
      // Seed existing record
      store.ingest03Z(
        [
          {
            stationId: '42933',
            tmin: 22.0,
            rainfall: 5.0,
          },
        ],
        '2026-10-10'
      );

      const csvData = [
        'Reporting Date,Station ID,Tmax (C),Tmin (C),Rainfall (mm),Raw SYNOP 03Z',
        '2026-10-10,42933,35.0,18.0,10.0,AAXX 10034 42933 ...',
        '2026-10-11,42809,32.0,20.0,0.0,AAXX 11034 42809 ...',
      ].join('\r\n');

      // Import with preserve_existing policy (default)
      const summary = store.importHistoricalArchive(csvData, { duplicatePolicy: 'preserve_existing' });
      assert.equal(summary.success, true);
      assert.equal(summary.recordsAdded, 1); // 42809 on 2026-10-11
      assert.equal(summary.recordsSkipped, 1); // 42933 on 2026-10-10 preserved

      // Verify existing 42933 values were not overwritten
      const existing = store.getStationObservation('42933', '2026-10-10');
      assert.ok(existing);
      assert.equal(existing.tmin, 22.0); // original preserved
      assert.equal(existing.rainfall, 5.0); // original preserved

      // Verify new station on new date was added
      const added = store.getStationObservation('42809', '2026-10-11');
      assert.ok(added);
      assert.equal(added.tmax, 32.0);
    });

    it('supports update_existing policy when explicitly configured', () => {
      const store = new InMemoryObservationStore();
      store.ingest03Z(
        [
          {
            stationId: '42933',
            tmin: 22.0,
            rainfall: 5.0,
          },
        ],
        '2026-10-10'
      );

      const csvData = [
        'Reporting Date,Station ID,Tmax (C),Tmin (C),Rainfall (mm)',
        '2026-10-10,42933,35.0,18.0,10.0',
      ].join('\r\n');

      const summary = store.importHistoricalArchive(csvData, { duplicatePolicy: 'update_existing' });
      assert.equal(summary.success, true);
      assert.equal(summary.recordsUpdated, 1);

      const updated = store.getStationObservation('42933', '2026-10-10');
      assert.ok(updated);
      assert.equal(updated.tmin, 18.0);
      assert.equal(updated.tmax, 35.0);
    });

    it('supports merge_fields policy filling missing fields without overwriting existing data', () => {
      const store = new InMemoryObservationStore();
      store.ingest03Z(
        [
          {
            stationId: '42933',
            tmin: 22.0,
            rainfall: null,
          },
        ],
        '2026-10-10'
      );

      const csvData = [
        'Reporting Date,Station ID,Tmax (C),Tmin (C),Rainfall (mm)',
        '2026-10-10,42933,34.5,19.0,7.2',
      ].join('\r\n');

      const summary = store.importHistoricalArchive(csvData, { duplicatePolicy: 'merge_fields' });
      assert.equal(summary.success, true);
      assert.equal(summary.recordsUpdated, 1);

      const merged = store.getStationObservation('42933', '2026-10-10');
      assert.ok(merged);
      assert.equal(merged.tmin, 22.0); // original preserved
      assert.equal(merged.tmax, 34.5); // null was filled
      assert.equal(merged.rainfall, 7.2); // null was filled
    });

    it('rejects invalid files without crashing', () => {
      const store = new InMemoryObservationStore();
      const badResult = store.importHistoricalArchive('Not a csv or json at all');
      assert.equal(badResult.success, false);
      assert.ok(badResult.error);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Minimal View Default & Streamlined Settings Menu
  // --------------------------------------------------------------------------
  describe('6. Minimal View Default & Streamlined Settings Menu', () => {
    it('renders Minimal (Default) as the default option and removes view descriptions', () => {
      const html = renderToStaticMarkup(
        React.createElement(HamburgerMenu, {
          isOpen: true,
          onClose: () => {},
          activeReport: 'consolidated',
          onSelectReport: () => {},
          archiveDateCount: 1,
          retentionLimit: 15,
          onRetentionChange: () => {},
          backupFormat: 'JSON',
          onBackupFormatChange: () => {},
          currentTheme: 'theme-blue',
          onThemeChange: () => {},
          onDownloadBackup: () => {},
          onViewModeChange: () => {},
        })
      );

      // Verify Minimal (Default) button exists and is active by default
      assert.ok(html.includes('Minimal (Default)'));
      assert.ok(html.includes('Standard'));
      assert.ok(html.includes('aria-checked="true"'));
      assert.ok(html.includes('class="btn-seg active">Minimal (Default)</button>'));

      // Verify verbose view description text is removed
      assert.ok(!html.includes('Minimal view: 3 large elements with day/month stepper'));
      assert.ok(!html.includes('Standard view: Full meteorological workspace with operational reports'));
    });

    it('groups settings into logical, discoverable categories with clear headers', () => {
      const html = renderToStaticMarkup(
        React.createElement(HamburgerMenu, {
          isOpen: true,
          onClose: () => {},
          activeReport: 'consolidated',
          onSelectReport: () => {},
          archiveDateCount: 1,
          retentionLimit: 15,
          onRetentionChange: () => {},
          backupFormat: 'JSON',
          onBackupFormatChange: () => {},
          currentTheme: 'theme-blue',
          onThemeChange: () => {},
          onDownloadBackup: () => {},
          onViewModeChange: () => {},
          stationInclusion: getDefaultStationInclusion(),
          onStationInclusionChange: () => {},
          onEditModeChange: () => {},
          onShowHeatWaveCountChange: () => {},
          onShowColdWaveCountChange: () => {},
          onAllowHistoricalEditsChange: () => {},
          onSyntaxHighlightingEnabledChange: () => {},
        })
      );

      // Check all 6 category headers exist in order
      const cat1Idx = html.indexOf('Workspace &amp; Appearance');
      const cat2Idx = html.indexOf('Report Display &amp; Tables');
      const cat3Idx = html.indexOf('Data Entry &amp; Validation');
      const cat4Idx = html.indexOf('Station Registry');
      const cat5Idx = html.indexOf('Archive &amp; Cloud Database');
      const cat6Idx = html.indexOf('Danger Zone');

      assert.ok(cat1Idx !== -1, 'Workspace & Appearance header exists');
      assert.ok(cat2Idx !== -1, 'Report Display & Tables header exists');
      assert.ok(cat3Idx !== -1, 'Data Entry & Validation header exists');
      assert.ok(cat4Idx !== -1, 'Station Registry header exists');
      assert.ok(cat5Idx !== -1, 'Archive & Cloud Database header exists');
      assert.ok(cat6Idx !== -1, 'Danger Zone header exists');

      // Verify logical order
      assert.ok(cat1Idx < cat2Idx, 'Cat 1 precedes Cat 2');
      assert.ok(cat2Idx < cat3Idx, 'Cat 2 precedes Cat 3');
      assert.ok(cat3Idx < cat4Idx, 'Cat 3 precedes Cat 4');
      assert.ok(cat4Idx < cat5Idx, 'Cat 4 precedes Cat 5');
      assert.ok(cat5Idx < cat6Idx, 'Cat 5 precedes Cat 6');
    });
  });
});

