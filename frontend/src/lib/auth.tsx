import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearToken, getToken, setToken } from "./api";
import type { User } from "./types";

interface Ctx {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  login: (name: string, password: string) => Promise<void>;
  signup: (name: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<Ctx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  async function refreshAdmin() {
    try {
      const a = await api<{ is_admin: boolean }>("GET", "/admin/me");
      setIsAdmin(!!a.is_admin);
    } catch {
      setIsAdmin(false);
    }
  }

  useEffect(() => {
    (async () => {
      // OAuth callback returns the token in the fragment: /#/token=<api_token>
      const m = window.location.hash.match(/token=([^&]+)/);
      if (m) {
        setToken(decodeURIComponent(m[1]));
        window.history.replaceState(null, "", window.location.pathname + "#/");
      }
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        setUser(await api<User>("GET", "/users/me"));
        await refreshAdmin();
      } catch {
        clearToken();
      }
      setLoading(false);
    })();
  }, []);

  async function finish(u: User) {
    setToken(u.api_token);
    setUser(u);
    await refreshAdmin();
  }

  const value: Ctx = {
    user,
    loading,
    isAdmin,
    login: async (name, password) => finish(await api<User>("POST", "/auth/login", { name, password })),
    signup: async (name, password) => finish(await api<User>("POST", "/auth/signup", { name, password })),
    logout: () => {
      clearToken();
      setUser(null);
      setIsAdmin(false);
      window.location.hash = "#/";
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
