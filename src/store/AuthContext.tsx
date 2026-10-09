import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Role } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { fetchUserProfileFromSupabase } from '../services/agriCycleService';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, expectedRole?: Role) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<{ requiresEmailConfirmation: boolean }>;
  logout: () => Promise<void>;
  isLoading: boolean;
  isSupabaseAuth: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    if (isSupabaseConfigured && supabase) {
      // 1. Restore active Supabase session and fetch trusted profile from PostgreSQL
      supabase.auth
        .getSession()
        .then(async ({ data: { session }, error }) => {
          if (!isMounted) return;
          if (error) {
            console.error('Supabase session restore error:', error.message);
            setUser(null);
            setIsLoading(false);
            return;
          }
          if (session?.user) {
            try {
              const profile = await fetchUserProfileFromSupabase(session.user.id, session.user.email);
              if (isMounted) {
                setUser(
                  profile || {
                    id: session.user.id,
                    name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
                    email: session.user.email || '',
                    role: Role.BUYER,
                  }
                );
              }
            } catch (profileErr) {
              console.error('Failed to load profile on session restore:', profileErr);
              if (isMounted) setUser(null);
            }
          } else {
            setUser(null);
          }
          if (isMounted) setIsLoading(false);
        })
        .catch((err) => {
          console.error('Unexpected error restoring session:', err);
          if (isMounted) {
            setUser(null);
            setIsLoading(false);
          }
        });

      // 2. Listen for auth state changes (sign in, sign out, token refresh, expired session)
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!isMounted) return;
        if (event === 'SIGNED_OUT' || !session?.user) {
          setUser(null);
          setIsLoading(false);
          return;
        }
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          try {
            const profile = await fetchUserProfileFromSupabase(session.user.id, session.user.email);
            if (isMounted && profile) {
              setUser(profile);
            }
          } catch (err) {
            console.error('Error refreshing user profile:', err);
          } finally {
            if (isMounted) setIsLoading(false);
          }
        }
      });

      return () => {
        isMounted = false;
        subscription.unsubscribe();
      };
    } else {
      // Offline / unconfigured fallback mode for local preview when VITE_SUPABASE_URL is not set
      const storedUser = localStorage.getItem('agricycle_user');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          console.error('Failed to parse user from local storage', e);
        }
      }
      setIsLoading(false);
      return () => {
        isMounted = false;
      };
    }
  }, []);

  const login = async (email: string, password: string, expectedRole?: Role) => {
    setIsLoading(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error || !data.user) {
          throw new Error(error?.message || 'Invalid login credentials.');
        }

        const profile = await fetchUserProfileFromSupabase(data.user.id, data.user.email);
        if (!profile) {
          throw new Error('Authenticated user profile could not be loaded from database.');
        }

        // Authoritative role comes strictly from PostgreSQL profiles table, never client selection
        setUser(profile);
        return;
      }

      // Fallback local demo login only when Supabase env vars are not configured
      await new Promise((resolve) => setTimeout(resolve, 400));

      if (password !== 'password') {
        throw new Error('Invalid credentials');
      }

      let role = expectedRole || Role.COORDINATOR;
      if (!expectedRole) {
        if (email.startsWith('admin')) role = Role.ADMINISTRATOR;
        else if (email.startsWith('coordinator')) role = Role.COORDINATOR;
        else if (email.startsWith('buyer')) role = Role.BUYER;
        else if (email.startsWith('lgu')) role = Role.LGU;
      }

      const defaultIdByRole: Record<Role, string> = {
        [Role.ADMINISTRATOR]: 'user-admin',
        [Role.COORDINATOR]: 'user-coord',
        [Role.LGU]: 'user-lgu',
        [Role.BUYER]: 'user-buyer',
      };

      const defaultOrgByRole: Record<Role, string | undefined> = {
        [Role.ADMINISTRATOR]: undefined,
        [Role.COORDINATOR]: 'org-2',
        [Role.LGU]: 'org-3',
        [Role.BUYER]: 'org-4',
      };

      const fallbackUser: User = {
        id: defaultIdByRole[role] || 'usr_' + Math.random().toString(36).substring(2, 9),
        name: email.split('@')[0],
        email,
        role,
        organizationId: defaultOrgByRole[role],
      };

      setUser(fallbackUser);
      localStorage.setItem('agricycle_user', JSON.stringify(fallbackUser));
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    name: string,
    email: string,
    password: string
  ): Promise<{ requiresEmailConfirmation: boolean }> => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Registration requires Supabase connection (VITE_SUPABASE_URL & VITE_SUPABASE_PUBLISHABLE_KEY).');
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            name: name.trim(),
          },
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.session && data.user) {
        const profile = await fetchUserProfileFromSupabase(data.user.id, data.user.email);
        if (profile) {
          setUser(profile);
        }
        return { requiresEmailConfirmation: false };
      }

      return { requiresEmailConfirmation: true };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    localStorage.removeItem('agricycle_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        register,
        logout,
        isLoading,
        isSupabaseAuth: isSupabaseConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
