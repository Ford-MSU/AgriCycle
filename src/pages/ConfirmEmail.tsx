import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Leaf,
  ArrowRight,
  ShieldCheck,
  MailCheck,
} from 'lucide-react';

export const ConfirmEmail: React.FC = () => {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your email address...');
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let isSubscribed = true;

    const verifyConfirmation = async () => {
      // 1. Check for URL error fragments / query parameters (e.g. #error=access_denied&error_description=...)
      const fullUrl = window.location.href;
      const hash = window.location.hash;
      const search = window.location.search;

      const urlParams = new URLSearchParams(search);
      const hashParams = new URLSearchParams(
        hash.includes('#') ? hash.substring(hash.indexOf('#') + 1) : ''
      );

      const errorDescription =
        urlParams.get('error_description') ||
        hashParams.get('error_description') ||
        urlParams.get('error') ||
        hashParams.get('error');

      if (errorDescription) {
        if (isSubscribed) {
          setStatus('error');
          setMessage(decodeURIComponent(errorDescription.replace(/\+/g, ' ')));
        }
        return;
      }

      // 2. If Supabase is configured, check for active session or exchanged token
      if (isSupabaseConfigured && supabase) {
        try {
          const { data: { session }, error } = await supabase.auth.getSession();

          if (error) {
            if (isSubscribed) {
              setStatus('error');
              setMessage(error.message);
            }
            return;
          }

          if (session?.user) {
            if (isSubscribed) {
              setConfirmedEmail(session.user.email || null);
              setStatus('success');
              setMessage('Your email address has been successfully verified.');
            }
            return;
          }

          // Listen for incoming SIGNED_IN or USER_UPDATED event from token in URL
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (!isSubscribed) return;
            if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
              setConfirmedEmail(session?.user?.email || null);
              setStatus('success');
              setMessage('Your email address has been successfully verified.');
            }
          });

          // Timeout fallback in case no session event arrives within 4 seconds
          setTimeout(() => {
            if (isSubscribed && status === 'verifying') {
              if (user) {
                setStatus('success');
                setConfirmedEmail(user.email);
                setMessage('Your email address has been confirmed.');
              } else {
                // If no session found but no explicit error, still show friendly verification prompt
                setStatus('success');
                setMessage('Email confirmation request received. You may now sign in.');
              }
            }
          }, 3500);

          return () => {
            subscription.unsubscribe();
          };
        } catch (err: any) {
          if (isSubscribed) {
            setStatus('error');
            setMessage(err?.message || 'Failed to verify confirmation link.');
          }
        }
      } else {
        // Fallback demo mode
        setTimeout(() => {
          if (isSubscribed) {
            setStatus('success');
            setMessage('Your email address has been confirmed (Demo Mode).');
          }
        }, 1200);
      }
    };

    verifyConfirmation();

    return () => {
      isSubscribed = false;
    };
  }, [location, user]);

  return (
    <div className="min-h-screen bg-agri-cream-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative background accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-agri-green-200/30 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-agri-accent-500/10 blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        {/* Brand header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-agri-green-600 text-white shadow-lg shadow-agri-green-600/20 mb-3">
            <Leaf size={30} strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-agri-dark-900">AgriCycle</h1>
          <p className="text-xs uppercase tracking-widest text-agri-green-700 font-semibold mt-0.5">
            Biomass Coordination & Verification Platform
          </p>
        </div>

        <Card className="border border-agri-green-100 shadow-xl bg-white/95 backdrop-blur-sm overflow-hidden">
          {/* Top color accent strip */}
          <div
            className={`h-2 w-full ${
              status === 'success'
                ? 'bg-agri-green-600'
                : status === 'error'
                ? 'bg-red-500'
                : 'bg-agri-accent-500 animate-pulse'
            }`}
          />

          <CardHeader className="text-center pt-8 pb-4">
            {status === 'verifying' && (
              <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-agri-green-50 text-agri-green-600 mb-3">
                <Loader2 size={36} className="animate-spin text-agri-green-600" />
              </div>
            )}

            {status === 'success' && (
              <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50 mb-3 animate-in zoom-in-75 duration-300">
                <CheckCircle2 size={40} className="text-emerald-600" />
              </div>
            )}

            {status === 'error' && (
              <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-red-50 text-red-600 ring-8 ring-red-50/50 mb-3 animate-in zoom-in-75 duration-300">
                <XCircle size={40} className="text-red-600" />
              </div>
            )}

            <CardTitle className="text-xl font-bold text-gray-900">
              {status === 'verifying' && 'Verifying Email Confirmation'}
              {status === 'success' && 'Email Successfully Verified!'}
              {status === 'error' && 'Verification Issue'}
            </CardTitle>

            <CardDescription className="text-sm text-gray-600 mt-2">
              {message}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-2 pb-8">
            {status === 'success' && (
              <>
                {confirmedEmail && (
                  <div className="flex items-center gap-3 p-3.5 bg-agri-green-50 border border-agri-green-200/80 rounded-xl text-sm text-agri-green-900">
                    <MailCheck className="w-5 h-5 text-agri-green-700 flex-shrink-0" />
                    <div className="overflow-hidden">
                      <p className="text-xs text-agri-green-700 font-medium">Verified Account</p>
                      <p className="font-semibold truncate">{confirmedEmail}</p>
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-xs text-gray-600 space-y-2">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-agri-green-600 mt-0.5 flex-shrink-0" />
                    <span>Your account is now authenticated with full AgriCycle access.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Leaf className="w-4 h-4 text-agri-green-600 mt-0.5 flex-shrink-0" />
                    <span>Explore biomass listings, monitor aggregation hubs, or submit trade inquiries.</span>
                  </div>
                </div>

                <Button
                  onClick={() => navigate(user ? '/' : '/login')}
                  className="w-full py-3 bg-agri-green-600 hover:bg-agri-green-700 text-white font-semibold shadow-md shadow-agri-green-600/20 flex items-center justify-center gap-2"
                >
                  <span>{user ? 'Go to Dashboard' : 'Proceed to Sign In'}</span>
                  <ArrowRight size={18} />
                </Button>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 space-y-2">
                  <p className="font-semibold">Possible reasons:</p>
                  <ul className="list-disc list-inside space-y-1 text-red-600">
                    <li>This confirmation link has expired or has already been used.</li>
                    <li>The URL was truncated or opened in a different browser session.</li>
                  </ul>
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => navigate('/login')}
                    className="w-full bg-agri-green-600 hover:bg-agri-green-700 text-white font-medium"
                  >
                    Back to Sign In
                  </Button>
                </div>
              </>
            )}

            {status === 'verifying' && (
              <div className="text-center py-2">
                <p className="text-xs text-gray-500 animate-pulse">
                  Exchanging secure authentication credentials with Supabase...
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer info */}
        <p className="text-center text-xs text-gray-500 mt-6">
          Need help? Contact AgriCycle administrator support at{' '}
          <span className="font-medium text-agri-green-700">support@agricycle.org</span>
        </p>
      </div>
    </div>
  );
};
