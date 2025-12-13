function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <img
          src="https://qewqcjzlfqamqwbccapr.supabase.co/storage/v1/object/public/assets/Untitled%20design%20(3).svg"
          alt="Zique Fitness"
          className="loading-logo"
        />
        <div className="loading-spinner-container">
          <div className="loading-spinner-ring"></div>
        </div>
      </div>

      <style>{`
        .loading-screen {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }

        .loading-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
        }

        .loading-logo {
          width: 100px;
          height: auto;
          animation: logoPulse 2s ease-in-out infinite;
        }

        @keyframes logoPulse {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }

        .loading-spinner-container {
          position: relative;
          width: 40px;
          height: 40px;
        }

        .loading-spinner-ring {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(13, 148, 136, 0.2);
          border-top-color: #0d9488;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default LoadingScreen;
