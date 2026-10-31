import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db, UserRow, isUsingMySQL } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "brightloop_jwt_secret_key_2026";
export const authRouter = Router();

export interface AuthenticatedRequest extends Request {
  user?: UserRow;
}

export function generateToken(user: UserRow): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    const user = await db.getUserById(decoded.id);
    if (!user) {
      res.status(401).json({ error: "User not found or session expired" });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Check system status (e.g. if bootstrap / first admin setup is needed)
authRouter.get("/status", async (_req: Request, res: Response) => {
  try {
    const users = await db.getAllUsers();
    res.json({
      needsBootstrap: users.length === 0,
      userCount: users.length,
      database: isUsingMySQL() ? "MySQL" : "In-Memory (MySQL Fallback)",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Register new user
authRouter.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "Name, email, and password are required" });
      return;
    }

    const existing = await db.getUserByEmail(email);
    if (existing) {
      res.status(400).json({ error: "An account with this email already exists" });
      return;
    }

    // First user is automatically admin, subsequent users default to customer or specified role
    const allUsers = await db.getAllUsers();
    const assignedRole = allUsers.length === 0 ? "admin" : role || "customer";

    const password_hash = await bcrypt.hash(password, 10);
    const user = await db.createUser({
      id: crypto.randomUUID(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password_hash,
      role: assignedRole,
    });

    await db.addAuditLog({
      user_id: user.id,
      user_name: user.name,
      action: "user_registered",
      target_type: "user",
      target_id: user.id,
      details: { email: user.email, role: user.role },
    });

    const token = generateToken(user);
    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err: any) {
    console.error("[Auth] Register error:", err);
    res.status(500).json({ error: err.message || "Failed to register" });
  }
});

// Login
authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    let user = await db.getUserByEmail(email);
    if (!user) {
      const normalized = email.toLowerCase().trim();
      if (normalized === "admin@recurpro.io") {
        user = await db.getUserByEmail("admin@brightloop.io");
      } else if (normalized === "admin@brightloop.io") {
        user = await db.getUserByEmail("admin@recurpro.io");
      }
    }
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = generateToken(user);
    await db.addAuditLog({
      user_id: user.id,
      user_name: user.name,
      action: "user_login",
      target_type: "user",
      target_id: user.id,
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err: any) {
    console.error("[Auth] Login error:", err);
    res.status(500).json({ error: err.message || "Failed to log in" });
  }
});

// Current User Profile
authRouter.get("/me", authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    created_at: user.created_at,
  });
});

// Update Password
authRouter.post("/change-password", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = req.user!;

    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters long" });
      return;
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      res.status(400).json({ error: "Incorrect current password" });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.updatePassword(user.id, newHash);

    await db.addAuditLog({
      user_id: user.id,
      user_name: user.name,
      action: "password_changed",
      target_type: "user",
      target_id: user.id,
    });

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Seed Demo Data (Admin & Sample tenant)
authRouter.post("/seed", async (req: Request, res: Response) => {
  try {
    const {
      adminName = "Administrator",
      adminEmail = "admin@brightloop.io",
      adminPassword = "Password123!",
    } = req.body;

    // 1. Create or get admin
    let admin = (await db.getUserByEmail(adminEmail)) || (await db.getUserByEmail("admin@brightloop.io"));
    if (!admin) {
      const password_hash = await bcrypt.hash(adminPassword, 10);
      admin = await db.createUser({
        id: crypto.randomUUID(),
        name: adminName,
        email: adminEmail,
        password_hash,
        role: "admin",
      });
    }

    // 2. Create sample staff
    const staffEmail = "staff@brightloop.io";
    if (!(await db.getUserByEmail(staffEmail)) && !(await db.getUserByEmail("staff@recurpro.io"))) {
      const hash = await bcrypt.hash("Password123!", 10);
      await db.createUser({
        id: crypto.randomUUID(),
        name: "Support Staff",
        email: staffEmail,
        password_hash: hash,
        role: "staff",
      });
    }

    // 3. Create sample customer user
    const customerEmail = "arjun@apexlogistics.in";
    if (!(await db.getUserByEmail(customerEmail))) {
      const hash = await bcrypt.hash("Password123!", 10);
      await db.createUser({
        id: crypto.randomUUID(),
        name: "Arjun Verma",
        email: customerEmail,
        password_hash: hash,
        role: "customer",
      });
    }

    // 4. Products & Plans
    const products = await db.getProducts();
    let proPlanId = "";
    let starterPlanId = "";

    if (products.length === 0) {
      const cloudSuite = await db.createProduct({
        name: "Brightloop Cloud Suite",
        description: "Complete recurring billing and invoice lifecycle management platform.",
        category: "SaaS Software",
        cost_price: 1500,
        is_active: true,
      });

      const starter = await db.createPlan({
        product_id: cloudSuite.id,
        name: "Starter Tier",
        description: "Up to 100 active subscriptions and standard invoice generation.",
        billing_interval: "month",
        price: 2499,
        currency: "INR",
        trial_days: 14,
        is_active: true,
      });
      starterPlanId = starter.id;

      const pro = await db.createPlan({
        product_id: cloudSuite.id,
        name: "Growth Pro",
        description: "Unlimited subscriptions, custom dunning schedules, and customer portal.",
        billing_interval: "month",
        price: 7999,
        currency: "INR",
        trial_days: 0,
        is_active: true,
      });
      proPlanId = pro.id;
    }

    // 5. Customers
    const customers = await db.getCustomers();
    let cust1Id = "";
    let cust2Id = "";

    if (customers.length === 0) {
      const c1 = await db.createCustomer({
        name: "Apex Logistics India Pvt Ltd",
        email: customerEmail,
        phone: "+91 98200 12345",
        company: "Apex Logistics",
        billing_address: "B-402, Cyber Park, Electronic City, Bengaluru, KA 560100",
        tax_id: "29AABCU9603R1Z7",
        currency: "INR",
        status: "active",
        notes: "Key enterprise client on Growth tier.",
      });
      cust1Id = c1.id;

      const c2 = await db.createCustomer({
        name: "Kaveri Retailers",
        email: "billing@kaveriretail.com",
        phone: "+91 94440 98765",
        company: "Kaveri Retail",
        billing_address: "12 Anna Salai, Chennai, TN 600002",
        tax_id: "33AABCU1111R1Z1",
        currency: "INR",
        status: "active",
        notes: "Monthly billing cycle on 1st of month.",
      });
      cust2Id = c2.id;
    }

    // 6. Subscriptions
    const subs = await db.getSubscriptions();
    if (subs.length === 0 && cust1Id && proPlanId) {
      const s1 = await db.createSubscription({
        customer_id: cust1Id,
        plan_id: proPlanId,
        quantity: 1,
      });

      // 7. Seed Invoices
      await db.createInvoice({
        customer_id: cust1Id,
        subscription_id: s1.id,
        status: "paid",
        items: [
          { description: "Growth Pro - Monthly Subscription (Active)", quantity: 1, unit_price: 7999 },
        ],
        notes: "Paid via NEFT / Net Banking.",
      });

      if (cust2Id && starterPlanId) {
        const s2 = await db.createSubscription({
          customer_id: cust2Id,
          plan_id: starterPlanId,
          quantity: 1,
        });

        await db.createInvoice({
          customer_id: cust2Id,
          subscription_id: s2.id,
          status: "posted",
          items: [
            { description: "Starter Tier - Monthly Billing", quantity: 1, unit_price: 2499 },
          ],
          notes: "Invoice sent, due in 15 days.",
        });
      }
    }

    await db.addAuditLog({
      user_id: admin.id,
      user_name: admin.name,
      action: "seed_demo_data",
      target_type: "system",
      details: { initialized: true },
    });

    const token = generateToken(admin);
    res.json({
      success: true,
      message: "Demo database seeded successfully with MySQL tables and sample tenant data.",
      admin: {
        email: admin.email,
        password: adminPassword,
        role: admin.role,
      },
      token,
    });
  } catch (err: any) {
    console.error("[Auth] Seed error:", err);
    res.status(500).json({ error: err.message });
  }
});
