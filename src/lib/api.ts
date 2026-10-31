// REST API client for Brightloop backend

const API_BASE = "";

export function getToken(): string | null {
  return localStorage.getItem("brightloop_token") || localStorage.getItem("recurpro_token");
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem("brightloop_token", token);
  } else {
    localStorage.removeItem("brightloop_token");
    localStorage.removeItem("recurpro_token");
  }
}

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorMsg = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.error) errorMsg = data.error;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return res.json();
}

export const api = {
  auth: {
    async status() {
      return request<{ needsBootstrap: boolean; userCount: number; database: string }>("/api/auth/status");
    },
    async register(data: { name: string; email: string; password: string; role?: string }) {
      const res = await request<{ token: string; user: any }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      });
      setToken(res.token);
      return res;
    },
    async login(data: { email: string; password: string }) {
      const res = await request<{ token: string; user: any }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      });
      setToken(res.token);
      return res;
    },
    async me() {
      return request<{ id: string; name: string; email: string; role: "admin" | "staff" | "customer"; avatar?: string }>("/api/auth/me");
    },
    async seed(data?: { adminName?: string; adminEmail?: string; adminPassword?: string }) {
      const res = await request<{ token: string; message: string; admin: any }>("/api/auth/seed", {
        method: "POST",
        body: JSON.stringify(data || {}),
      });
      if (res.token) {
        setToken(res.token);
      }
      return res;
    },
    async changePassword(data: { currentPassword: string; newPassword: string }) {
      return request<{ success: boolean; message: string }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    logout() {
      setToken(null);
    },
  },

  customers: {
    async list(query = "") {
      return request<any[]>(`/api/customers${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    },
    async get(id: string) {
      return request<{ customer: any; subscriptions: any[]; invoices: any[] }>(`/api/customers/${id}`);
    },
    async create(data: any) {
      return request<any>("/api/customers", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
  },

  catalog: {
    async getProducts() {
      return request<any[]>("/api/catalog");
    },
    async getPlans() {
      return request<any[]>("/api/plans");
    },
    async createProduct(data: any) {
      return request<any>("/api/catalog", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    async createPlan(data: any) {
      return request<any>("/api/plans", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
  },

  subscriptions: {
    async list(customerId?: string) {
      return request<any[]>(`/api/subscriptions${customerId ? `?customerId=${customerId}` : ""}`);
    },
    async create(data: { customer_id: string; plan_id: string; quantity?: number }) {
      return request<any>("/api/subscriptions", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    async cancel(id: string) {
      return request<{ success: boolean }>(`/api/subscriptions/${id}/cancel`, {
        method: "POST",
      });
    },
  },

  invoices: {
    async list(customerId?: string) {
      return request<any[]>(`/api/invoices${customerId ? `?customerId=${customerId}` : ""}`);
    },
    async get(id: string) {
      return request<any>(`/api/invoices/${id}`);
    },
    async pay(id: string) {
      return request<{ success: boolean }>(`/api/invoices/${id}/pay`, {
        method: "POST",
      });
    },
  },

  reports: {
    async summary() {
      return request<{
        mrr: number;
        activeSubscriptionsCount: number;
        totalCustomersCount: number;
        totalRevenue: number;
        outstandingReceivables: number;
        aging: { bucket: string; count: number; amount: number }[];
      }>("/api/reports/summary");
    },
  },

  admin: {
    async getStaff() {
      return request<any[]>("/api/admin/staff");
    },
    async updateRole(userId: string, role: string) {
      return request<any>(`/api/admin/staff/${userId}/role`, {
        method: "POST",
        body: JSON.stringify({ role }),
      });
    },
    async getAuditLogs() {
      return request<any[]>("/api/admin/audit-logs");
    },
  },
};
