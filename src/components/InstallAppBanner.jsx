import { useState } from 'react';
import { Download, Share, Plus, X, Smartphone } from 'lucide-react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

function InstallAppBanner() {
  const { showBanner, canInstallNatively, showIOSInstructions, triggerInstall, dismiss } = useInstallPrompt();
  const [showIOSSteps, setShowIOSSteps] = useState(false);

  if (!showBanner) return null;

  // Android / Chrome / Edge — one-tap install
  if (canInstallNatively) {
    return (
      <div className="install-app-banner">
        <button className="install-dismiss-btn" onClick={dismiss} aria-label="Dismiss">
          <X size={16} />
        </button>
        <div className="install-banner-content">
          <div className="install-banner-icon">
            <Smartphone size={24} />
          </div>
          <div className="install-banner-text">
            <div className="install-banner-title">Install the App</div>
            <p className="install-banner-desc">
              Skip the browser — open the app straight from your home screen. No typing URLs, no logging in every time.
            </p>
          </div>
        </div>
        <button className="install-app-btn" onClick={triggerInstall}>
          <Download size={20} />
          Add to Home Screen
        </button>
      </div>
    );
  }

  // iOS Safari — show instructions
  if (showIOSInstructions) {
    return (
      <div className="install-app-banner">
        <button className="install-dismiss-btn" onClick={dismiss} aria-label="Dismiss">
          <X size={16} />
        </button>
        <div className="install-banner-content">
          <div className="install-banner-icon">
            <Smartphone size={24} />
          </div>
          <div className="install-banner-text">
            <div className="install-banner-title">Install the App</div>
            <p className="install-banner-desc">
              Skip Safari — open the app straight from your home screen. No typing URLs, no logging in every time.
            </p>
          </div>
        </div>

        {!showIOSSteps ? (
          <button className="install-app-btn" onClick={() => setShowIOSSteps(true)}>
            <Download size={20} />
            Show Me How
          </button>
        ) : (
          <div className="ios-install-steps">
            <div className="ios-step">
              <span className="ios-step-num">1</span>
              <span>
                Tap the <strong>Share</strong> button
                <span className="ios-step-icon"><Share size={14} /></span>
                at the bottom of Safari
              </span>
            </div>
            <div className="ios-step">
              <span className="ios-step-num">2</span>
              <span>Scroll down and tap <strong>"Add to Home Screen"</strong> <span className="ios-step-icon"><Plus size={14} /></span></span>
            </div>
            <div className="ios-step">
              <span className="ios-step-num">3</span>
              <span>Tap <strong>"Add"</strong> in the top-right corner</span>
            </div>
            <button className="ios-got-it-btn" onClick={dismiss}>
              Got it!
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default InstallAppBanner;
