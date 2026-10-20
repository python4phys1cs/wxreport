/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Info, Mail, Award, Landmark, Code2, X } from 'lucide-react';

export interface CreditSection {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  people: string[];
}

export const CREDITS: CreditSection[] = [
  {
    title: "Conceptualization",
    icon: Award,
    people: [
      "Dr. Praveen Kumar, Scientist-D"
    ]
  },
  {
    title: "Software Design & Architecture",
    icon: Code2,
    people: [
      "Ajay Kumar Rai, Scientific Assistant",
      "Mayank Tiwari, Scientific Assistant"
    ]
  },
  {
    title: "Software Development & Maintenance",
    icon: Code2,
    people: [
      "Ajay Kumar Rai, Scientific Assistant",
      "Mayank Tiwari, Scientific Assistant"
    ]
  },
  {
    title: "Developed By",
    icon: Landmark,
    people: [
      "Regional Weather Forecasting Centre (RWFC), Nagpur",
      "India Meteorological Department (IMD)"
    ]
  }
];

export const CONTACT_EMAILS = [
  "rwfcnagpur2020@gmail.com",
  "rwfc.nagpur@imd.gov.in"
];

export interface AboutSectionProps {
  onClose?: () => void;
  className?: string;
  showCloseButton?: boolean;
}

export function AboutSection({ onClose, className = '', showCloseButton = false }: AboutSectionProps) {
  const version = "v1.0.0";

  return (
    <div className={`about-section-container space-y-5 p-1 text-on-surface ${className}`}>
      {/* Header Profile Card */}
      <div className="bg-surface-container/30 border border-outline-variant/30 rounded-lg p-4 space-y-3 about-card">
        <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2 mb-1">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="font-bold text-xs uppercase tracking-wider text-primary font-mono">System Info</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded tracking-wide">
              {version}
            </span>
            {showCloseButton && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-on-surface-variant/70 hover:text-on-surface p-1 rounded-md transition-colors"
                aria-label="Close about dialog"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-bold tracking-tight text-on-surface">WXOps Synop Report</h2>
          <p className="text-xs text-on-surface-variant font-medium leading-relaxed">
            Operational 03Z / 12Z Meteorological Report Generator
          </p>
        </div>

        <div className="pt-2 border-t border-outline-variant/20">
          <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-on-surface-variant/60 block mb-1">
            System Description
          </span>
          <p className="text-on-surface-variant leading-relaxed text-[11px] text-justify">
            WXOps Synop Report is a specialized operational meteorological reporting workstation designed for real-time decoding, validation, and dissemination of daily weather observations. It processes standard WMO 03Z (08:30 IST) and 12Z (17:30 IST) surface SYNOP bulletins to generate official Consolidated Station Observation Reports, Realised Weather Summaries, and Subdivision-wise reports across Vidarbha, West Madhya Pradesh, East Madhya Pradesh, and Chhattisgarh. The system computes climatological departures against official 1981–2010 pentad normals, automates heat wave and cold wave assessments, supports direct tabular manual edits, and ensures synchronized persistence across operational forecasting desks for reliable 24×7 duties.
          </p>
        </div>
      </div>

      {/* Credits Grid (Two-column on desktop, stacked on mobile) */}
      <div className="bg-surface-container/20 border border-outline-variant/20 rounded-lg p-4 space-y-4 about-card">
        <div className="border-b border-outline-variant/20 pb-2">
          <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-primary">
            Workstation Credits
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CREDITS.map((section, idx) => {
            const Icon = section.icon;
            return (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-on-surface-variant/70">
                  <Icon className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
                  <span className="text-[10px] uppercase font-bold tracking-wider font-mono">
                    {section.title}
                  </span>
                </div>
                <div className="text-[11px] text-on-surface leading-relaxed pl-5 font-sans space-y-0.5">
                  {section.people.map((person, pIdx) => (
                    <div key={pIdx} className="font-medium text-on-surface-variant/90">
                      {person}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Contact Panel */}
      <div className="bg-surface-container/20 border border-outline-variant/20 rounded-lg p-4 space-y-3 about-card">
        <div className="flex items-center gap-1.5 border-b border-outline-variant/20 pb-2">
          <Mail className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-primary">
            Contact &amp; Support
          </span>
        </div>
        <div className="space-y-1.5 pl-5">
          <span className="text-[9px] uppercase font-bold tracking-wider font-mono text-on-surface-variant/60 block">
            Direct Operations Desk
          </span>
          <div className="flex flex-col gap-1 text-[11px] font-mono">
            {CONTACT_EMAILS.map((email) => (
              <a
                key={email}
                href={`mailto:${email}`}
                className="text-primary hover:underline hover:text-primary-hover transition-colors truncate block"
              >
                {email}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Corporate Operational Footer */}
      <div className="pt-4 pb-2 border-t border-outline-variant/25 text-center space-y-1">
        <p className="text-[10px] font-mono font-semibold text-on-surface-variant/80">
          &copy; India Meteorological Department
        </p>
        <p className="text-[9px] font-mono text-on-surface-variant/50">
          Regional Weather Forecasting Centre, Nagpur
        </p>
        <p className="text-[8px] font-mono text-on-surface-variant/40 tracking-wider uppercase">
          All rights reserved.
        </p>
      </div>
    </div>
  );
}

export interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  React.useEffect(() => {
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
      <div
        className="about-modal-backdrop no-print"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="about-modal-dialog no-print"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-dialog-title"
      >
        <div className="about-modal-header">
          <div id="about-dialog-title" className="about-modal-title">
            <Info className="w-4 h-4 text-primary" />
            <span>About WXOps</span>
          </div>
          <button
            type="button"
            className="about-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="about-modal-body">
          <AboutSection onClose={onClose} />
        </div>
      </div>
    </>
  );
}
