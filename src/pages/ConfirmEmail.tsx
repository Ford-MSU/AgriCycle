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
  KeyRound,
  LogIn,
  Info,
} from 'lucide-react';

export const ConfirmEmail: React.FC = () => {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your email address...');
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Recovery interaction mode: 'otp' | 'resend'
  const [recoveryTab, setRecoveryTab] = useState<'signin' | 'otp' | 'resend'>('signin');

  // Stored / prefilled email
  const initialEmail = () => {
    try {
      return localStorage.getItem('agricycle_registered_email') || '';
    } catch {
      return '';
    }
  };

  // 6-digit OTP verification state
  const [otpEmail, setOtpEmail] = useState(initialEmail);
  const [otpCode, setOtpCode] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpFeedback, setOtpFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Resend confirmation link state
  const [resendEmail, setResendEmail] = useState(initialEmail);
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

      // Parse query string inside hash (e.g., #/confirm-email?error_code=otp_expired or ?token_hash=...)
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

      // Check for PKCE exchange code or Token Hash
      const pkceCode = searchParams.get('code') || hashParams.get('code');
      const tokenHash = searchParams.get('token_hash') || hashParams.get('token_hash');
      const otpType = searchParams.get('type') || hashParams.get('type') || 'email';

      // 2. Handle Token Hash verification if present (scanner-immune direct route)
      if (tokenHash && isSupabaseConfigured && supabase) {
        try {
          let otpRes = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType as any,
          });

          if (otpRes.error && otpType === 'email') {
            // Fallback retry with 'signup'
            otpRes = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: 'signup' as any,
            });
          }

          if (otpRes.data?.user) {
            if (!isSubscribed) return;
            setConfirmedEmail(otpRes.data.user.email || null);
            setStatus('success');
            setMessage('Email confirmed successfully! You can now sign in to your AgriCycle account.');

            if (window.history && window.history.replaceState) {
              window.history.replaceState(null, '', window.location.pathname + '#/confirm-email');
            }
            return;
          }
        } catch {
          // Continue to error/code handling
        }
      }

      // 3. Handle explicit errors (such as otp_expired from email security scanners or expired links)
      if (errCode || rawDescription) {
        if (!isSubscribed) return;
        setErrorCode(errCode);
        setStatus('error');

        const isExpiredOrInvalid =
          errCode === 'otp_expired' ||
          errCode === 'access_denied' ||
          (rawDescription && /expired|invalid|already/i.test(rawDescription));

        if (isExpiredOrInvalid) {
          setMessage(
            'Your email confirmation link was already used or has expired. This frequently occurs when email security filters pre-scan links. Your account may already be confirmed!'
          );
        } else {
          const decoded = rawDescription
            ? decodeURIComponent(rawDescription.replace(/\+/g, ' '))
            : 'Email verification could not be completed. Please try again.';
          setMessage(decoded);
        }
        return;
      }

      // 4. PKCE code exchange if present
      if (pkceCode && isSupabaseConfigured && supabase) {
        try {
          const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(pkceCode);
          if (exchangeError) {
            if (!isSubscribed) return;
            setStatus('error');
            setErrorCode('pkce_exchange_failed');
            setMessage('Your email confirmation link is invalid or has expired. Please request a new confirmation email or enter your 6-digit code.');
            return;
          }

          if (exchangeData?.user) {
            if (!isSubscribed) return;
            setConfirmedEmail(exchangeData.user.email || null);
            setStatus('success');
            setMessage('Email confirmed successfully! You can now sign in to your AgriCycle account.');

            if (window.history && window.history.replaceState) {
              window.history.replaceState(null, '', window.location.pathname + '#/confirm-email');
            }
            return;
          }
        } catch {
          // Continue to fallback
        }
      }

      // 5. Inspect active Supabase session or exchanged access token
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
                setStatus('error');
                setMessage('No active verification credentials found in this link. Please enter your 6-digit confirmation code or sign in.');
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

  // Handle manual 6-digit OTP code verification
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpFeedback(null);

    const emailToVerify = otpEmail.trim() || initialEmail();
    const cleanCode = otpCode.trim();

    if (!emailToVerify || !emailToVerify.includes('@')) {
      setOtpFeedback({ type: 'error', text: 'Please enter your registered email address.' });
      return;
    }

    if (!cleanCode || cleanCode.length < 6) {
      setOtpFeedback({ type: 'error', text: 'Please enter the 6-digit confirmation code from your email.' });
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setStatus('success');
      setConfirmedEmail(emailToVerify);
      setMessage('Email confirmed successfully! You can now sign in to your AgriCycle account.');
      return;
    }

    setIsVerifyingOtp(true);
    try {
      // Try 'signup' OTP type first
      let res = await supabase.auth.verifyOtp({
        email: emailToVerify,
        token: cleanCode,
        type: 'signup',
      });

      // If 'signup' fails, retry with 'email' OTP type
      if (res.error) {
        res = await supabase.auth.verifyOtp({
          email: emailToVerify,
          token: cleanCode,
          type: 'email',
        });
      }

      if (res.error) {
        throw new Error(res.error.message || 'Invalid or expired confirmation code.');
      }

      setConfirmedEmail(res.data?.user?.email || emailToVerify);
      setStatus('success');
      setMessage('Email confirmed successfully! You can now sign in to your AgriCycle account.');
    } catch (err: any) {
      setOtpFeedback({
        type: 'error',
        text: err?.message || 'Verification failed. Please check the code and try again.',
      });
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Handle resending confirmation email
  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendFeedback(null);

    const emailToSend = resendEmail.trim() || otpEmail.trim() || confirmedEmail || user?.email || initialEmail();
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

  const isOtpExpiredError = errorCode === 'otp_expired' || errorCode === 'access_denied';

  return (
    <div className="min-h-screen bg-agri-cream-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative background accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-agri-green-200/30 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-agri-accent-500/10 blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-lg relative z-10 px-4">
        {/* Brand header */}
        <div className="flex flex-col items-center mb-6 text-center">
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
                ? isOtpExpiredError
                  ? 'bg-amber-500'
                  : 'bg-red-500'
                : 'bg-agri-accent-500 animate-pulse'
            }`}
          />

          <CardHeader className="text-center pt-8 pb-3">
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
              <div
                className={`mx-auto flex items-center justify-center w-16 h-16 rounded-full mb-3 animate-in zoom-in-75 duration-300 ${
                  isOtpExpiredError
                    ? 'bg-amber-50 text-amber-600 ring-8 ring-amber-50/50'
                    : 'bg-red-50 text-red-600 ring-8 ring-red-50/50'
                }`}
              >
                {isOtpExpiredError ? (
                  <AlertTriangle size={38} className="text-amber-600" />
                ) : (
                  <XCircle size={40} className="text-red-600" />
                )}
              </div>
            )}

            <CardTitle className="text-xl font-bold text-gray-900">
              {status === 'verifying' && 'Verifying Email Confirmation'}
              {status === 'success' && 'Email Confirmed Successfully!'}
              {status === 'error' && (isOtpExpiredError ? 'Link Already Used or Expired' : 'Confirmation Link Issue')}
            </CardTitle>

            <CardDescription className="text-sm text-gray-600 mt-2">
              {message}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-1 pb-8">
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
                {/* Explain why otp_expired occurs and guide user */}
                {isOtpExpiredError && (
                  <div className="p-4 bg-amber-50/90 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-800 text-sm">
                      <Info size={16} className="text-amber-700 shrink-0" />
                      <span>Why did this happen?</span>
                    </div>
                    <p className="leading-relaxed">
                      Institutional email systems (such as Google Workspace for <strong>@g.msuiit.edu.ph</strong> or Microsoft Defender) automatically pre-scan links in incoming emails to verify safety. That security scan visits the link and marks the one-time token as consumed.
                    </p>
                    <div className="pt-1.5 border-t border-amber-200/80 font-medium text-amber-950">
                      ✨ <strong>Good News:</strong> The security scan often completes the verification on the server! You may already be verified.
                    </div>
                  </div>
                )}

                {/* Primary Action Button: Try Signing In */}
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-emerald-900">Step 1: Try Signing In</h3>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      If your account was already verified, you can sign in directly with your password.
                    </p>
                  </div>
                  <Button
                    onClick={() => navigate('/login')}
                    className="w-full py-2.5 bg-agri-green-700 hover:bg-agri-green-800 text-white font-semibold text-sm shadow-sm flex items-center justify-center gap-2"
                  >
                    <LogIn size={16} />
                    <span>Try Signing In Now</span>
                  </Button>
                </div>

                {/* Alternative Options Header */}
                <div className="pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setRecoveryTab('otp')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                        recoveryTab === 'otp'
                          ? 'bg-agri-green-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <KeyRound size={13} />
                      <span>Enter 6-Digit Code</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecoveryTab('resend')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                        recoveryTab === 'resend'
                          ? 'bg-agri-green-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <RefreshCw size={13} />
                      <span>Resend Email</span>
                    </button>
                  </div>

                  {/* Tab 1: Enter 6-digit Code */}
                  {recoveryTab === 'otp' && (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3 animate-in fade-in-50 duration-200">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-700">
                        <KeyRound size={14} className="text-agri-green-600" />
                        Verify with 6-Digit Code
                      </div>
                      <p className="text-xs text-gray-600">
                        If your email included a 6-digit numeric confirmation code, enter it below:
                      </p>

                      <form onSubmit={handleVerifyOtp} className="space-y-3">
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                            <Mail size={15} />
                          </div>
                          <input
                            type="email"
                            value={otpEmail}
                            onChange={(e) => setOtpEmail(e.target.value)}
                            placeholder="your.email@example.com"
                            required
                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs sm:text-sm bg-white focus:ring-agri-green-500 focus:border-agri-green-500"
                          />
                        </div>

                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                            <KeyRound size={15} />
                          </div>
                          <input
                            type="text"
                            maxLength={8}
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                            placeholder="6-digit code (e.g. 123456)"
                            required
                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm tracking-widest font-mono bg-white focus:ring-agri-green-500 focus:border-agri-green-500"
                          />
                        </div>

                        {otpFeedback && (
                          <div
                            className={`p-2.5 rounded-lg text-xs flex items-start gap-2 ${
                              otpFeedback.type === 'success'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}
                          >
                            {otpFeedback.type === 'success' ? (
                              <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-600" />
                            ) : (
                              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-600" />
                            )}
                            <span>{otpFeedback.text}</span>
                          </div>
                        )}

                        <Button
                          type="submit"
                          disabled={isVerifyingOtp}
                          isLoading={isVerifyingOtp}
                          className="w-full bg-agri-green-600 hover:bg-agri-green-700 text-white font-medium text-xs sm:text-sm py-2 flex items-center justify-center gap-2"
                        >
                          <ShieldCheck size={15} />
                          <span>{isVerifyingOtp ? 'Verifying Code...' : 'Verify Code & Activate'}</span>
                        </Button>
                      </form>
                    </div>
                  )}

                  {/* Tab 2: Resend Confirmation Email */}
                  {recoveryTab === 'resend' && (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3 animate-in fade-in-50 duration-200">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-700">
                        <RefreshCw size={14} className="text-agri-green-600" />
                        Request New Confirmation Email
                      </div>
                      <p className="text-xs text-gray-600">
                        Enter your email address to receive a fresh verification link.
                      </p>

                      <form onSubmit={handleResend} className="space-y-3">
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                            <Mail size={15} />
                          </div>
                          <input
                            type="email"
                            value={resendEmail}
                            onChange={(e) => setResendEmail(e.target.value)}
                            placeholder="your.email@example.com"
                            required
                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs sm:text-sm bg-white focus:ring-agri-green-500 focus:border-agri-green-500"
                          />
                        </div>

                        {resendFeedback && (
                          <div
                            className={`p-2.5 rounded-lg text-xs flex items-start gap-2 ${
                              resendFeedback.type === 'success'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}
                          >
                            {resendFeedback.type === 'success' ? (
                              <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-600" />
                            ) : (
                              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-600" />
                            )}
                            <span>{resendFeedback.text}</span>
                          </div>
                        )}

                        <Button
                          type="submit"
                          disabled={isResending}
                          isLoading={isResending}
                          className="w-full bg-agri-green-600 hover:bg-agri-green-700 text-white font-medium text-xs sm:text-sm py-2 flex items-center justify-center gap-2"
                        >
                          <Send size={15} />
                          <span>{isResending ? 'Sending...' : 'Send New Confirmation Link'}</span>
                        </Button>
                      </form>
                    </div>
                  )}
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
