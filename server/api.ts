import { Router, Response } from "express";
import { db } from "./db";
import { authMiddleware, AuthenticatedRequest } from "./auth";

export const apiRouter = Router();

// Protect all standard data routes with JWT authentication
apiRouter.use(authMiddleware);

// --- CUSTOMERS ---
apiRouter.get("/customers", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = (req.query.q as string) || "";
    const customers = await db.getCustomers(q);
    res.json(customers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get("/customers/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const customer = await db.getCustomerById(id);
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    const subscriptions = await db.getSubscriptions(customer.id);
    const invoices = await db.getInvoices(customer.id);
    res.json({ customer, subscriptions, invoices });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post("/customers", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, email, phone, company, billing_address, tax_id, currency, notes } = req.body;
    if (!name || !email) {
      res.status(400).json({ error: "Name and email are required" });
      return;
    }

    const customer = await db.createCustomer({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone,
      company,
      billing_address,
      tax_id,
      currency: currency || "INR",
      status: "active",
      notes,
    });

    await db.addAuditLog({
      user_id: req.user?.id,
      user_name: req.user?.name,
      action: "customer_created",
      target_type: "customer",
      target_id: customer.id,
      details: { name: customer.name, email: customer.email },
    });

    res.status(201).json(customer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- CATALOG & PLANS ---
apiRouter.get("/catalog", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const products = await db.getProducts();
    res.json(products);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post("/catalog", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description, category, cost_price } = req.body;
    if (!name) {
      res.status(400).json({ error: "Product name is required" });
      return;
    }
    const product = await db.createProduct({
      name,
      description,
      category: category || "software",
      cost_price: cost_price ? Number(cost_price) : null,
      is_active: true,
    });
    res.status(201).json(product);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get("/plans", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const plans = await db.getPlans();
    res.json(plans);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post("/plans", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { product_id, name, description, billing_interval, price, currency, trial_days } = req.body;
    if (!product_id || !name || price === undefined) {
      res.status(400).json({ error: "Product ID, name, and price are required" });
      return;
    }
    const plan = await db.createPlan({
      product_id,
      name,
      description,
      billing_interval: billing_interval || "month",
      price: Number(price),
      currency: currency || "INR",
      trial_days: Number(trial_days) || 0,
      is_active: true,
    });
    res.status(201).json(plan);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- SUBSCRIPTIONS ---
apiRouter.get("/subscriptions", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customerId = (req.query.customerId as string) || undefined;
    // If the authenticated user is a customer, only return their subscriptions
    const targetCustomer = req.user?.role === "customer" ? req.user.id : customerId;
    const subscriptions = await db.getSubscriptions(targetCustomer);
    res.json(subscriptions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post("/subscriptions", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { customer_id, plan_id, quantity } = req.body;
    if (!customer_id || !plan_id) {
      res.status(400).json({ error: "Customer and Plan are required" });
      return;
    }

    const sub = await db.createSubscription({
      customer_id,
      plan_id,
      quantity: Number(quantity) || 1,
    });

    // Create corresponding initial invoice
    const plans = await db.getPlans();
    const plan = plans.find((p) => p.id === plan_id);
    if (plan) {
      await db.createInvoice({
        customer_id,
        subscription_id: sub.id,
        status: "posted",
        items: [
          {
            description: `${plan.name} - Initial Subscription Period`,
            quantity: Number(quantity) || 1,
            unit_price: plan.price,
          },
        ],
      });
    }

    await db.addAuditLog({
      user_id: req.user?.id,
      user_name: req.user?.name,
      action: "subscription_created",
      target_type: "subscription",
      target_id: sub.id,
    });

    res.status(201).json(sub);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post("/subscriptions/:id/cancel", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const success = await db.cancelSubscription(id);
    if (!success) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }
    await db.addAuditLog({
      user_id: req.user?.id,
      user_name: req.user?.name,
      action: "subscription_canceled",
      target_type: "subscription",
      target_id: id,
    });
    res.json({ success: true, message: "Subscription cancelled" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- INVOICES ---
apiRouter.get("/invoices", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customerId = (req.query.customerId as string) || undefined;
    const targetCustomer = req.user?.role === "customer" ? req.user.id : customerId;
    const invoices = await db.getInvoices(targetCustomer);
    res.json(invoices);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get("/invoices/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const detail = await db.getInvoiceDetail(id);
    if (!detail) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    res.json(detail);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post("/invoices/:id/pay", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const success = await db.markInvoicePaid(id);
    if (!success) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    await db.addAuditLog({
      user_id: req.user?.id,
      user_name: req.user?.name,
      action: "invoice_paid",
      target_type: "invoice",
      target_id: id,
    });
    res.json({ success: true, message: "Invoice marked as paid" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- REPORTS & METRICS ---
apiRouter.get("/reports/summary", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const subs = await db.getSubscriptions();
    const invoices = await db.getInvoices();
    const customers = await db.getCustomers();

    const activeSubs = subs.filter((s) => s.status === "active");
    const mrr = activeSubs.reduce((acc, s) => acc + (s.price * s.quantity), 0);
    const totalRevenue = invoices
      .filter((i) => i.status === "paid")
      .reduce((acc, i) => acc + Number(i.total), 0);
    const outstandingReceivables = invoices
      .filter((i) => i.status === "posted")
      .reduce((acc, i) => acc + Number(i.total), 0);

    // Aging breakdown
    const aging = [
      { bucket: "Current (0-30 days)", count: 0, amount: 0 },
      { bucket: "31-60 days", count: 0, amount: 0 },
      { bucket: "61-90 days", count: 0, amount: 0 },
      { bucket: "90+ days", count: 0, amount: 0 },
    ];

    const now = Date.now();
    for (const inv of invoices.filter((i) => i.status === "posted")) {
      const days = Math.floor((now - new Date(inv.due_date).getTime()) / (1000 * 3600 * 24));
      if (days <= 30) {
        aging[0].count++;
        aging[0].amount += Number(inv.total);
      } else if (days <= 60) {
        aging[1].count++;
        aging[1].amount += Number(inv.total);
      } else if (days <= 90) {
        aging[2].count++;
        aging[2].amount += Number(inv.total);
      } else {
        aging[3].count++;
        aging[3].amount += Number(inv.total);
      }
    }

    res.json({
      mrr,
      activeSubscriptionsCount: activeSubs.length,
      totalCustomersCount: customers.length,
      totalRevenue,
      outstandingReceivables,
      aging,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN & STAFF ---
apiRouter.get("/admin/staff", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await db.getAllUsers();
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post("/admin/staff/:id/role", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { role } = req.body;
    if (!["admin", "staff", "customer"].includes(role)) {
      res.status(400).json({ error: "Invalid role specified" });
      return;
    }
    const success = await db.updateUserRole(id, role);
    if (!success) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ success: true, role });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get("/admin/audit-logs", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const logs = await db.getAuditLogs(100);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
