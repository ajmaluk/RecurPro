import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initDatabase, db, isUsingMySQL } from "./db";
import { authRouter } from "./auth";
import { apiRouter } from "./api";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import fs from "fs";
import path from "path";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    database: isUsingMySQL() ? "MySQL" : "In-Memory (MySQL Fallback)",
    timestamp: new Date().toISOString(),
  });
});

// Endpoint to persist generated video recordings directly to public/
app.post("/api/save-video", express.raw({ type: "*/*", limit: "250mb" }), (req, res) => {
  try {
    const videoPath = path.resolve(process.cwd(), "public", "brightloop_presentation.webm");
    fs.writeFileSync(videoPath, req.body);
    console.log(`[Video] Walkthrough video saved successfully: ${videoPath} (${(req.body.length / 1024 / 1024).toFixed(2)} MB)`);
    res.json({ success: true, url: "/brightloop_presentation.webm", size: req.body.length });
  } catch (err: any) {
    console.error("[Video] Failed to save video:", err);
    res.status(500).json({ error: err.message });
  }
});

import { convexBridgeRouter } from "./convex-bridge";

// API Routes
app.use("/api/auth", authRouter);
app.use("/api/convex", convexBridgeRouter);
app.use("/api", apiRouter);

async function startServer() {
  // 1. Initialize database (MySQL if available, otherwise resilient fallback)
  await initDatabase();

  // 2. Ensure all types of demo users exist
  await seedAllDemoUsers();

  app.listen(PORT, () => {
    console.log(`[Server] Brightloop Backend running on http://localhost:${PORT}`);
  });
}

async function seedAllDemoUsers() {
  const defaultPassword = "Password123!";
  const password_hash = await bcrypt.hash(defaultPassword, 10);

  // 1. Admin Account (Back Office Owner)
  if (!(await db.getUserByEmail("admin@brightloop.io"))) {
    await db.createUser({
      id: crypto.randomUUID(),
      name: "Alex Rivera (Admin)",
      email: "admin@brightloop.io",
      password_hash,
      role: "admin",
    });
  }

  // 2. Operations & Billing Staff Account
  if (!(await db.getUserByEmail("staff@brightloop.io"))) {
    await db.createUser({
      id: crypto.randomUUID(),
      name: "Priya Sharma (Finance Staff)",
      email: "staff@brightloop.io",
      password_hash,
      role: "staff",
    });
  }

  // 3. Enterprise Customer Account
  if (!(await db.getUserByEmail("arjun@apexlogistics.in"))) {
    await db.createUser({
      id: crypto.randomUUID(),
      name: "Arjun Verma (Apex Logistics)",
      email: "arjun@apexlogistics.in",
      password_hash,
      role: "customer",
    });
  }

  // 4. SME / Startup Customer Account
  if (!(await db.getUserByEmail("neha@zenithtech.in"))) {
    await db.createUser({
      id: crypto.randomUUID(),
      name: "Neha Patel (Zenith Technologies)",
      email: "neha@zenithtech.in",
      password_hash,
      role: "customer",
    });
  }

  // Products and Plans
  const products = await db.getProducts();
  let suite: any = products[0];
  if (!suite) {
    suite = await db.createProduct({
      name: "Brightloop Cloud Suite",
      description: "Complete recurring billing and invoice lifecycle management platform.",
      category: "SaaS Software",
      cost_price: 1500,
      is_active: true,
    });
  }

  const plans = await db.getPlans();
  let pro: any = plans[0];
  if (!pro) {
    pro = await db.createPlan({
      product_id: suite.id,
      name: "Growth Pro",
      description: "Unlimited subscriptions, custom dunning schedules, and customer portal.",
      billing_interval: "month",
      price: 7999,
      currency: "INR",
      trial_days: 0,
      is_active: true,
    });
  }

  const customers = await db.getCustomers();

  // 1. Apex Logistics Customer
  let cust1 = customers.find(
    (c) => c.email.toLowerCase() === "arjun@apexlogistics.in" || c.email.toLowerCase() === "billing@apexlogistics.in"
  );
  if (!cust1) {
    cust1 = await db.createCustomer({
      name: "Apex Logistics India Pvt Ltd",
      email: "arjun@apexlogistics.in",
      phone: "+91 98200 12345",
      company: "Apex Logistics",
      billing_address: "B-402, Cyber Park, Electronic City, Bengaluru, KA 560100",
      tax_id: "29AABCU9603R1Z7",
      currency: "INR",
      status: "active",
      notes: "Key enterprise client on Growth tier.",
    });

    const sub1 = await db.createSubscription({
      customer_id: cust1.id,
      plan_id: pro.id,
      quantity: 1,
    });

    await db.createInvoice({
      customer_id: cust1.id,
      subscription_id: sub1.id,
      status: "paid",
      items: [
        { description: "Growth Pro - Monthly Subscription (Active)", quantity: 1, unit_price: 7999 },
      ],
      notes: "Paid via NEFT / Net Banking.",
    });
  }

  // 2. Zenith Technologies Customer
  let cust2 = customers.find((c) => c.email.toLowerCase() === "neha@zenithtech.in");
  if (!cust2) {
    cust2 = await db.createCustomer({
      name: "Zenith Technologies LLP",
      email: "neha@zenithtech.in",
      phone: "+91 98111 67890",
      company: "Zenith Technologies",
      billing_address: "Plot 14, Hinjawadi Phase 2, Pune, MH 411057",
      tax_id: "27AAACZ1234F1ZA",
      currency: "INR",
      status: "active",
      notes: "SaaS growth subscriber.",
    });

    const sub2 = await db.createSubscription({
      customer_id: cust2.id,
      plan_id: pro.id,
      quantity: 1,
    });

    await db.createInvoice({
      customer_id: cust2.id,
      subscription_id: sub2.id,
      status: "paid",
      items: [
        { description: "Growth Pro - Platform License", quantity: 1, unit_price: 7999 },
      ],
      notes: "Paid via Corporate Net Banking.",
    });

    // Also create a confirmed/posted invoice so Neha has an outstanding balance in her portal
    await db.createInvoice({
      customer_id: cust2.id,
      subscription_id: sub2.id,
      status: "posted",
      items: [
        { description: "Growth Pro - Subscription Renewal Period", quantity: 1, unit_price: 7999 },
      ],
      notes: "Payment pending - Net 15 days.",
    });
  }

  console.log(`[Seed] Demo users initialized:`);
  console.log(`  1. Admin:    admin@brightloop.io    / ${defaultPassword}`);
  console.log(`  2. Staff:    staff@brightloop.io    / ${defaultPassword}`);
  console.log(`  3. Customer: arjun@apexlogistics.in / ${defaultPassword}`);
  console.log(`  4. Customer: neha@zenithtech.in     / ${defaultPassword}`);
}

startServer().catch((err) => {
  console.error("[Server] Fatal startup error:", err);
});
