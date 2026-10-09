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
} from 'lucide-react';
import { Role } from '../types';

const ROLE_OPTIONS = [
  { id: Role.ADMINISTRATOR, name: 'Administrator', icon: Shield, desc: 'Manage users, roles, settings, data & audit logs' },
  { id: Role.COORDINATOR, name: 'Cooperative / Hub Coordinator', icon: Layers, desc: 'Manage records, encoding, hubs & listings' },
  { id: Role.LGU, name: 'LGU / Institutional User', icon: Building, desc: 'Monitor info, validate records, map & reports' },
  { id: Role.BUYER, name: 'Buyer / Institutional Inquirer', icon: Briefcase, desc: 'Browse listings, filter, and send inquiries' },
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

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    setError('');
    setInfoMessage('');

    if (!isSupabaseAuth) {
      const rolePrefix = role.toLowerCase().replace('_', '');
      setEmail(`${rolePrefix}@test.com`);
      setPassword('password');
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
        const { requiresEmailConfirmation } = await register(name, email, password);
        if (requiresEmailConfirmation) {
          setInfoMessage(
            'Account created! Please check your email inbox to confirm your registration before signing in.'
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
      setError(
        err?.message ||
          (isSupabaseAuth
            ? 'Authentication failed. Please check your email and password.'
            : 'Invalid credentials. (Hint: use password "password")')
      );
    }
  };

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
                  {ROLE_OPTIONS.find((r) => r.id === selectedRole)?.name}
                </div>
              </div>
              <CardTitle className="text-xl">
                {isRegisterMode ? 'Create an Account' : 'Sign in to your account'}
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                {isRegisterMode
                  ? 'New accounts are registered with Buyer permissions by default until assigned a staff role by an Administrator.'
                  : isSupabaseAuth
                  ? 'Enter your Supabase account credentials.'
                  : 'Test credentials have been pre-filled for this role.'}
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

                <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
                  {isRegisterMode ? 'Register Account' : 'Sign In'}
                </Button>

                {isSupabaseAuth && (
                  <div className="text-center pt-2 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegisterMode(!isRegisterMode);
                        setError('');
                        setInfoMessage('');
                      }}
                      className="text-xs font-medium text-agri-green-700 hover:text-agri-green-800"
                    >
                      {isRegisterMode
                        ? 'Already have an account? Sign in'
                        : "Don't have an account? Register as Buyer"}
                    </button>
                  </div>
                )}
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
