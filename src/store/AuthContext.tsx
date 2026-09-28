import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Role } from '../types';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, role?: Role) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate checking local storage for an existing session
    const storedUser = localStorage.getItem('agricycle_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse user from local storage', e);
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string, explicitRole?: Role) => {
    setIsLoading(true);
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));

    if (password !== 'password') {
      setIsLoading(false);
      throw new Error('Invalid credentials');
    }

    // Use explicitly selected role, or fallback to mock logic based on email prefix
    let role = explicitRole || Role.COORDINATOR;
    
    if (!explicitRole) {
      if (email.startsWith('admin')) role = Role.ADMINISTRATOR;
      else if (email.startsWith('coordinator')) role = Role.COORDINATOR;
      else if (email.startsWith('buyer')) role = Role.BUYER;
      else if (email.startsWith('lgu')) role = Role.LGU;
    }

    const mockUser: User = {
      id: 'usr_' + Math.random().toString(36).substr(2, 9),
      name: email.split('@')[0],
      email,
      role,
    };

    setUser(mockUser);
    localStorage.setItem('agricycle_user', JSON.stringify(mockUser));
    setIsLoading(false);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('agricycle_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
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
