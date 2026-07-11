import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { DEV_TOKEN_KEY } from './api';
import { registerPushToken } from './notifications';
import { supabase, supabaseConfigured } from './supabase';

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  supabaseConfigured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  continueDevMode: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setStatus(data.session ? 'signedIn' : 'signedOut');
      } else {
        const token = await AsyncStorage.getItem(DEV_TOKEN_KEY);
        if (!mounted) return;
        setStatus(token ? 'signedIn' : 'signedOut');
      }
    }

    bootstrap();

    const sub = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setStatus(session ? 'signedIn' : 'signedOut');
    });

    return () => {
      mounted = false;
      sub?.data.subscription.unsubscribe();
    };
  }, []);

  // Register the Expo push token once per session (best-effort, non-blocking).
  useEffect(() => {
    if (status === 'signedIn') void registerPushToken();
  }, [status]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      supabaseConfigured,
      async signInWithPassword(email, password) {
        if (!supabase) throw new Error('Supabase is not configured.');
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      },
      async signUpWithPassword(email, password) {
        if (!supabase) throw new Error('Supabase is not configured.');
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      },
      async continueDevMode() {
        await AsyncStorage.setItem(DEV_TOKEN_KEY, 'dev');
        setStatus('signedIn');
      },
      async signOut() {
        if (supabase) await supabase.auth.signOut();
        await AsyncStorage.removeItem(DEV_TOKEN_KEY);
        setStatus('signedOut');
      },
    }),
    [status]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
