import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { ShieldAlert, Clock, LogOut, CheckCircle } from 'lucide-react';
import { Button } from './ui/Button';

// 30 minutes total timeout, 2 minutes warning countdown
const TIMEOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const LAST_ACTIVE_KEY = 'agricycle_last_active_timestamp';

export const InactivityTracker: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(120);
  const lastActivityReportRef = useRef<number>(Date.now());

  const resetActivity = useCallback(() => {
    const now = Date.now();
    // Throttle writing to localStorage to once every 2 seconds
    if (now - lastActivityReportRef.current > 2000) {
      lastActivityReportRef.current = now;
      try {
        localStorage.setItem(LAST_ACTIVE_KEY, now.toString());
      } catch {
        // ignore storage error
      }
    }
    setShowWarning(false);
  }, []);

  const handleManualStaySignedIn = () => {
    const now = Date.now();
    lastActivityReportRef.current = now;
    try {
      localStorage.setItem(LAST_ACTIVE_KEY, now.toString());
    } catch {
      // ignore storage error
    }
    setShowWarning(false);
  };

  const handleSignOutNow = async () => {
    setShowWarning(false);
    try {
      localStorage.removeItem(LAST_ACTIVE_KEY);
    } catch {
      // ignore
    }
    await logout();
    navigate('/login');
  };

  useEffect(() => {
    if (!user) return;

    // Initialize last active timestamp if not present
    if (!localStorage.getItem(LAST_ACTIVE_KEY)) {
      localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
    }

    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const handleUserActivity = () => {
      // Only reset if modal is not currently prompting
      if (!showWarning) {
        resetActivity();
      }
    };

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true });
    });

    const interval = setInterval(() => {
      const storedLast = localStorage.getItem(LAST_ACTIVE_KEY);
      const lastActive = storedLast ? parseInt(storedLast, 10) : Date.now();
      const elapsed = Date.now() - lastActive;
      const remainingMs = TIMEOUT_DURATION_MS - elapsed;

      if (remainingMs <= 0) {
        // Auto-logout triggered
        clearInterval(interval);
        handleSignOutNow();
      } else if (remainingMs <= WARNING_THRESHOLD_MS) {
        setShowWarning(true);
        setSecondsRemaining(Math.ceil(remainingMs / 1000));
      } else {
        setShowWarning(false);
      }
    }, 1000);

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
      clearInterval(interval);
    };
  }, [user, showWarning, resetActivity]);

  if (!user || !showWarning) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-agri-cream-200 p-6 text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center border-2 border-amber-200">
          <Clock size={28} className="animate-pulse" />
        </div>

        <div>
          <h3 className="text-xl font-bold text-gray-900 tracking-tight">
            Session Inactivity Warning
          </h3>
          <p className="text-sm text-agri-earth-600 mt-2">
            You have been inactive for nearly 30 minutes. To protect sensitive regional agricultural data and maintain system security, your session will automatically sign out in:
          </p>
        </div>

        <div className="py-3 px-4 bg-amber-50 rounded-xl border border-amber-200 font-mono text-3xl font-extrabold text-amber-900 tracking-wider">
          {formattedTime}
        </div>

        <p className="text-xs text-agri-earth-500">
          Would you like to extend your session and keep working?
        </p>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 text-gray-700"
            icon={<LogOut size={16} />}
            onClick={handleSignOutNow}
          >
            Sign Out Now
          </Button>
          <Button
            type="button"
            variant="primary"
            className="flex-1"
            icon={<CheckCircle size={16} />}
            onClick={handleManualStaySignedIn}
          >
            Stay Signed In
          </Button>
        </div>
      </div>
    </div>
  );
};
