import mysql from "mysql2/promise";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "admin" | "staff" | "customer";
  avatar?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  billing_address?: string | null;
  tax_id?: string | null;
  currency: string;
  status: "active" | "inactive" | "archived";
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  cost_price?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlanRow {
  id: string;
  product_id: string;
  name: string;
  description?: string | null;
  billing_interval: "month" | "year" | "week" | "day";
  price: number;
  currency: string;
  trial_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionRow {
  id: string;
  customer_id: string;
  plan_id: string;
  status: "active" | "trialing" | "past_due" | "paused" | "canceled";
  quantity: number;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  customer_id: string;
  subscription_id?: string | null;
  status: "draft" | "posted" | "paid" | "void" | "uncollectible";
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  currency: string;
  due_date: string;
  paid_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  user_id?: string | null;
  user_name?: string | null;
  action: string;
  target_type: string;
  target_id?: string | null;
  details?: any;
  created_at: string;
}

let pool: mysql.Pool | null = null;
let isConnectedToMySQL = false;

// Fallback in-memory store if MySQL server is not running
const memoryStore = {
  users: [] as UserRow[],
  customers: [] as CustomerRow[],
  products: [] as ProductRow[],
  plans: [] as PlanRow[],
  subscriptions: [] as SubscriptionRow[],
  invoices: [] as InvoiceRow[],
  invoice_items: [] as InvoiceItemRow[],
  audit_logs: [] as AuditLogRow[],
};

export async function initDatabase() {
  const host = process.env.MYSQL_HOST || "127.0.0.1";
  const port = Number(process.env.MYSQL_PORT) || 3306;
  const user = process.env.MYSQL_USER || "root";
  const password = process.env.MYSQL_PASSWORD || "";
  const database = process.env.MYSQL_DATABASE || "recurpro";

  try {
    // 1. Check server connection without database first to create DB if needed
    const connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      connectTimeout: 2000,
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.end();

    // 2. Initialize connection pool to the database
    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: true,
    });

    // 3. Create tables if not exist
    await createTables(pool);
    isConnectedToMySQL = true;
    console.log(`[Database] Successfully connected to MySQL at ${host}:${port}/${database}`);
  } catch (err: any) {
    console.warn(`[Database] MySQL not reachable on ${host}:${port} (${err.message}).`);
    console.warn(`[Database] Operating in persistent in-memory fallback mode so login and app work immediately.`);
    console.warn(`[Database] To use MySQL, verify your service is running and configure MYSQL_HOST/PORT/USER/PASSWORD in .env.`);
    isConnectedToMySQL = false;
  }
}

async function createTables(p: mysql.Pool) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin', 'staff', 'customer') NOT NULL DEFAULT 'customer',
      avatar VARCHAR(500) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_users_email (email),
      INDEX idx_users_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS customers (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      phone VARCHAR(50) NULL,
      company VARCHAR(255) NULL,
      billing_address TEXT NULL,
      tax_id VARCHAR(100) NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'INR',
      status ENUM('active', 'inactive', 'archived') NOT NULL DEFAULT 'active',
      notes TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_customers_email (email),
      INDEX idx_customers_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      category VARCHAR(100) NOT NULL DEFAULT 'software',
      cost_price DECIMAL(12,2) NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_products_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS plans (
      id VARCHAR(36) PRIMARY KEY,
      product_id VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      billing_interval ENUM('month', 'year', 'week', 'day') NOT NULL DEFAULT 'month',
      price DECIMAL(12,2) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'INR',
      trial_days INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_plans_product (product_id),
      INDEX idx_plans_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS subscriptions (
      id VARCHAR(36) PRIMARY KEY,
      customer_id VARCHAR(36) NOT NULL,
      plan_id VARCHAR(36) NOT NULL,
      status ENUM('active', 'trialing', 'past_due', 'paused', 'canceled') NOT NULL DEFAULT 'active',
      quantity INT NOT NULL DEFAULT 1,
      current_period_start DATETIME NOT NULL,
      current_period_end DATETIME NOT NULL,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
      canceled_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_subscriptions_customer (customer_id),
      INDEX idx_subscriptions_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS invoices (
      id VARCHAR(36) PRIMARY KEY,
      invoice_number VARCHAR(50) NOT NULL UNIQUE,
      customer_id VARCHAR(36) NOT NULL,
      subscription_id VARCHAR(36) NULL,
      status ENUM('draft', 'posted', 'paid', 'void', 'uncollectible') NOT NULL DEFAULT 'draft',
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      discount_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      tax_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      currency VARCHAR(10) NOT NULL DEFAULT 'INR',
      due_date DATETIME NOT NULL,
      paid_at DATETIME NULL,
      notes TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_invoices_customer (customer_id),
      INDEX idx_invoices_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS invoice_items (
      id VARCHAR(36) PRIMARY KEY,
      invoice_id VARCHAR(36) NOT NULL,
      description VARCHAR(255) NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      unit_price DECIMAL(12,2) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_invoice_items_invoice (invoice_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NULL,
      user_name VARCHAR(255) NULL,
      action VARCHAR(100) NOT NULL,
      target_type VARCHAR(100) NOT NULL,
      target_id VARCHAR(36) NULL,
      details JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_logs_action (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  ];

  for (const sql of statements) {
    await p.query(sql);
  }
}

export function isUsingMySQL() {
  return isConnectedToMySQL;
}

export const db = {
  // --- USERS ---
  async getUserByEmail(email: string): Promise<UserRow | null> {
    if (pool && isConnectedToMySQL) {
      const [rows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT * FROM users WHERE email = ? LIMIT 1",
        [email.toLowerCase().trim()]
      );
      return (rows[0] as UserRow) || null;
    }
    return (
      memoryStore.users.find(
        (u) => u.email.toLowerCase() === email.toLowerCase().trim()
      ) || null
    );
  },

  async getUserById(id: string): Promise<UserRow | null> {
    if (pool && isConnectedToMySQL) {
      const [rows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT * FROM users WHERE id = ? LIMIT 1",
        [id]
      );
      return (rows[0] as UserRow) || null;
    }
    return memoryStore.users.find((u) => u.id === id) || null;
  },

  async getAllUsers(): Promise<UserRow[]> {
    if (pool && isConnectedToMySQL) {
      const [rows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT id, name, email, role, avatar, created_at, updated_at FROM users ORDER BY created_at DESC"
      );
      return rows as UserRow[];
    }
    return memoryStore.users.map(({ password_hash: _, ...rest }) => ({ ...rest, password_hash: "" }));
  },

  async createUser(user: Omit<UserRow, "created_at" | "updated_at">): Promise<UserRow> {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const newUser: UserRow = {
      ...user,
      email: user.email.toLowerCase().trim(),
      created_at: now,
      updated_at: now,
    };

    if (pool && isConnectedToMySQL) {
      await pool.query(
        "INSERT INTO users (id, name, email, password_hash, role, avatar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [newUser.id, newUser.name, newUser.email, newUser.password_hash, newUser.role, newUser.avatar || null, newUser.created_at, newUser.updated_at]
      );
      return newUser;
    }
    memoryStore.users.push(newUser);
    return newUser;
  },

  async updateUserRole(id: string, role: "admin" | "staff" | "customer"): Promise<boolean> {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    if (pool && isConnectedToMySQL) {
      const [res] = await pool.query<mysql.ResultSetHeader>(
        "UPDATE users SET role = ?, updated_at = ? WHERE id = ?",
        [role, now, id]
      );
      return res.affectedRows > 0;
    }
    const user = memoryStore.users.find((u) => u.id === id);
    if (user) {
      user.role = role;
      user.updated_at = now;
      return true;
    }
    return false;
  },

  async updatePassword(id: string, password_hash: string): Promise<boolean> {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    if (pool && isConnectedToMySQL) {
      const [res] = await pool.query<mysql.ResultSetHeader>(
        "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
        [password_hash, now, id]
      );
      return res.affectedRows > 0;
    }
    const user = memoryStore.users.find((u) => u.id === id);
    if (user) {
      user.password_hash = password_hash;
      user.updated_at = now;
      return true;
    }
    return false;
  },

  // --- CUSTOMERS ---
  async getCustomers(query = ""): Promise<CustomerRow[]> {
    if (pool && isConnectedToMySQL) {
      if (query.trim()) {
        const q = `%${query.trim()}%`;
        const [rows] = await pool.query<mysql.RowDataPacket[]>(
          "SELECT * FROM customers WHERE name LIKE ? OR email LIKE ? OR company LIKE ? ORDER BY created_at DESC",
          [q, q, q]
        );
        return rows as CustomerRow[];
      }
      const [rows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT * FROM customers ORDER BY created_at DESC"
      );
      return rows as CustomerRow[];
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      return memoryStore.customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.company && c.company.toLowerCase().includes(q))
      );
    }
    return memoryStore.customers;
  },

  async getCustomerById(id: string): Promise<CustomerRow | null> {
    if (pool && isConnectedToMySQL) {
      const [rows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT * FROM customers WHERE id = ? LIMIT 1",
        [id]
      );
      return (rows[0] as CustomerRow) || null;
    }
    return memoryStore.customers.find((c) => c.id === id) || null;
  },

  async createCustomer(cust: Omit<CustomerRow, "id" | "created_at" | "updated_at">): Promise<CustomerRow> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const newCust: CustomerRow = {
      id,
      ...cust,
      created_at: now,
      updated_at: now,
    };

    if (pool && isConnectedToMySQL) {
      await pool.query(
        "INSERT INTO customers (id, name, email, phone, company, billing_address, tax_id, currency, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          newCust.id,
          newCust.name,
          newCust.email,
          newCust.phone || null,
          newCust.company || null,
          newCust.billing_address || null,
          newCust.tax_id || null,
          newCust.currency,
          newCust.status,
          newCust.notes || null,
          newCust.created_at,
          newCust.updated_at,
        ]
      );
      return newCust;
    }
    memoryStore.customers.push(newCust);
    return newCust;
  },

  // --- PRODUCTS & PLANS ---
  async getProducts(): Promise<(ProductRow & { plans: PlanRow[] })[]> {
    if (pool && isConnectedToMySQL) {
      const [prods] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT * FROM products WHERE is_active = TRUE ORDER BY created_at DESC"
      );
      const [plans] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT * FROM plans WHERE is_active = TRUE ORDER BY price ASC"
      );
      return (prods as ProductRow[]).map((p) => ({
        ...p,
        plans: (plans as PlanRow[]).filter((pl) => pl.product_id === p.id),
      }));
    }

    return memoryStore.products
      .filter((p) => p.is_active)
      .map((p) => ({
        ...p,
        plans: memoryStore.plans.filter((pl) => pl.product_id === p.id && pl.is_active),
      }));
  },

  async getPlans(): Promise<(PlanRow & { product_name: string })[]> {
    if (pool && isConnectedToMySQL) {
      const [rows] = await pool.query<mysql.RowDataPacket[]>(
        `SELECT pl.*, pr.name as product_name 
         FROM plans pl 
         JOIN products pr ON pl.product_id = pr.id 
         WHERE pl.is_active = TRUE 
         ORDER BY pl.price ASC`
      );
      return rows as (PlanRow & { product_name: string })[];
    }

    return memoryStore.plans
      .filter((pl) => pl.is_active)
      .map((pl) => {
        const prod = memoryStore.products.find((p) => p.id === pl.product_id);
        return {
          ...pl,
          product_name: prod ? prod.name : "Subscription Service",
        };
      });
  },

  async createProduct(prod: Omit<ProductRow, "id" | "created_at" | "updated_at">): Promise<ProductRow> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const newProd: ProductRow = { id, ...prod, created_at: now, updated_at: now };

    if (pool && isConnectedToMySQL) {
      await pool.query(
        "INSERT INTO products (id, name, description, category, cost_price, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [newProd.id, newProd.name, newProd.description || null, newProd.category, newProd.cost_price || null, newProd.is_active, newProd.created_at, newProd.updated_at]
      );
      return newProd;
    }
    memoryStore.products.push(newProd);
    return newProd;
  },

  async createPlan(plan: Omit<PlanRow, "id" | "created_at" | "updated_at">): Promise<PlanRow> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const newPlan: PlanRow = { id, ...plan, created_at: now, updated_at: now };

    if (pool && isConnectedToMySQL) {
      await pool.query(
        "INSERT INTO plans (id, product_id, name, description, billing_interval, price, currency, trial_days, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [newPlan.id, newPlan.product_id, newPlan.name, newPlan.description || null, newPlan.billing_interval, newPlan.price, newPlan.currency, newPlan.trial_days, newPlan.is_active, newPlan.created_at, newPlan.updated_at]
      );
      return newPlan;
    }
    memoryStore.plans.push(newPlan);
    return newPlan;
  },

  // --- SUBSCRIPTIONS ---
  async getSubscriptions(customerId?: string): Promise<(SubscriptionRow & { customer_name: string; plan_name: string; price: number; currency: string })[]> {
    if (pool && isConnectedToMySQL) {
      let query = `
        SELECT s.*, c.name as customer_name, pl.name as plan_name, pl.price, pl.currency
        FROM subscriptions s
        JOIN customers c ON s.customer_id = c.id
        JOIN plans pl ON s.plan_id = pl.id
      `;
      const params: any[] = [];
      if (customerId) {
        query += " WHERE s.customer_id = ?";
        params.push(customerId);
      }
      query += " ORDER BY s.created_at DESC";
      const [rows] = await pool.query<mysql.RowDataPacket[]>(query, params);
      return rows as any[];
    }

    let subs = memoryStore.subscriptions;
    if (customerId) {
      subs = subs.filter((s) => s.customer_id === customerId);
    }
    return subs.map((s) => {
      const cust = memoryStore.customers.find((c) => c.id === s.customer_id);
      const plan = memoryStore.plans.find((p) => p.id === s.plan_id);
      return {
        ...s,
        customer_name: cust ? cust.name : "Customer",
        plan_name: plan ? plan.name : "Plan",
        price: plan ? plan.price : 0,
        currency: plan ? plan.currency : "INR",
      };
    });
  },

  async createSubscription(sub: {
    customer_id: string;
    plan_id: string;
    quantity?: number;
  }): Promise<SubscriptionRow> {
    const id = crypto.randomUUID();
    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const startStr = now.toISOString().slice(0, 19).replace("T", " ");
    const endStr = nextMonth.toISOString().slice(0, 19).replace("T", " ");

    const newSub: SubscriptionRow = {
      id,
      customer_id: sub.customer_id,
      plan_id: sub.plan_id,
      status: "active",
      quantity: sub.quantity || 1,
      current_period_start: startStr,
      current_period_end: endStr,
      cancel_at_period_end: false,
      canceled_at: null,
      created_at: startStr,
      updated_at: startStr,
    };

    if (pool && isConnectedToMySQL) {
      await pool.query(
        "INSERT INTO subscriptions (id, customer_id, plan_id, status, quantity, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [newSub.id, newSub.customer_id, newSub.plan_id, newSub.status, newSub.quantity, newSub.current_period_start, newSub.current_period_end, newSub.cancel_at_period_end, newSub.created_at, newSub.updated_at]
      );
      return newSub;
    }
    memoryStore.subscriptions.push(newSub);
    return newSub;
  },

  async cancelSubscription(id: string): Promise<boolean> {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    if (pool && isConnectedToMySQL) {
      const [res] = await pool.query<mysql.ResultSetHeader>(
        "UPDATE subscriptions SET status = 'canceled', cancel_at_period_end = TRUE, canceled_at = ?, updated_at = ? WHERE id = ?",
        [now, now, id]
      );
      return res.affectedRows > 0;
    }
    const sub = memoryStore.subscriptions.find((s) => s.id === id);
    if (sub) {
      sub.status = "canceled";
      sub.cancel_at_period_end = true;
      sub.canceled_at = now;
      sub.updated_at = now;
      return true;
    }
    return false;
  },

  // --- INVOICES ---
  async getInvoices(customerId?: string): Promise<(InvoiceRow & { customer_name: string })[]> {
    if (pool && isConnectedToMySQL) {
      let query = `
        SELECT i.*, c.name as customer_name
        FROM invoices i
        JOIN customers c ON i.customer_id = c.id
      `;
      const params: any[] = [];
      if (customerId) {
        query += " WHERE i.customer_id = ?";
        params.push(customerId);
      }
      query += " ORDER BY i.created_at DESC";
      const [rows] = await pool.query<mysql.RowDataPacket[]>(query, params);
      return rows as any[];
    }

    let invs = memoryStore.invoices;
    if (customerId) {
      invs = invs.filter((i) => i.customer_id === customerId);
    }
    return invs.map((i) => {
      const cust = memoryStore.customers.find((c) => c.id === i.customer_id);
      return {
        ...i,
        customer_name: cust ? cust.name : "Customer",
      };
    });
  },

  async getInvoiceDetail(id: string): Promise<(InvoiceRow & { customer: CustomerRow | null; items: InvoiceItemRow[] }) | null> {
    if (pool && isConnectedToMySQL) {
      const [invRows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT * FROM invoices WHERE id = ? LIMIT 1",
        [id]
      );
      if (!invRows[0]) return null;
      const invoice = invRows[0] as InvoiceRow;
      const [custRows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT * FROM customers WHERE id = ? LIMIT 1",
        [invoice.customer_id]
      );
      const [itemRows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT * FROM invoice_items WHERE invoice_id = ?",
        [id]
      );
      return {
        ...invoice,
        customer: (custRows[0] as CustomerRow) || null,
        items: itemRows as InvoiceItemRow[],
      };
    }

    const inv = memoryStore.invoices.find((i) => i.id === id);
    if (!inv) return null;
    const customer = memoryStore.customers.find((c) => c.id === inv.customer_id) || null;
    const items = memoryStore.invoice_items.filter((it) => it.invoice_id === id);
    return { ...inv, customer, items };
  },

  async createInvoice(data: {
    customer_id: string;
    subscription_id?: string;
    status?: InvoiceRow["status"];
    items: { description: string; quantity: number; unit_price: number }[];
    notes?: string;
  }): Promise<InvoiceRow> {
    const id = crypto.randomUUID();
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 15);

    const nowStr = now.toISOString().slice(0, 19).replace("T", " ");
    const dueStr = dueDate.toISOString().slice(0, 19).replace("T", " ");

    let subtotal = 0;
    const itemsToInsert: InvoiceItemRow[] = data.items.map((it) => {
      const amount = it.quantity * it.unit_price;
      subtotal += amount;
      return {
        id: crypto.randomUUID(),
        invoice_id: id,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        amount,
        created_at: nowStr,
      };
    });

    const taxTotal = Math.round(subtotal * 0.18 * 100) / 100; // 18% GST standard
    const discountTotal = 0;
    const total = subtotal + taxTotal - discountTotal;

    const newInvoice: InvoiceRow = {
      id,
      invoice_number: invoiceNumber,
      customer_id: data.customer_id,
      subscription_id: data.subscription_id || null,
      status: data.status || "posted",
      subtotal,
      discount_total: discountTotal,
      tax_total: taxTotal,
      total,
      currency: "INR",
      due_date: dueStr,
      paid_at: data.status === "paid" ? nowStr : null,
      notes: data.notes || null,
      created_at: nowStr,
      updated_at: nowStr,
    };

    if (pool && isConnectedToMySQL) {
      await pool.query(
        "INSERT INTO invoices (id, invoice_number, customer_id, subscription_id, status, subtotal, discount_total, tax_total, total, currency, due_date, paid_at, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [newInvoice.id, newInvoice.invoice_number, newInvoice.customer_id, newInvoice.subscription_id, newInvoice.status, newInvoice.subtotal, newInvoice.discount_total, newInvoice.tax_total, newInvoice.total, newInvoice.currency, newInvoice.due_date, newInvoice.paid_at, newInvoice.notes, newInvoice.created_at, newInvoice.updated_at]
      );
      for (const item of itemsToInsert) {
        await pool.query(
          "INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [item.id, item.invoice_id, item.description, item.quantity, item.unit_price, item.amount, item.created_at]
        );
      }
      return newInvoice;
    }

    memoryStore.invoices.push(newInvoice);
    memoryStore.invoice_items.push(...itemsToInsert);
    return newInvoice;
  },

  async markInvoicePaid(id: string): Promise<boolean> {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    if (pool && isConnectedToMySQL) {
      const [res] = await pool.query<mysql.ResultSetHeader>(
        "UPDATE invoices SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?",
        [now, now, id]
      );
      return res.affectedRows > 0;
    }
    const inv = memoryStore.invoices.find((i) => i.id === id);
    if (inv) {
      inv.status = "paid";
      inv.paid_at = now;
      inv.updated_at = now;
      return true;
    }
    return false;
  },

  async updateInvoiceStatus(id: string, status: InvoiceRow["status"]): Promise<boolean> {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    if (pool && isConnectedToMySQL) {
      const [res] = await pool.query<mysql.ResultSetHeader>(
        "UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?",
        [status, now, id]
      );
      return res.affectedRows > 0;
    }
    const inv = memoryStore.invoices.find((i) => i.id === id);
    if (inv) {
      inv.status = status;
      inv.updated_at = now;
      return true;
    }
    return false;
  },

  // --- AUDIT LOGS ---
  async addAuditLog(log: Omit<AuditLogRow, "id" | "created_at">): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const newLog: AuditLogRow = { id, ...log, created_at: now };

    if (pool && isConnectedToMySQL) {
      await pool.query(
        "INSERT INTO audit_logs (id, user_id, user_name, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [newLog.id, newLog.user_id || null, newLog.user_name || null, newLog.action, newLog.target_type, newLog.target_id || null, JSON.stringify(newLog.details || {}), newLog.created_at]
      );
      return;
    }
    memoryStore.audit_logs.unshift(newLog);
  },

  async getAuditLogs(limit = 50): Promise<AuditLogRow[]> {
    if (pool && isConnectedToMySQL) {
      const [rows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?",
        [limit]
      );
      return rows as AuditLogRow[];
    }
    return memoryStore.audit_logs.slice(0, limit);
  },
};
