import { useState } from 'react';
import { Download, Share, Plus, X, Smartphone } from 'lucide-react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { useLanguage } from '../context/LanguageContext';

function InstallAppBanner() {
  const { t } = useLanguage();
  const { showBanner, canInstallNatively, showIOSInstructions, triggerInstall, dismiss } = useInstallPrompt();
  const [showIOSSteps, setShowIOSSteps] = useState(false);

  if (!showBanner) return null;

  // Android / Chrome / Edge — one-tap install
  if (canInstallNatively) {
    return (
      <div className="install-app-banner">
        <button className="install-dismiss-btn" onClick={dismiss} aria-label={t('installBanner.dismissAriaLabel')}>
          <X size={16} />
        </button>
        <div className="install-banner-content">
          <div className="install-banner-icon">
            <Smartphone size={24} />
          </div>
          <div className="install-banner-text">
            <div className="install-banner-title">{t('installBanner.title')}</div>
            <p className="install-banner-desc">
              {t('installBanner.descNative')}
            </p>
          </div>
        </div>
        <button className="install-app-btn" onClick={triggerInstall}>
          <Download size={20} />
          {t('installBanner.addToHomeScreen')}
        </button>
      </div>
    );
  }

  // iOS Safari — show instructions
  if (showIOSInstructions) {
    return (
      <div className="install-app-banner">
        <button className="install-dismiss-btn" onClick={dismiss} aria-label={t('installBanner.dismissAriaLabel')}>
          <X size={16} />
        </button>
        <div className="install-banner-content">
          <div className="install-banner-icon">
            <Smartphone size={24} />
          </div>
          <div className="install-banner-text">
            <div className="install-banner-title">{t('installBanner.title')}</div>
            <p className="install-banner-desc">
              {t('installBanner.descIOS')}
            </p>
          </div>
        </div>

        {!showIOSSteps ? (
          <button className="install-app-btn" onClick={() => setShowIOSSteps(true)}>
            <Download size={20} />
            {t('installBanner.showMeHow')}
          </button>
        ) : (
          <div className="ios-install-steps">
            <div className="ios-step">
              <span className="ios-step-num">1</span>
              <span dangerouslySetInnerHTML={{ __html: t('installBanner.step1') }} />
            </div>
            <div className="ios-step">
              <span className="ios-step-num">2</span>
              <span>
                {t('installBanner.step2Label')} <strong>{t('installBanner.step2Share')}</strong>
                <span className="ios-step-icon"><Share size={14} /></span>
              </span>
            </div>
            <div className="ios-step">
              <span className="ios-step-num">3</span>
              <span>{t('installBanner.step3Label')} <strong>{t('installBanner.step3AddToHomeScreen')}</strong> <span className="ios-step-icon"><Plus size={14} /></span></span>
            </div>
            <div className="ios-step">
              <span className="ios-step-num">4</span>
              <span>{t('installBanner.step4Label')} <strong>{t('installBanner.step4Add')}</strong> {t('installBanner.step4Suffix')}</span>
            </div>
            <button className="ios-got-it-btn" onClick={dismiss}>
              {t('installBanner.gotIt')}
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default InstallAppBanner;
