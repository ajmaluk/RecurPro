/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-refresh/only-export-components */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { getFunctionName } from "convex/server";
import { getToken } from "./api";

// Simple reactive bus for re-fetching queries on mutations
const MUTATION_EVENT = "recurpro_db_mutation";

export function notifyMutation() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MUTATION_EVENT));
  }
}

function resolveFnName(fnRef: any): string {
  try {
    const raw = getFunctionName(fnRef);
    return raw.replace(":", ".");
  } catch {
    if (typeof fnRef === "string") return fnRef.replace(":", ".");
    return String(fnRef);
  }
}

async function callConvexBridge(type: "query" | "mutation" | "action", name: string, args: any) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`/api/convex/${type === "action" ? "mutation" : type}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name, args }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Bridge ${type} failed: ${res.statusText}`);
  }

  const data = await res.json();
  return data.result;
}

/**
 * Reactive useQuery implementation connected to MySQL backend
 */
export function useQuery(fnRef: any, args?: any): any {
  const fnName = useMemo(() => (fnRef ? resolveFnName(fnRef) : ""), [fnRef]);
  const isSkipped = args === "skip" || !fnRef;
  const argsKey = useMemo(() => JSON.stringify(args ?? {}), [args]);

  const [data, setData] = useState<any>(undefined);

  const fetchQuery = useCallback(async () => {
    if (isSkipped || !fnName) return;
    try {
      const result = await callConvexBridge("query", fnName, args);
      setData(result);
    } catch (err) {
      console.error(`[ConvexAdapter] Query "${fnName}" error:`, err);
      setData(null);
    }
  }, [fnName, isSkipped, argsKey]);

  useEffect(() => {
    fetchQuery();
  }, [fetchQuery]);

  // Re-run query whenever a mutation occurs across the application
  useEffect(() => {
    if (isSkipped || !fnName) return;
    const handleMutation = () => {
      fetchQuery();
    };
    window.addEventListener(MUTATION_EVENT, handleMutation);
    return () => {
      window.removeEventListener(MUTATION_EVENT, handleMutation);
    };
  }, [fetchQuery, isSkipped, fnName]);

  return isSkipped ? undefined : data;
}

/**
 * usePaginatedQuery implementation connected to MySQL
 */
export function usePaginatedQuery(fnRef: any, args: any, options?: { initialNumItems?: number }) {
  const fnName = useMemo(() => (fnRef ? resolveFnName(fnRef) : ""), [fnRef]);
  const argsKey = useMemo(() => JSON.stringify(args ?? {}), [args]);
  const [data, setData] = useState<any>(undefined);

  const fetchPage = useCallback(async () => {
    if (!fnName) return;
    try {
      const result = await callConvexBridge("query", fnName, { ...args, initialNumItems: options?.initialNumItems });
      setData(result);
    } catch (err) {
      console.error(`[ConvexAdapter] PaginatedQuery "${fnName}" error:`, err);
      setData({ page: [], isDone: true, continueCursor: "" });
    }
  }, [fnName, argsKey, options?.initialNumItems]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    const handleMutation = () => {
      fetchPage();
    };
    window.addEventListener(MUTATION_EVENT, handleMutation);
    return () => {
      window.removeEventListener(MUTATION_EVENT, handleMutation);
    };
  }, [fetchPage]);

  const results = data?.page || [];
  const isLoading = data === undefined;

  return {
    results,
    status: isLoading ? "LoadingFirstPage" : "CanLoadMore",
    loadMore: (_num?: number) => {},
    isLoading,
  };
}

/**
 * useMutation implementation executing against MySQL backend
 */
export function useMutation(fnRef: any) {
  const fnName = resolveFnName(fnRef);
  return useCallback(
    async (args: any = {}) => {
      const result = await callConvexBridge("mutation", fnName, args);
      notifyMutation();
      return result;
    },
    [fnName]
  );
}

/**
 * useAction implementation
 */
export function useAction(fnRef: any) {
  const fnName = resolveFnName(fnRef);
  return useCallback(
    async (args: any = {}) => {
      const result = await callConvexBridge("action", fnName, args);
      notifyMutation();
      return result;
    },
    [fnName]
  );
}

/**
 * useConvexAuth compatibility hook
 */
export function useConvexAuth() {
  const token = typeof window !== "undefined" ? getToken() : null;
  return {
    isLoading: false,
    isAuthenticated: !!token,
  };
}

/**
 * Dummy client & providers to keep existing JSX completely intact
 */
export class ConvexReactClient {
  constructor(_url: string) {}
}

export function ConvexProvider({ children }: { children: React.ReactNode; client?: any }) {
  return <>{children}</>;
}

export function ConvexAuthProvider({ children }: { children: React.ReactNode; client?: any }) {
  return <>{children}</>;
}

export function ConvexProviderWithAuth({ children }: { children: React.ReactNode; client?: any; useAuth?: any }) {
  return <>{children}</>;
}

export function useConvex() {
  return {
    query: async (fnRef: any, args: any) => callConvexBridge("query", resolveFnName(fnRef), args),
    mutation: async (fnRef: any, args: any) => callConvexBridge("mutation", resolveFnName(fnRef), args),
    action: async (fnRef: any, args: any) => callConvexBridge("action", resolveFnName(fnRef), args),
  };
}

export function Authenticated({ children }: { children: React.ReactNode }) {
  const token = typeof window !== "undefined" ? getToken() : null;
  return token ? <>{children}</> : null;
}

export function Unauthenticated({ children }: { children: React.ReactNode }) {
  const token = typeof window !== "undefined" ? getToken() : null;
  return !token ? <>{children}</> : null;
}

export function AuthLoading({ children: _children }: { children?: React.ReactNode }) {
  return null;
}

export function useAuthActions() {
  return {
    signIn: async () => {},
    signOut: async () => {},
  };
}

