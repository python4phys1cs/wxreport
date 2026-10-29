/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { WORKSTATION_IDENTITIES, type WorkstationIdentity } from '../server/authService.ts';
import { authClient } from '../auth/authClient.ts';

interface LoginScreenProps {
  onLoginSuccess: (identity: WorkstationIdentity) => void;
  currentTheme?: string;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  currentTheme = 'theme-blue',
}) => {
  const [selectedIdentity, setSelectedIdentity] = useState<WorkstationIdentity>('AMSS Nagpur');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setErrorMessage('Please enter the workstation password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await authClient.login(selectedIdentity, password);
      if (result.success && result.identity) {
        onLoginSuccess(result.identity);
      } else {
        setErrorMessage(
          result.error || 'Invalid meteorological workstation credentials. Please check identity and password.'
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setErrorMessage(`Authentication error: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`report-container login-wrapper ${currentTheme}`}>
      <div className="login-card" role="main" aria-label="Workstation Login">
        {/* Brand Header */}
        <div className="login-header">
          <h1 className="login-title">WXOps Synop Report</h1>
          <p className="login-subtitle">
            Operational 03Z / 12Z Meteorological Report Generator
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form" noValidate>
          {/* Identity Selection */}
          <div className="login-group">
            <label className="login-label">
              Select Workstation Identity:
            </label>
            <div className="identity-selector-grid" role="radiogroup" aria-label="Operational Identity">
              {WORKSTATION_IDENTITIES.map((identity) => {
                const isSelected = selectedIdentity === identity;
                return (
                  <button
                    key={identity}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`identity-card-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedIdentity(identity);
                      setErrorMessage(null);
                    }}
                    disabled={isLoading}
                  >
                    <div className="identity-radio-circle" aria-hidden="true">
                      {isSelected && <span className="identity-radio-dot" />}
                    </div>
                    <div className="identity-info">
                      <strong className="identity-name">{identity}</strong>
                      {identity !== 'AMSS Nagpur' && (
                        <span className="identity-desc">
                          Regional Weather Forecasting Centre
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Password Input */}
          <div className="login-group">
            <label htmlFor="workstation-password" className="login-label">
              Workstation Password:
            </label>
            <div className="password-input-wrapper">
              <input
                id="workstation-password"
                type={showPassword ? 'text' : 'password'}
                className="login-password-input"
                placeholder="Enter password..."
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isLoading}
                autoComplete="current-password"
                autoFocus
              />
              <button
                type="button"
                className="btn-toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="login-error-alert" role="alert">
              <span className="error-icon" aria-hidden="true">⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Button */}
          <div className="login-actions">
            <button
              type="submit"
              className="btn btn-primary btn-login-submit"
              disabled={isLoading || !password.trim()}
            >
              {isLoading ? (
                <>
                  <span className="login-spinner" aria-hidden="true" />
                  <span>Authenticating Workstation...</span>
                </>
              ) : (
                `Log In as ${selectedIdentity}`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
