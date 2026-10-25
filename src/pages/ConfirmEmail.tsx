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
  Send,
  AlertTriangle,
  RefreshCw,
  Mail,
} from 'lucide-react';

export const ConfirmEmail: React.FC = () => {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your email address...');
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Resend confirmation link state
  const [resendEmail, setResendEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendFeedback, setResendFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { user, resendConfirmationEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let isSubscribed = true;

    const verifyConfirmation = async () => {
      // 1. Inspect URL parameters across hash and search
      const fullHash = window.location.hash || '';
      const fullSearch = window.location.search || '';

      // Parse query string inside hash (e.g., #/confirm-email?error_code=otp_expired)
      let hashQuery = '';
      if (fullHash.includes('?')) {
        hashQuery = fullHash.substring(fullHash.indexOf('?') + 1);
      } else if (fullHash.includes('#') && fullHash.indexOf('#') !== fullHash.lastIndexOf('#')) {
        hashQuery = fullHash.substring(fullHash.lastIndexOf('#') + 1);
      } else if (!fullHash.startsWith('#/')) {
        hashQuery = fullHash.replace(/^#/, '');
      }

      const searchParams = new URLSearchParams(fullSearch);
      const hashParams = new URLSearchParams(hashQuery);

      const errCode =
        searchParams.get('error_code') ||
        hashParams.get('error_code') ||
        searchParams.get('error') ||
        hashParams.get('error');

      const rawDescription =
        searchParams.get('error_description') ||
        hashParams.get('error_description');

      // Check for PKCE exchange code
      const pkceCode = searchParams.get('code') || hashParams.get('code');

      if (errCode || rawDescription) {
        if (!isSubscribed) return;
        setErrorCode(errCode);
        setStatus('error');

        const isExpiredOrInvalid =
          errCode === 'otp_expired' ||
          errCode === 'access_denied' ||
          (rawDescription && /expired|invalid|already/i.test(rawDescription));

        if (isExpiredOrInvalid) {
          setMessage('Your email confirmation link is invalid or has expired. Please request a new confirmation email and try again.');
        } else {
          const decoded = rawDescription
            ? decodeURIComponent(rawDescription.replace(/\+/g, ' '))
            : 'Email verification could not be completed. Please try again.';
          setMessage(decoded);
        }
        return;
      }

      // 2. PKCE code exchange if present
      if (pkceCode && isSupabaseConfigured && supabase) {
        try {
          const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(pkceCode);
          if (exchangeError) {
            if (!isSubscribed) return;
            setStatus('error');
            setMessage('Your email confirmation link is invalid or has expired. Please request a new confirmation email and try again.');
            return;
          }

          if (exchangeData?.user) {
            if (!isSubscribed) return;
            setConfirmedEmail(exchangeData.user.email || null);
            setStatus('success');
            setMessage('Email confirmed successfully! You can now sign in to your AgriCycle account.');

            // Clean up credentials from URL bar
            if (window.history && window.history.replaceState) {
              window.history.replaceState(null, '', window.location.pathname + '#/confirm-email');
            }
            return;
          }
        } catch {
          // Continue to fallback
        }
      }

      // 3. Inspect active Supabase session or exchanged access token
      if (isSupabaseConfigured && supabase) {
        try {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();

          if (sessionError) {
            if (!isSubscribed) return;
            setStatus('error');
            setMessage(sessionError.message);
            return;
          }

          if (session?.user) {
            if (!isSubscribed) return;
            setConfirmedEmail(session.user.email || null);
            setStatus('success');
            setMessage('Email confirmed successfully! You can now sign in to your AgriCycle account.');

            // Clean up tokens from hash
            if (window.history && window.history.replaceState) {
              window.history.replaceState(null, '', window.location.pathname + '#/confirm-email');
            }
            return;
          }

          // Listen for incoming SIGNED_IN or USER_UPDATED event triggered by detectSessionInUrl
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (!isSubscribed) return;
            if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
              setConfirmedEmail(session?.user?.email || null);
              setStatus('success');
              setMessage('Email confirmed successfully! You can now sign in to your AgriCycle account.');

              if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', window.location.pathname + '#/confirm-email');
              }
            }
          });

          // Timeout check
          const timer = setTimeout(() => {
            if (isSubscribed && status === 'verifying') {
              if (user) {
                setStatus('success');
                setConfirmedEmail(user.email);
                setMessage('Email confirmed successfully! You can now sign in to your AgriCycle account.');
              } else {
                // If no tokens were in URL and no session exists, guide user to sign in or resend
                setStatus('error');
                setMessage('No active verification credentials found in this link. Please request a new confirmation email or sign in.');
              }
            }
          }, 3500);

          return () => {
            clearTimeout(timer);
            subscription.unsubscribe();
          };
        } catch (err: any) {
          if (isSubscribed) {
            setStatus('error');
            setMessage(err?.message || 'Failed to verify confirmation link.');
          }
        }
      } else {
        // Offline / demo fallback mode
        const timer = setTimeout(() => {
          if (isSubscribed) {
            setStatus('success');
            setMessage('Email confirmed successfully! You can now sign in to your AgriCycle account (Demo Mode).');
          }
        }, 800);
        return () => clearTimeout(timer);
      }
    };

    verifyConfirmation();

    return () => {
      isSubscribed = false;
    };
  }, [location, user]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendFeedback(null);

    const emailToSend = resendEmail.trim() || confirmedEmail || user?.email || '';
    if (!emailToSend || !emailToSend.includes('@')) {
      setResendFeedback({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }

    setIsResending(true);
    try {
      const result = await resendConfirmationEmail(emailToSend);
      setResendFeedback({ type: 'success', text: result.message });
    } catch (err: any) {
      setResendFeedback({ type: 'error', text: err?.message || 'Failed to resend confirmation email.' });
    } finally {
      setIsResending(false);
    }
  };

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
              {status === 'success' && 'Email Confirmed Successfully!'}
              {status === 'error' && 'Confirmation Link Issue'}
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
                      <p className="text-xs text-agri-green-700 font-medium">Verified Email Account</p>
                      <p className="font-semibold truncate">{confirmedEmail}</p>
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-xs text-gray-600 space-y-2">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-agri-green-600 mt-0.5 flex-shrink-0" />
                    <span>Your account credentials are verified and ready for sign-in.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Leaf className="w-4 h-4 text-agri-green-600 mt-0.5 flex-shrink-0" />
                    <span>Access verified regional biomass listings, aggregation hubs, and buyer inquiries.</span>
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
              <div className="space-y-5">
                {/* Dedicated Resend Confirmation Email Form */}
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-700">
                    <RefreshCw size={14} className="text-agri-green-600" />
                    Request New Confirmation Email
                  </div>
                  <p className="text-xs text-gray-600">
                    Enter the email address you registered with to receive a fresh verification link.
                  </p>

                  <form onSubmit={handleResend} className="space-y-3">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                        <Mail size={16} />
                      </div>
                      <input
                        type="email"
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        placeholder="your.email@example.com"
                        required
                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-agri-green-500 focus:border-agri-green-500"
                      />
                    </div>

                    {resendFeedback && (
                      <div
                        className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                          resendFeedback.type === 'success'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {resendFeedback.type === 'success' ? (
                          <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-emerald-600" />
                        ) : (
                          <AlertTriangle size={15} className="shrink-0 mt-0.5 text-red-600" />
                        )}
                        <span>{resendFeedback.text}</span>
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={isResending}
                      isLoading={isResending}
                      className="w-full bg-agri-green-600 hover:bg-agri-green-700 text-white font-medium text-sm py-2 flex items-center justify-center gap-2"
                    >
                      <Send size={15} />
                      <span>{isResending ? 'Sending...' : 'Send New Confirmation Link'}</span>
                    </Button>
                  </form>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => navigate('/login')}
                    className="w-full border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Back to Sign In
                  </Button>
                </div>
              </div>
            )}

            {status === 'verifying' && (
              <div className="text-center py-2 space-y-2">
                <p className="text-xs text-gray-500 animate-pulse">
                  Exchanging secure authentication credentials with Supabase...
                </p>
                <div className="w-16 h-1 bg-agri-green-100 rounded-full mx-auto overflow-hidden">
                  <div className="w-8 h-full bg-agri-green-600 rounded-full animate-indeterminate" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer info */}
        <p className="text-center text-xs text-gray-500 mt-6">
          Need help? Contact AgriCycle support at{' '}
          <span className="font-medium text-agri-green-700">support@agricycle.org</span>
        </p>
      </div>
    </div>
  );
};
