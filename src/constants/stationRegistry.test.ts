/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_STATIONS,
  SUBDIVISIONS,
  LEGACY_STATION_INCONSISTENCIES,
  VIDARBHA_PRINT_REPORT_ORDER,
  getStation,
  getStationsBySubdivision,
  getAllStations,
  getAllSubdivisions,
  getSubdivision,
} from './stationRegistry.ts';

describe('Station Registry & Metadata Suite', () => {

  // Exact 77 station IDs from $arr_station in synop_entry_03utc.php line 71
  const legacy77Stations = [
    '42933', '42937', '42931', '42946', '43029', '42947', '42871', '42867', '42939', '42935', '42943',
    '42768', '42674', '42675', '42567', '42776', '42770', '42467', '42574', '42671', '42571', '42771', '42577', '42562', '42679',
    '42860', '42667', '42460', '42752', '42559', '42361', '42763', '42754', '42855', '42849', '42767', '42672', '42557', '42661', '42665', '42456', '42459', '42662',
    '42693', '42782', '42876', '43041', '42872', '42779', '42874', '42948',
    '43058', '43062', '43001', '43109', '43057', '43003', '43110',
    '43009', '42851', '43071', '43157', '43111', '42925', '42921', '43063', '43158', '43113', '43117',
    '43014', '43011', '43021', '43075', '43017', '43076',
    '42715', '42865'
  ];

  it('contains exactly 79 canonical stations with no duplicate IDs', () => {
    assert.equal(CANONICAL_STATIONS.length, 79);
    const ids = CANONICAL_STATIONS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, 79, 'All 79 station IDs must be unique');
  });

  it('represents all 77 operational station IDs', () => {
    for (const legacyId of legacy77Stations) {
      const stn = getStation(legacyId);
      assert.ok(stn, `Station ID ${legacyId} must exist in canonical registry`);
      assert.equal(stn.id, legacyId);
    }
  });

  it('verifies station counts by subdivision', () => {
    const wmp = getStationsBySubdivision('19');
    assert.equal(wmp.length, 20, 'West MP must contain 18 active stations + 2 disabled stations (Bhind, Ashoknagar)');

    const emp = getStationsBySubdivision('20');
    assert.equal(emp.length, 15, 'East MP must contain 15 stations (including 42715)');

    const vid = getStationsBySubdivision('26');
    assert.equal(vid.length, 12, 'Vidarbha must contain 12 stations (including 42865 Bhandara)');

    const cht = getStationsBySubdivision('27');
    assert.equal(cht.length, 8, 'Chattisgarh must contain 8 stations');

    const mar = getStationsBySubdivision('25');
    assert.equal(mar.length, 6, 'Marathwada must contain 6 stations');

    const mm = getStationsBySubdivision('24');
    assert.equal(mm.length, 11, 'Madhya Maharashtra must contain 11 stations');

    const kg = getStationsBySubdivision('23');
    assert.equal(kg.length, 7, 'Konkan & Goa must contain 7 stations');

    const total = wmp.length + emp.length + vid.length + cht.length + mar.length + mm.length + kg.length;
    assert.equal(total, 79);
  });

  it('preserves exact legacy web report station ordering', () => {
    // West MP (19) exact array order from observations_include_fast.php plus disabled stations
    const wmpExpected = [
      '42860', '42667', '42460', '42752', '42559', '42361',
      '42763', '42754', '42855', '42849', '42767', '42672',
      '42557', '42661', '42665', '42456', '42459', '42662',
      '42358', '42558'
    ];
    const wmpActual = getStationsBySubdivision('19').map((s) => s.id);
    assert.deepEqual(wmpActual, wmpExpected);

    // Vidarbha (26) exact array order with Bhandara (42865)
    const vidExpected = [
      '42933', '42937', '42865', '42931', '42946', '43029',
      '42947', '42871', '42867', '42939', '42935', '42943'
    ];
    const vidActual = getStationsBySubdivision('26').map((s) => s.id);
    assert.deepEqual(vidActual, vidExpected);

    // Chattisgarh (27) exact array order
    const chtExpected = ['42693', '42782', '42876', '43041', '42872', '42779', '42874', '42948'];
    const chtActual = getStationsBySubdivision('27').map((s) => s.id);
    assert.deepEqual(chtActual, chtExpected);
  });

  it('verifies Bhandara exists and Nagpur (AWS) is removed from operational registry', () => {
    // Bhandara 42865
    const bhandara = getStation('42865');
    assert.ok(bhandara, 'Bhandara (42865) must exist in registry');
    assert.equal(bhandara.name, 'Bhandara');
    assert.equal(bhandara.subdivisionId, '26');
    assert.equal(bhandara.district, 'Bhandara');

    // Nagpur AWS 13301 must NOT exist
    assert.equal(getStation('13301'), undefined, 'Nagpur (AWS) 13301 must be absent');

    // Non-AWS Nagpur 42867 must remain intact
    const nagpur = getStation('42867');
    assert.ok(nagpur, 'Nagpur 42867 must remain intact');
    assert.equal(nagpur.name, 'Nagpur');
    assert.equal(nagpur.subdivisionId, '26');

    // Amravati 42937 must remain intact
    const amravati = getStation('42937');
    assert.ok(amravati, 'Amravati 42937 must remain intact');
    assert.equal(amravati.name, 'Amravati');
    assert.equal(amravati.subdivisionId, '26');
  });

  it('supports special Vidarbha print report ordering variant', () => {
    const printOrdered = getStationsBySubdivision('26', 'print');
    assert.equal(printOrdered.length, 11, 'Vidarbha print order omits 13301');
    assert.deepEqual(printOrdered.map((s) => s.id), [...VIDARBHA_PRINT_REPORT_ORDER]);
    assert.equal(printOrdered[0].id, '42867', 'First station in print order is Nagpur (42867)');
    assert.equal(printOrdered[7].id, '42933', 'Akola is 8th in print order');
  });

  it('explicitly documents known legacy inconsistencies', () => {
    // 42715 inconsistency
    const stn42715 = getStation('42715');
    assert.ok(stn42715);
    assert.equal(stn42715.subdivisionId, '20');
    assert.equal(stn42715.legacyNotes, LEGACY_STATION_INCONSISTENCIES.STATION_42715);

    // 13301 (Nagpur AWS) was decommissioned and removed from operational registry
    assert.equal(getStation('13301'), undefined);

    // Print order discrepancy constant
    assert.ok(LEGACY_STATION_INCONSISTENCIES.VIDARBHA_PRINT_ORDER.includes('42867'));
  });

  describe('Lookup helpers', () => {
    it('retrieves station metadata by valid ID', () => {
      const nagpur = getStation('42867');
      assert.ok(nagpur);
      assert.equal(nagpur.name, 'Nagpur');
      assert.equal(nagpur.subdivisionId, '26');
      assert.equal(nagpur.subdivisionName, 'Vidarbha');
      assert.equal(nagpur.district, 'Nagpur');

      const dhar = getStation('42752');
      assert.ok(dhar);
      assert.equal(dhar.name, 'Dhar');

      const shajapur = getStation('42665');
      assert.ok(shajapur);
      assert.equal(shajapur.name, 'Shajapur');

      const jabalpur = getStation('42675');
      assert.ok(jabalpur);
      assert.equal(jabalpur.name, 'Jabalpur');

      const seoni = getStation('42771');
      assert.ok(seoni);
      assert.equal(seoni.name, 'Seoni');
    });

    it('returns undefined for non-existent station ID', () => {
      assert.equal(getStation('99999'), undefined);
    });

    it('retrieves subdivision by valid ID', () => {
      const sub = getSubdivision('19');
      assert.ok(sub);
      assert.equal(sub.name, 'West Madhya Pradesh');
      assert.equal(sub.code, 'WMP');
      assert.equal(sub.stationIds.length, 20);
    });

    it('returns undefined for non-existent subdivision ID', () => {
      assert.equal(getSubdivision('99'), undefined);
    });

    it('returns empty array when querying non-existent subdivision stations', () => {
      assert.deepEqual(getStationsBySubdivision('99'), []);
    });

    it('returns all canonical stations and subdivisions', () => {
      assert.equal(getAllStations().length, 79);
      assert.equal(getAllSubdivisions().length, 7);
    });
  });

});
