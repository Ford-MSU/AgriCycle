import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import {
  Leaf,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Shield,
  Layers,
  Briefcase,
  Building,
  ArrowLeft,
  User as UserIcon,
  Info,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { Role, EXISTING_TEST_ACCOUNTS } from '../types';

const ROLE_OPTIONS = [
  { id: Role.ADMINISTRATOR, name: 'Administrator', icon: Shield, desc: 'Manage users, roles, settings, data & audit logs' },
  { id: Role.COORDINATOR, name: 'Cooperative / Hub Coordinator', icon: Layers, desc: 'Manage records, encoding, hubs & listings' },
  { id: Role.LGU, name: 'LGU / Institutional User', icon: Building, desc: 'Monitor info, validate records, map & reports' },
  { id: Role.BUYER, name: 'Buyer / Institutional Inquirer', icon: Briefcase, desc: 'Browse listings, filter, and send inquiries' },
];

export const Login: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [loginMode, setLoginMode] = useState<'TEST_ACCOUNT' | 'STANDARD_CREDENTIALS'>('TEST_ACCOUNT');
  const [displayName, setDisplayName] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const { login, loginWithTestAccount, register, isLoading, isSupabaseAuth } = useAuth();
  const navigate = useNavigate();

  const getRoleDisplayName = (role: Role | null) => {
    switch (role) {
      case Role.ADMINISTRATOR:
        return 'an Admin';
      case Role.COORDINATOR:
        return 'a Coordinator';
      case Role.LGU:
        return 'an LGU Validator';
      case Role.BUYER:
        return 'a Buyer';
      default:
        return 'an Account';
    }
  };

  const getRoleShortName = (role: Role | null) => {
    switch (role) {
      case Role.ADMINISTRATOR:
        return 'Admin';
      case Role.COORDINATOR:
        return 'Coordinator';
      case Role.LGU:
        return 'LGU Validator';
      case Role.BUYER:
        return 'Buyer';
      default:
        return 'User';
    }
  };

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    setLoginMode('TEST_ACCOUNT');
    setIsRegisterMode(false);
    setDisplayName('');
    setError('');
    setInfoMessage('');
    setEmail('');
    setPassword('');
  };

  const handleBackToRoleSelection = () => {
    setSelectedRole(null);
    setLoginMode('TEST_ACCOUNT');
    setIsRegisterMode(false);
    setDisplayName('');
    setError('');
    setInfoMessage('');
  };

  const toggleRegisterMode = () => {
    const nextMode = !isRegisterMode;
    setIsRegisterMode(nextMode);
    setError('');
    setInfoMessage('');
    if (nextMode) {
      setName('');
      setEmail('');
      setPassword('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    if (!selectedRole) {
      setError('Please select a portal role first.');
      return;
    }

    // 1. Primary Testing Login Mode (Role + Custom Display Name -> Existing Test Account)
    if (loginMode === 'TEST_ACCOUNT') {
      const trimmed = displayName.trim();
      if (!trimmed) {
        setError('Please enter your preferred display name.');
        return;
      }
      if (trimmed.length < 2) {
        setError('Display name must be at least 2 characters long.');
        return;
      }
      if (trimmed.length > 50) {
        setError('Display name must be 50 characters or fewer.');
        return;
      }
      if (/[<>{}]/g.test(trimmed)) {
        setError('Display name cannot contain script or HTML characters.');
        return;
      }

      try {
        await loginWithTestAccount(selectedRole, trimmed);
        navigate('/');
      } catch (err: any) {
        setError(err?.message || 'Failed to authenticate testing session.');
      }
      return;
    }

    // 2. Standard Credentials Login / Registration Mode
    if (!email || !password) {
      setError('Please provide your email and password.');
      return;
    }

    try {
      if (isRegisterMode) {
        if (!name.trim()) {
          setError('Please enter your full name or organization name.');
          return;
        }
        const targetRole = selectedRole || Role.BUYER;
        localStorage.setItem('agricycle_registered_email', email.trim());
        const { requiresEmailConfirmation } = await register(name, email, password, targetRole);
        if (requiresEmailConfirmation) {
          setInfoMessage(
            `Account created for ${getRoleShortName(targetRole)}! A confirmation link has been sent to ${email}. Please check your inbox and click the confirmation link before signing in.`
          );
          setIsRegisterMode(false);
        } else {
          navigate('/');
        }
      } else {
        await login(email, password, selectedRole || undefined);
        navigate('/');
      }
    } catch (err: any) {
      const rawMsg = err?.message || '';
      if (rawMsg.toLowerCase().includes('error sending confirmation email')) {
        setError(
          'Email delivery failed: Supabase could not dispatch the confirmation email. Please check your Custom SMTP settings in the Supabase Dashboard, or disable "Confirm email" under Auth > Providers > Email for testing.'
        );
      } else {
        setError(
          rawMsg ||
            (isSupabaseAuth
              ? 'Authentication failed. Please check your email and password.'
              : 'Invalid credentials. (Hint: use password "password")')
        );
      }
    }
  };

  const activeTestAccount = selectedRole ? EXISTING_TEST_ACCOUNTS[selectedRole] : null;

  return (
    <div className="min-h-screen bg-agri-green-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-agri-green-200 opacity-20 blur-3xl"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-agri-accent-500 opacity-10 blur-3xl"></div>

      <div className="sm:mx-auto sm:w-full sm:max-w-xl relative z-10">
        <div className="flex justify-center items-center mb-6 text-agri-green-600">
          <Leaf size={48} strokeWidth={1.5} />
        </div>
        <h2 className="mt-2 text-center text-3xl font-extrabold text-gray-900 tracking-tight">
          AgriCycle
        </h2>
        <p className="mt-2 text-center text-sm text-agri-earth-600 max-w-sm mx-auto">
          Community-Based Biomass Information Management
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl relative z-10 px-4 sm:px-0">
        {!selectedRole ? (
          <Card className="shadow-lg border-none">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl text-center">Select Your Portal</CardTitle>
              <CardDescription className="text-center">
                Choose a persona to sign in with an existing authorized test account using your custom display name
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ROLE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleRoleSelect(option.id)}
                    className="flex items-start text-left gap-3 p-4 rounded-lg border border-agri-green-100 bg-white hover:bg-agri-green-50 hover:border-agri-green-300 transition-all group"
                  >
                    <div className="mt-0.5 p-2 rounded-md bg-agri-cream-100 text-agri-green-600 group-hover:bg-agri-green-600 group-hover:text-white transition-colors shrink-0">
                      <option.icon size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{option.name}</p>
                      <p className="text-xs text-agri-earth-500 mt-0.5">{option.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-lg border-none sm:max-w-md mx-auto">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={handleBackToRoleSelection}
                  className="p-1.5 -ml-1.5 text-agri-earth-500 hover:text-agri-green-600 hover:bg-agri-green-50 rounded-md transition-colors"
                  aria-label="Back to role selection"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="px-2.5 py-1 rounded-full bg-agri-green-100 text-agri-green-800 text-xs font-semibold">
                  {ROLE_OPTIONS.find((r) => r.id === selectedRole)?.name}
                </div>
              </div>

              <CardTitle className="text-xl">
                {loginMode === 'TEST_ACCOUNT'
                  ? `Sign in as ${getRoleShortName(selectedRole)}`
                  : isRegisterMode
                  ? `Register as ${getRoleDisplayName(selectedRole)}`
                  : `Sign in as ${getRoleShortName(selectedRole)}`}
              </CardTitle>

              <CardDescription className="text-sm mt-1">
                {loginMode === 'TEST_ACCOUNT'
                  ? `Enter your preferred display name to test the ${getRoleShortName(
                      selectedRole
                    )} portal using the existing test account.`
                  : isRegisterMode
                  ? 'Create an independent account with permanent credentials.'
                  : `Enter credentials for ${getRoleShortName(selectedRole)} access.`}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form className="space-y-5" onSubmit={handleSubmit}>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                    {error}
                  </div>
                )}

                {infoMessage && (
                  <div className="bg-agri-green-50 border border-agri-green-200 text-agri-green-800 px-4 py-3 rounded-md text-sm">
                    {infoMessage}
                  </div>
                )}

                {/* Controlled Testing Mode: Enter Custom Display Name */}
                {loginMode === 'TEST_ACCOUNT' ? (
                  <>
                    <div className="rounded-lg bg-agri-cream-100/70 border border-agri-cream-300 p-3 text-xs text-agri-earth-700 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-semibold text-agri-green-800">
                        <Sparkles size={14} className="text-agri-green-600" />
                        Testing Account Mapping
                      </div>
                      <div className="flex justify-between items-center text-[11px] pt-0.5">
                        <span className="text-gray-500">Selected Portal Role:</span>
                        <span className="font-semibold text-gray-800">
                          {ROLE_OPTIONS.find((r) => r.id === selectedRole)?.name}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-gray-500">Underlying Account:</span>
                        <span className="font-mono text-agri-green-700 font-medium">
                          {activeTestAccount?.email}
                        </span>
                      </div>
                      <p className="text-[10px] text-agri-earth-500 pt-1 border-t border-agri-cream-200">
                        Your entered name is a testing session override displayed across the interface. The existing account's role, permissions, and database records remain unchanged.
                      </p>
                    </div>

                    <Input
                      label="Enter Your Display Name"
                      type="text"
                      placeholder="Enter your name or preferred username"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      icon={<UserIcon size={18} />}
                      required
                      autoFocus
                    />

                    <p className="text-[11px] text-gray-500 -mt-3">
                      This name will appear on the dashboard welcome message, sidebar, and header.
                    </p>

                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      isLoading={isLoading}
                    >
                      Sign In as {getRoleShortName(selectedRole)}
                    </Button>

                    <div className="text-center pt-2 border-t border-gray-100 space-y-2">
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            setLoginMode('STANDARD_CREDENTIALS');
                            setError('');
                            setInfoMessage('');
                          }}
                          className="text-xs font-medium text-agri-earth-600 hover:text-agri-green-700 transition-colors"
                        >
                          Need email/password credentials? Switch to Standard Sign In &rarr;
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  /* Standard Credentials Login & Registration Mode */
                  <>
                    {isRegisterMode && (
                      <Input
                        label="Full Name / Organization"
                        type="text"
                        placeholder="Enter your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        icon={<UserIcon size={18} />}
                        required
                      />
                    )}

                    <Input
                      label="Email Address"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      icon={<Mail size={18} />}
                      required
                    />

                    <Input
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      icon={<Lock size={18} />}
                      suffix={
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="hover:text-agri-green-600 focus:outline-none"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      }
                      required
                    />

                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      isLoading={isLoading}
                    >
                      {isRegisterMode
                        ? `Register as ${getRoleShortName(selectedRole)}`
                        : `Sign In with Credentials`}
                    </Button>

                    <div className="text-center pt-2 border-t border-gray-100 space-y-2">
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            setLoginMode('TEST_ACCOUNT');
                            setError('');
                            setInfoMessage('');
                          }}
                          className="text-xs font-semibold text-agri-green-700 hover:text-agri-green-800 transition-colors"
                        >
                          &larr; Back to Testing Login with Display Name
                        </button>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={toggleRegisterMode}
                          className="text-xs font-medium text-agri-earth-600 hover:text-agri-green-700 transition-colors"
                        >
                          {isRegisterMode
                            ? `Already have an account? Sign in with email`
                            : `Don't have an account? Register as ${getRoleDisplayName(selectedRole)}`}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div className="text-center pt-1 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => navigate('/confirm-email')}
                    className="text-[11px] text-gray-500 hover:text-agri-green-700 transition-colors"
                  >
                    Need to confirm your email or link expired? Verify here &rarr;
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="mt-8 text-center text-xs text-agri-earth-500">
          <p>AgriCycle CB-BAIM System &bull; Butuan City, Philippines</p>
        </div>
      </div>
    </div>
  );
};
