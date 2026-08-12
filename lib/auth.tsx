import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type UserRole = 'admin' | 'manager' | null;

type AuthContextType = {
  session: Session | null;
  loading: boolean;
  role: UserRole;
  managerId: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  role: null,
  managerId: null,
  signIn: async () => ({ error: 'not implemented' }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>(null);
  const [managerId, setManagerId] = useState<string | null>(null);

  const extractRole = (user: User | null): UserRole => {
    if (!user) return null;
    const r = (user.user_metadata?.role) || (user.app_metadata?.role);
    return (r === 'admin' || r === 'manager') ? r : null;
  };

  const fetchManagerId = async (user: User | null) => {
    if (!user) { setManagerId(null); return; }
    const { data } = await supabase
      .from('managers')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    setManagerId(data?.id || null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setRole(extractRole(data.session?.user ?? null));
      if (data.session?.user) {
        fetchManagerId(data.session.user).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      (async () => {
        setSession(sess);
        setRole(extractRole(sess?.user ?? null));
        if (sess?.user) {
          await fetchManagerId(sess.user);
        } else {
          setManagerId(null);
        }
        setLoading(false);
      })();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message || null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
    setManagerId(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, role, managerId, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
