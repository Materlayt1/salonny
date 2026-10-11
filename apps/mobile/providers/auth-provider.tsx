import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { initializeSupabase } from "@/lib/supabase";
import { config } from "@/lib/config";

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, fullName: string): Promise<boolean>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  resendVerification(email: string): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [configured, setConfigured] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void initializeSupabase().then(async (client) => {
      if (!active) return;
      setConfigured(true);
      const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setLoading(false);
      });
      unsubscribe = () => listener.subscription.unsubscribe();
      const { data } = await client.auth.getSession();
      if (active) {
        setSession(data.session);
        setLoading(false);
      }
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [configured]);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = await initializeSupabase();
    setConfigured(true);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.code === "invalid_credentials") throw new Error("E-posta veya şifre hatalı.");
      if (error.code === "email_not_confirmed") throw new Error("Önce e-postana gelen doğrulama bağlantısını aç.");
      throw new Error("Giriş servisine ulaşılamadı. Biraz sonra yeniden dene.");
    }
    setSession(data.session);
  }, []);

  const signUp = useCallback(async (
    email: string,
    password: string,
    fullName: string,
  ) => {
    const client = await initializeSupabase();
    setConfigured(true);
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, requested_role: "customer" } },
    });
    if (error) throw new Error(error.message);
    if (data.user?.identities?.length === 0) throw new Error("Bu e-posta ile zaten bir hesap var. Giriş yapabilirsin.");
    if (data.session) setSession(data.session);
    return Boolean(data.session);
  }, []);

  const signOut = useCallback(async () => {
    const client = await initializeSupabase();
    const { error } = await client.auth.signOut();
    if (error) throw new Error("Oturum kapatılamadı.");
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const resetPassword = useCallback(async (email: string) => {
    const client = await initializeSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${config.apiUrl}/auth/reset-password` });
    if (error) throw new Error(error.code === "over_email_send_rate_limit" ? "E-posta gönderim sınırına ulaşıldı. Biraz sonra yeniden dene." : "Şifre yenileme e-postası gönderilemedi. Yeniden dene.");
  }, []);
  const resendVerification = useCallback(async (email: string) => {
    const client = await initializeSupabase();
    const { error } = await client.auth.resend({ type: "signup", email });
    if (error) throw new Error("Doğrulama e-postası gönderilemedi. Biraz sonra yeniden dene.");
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    configured,
    loading,
    session,
    user: session?.user ?? null,
    signIn,
    signUp,
    signOut,
    resetPassword,
    resendVerification,
  }), [configured, loading, session, signIn, signOut, signUp, resetPassword, resendVerification]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
