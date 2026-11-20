import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react';
import { Role } from '../types';
import { useAuth } from '../store/AuthContext';
import { BrandLogo } from '../components/BrandLogo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { login, isLoading, isSupabaseAuth } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please enter your Administrator email and password.');
      return;
    }

    try {
      await login(email, password, Role.ADMINISTRATOR, true);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(
        err?.message ||
          (isSupabaseAuth
            ? 'Administrator authentication failed. Please verify your credentials and role.'
            : 'Invalid Administrator credentials.')
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#F7FAF7] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <BrandLogo size="lg" />
          <h1 className="mt-4 text-2xl font-bold text-[#1E3328] tracking-tight">
            Administrator Access
          </h1>
          <p className="text-xs text-[#64756A] mt-1">
            AgriCycle System Governance &amp; Audit Administration
          </p>
        </div>

        <Card className="border-[#E2EAE3] shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2 text-[#1E3328]">
              <ShieldCheck size={19} className="text-[#006B45]" />
              Administrator Sign In
            </CardTitle>
            <CardDescription>
              Restricted to authorized system Administrators. Self-registration is disabled.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <Input
                label="Administrator Email"
                type="email"
                placeholder="admin@agricycle.ph"
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
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="text-[#64756A] hover:text-[#006B45] focus:outline-none cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                }
                required
              />

              <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
                Sign In to Administrator Console
              </Button>
            </form>

            <div className="mt-5 pt-4 border-t border-[#E2EAE3] text-center">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#64756A] hover:text-[#006B45]"
              >
                <ArrowLeft size={14} />
                <span>Return to Public Overview</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
