/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AboutSection,
  AboutModal,
  CREDITS,
  CONTACT_EMAILS,
} from './AboutSection.tsx';
import { AppHeader } from './AppHeader.tsx';
import { HamburgerMenu } from './HamburgerMenu.tsx';

describe('AboutSection & System Credits Suite', () => {
  describe('1. Credits and Roles Integrity', () => {
    it('contains all four credit sections with accurate roles and contributions', () => {
      assert.equal(CREDITS.length, 4);

      // Section 1: Conceptualization
      const conceptualization = CREDITS.find((c) => c.title === 'Conceptualization');
      assert.ok(conceptualization, 'Conceptualization section must exist');
      assert.deepEqual(conceptualization.people, ['Dr. Praveen Kumar, Scientist-D']);

      // Section 2: Software Design & Architecture
      const architecture = CREDITS.find((c) => c.title === 'Software Design & Architecture');
      assert.ok(architecture, 'Software Design & Architecture section must exist');
      assert.deepEqual(architecture.people, [
        'Ajay Kumar Rai, Scientific Assistant',
        'Mayank Tiwari, Scientific Assistant',
      ]);

      // Section 3: Software Development & Maintenance
      const development = CREDITS.find((c) => c.title === 'Software Development & Maintenance');
      assert.ok(development, 'Software Development & Maintenance section must exist');
      assert.deepEqual(development.people, [
        'Ajay Kumar Rai, Scientific Assistant',
        'Mayank Tiwari, Scientific Assistant',
      ]);

      // Section 4: Developed By
      const developedBy = CREDITS.find((c) => c.title === 'Developed By');
      assert.ok(developedBy, 'Developed By section must exist');
      assert.deepEqual(developedBy.people, [
        'Regional Weather Forecasting Centre (RWFC), Nagpur',
        'India Meteorological Department (IMD)',
      ]);
    });

    it('contains the authorized operational contact emails', () => {
      assert.ok(CONTACT_EMAILS.includes('rwfcnagpur2020@gmail.com'));
      assert.ok(CONTACT_EMAILS.includes('rwfc.nagpur@imd.gov.in'));
    });
  });

  describe('2. AboutSection Markup & Rendering', () => {
    it('renders system info, version v1.0.0, and system description', () => {
      const html = renderToStaticMarkup(React.createElement(AboutSection));

      assert.ok(html.includes('v1.0.0'));
      assert.ok(html.includes('WXOps Synop Report'));
      assert.ok(html.includes('Operational 03Z / 12Z Meteorological Report Generator'));
      assert.ok(html.includes('WMO 03Z (08:30 IST) and 12Z (17:30 IST) surface SYNOP bulletins'));
      assert.ok(html.includes('Consolidated Station Observation Reports'));
      assert.ok(html.includes('1981–2010 pentad normals'));
      assert.ok(html.includes('Vidarbha, West Madhya Pradesh, East Madhya Pradesh, and Chhattisgarh'));
      assert.ok(html.includes('24×7 duties'));
    });

    it('renders all contributors and organization details in the DOM', () => {
      const html = renderToStaticMarkup(React.createElement(AboutSection));

      assert.ok(html.includes('Dr. Praveen Kumar, Scientist-D'));
      assert.ok(html.includes('Ajay Kumar Rai, Scientific Assistant'));
      assert.ok(html.includes('Mayank Tiwari, Scientific Assistant'));
      assert.ok(html.includes('Regional Weather Forecasting Centre (RWFC), Nagpur'));
      assert.ok(html.includes('India Meteorological Department (IMD)'));
    });

    it('renders contact links with valid mailto hrefs', () => {
      const html = renderToStaticMarkup(React.createElement(AboutSection));

      assert.ok(html.includes('href="mailto:rwfcnagpur2020@gmail.com"'));
      assert.ok(html.includes('href="mailto:rwfc.nagpur@imd.gov.in"'));
    });

    it('renders corporate copyright footer', () => {
      const html = renderToStaticMarkup(React.createElement(AboutSection));

      assert.ok(html.includes('India Meteorological Department'));
      assert.ok(html.includes('Regional Weather Forecasting Centre, Nagpur'));
      assert.ok(html.includes('All rights reserved'));
    });
  });

  describe('3. AboutModal Rendering & Accessibility', () => {
    it('renders nothing when isOpen is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(AboutModal, { isOpen: false, onClose: () => {} })
      );
      assert.equal(html, '');
    });

    it('renders dialog and backdrop when isOpen is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(AboutModal, { isOpen: true, onClose: () => {} })
      );
      assert.ok(html.includes('about-modal-backdrop'));
      assert.ok(html.includes('about-modal-dialog'));
      assert.ok(html.includes('role="dialog"'));
      assert.ok(html.includes('aria-modal="true"'));
      assert.ok(html.includes('System Info &amp; Workstation Credits'));
      assert.ok(html.includes('Dr. Praveen Kumar, Scientist-D'));
    });
  });

  describe('4. Navigation & Menu Integration', () => {
    it('does not render About button in AppHeader keeping header minimal', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppHeader, {
          onToggleMenu: () => {},
          clockString: '20/10/2026 14:30 IST | 09:00 UTC',
        })
      );

      assert.equal(html.includes('btn-header-about'), false);
      assert.equal(html.includes('About WXOps &amp; System Credits'), false);
    });

    it('renders only meteorological reports in report list and retains only System Info & Workstation Credits in drawer footer', () => {
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
          onOpenAbout: () => {},
        })
      );

      // Verify 'About WXOps & Credits' is removed from menu
      assert.equal(html.includes('About WXOps &amp; Credits'), false);
      assert.equal(html.includes('About WxOps &amp; Credits'), false);

      // Verify 'WXOps Synop Report • Operational Meteorology' is removed from footer
      assert.equal(html.includes('Operational Meteorology'), false);

      // Verify only System Info & Workstation Credits is kept in footer
      assert.ok(html.includes('System Info &amp; Workstation Credits'));
    });
  });
});
