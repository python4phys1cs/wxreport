/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sortSubdivisionsForOperationalReports,
  sortStationsAlphabetically,
  OPERATIONAL_REPORT_SUBDIVISION_ORDER,
} from './stationSort.ts';
import {
  getStationsBySubdivision,
  getSubdivision,
  getAllStations,
} from '../constants/stationRegistry.ts';
import {
  WORKSTATION_THEMES,
} from '../components/HamburgerMenu.tsx';
import {
  InMemoryObservationStore,
} from '../engine/observationStore.ts';
import {
  generateDailyReports,
  recalculateReportsResult,
} from '../engine/reportOrchestrator.ts';
import {
  SAMPLE_OPERATIONAL_SYNOP_BULLETIN,
} from '../providers/fixtureProvider.ts';

describe('Operational Station Sorting & Report Subdivision Ordering', () => {
  it('1. verifies canonical subdivision operational sequence: Vidarbha, West MP, East MP, Chhattisgarh', () => {
    assert.deepEqual(OPERATIONAL_REPORT_SUBDIVISION_ORDER, ['26', '19', '20', '27']);

    const mockSubdivisions = [
      { subdivision: { id: '20', name: 'East Madhya Pradesh', code: 'EMP', stationIds: [] } },
      { subdivision: { id: '27', name: 'Chattisgarh', code: 'CHT', stationIds: [] } },
      { subdivision: { id: '19', name: 'West Madhya Pradesh', code: 'WMP', stationIds: [] } },
      { subdivision: { id: '26', name: 'Vidarbha', code: 'VID', stationIds: [] } },
    ] as any;

    const sorted = sortSubdivisionsForOperationalReports(mockSubdivisions);
    assert.equal(sorted[0].subdivision.id, '26');
    assert.equal(sorted[0].subdivision.name, 'Vidarbha');
    assert.equal(sorted[1].subdivision.id, '19');
    assert.equal(sorted[1].subdivision.name, 'West Madhya Pradesh');
    assert.equal(sorted[2].subdivision.id, '20');
    assert.equal(sorted[2].subdivision.name, 'East Madhya Pradesh');
    assert.equal(sorted[3].subdivision.id, '27');
    assert.equal(sorted[3].subdivision.name, 'Chattisgarh');
  });

  it('2. sorts Vidarbha stations strictly alphabetically by station name', () => {
    const rawStations = getStationsBySubdivision('26');
    const stationRows = rawStations.map((s) => ({
      stationId: s.id,
      stationName: s.name,
    }));

    const sorted = sortStationsAlphabetically(stationRows);
    const sortedNames = sorted.map((s) => s.stationName);

    // Alphabetical order for Vidarbha (12 canonical stations):
    // Akola, Amravati, Bhandara, Brahmpuri, Buldana, Chandrapur, Gadchiroli, Gondia, Nagpur, Wardha, Washim, Yavatmal
    assert.deepEqual(sortedNames, [
      'Akola',
      'Amravati',
      'Bhandara',
      'Brahmpuri',
      'Buldana',
      'Chandrapur',
      'Gadchiroli',
      'Gondia',
      'Nagpur',
      'Wardha',
      'Washim',
      'Yavatmal',
    ]);
  });

  it('3. sorts West Madhya Pradesh stations strictly alphabetically by station name', () => {
    const rawStations = getStationsBySubdivision('19');
    const stationRows = rawStations.map((s) => ({
      stationId: s.id,
      stationName: s.name,
    }));

    const sorted = sortStationsAlphabetically(stationRows);
    const sortedNames = sorted.map((s) => s.stationName);

    // 20 stations registered in West MP (18 active + 2 disabled: Bhind, Ashoknagar)
    assert.equal(sorted.length, 20);
    assert.equal(sortedNames[0], 'Ashoknagar');
    assert.equal(sortedNames[1], 'Betul');
    assert.equal(sortedNames[2], 'Bhind');
    assert.equal(sortedNames[3], 'Bhopal');
    assert.equal(sortedNames[sortedNames.length - 1], 'Ujjain');

    // Verify list is monotonic ascending
    for (let i = 1; i < sortedNames.length; i++) {
      assert.ok(
        sortedNames[i - 1].localeCompare(sortedNames[i], 'en', { sensitivity: 'base' }) <= 0,
        `${sortedNames[i - 1]} should come before ${sortedNames[i]}`
      );
    }
  });

  it('4. case-insensitive and deterministic tie-breaking for station sorting', () => {
    const mixed = [
      { stationId: '2', stationName: 'nagpur' },
      { stationId: '1', stationName: 'Nagpur' },
      { stationId: '3', stationName: 'AKOLA' },
      { stationId: '4', stationName: 'amravati' },
    ];

    const sorted = sortStationsAlphabetically(mixed);
    assert.equal(sorted[0].stationName, 'AKOLA');
    assert.equal(sorted[1].stationName, 'amravati');
    // For tied names, secondary tie-breaker is stationId
    assert.equal(sorted[2].stationId, '1');
    assert.equal(sorted[3].stationId, '2');
  });

  it('5. canonical station registry and subdivision assignments are unchanged', () => {
    const all = getAllStations();
    assert.equal(all.length, 79);

    const vid = getSubdivision('26');
    assert.ok(vid);
    assert.equal(vid.name, 'Vidarbha');
    assert.equal(vid.stationIds.length, 12);
  });
});

describe('Operational Themes Extension', () => {
  it('6. retains the six required themes (Green, Orange, Blue, Red, Grey, Night Duty)', () => {
    assert.equal(WORKSTATION_THEMES.length, 6);

    const ids = WORKSTATION_THEMES.map((t) => t.id);
    assert.equal(ids[0], 'theme-green');
    assert.equal(ids[1], 'theme-orange');
    assert.equal(ids[2], 'theme-blue');
    assert.equal(ids[3], 'theme-red');
    assert.equal(ids[4], 'theme-grey');
    assert.equal(ids[5], 'theme-night');

    // Each option has clean display names and color preview swatches
    for (const theme of WORKSTATION_THEMES) {
      assert.ok(theme.name.length > 0);
      assert.ok(theme.previewBg.startsWith('#'));
      assert.ok(theme.previewAccent.startsWith('#'));
    }
  });
});

describe('Table Edit Mode & Store Recalculation', () => {
  it('7. updateStationObservation updates store record for target date and station', () => {
    const store = new InMemoryObservationStore();
    const date = '2026-10-06';
    const stationId = '42937'; // Nagpur

    const updated = store.updateStationObservation(date, stationId, {
      tmax: 41.5,
      tmin: 24.2,
      rainfall: 12.0,
      rh0830: 85,
      rh1730: 52,
    });

    assert.equal(updated.stationId, stationId);
    assert.equal(updated.tmax, 41.5);
    assert.equal(updated.tmin, 24.2);
    assert.equal(updated.rainfall, 12.0);
    assert.equal(updated.rh0830, 85);
    assert.equal(updated.rh1730, 52);

    const fetched = store.getStationObservation(stationId, date);
    assert.ok(fetched);
    assert.equal(fetched.tmax, 41.5);
    assert.equal(fetched.tmin, 24.2);
  });

  it('8. recalculateReportsResult updates station values and subdivision statistics immediately', () => {
    const date = '2026-01-05';
    const store = new InMemoryObservationStore();

    const initial = generateDailyReports(
      SAMPLE_OPERATIONAL_SYNOP_BULLETIN,
      date,
      undefined,
      undefined,
      { observationStore: store, utcSlot: '03Z', subdivisionIds: ['26'] }
    );

    const vidarbha = initial.subdivisions.find((s) => s.subdivision.id === '26')!;
    const akolaInitial = vidarbha.report1Rows.find((r) => r.stationId === '42933')!;
    assert.equal(akolaInitial.stationId, '42933');

    // Perform an edit in Edit Mode on Akola's Tmax and Rainfall
    const recalculated = recalculateReportsResult(
      initial,
      {
        '42933': {
          tmax: 43.8,
          rainfall: 25.4,
        },
      }
    );

    const vidRecalc = recalculated.subdivisions.find((s) => s.subdivision.id === '26')!;
    const akolaEdited = vidRecalc.report1Rows.find((r) => r.stationId === '42933')!;
    assert.equal(akolaEdited.tmax, 43.8);
    assert.equal(akolaEdited.rainfall, 25.4);

    // Akola should now be reflected as highest Tmax
    assert.equal(vidRecalc.report2Summary.highestTmax.value, 43.8);
    assert.ok(vidRecalc.report2Summary.highestTmax.stationNames.includes('Akola'));
  });
});
