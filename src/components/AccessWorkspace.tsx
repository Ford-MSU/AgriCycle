import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers,
  Briefcase,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User as UserIcon,
  ArrowRight,
  Info,
  X,
} from 'lucide-react';
import { Role } from '../types';
import { useAuth } from '../store/AuthContext';
import { getRoleDisplayName, getRoleShortName } from '../utils/rbac';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { BrandLogo } from './BrandLogo';

type PublicPortalRole = Role.COORDINATOR | Role.BUYER;

interface AccessWorkspaceProps {
  initialPortal?: PublicPortalRole | null;
}

const PUBLIC_PORTALS: Array<{
  role: PublicPortalRole;
  title: string;
  description: string;
  ctaLabel: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accentBg: string;
  accentText: string;
}> = [
  {
    role: Role.COORDINATOR,
    title: 'LGU Biomass Information Coordinator',
    description:
      'Manage biomass sources and records, review and validate submissions, monitor aggregation information, and coordinate buyer inquiries.',
    ctaLabel: 'Coordinator Login',
    icon: Layers,
    accentBg: 'bg-[#EAF4EC]',
    accentText: 'text-[#006B45]',
  },
  {
    role: Role.BUYER,
    title: 'Buyer/Institutional Inquirer',
    description:
      'Explore validated biomass listings, review available information, and submit non-binding inquiries.',
    ctaLabel: 'Buyer Login',
    icon: Briefcase,
    accentBg: 'bg-[#FFF7E2]',
    accentText: 'text-[#9C6E00]',
  },
];

export const AccessWorkspace: React.FC<AccessWorkspaceProps> = ({ initialPortal = null }) => {
  const [selectedPortal, setSelectedPortal] = useState<PublicPortalRole | null>(initialPortal);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const { login, register, isLoading, isSupabaseAuth } = useAuth();
  const navigate = useNavigate();

  const openPortal = (role: PublicPortalRole) => {
    setSelectedPortal(role);
    setIsRegisterMode(false);
    setError('');
    setInfoMessage('');
    setShowPassword(false);

    if (!isSupabaseAuth) {
      const prefix = role === Role.COORDINATOR ? 'coordinator' : 'buyer';
      setEmail(`${prefix}@test.com`);
      setPassword('password');
    } else {
      setEmail('');
      setPassword('');
    }
  };

  const toggleRegisterMode = () => {
    const next = !isRegisterMode;
    setIsRegisterMode(next);
    setError('');
    setInfoMessage('');

    if (!isSupabaseAuth) {
      if (next) {
        setName('');
        setEmail('');
        setPassword('');
      } else {
        setEmail('buyer@test.com');
        setPassword('password');
      }
    } else {
      setName('');
      setEmail('');
      setPassword('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPortal) return;
    setError('');
    setInfoMessage('');

    if (!email.trim() || !password) {
      setError('Please provide your email and password.');
      return;
    }

    try {
      if (isRegisterMode && selectedPortal === Role.BUYER) {
        if (!name.trim()) {
          setError('Please enter your full name or organization name.');
          return;
        }
        try {
          localStorage.setItem('agricycle_registered_email', email.trim());
        } catch {
          // ignore storage access issues
        }
        const { requiresEmailConfirmation } = await register(name, email, password, Role.BUYER);
        if (requiresEmailConfirmation) {
          setInfoMessage(
            `Account created for ${getRoleDisplayName(Role.BUYER)}. A confirmation link has been sent to ${email}. Please confirm your email before signing in.`
          );
          setIsRegisterMode(false);
        } else {
          navigate('/');
        }
      } else {
        await login(email, password, selectedPortal);
        navigate('/');
      }
    } catch (err: any) {
      const rawMsg = err?.message || '';
      if (rawMsg.toLowerCase().includes('error sending confirmation email')) {
        setError(
          'Email delivery failed: Supabase could not dispatch the confirmation email. Please verify your SMTP configuration in Supabase Dashboard.'
        );
      } else {
        setError(
          rawMsg ||
            (isSupabaseAuth
              ? 'Authentication failed. Please check your email and password.'
              : 'Invalid credentials. (Demo hint: use password "password")')
        );
      }
    }
  };

  return (
    <section
      id="access-workspace"
      aria-labelledby="access-workspace-heading"
      className="pt-8 pb-4 scroll-mt-20"
    >
      <div className="bg-white border border-[#E2EAE3] rounded-2xl p-6 sm:p-10 shadow-xs">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#006B45]">
            Workspace Portals
          </p>
          <h2
            id="access-workspace-heading"
            className="text-2xl sm:text-3xl font-bold text-[#1E3328] tracking-tight mt-1"
          >
            Access Your Workspace
          </h2>
          <p className="text-sm text-[#64756A] mt-2 leading-relaxed">
            Authorized coordinators and prospective institutional buyers can sign in below to manage validated biomass records or submit non-binding market inquiries.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-8">
          {PUBLIC_PORTALS.map((portal) => {
            const Icon = portal.icon;
            const isSelected = selectedPortal === portal.role;
            return (
              <Card
                key={portal.role}
                className={`flex flex-col justify-between transition-all ${
                  isSelected
                    ? 'border-[#006B45] ring-2 ring-[#006B45]/15'
                    : 'border-[#E2EAE3] hover:border-[#006B45]/40'
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${portal.accentBg} ${portal.accentText}`}
                    >
                      <Icon size={22} />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-[#1E3328]">
                        {portal.title}
                      </CardTitle>
                      <CardDescription className="mt-1.5 text-sm leading-relaxed text-[#64756A]">
                        {portal.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-3">
                  <Button
                    type="button"
                    variant={portal.role === Role.COORDINATOR ? 'primary' : 'outline'}
                    className="w-full justify-between"
                    onClick={() => openPortal(portal.role)}
                  >
                    <span>{portal.ctaLabel}</span>
                    <ArrowRight size={16} />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Focused Sign-In Interface for Selected Portal */}
        {selectedPortal && (
          <div className="mt-8 pt-8 border-t border-[#E2EAE3]">
            <div className="max-w-md mx-auto bg-[#F7FAF7] border border-[#E2EAE3] rounded-xl p-6">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <BrandLogo size="sm" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#006B45]">
                      {getRoleDisplayName(selectedPortal)}
                    </p>
                    <h3 className="text-lg font-bold text-[#1E3328]">
                      {isRegisterMode
                        ? 'Create Buyer Account'
                        : `Sign In as ${getRoleShortName(selectedPortal)}`}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPortal(null);
                    setIsRegisterMode(false);
                    setError('');
                    setInfoMessage('');
                  }}
                  className="p-1.5 rounded-lg text-[#64756A] hover:text-[#1E3328] hover:bg-white border border-transparent hover:border-[#E2EAE3] transition-colors cursor-pointer"
                  aria-label="Close login form"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                {infoMessage && (
                  <div className="bg-[#EAF4EC] border border-[#C3DFC8] text-[#006B45] px-3.5 py-2.5 rounded-lg text-sm">
                    {infoMessage}
                  </div>
                )}

                {isRegisterMode && selectedPortal === Role.BUYER && (
                  <Input
                    label="Full Name / Organization"
                    type="text"
                    placeholder="Enter your name or organization"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    icon={<UserIcon size={17} />}
                    required
                  />
                )}

                <Input
                  label="Email Address"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail size={17} />}
                  required
                />

                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={<Lock size={17} />}
                  suffix={
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="text-[#64756A] hover:text-[#006B45] focus:outline-none cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  }
                  required
                />

                <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
                  {isRegisterMode
                    ? `Register as ${getRoleShortName(Role.BUYER)}`
                    : `Sign In as ${getRoleShortName(selectedPortal)}`}
                </Button>

                {selectedPortal === Role.COORDINATOR ? (
                  <div className="bg-white border border-[#E2EAE3] rounded-lg p-3 flex items-start gap-2.5 text-xs text-[#64756A]">
                    <Info size={15} className="shrink-0 mt-0.5 text-[#006B45]" />
                    <p>
                      Coordinator and LGU planning accounts are managed by the system Administrator. Role permissions are enforced securely by your database profile.
                    </p>
                  </div>
                ) : (
                  <div className="text-center pt-2 border-t border-[#E2EAE3] space-y-1.5">
                    <div>
                      <button
                        type="button"
                        onClick={toggleRegisterMode}
                        className="text-xs font-semibold text-[#006B45] hover:underline cursor-pointer"
                      >
                        {isRegisterMode
                          ? 'Already have a Buyer account? Sign in'
                          : "Don't have an account? Register as Buyer/Institutional Inquirer"}
                      </button>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => navigate('/confirm-email')}
                        className="text-[11px] text-[#64756A] hover:text-[#006B45] cursor-pointer"
                      >
                        Need to verify your email link? Confirm here &rarr;
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
