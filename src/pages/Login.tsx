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
} from 'lucide-react';
import { Role } from '../types';
import { getRoleDisplayName, getRoleShortName, ROLE_DESCRIPTIONS } from '../utils/rbac';

const ROLE_OPTIONS = [
  {
    id: Role.ADMINISTRATOR,
    name: getRoleDisplayName(Role.ADMINISTRATOR),
    icon: Shield,
    desc: ROLE_DESCRIPTIONS[Role.ADMINISTRATOR],
  },
  {
    id: Role.COORDINATOR,
    name: getRoleDisplayName(Role.COORDINATOR),
    icon: Layers,
    desc: ROLE_DESCRIPTIONS[Role.COORDINATOR],
  },
  {
    id: Role.LGU,
    name: getRoleDisplayName(Role.LGU),
    icon: Building,
    desc: ROLE_DESCRIPTIONS[Role.LGU],
  },
  {
    id: Role.BUYER,
    name: getRoleDisplayName(Role.BUYER),
    icon: Briefcase,
    desc: ROLE_DESCRIPTIONS[Role.BUYER],
  },
];

export const Login: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const { login, register, isLoading, isSupabaseAuth } = useAuth();
  const navigate = useNavigate();

  const canSelfRegister = selectedRole === Role.BUYER;

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    setIsRegisterMode(false);
    setError('');
    setInfoMessage('');

    if (!isSupabaseAuth) {
      const rolePrefix = role.toLowerCase().replace('_', '');
      setEmail(`${rolePrefix}@test.com`);
      setPassword('password');
    } else {
      setEmail('');
      setPassword('');
    }
  };

  const toggleRegisterMode = () => {
    if (selectedRole !== Role.BUYER) {
      setSelectedRole(Role.BUYER);
    }
    const nextMode = !isRegisterMode;
    setIsRegisterMode(nextMode);
    setError('');
    setInfoMessage('');

    if (!isSupabaseAuth) {
      if (nextMode) {
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
    setError('');
    setInfoMessage('');

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
        // Public self-registration is strictly restricted to Buyer/Institutional Inquirer.
        localStorage.setItem('agricycle_registered_email', email.trim());
        const { requiresEmailConfirmation } = await register(name, email, password, Role.BUYER);
        if (requiresEmailConfirmation) {
          setInfoMessage(
            `Account created for ${getRoleDisplayName(Role.BUYER)}! A confirmation link has been sent to ${email}. Please check your inbox and click the confirmation link before signing in.`
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

  return (
    <div className="min-h-screen bg-agri-green-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-agri-green-200 opacity-20 blur-3xl"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-agri-accent-500 opacity-10 blur-3xl"></div>

      <div className="sm:mx-auto sm:w-full sm:max-w-xl relative z-10">
        <div className="flex justify-center items-center mb-6 text-agri-green-600">
          <Leaf size={48} strokeWidth={1.5} />
        </div>
        <h2 className="mt-2 text-center text-3xl font-extrabold text-gray-900 tracking-tight">
          AgriCycle
        </h2>
        <p className="mt-2 text-center text-sm text-agri-earth-600 max-w-md mx-auto">
          Community-Based Biomass Information Management & Market Linkage System
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl relative z-10 px-4 sm:px-0">
        {!selectedRole ? (
          <Card className="shadow-lg border-none">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl text-center">Select Your Portal</CardTitle>
              <CardDescription className="text-center">
                {isSupabaseAuth
                  ? 'Select a portal to sign in with your registered account (permissions are enforced by your database profile role)'
                  : 'Choose a persona to explore the prototype'}
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
                  onClick={() => {
                    setSelectedRole(null);
                    setIsRegisterMode(false);
                    setError('');
                    setInfoMessage('');
                  }}
                  className="p-1.5 -ml-1.5 text-agri-earth-500 hover:text-agri-green-600 hover:bg-agri-green-50 rounded-md transition-colors"
                  aria-label="Back to role selection"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="px-2.5 py-1 rounded-full bg-agri-green-100 text-agri-green-800 text-xs font-semibold">
                  {getRoleDisplayName(selectedRole)}
                </div>
              </div>
              <CardTitle className="text-xl">
                {isRegisterMode
                  ? `Register as ${getRoleDisplayName(Role.BUYER)}`
                  : `Sign in as ${getRoleShortName(selectedRole)}`}
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                {isRegisterMode
                  ? 'Create a Buyer/Institutional Inquirer account to browse validated biomass listings and submit non-binding market inquiries.'
                  : isSupabaseAuth
                  ? `Enter your credentials for ${getRoleDisplayName(selectedRole)} access.`
                  : 'Demo credentials have been pre-filled for this role.'}
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

                {isRegisterMode && (
                  <Input
                    label="Full Name / Organization"
                    type="text"
                    placeholder="Enter your name or organization"
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
                    ? `Register as ${getRoleShortName(Role.BUYER)}`
                    : `Sign In as ${getRoleShortName(selectedRole)}`}
                </Button>

                {!canSelfRegister && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex items-start gap-2.5 text-xs text-blue-900">
                    <Info size={16} className="shrink-0 mt-0.5 text-blue-700" />
                    <div>
                      <p className="font-semibold">Administrator-Managed Role</p>
                      <p className="mt-0.5 text-blue-800">
                        Public self-registration provisions Buyer/Institutional Inquirer accounts only. Coordinator, Planning User, and Administrator permissions are assigned by an Administrator.
                      </p>
                    </div>
                  </div>
                )}

                <div className="text-center pt-2 border-t border-gray-100 space-y-2">
                  <div>
                    <button
                      type="button"
                      onClick={toggleRegisterMode}
                      className="text-xs font-medium text-agri-green-700 hover:text-agri-green-800 transition-colors"
                    >
                      {isRegisterMode
                        ? 'Already have an account? Sign in'
                        : canSelfRegister
                        ? "Don't have an account? Register as Buyer/Institutional Inquirer"
                        : 'Need a new account? Register as Buyer/Institutional Inquirer'}
                    </button>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => navigate('/confirm-email')}
                      className="text-[11px] text-gray-500 hover:text-agri-green-700 transition-colors"
                    >
                      Need to confirm your email or link expired? Verify here &rarr;
                    </button>
                  </div>
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
