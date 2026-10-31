import React, { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "@/lib/api";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff" | "customer";
  avatar?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (provider: string, formData: FormData | { email: string; password: string }) => Promise<void>;
  signUp: (data: { name: string; email: string; password: string }) => Promise<void>;
  signOut: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  async function loadUser() {
    const token = getToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const me = await api.auth.me();
      setUser(me);
    } catch (err) {
      console.warn("[Auth] Failed to restore session:", err);
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadUser();
  }, []);

  const signIn = async (
    _provider: string,
    formData: FormData | { email: string; password: string }
  ) => {
    setIsLoading(true);
    try {
      let email = "";
      let password = "";
      let flow = "signIn";

      if (formData instanceof FormData) {
        email = String(formData.get("email") || "");
        password = String(formData.get("password") || "");
        flow = String(formData.get("flow") || "signIn");
      } else {
        email = formData.email;
        password = formData.password;
      }

      if (flow === "signUp") {
        const name = formData instanceof FormData ? String(formData.get("name") || "") : email.split("@")[0];
        const res = await api.auth.register({ name, email, password });
        setUser(res.user);
      } else {
        const res = await api.auth.login({ email, password });
        setUser(res.user);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (data: { name: string; email: string; password: string }) => {
    setIsLoading(true);
    try {
      const res = await api.auth.register(data);
      setUser(res.user);
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = () => {
    api.auth.logout();
    setUser(null);
  };

  const refreshUser = async () => {
    await loadUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signUp,
        signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
