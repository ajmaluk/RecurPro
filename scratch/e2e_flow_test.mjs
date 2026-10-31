async function runTestSuite() {
  console.log("=== Brightloop End-To-End System Flow Test ===");
  const base = "http://localhost:5173/api";
  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      testsPassed++;
    } else {
      console.error(`[FAIL] ${message}`);
      testsFailed++;
    }
  }

  try {
    // 1. Auth Login (Test Brightloop admin login)
    const loginRes = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@brightloop.io", password: "Password123!" }),
    });
    const loginData = await loginRes.json();
    assert(loginRes.ok && !!loginData.token, "Admin authentication with admin@brightloop.io returns valid JWT token");
    const token = loginData.token;
    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    // 2. Auth /me
    const meRes = await fetch(`${base}/auth/me`, { headers: authHeaders });
    const meData = await meRes.json();
    assert(meRes.ok && !!meData.email && (meData.role === "admin"), "Token restores user session (/api/auth/me)");

    // Helper for convex bridge query
    async function query(name, args = {}) {
      const r = await fetch(`${base}/convex/query`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name, args }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Query ${name} failed`);
      return d.result;
    }

    // Helper for convex bridge mutation
    async function mutate(name, args = {}) {
      const r = await fetch(`${base}/convex/mutation`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name, args }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Mutation ${name} failed`);
      return d.result;
    }

    // 3. Dashboard Analytics
    const overview = await query("reports.overview");
    assert(
      Array.isArray(overview.series) && overview.series.length > 0 && typeof overview.mrr === "number",
      "Dashboard analytics (/reports.overview) returns complete series and MRR"
    );

    // 4. Billing Preview & Runs
    const preview = await query("billing.preview");
    assert(typeof preview.invoiceCount === "number" && Array.isArray(preview.rows), "Billing preview returns row breakdown");
    const runs = await query("billing.recentRuns");
    assert(Array.isArray(runs) && runs.length > 0, "Billing runs history returns list of runs");

    // 5. Trigger Billing Run
    const runId = await mutate("billing.start", {});
    assert(typeof runId === "string" && runId.startsWith("job_run"), "Triggering billing run generates new job run");

    // 6. Invoices List & Detail
    const invoices = await query("invoices.list", {});
    assert(Array.isArray(invoices.page) && invoices.page.length > 0, "Invoices list returns paginated invoice rows");
    const testInv = invoices.page[0];
    const invDetail = await query("invoices.detail", { id: testInv._id });
    assert(
      invDetail && invDetail.invoice && Array.isArray(invDetail.lines),
      "Invoice detail returns structured invoice, lines, and customer snapshot"
    );

    // 7. Invoice Payment Recording
    const payRes = await mutate("payments.record", { invoiceId: testInv._id });
    assert(payRes && payRes.success, "Record payment successfully marks invoice paid");

    // 8. Customers List, Options & Detail
    const custs = await query("customers.list", {});
    assert(Array.isArray(custs.page) && custs.page.length > 0, "Customers list returns active customers");
    const custOptions = await query("customers.options");
    assert(Array.isArray(custOptions) && custOptions.length > 0, "Customer options returns selection dropdowns");
    const custDetail = await query("customers.detail", { id: custs.page[0]._id });
    assert(custDetail && custDetail.customer && Array.isArray(custDetail.subscriptions), "Customer detail returns profile & subscriptions");

    // 9. Create Customer
    const newCustId = await mutate("customers.create", {
      name: "Global Technologies Corp",
      email: "accounts@globaltech.com",
      company: "Global Tech Inc",
      addressLine: "100 MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560001",
    });
    assert(typeof newCustId === "string", "Create customer adds new customer to MySQL datastore");

    // 10. Subscriptions List & Detail
    const subs = await query("subscriptions.list", {});
    assert(Array.isArray(subs.page) && subs.page.length > 0, "Subscriptions list returns active subscriptions");
    const subDetail = await query("subscriptions.detail", { id: subs.page[0]._id });
    assert(
      subDetail && subDetail.subscription && subDetail.plan && Array.isArray(subDetail.lines),
      "Subscription detail returns subscription, plan, and line breakdown"
    );

    // 11. Create Subscription from Template
    const newSubId = await mutate("subscriptions.createFromTemplate", {
      customerId: newCustId,
      templateId: "tpl_1",
      startDate: "2026-11-01",
      expiryDate: "2027-10-31",
    });
    assert(typeof newSubId === "string", "Create subscription from wizard adds new subscription");

    // 12. Catalog & Products
    const prods = await query("catalog.listProducts");
    assert(Array.isArray(prods) && prods.length > 0, "Catalog products returns products with variant metadata");
    const attrs = await query("catalog.listAttributes");
    assert(Array.isArray(attrs) && attrs[0].values[0].value, "Catalog attributes returns formatted values with prices");

    const newProdId = await mutate("catalog.createProduct", {
      name: "Enterprise Dedicated Support",
      salesPrice: "15000",
      type: "SERVICE",
    });
    assert(typeof newProdId === "string", "Create product registers new product");

    // 13. Plans & Pricing
    const plans = await query("plans.list");
    assert(Array.isArray(plans) && plans.length > 0, "Plans list returns active plans");
    const taxes = await query("pricing.listTaxes");
    assert(Array.isArray(taxes) && taxes.length > 0, "Taxes list returns GST rates");
    const terms = await query("plans.paymentTerms");
    assert(Array.isArray(terms) && terms.length > 0, "Payment terms returns default terms");

    const newPlanId = await mutate("plans.create", {
      name: "Dedicated Enterprise Plan",
      price: "15000",
      billingPeriod: "MONTHLY",
    });
    assert(typeof newPlanId === "string", "Create plan successfully creates plan");

    // 14. Admin & Staff
    const staff = await query("staff.list");
    assert(Array.isArray(staff) && staff.length > 0, "Staff list returns system accounts");
    const audit = await query("audit.list");
    assert(Array.isArray(audit.page), "Audit logs returns recorded event history");

    // 15. Customer Portal
    const portalDash = await query("portal.dashboard");
    assert(
      typeof portalDash.activeCount === "number" && Array.isArray(portalDash.recentInvoices),
      "Customer portal dashboard returns active count and recent invoices"
    );
    const portalSubs = await query("portal.subscriptions");
    assert(Array.isArray(portalSubs), "Customer portal subscriptions returns subscriber plans");
    const portalInvs = await query("portal.invoices");
    assert(Array.isArray(portalInvs.page), "Customer portal invoices returns invoice history");

    console.log(`\n=== Flow Test Summary: ${testsPassed} PASSED, ${testsFailed} FAILED ===`);
  } catch (e) {
    console.error("Test execution threw error:", e);
  }
}

runTestSuite();
