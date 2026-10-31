import { Link } from "react-router";
import {
  ArrowRight,
  BadgeCheck,
  CalendarRange,
  CheckCircle2,
  FileSignature,
  GaugeCircle,
  Layers,
  Lock,
  Receipt,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { formatINR } from "@/shared/money";

const FEATURES = [
  {
    icon: <Repeat2 className="size-5" />,
    title: "Billing runs that never double-charge",
    body: "Every period gets an idempotency key. A crash, a retry or two people clicking at once still produces exactly one invoice per period — and missed days catch up instead of vanishing.",
  },
  {
    icon: <FileSignature className="size-5" />,
    title: "Quotations become subscriptions",
    body: "Reusable quotation templates turn into draft subscriptions, then move Draft → Quotation → Confirmed → Active with a full status history on every record.",
  },
  {
    icon: <Receipt className="size-5" />,
    title: "Taxes and discounts done in paise",
    body: "GST percentages or fixed taxes, inclusive or exclusive, automatic or subscription-scoped discounts — every line rounded half-up as integers, never as floats.",
  },
  {
    icon: <GaugeCircle className="size-5" />,
    title: "Finance dashboard that answers questions",
    body: "Billed this month, collected this month, what's overdue, what's ageing past 60 days and MRR from live subscriptions — plus a dunning queue you can work down.",
  },
  {
    icon: <Users className="size-5" />,
    title: "A portal customers actually use",
    body: "Customers sign in, see only their own subscriptions and invoices, download a printable invoice and manage their password. They can never reach anyone else's data.",
  },
  {
    icon: <ShieldCheck className="size-5" />,
    title: "Roles, restricted to the server",
    body: "Admins manage staff, taxes and discounts. Staff run billing and sales. Every state change lands in an audit log. Authorization is enforced in Convex, never in the UI.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Quote the work",
    body: "Pick a customer and a quotation template — plans, line items, taxes and validity come with it. Edit the lines, set the dates, send it for approval.",
  },
  {
    step: "02",
    title: "Confirm the subscription",
    body: "The quotation becomes a confirmed subscription with a start date, expiry, payment terms and an optional discount. It activates on its own when the start date arrives.",
  },
  {
    step: "03",
    title: "Bill, invoice, collect",
    body: "The nightly run generates the period's invoice as a draft, you confirm it, record payments — partial or full — and the invoice flips to Paid the moment it's cleared.",
  },
];

const PRICE_ROWS = [
  { label: "Retainer Support Hours — Priority", qty: "1", amount: 556000 },
  { label: "Analytics Workspace — Pro", qty: "1", amount: 249000 },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ---------------------------------- header --------------------------------- */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo className="size-7 text-brand" />
            <span className="text-[15px] font-semibold tracking-tight">Brightloop</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#product" className="hover:text-foreground">
              Product
            </a>
            <a href="#how" className="hover:text-foreground">
              How it works
            </a>
            <a href="#safety" className="hover:text-foreground">
              Billing safety
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/portal/login">Customer Portal</Link>
            </Button>
            <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-strong">
              <Link to="/admin/login">
                Admin Sign In <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ----------------------------------- hero ---------------------------------- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 hairline-grid opacity-40" />
        <div className="pointer-events-none absolute -top-24 right-[-10%] size-[36rem] rounded-full bg-brand-soft blur-3xl opacity-60" />
        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pt-24">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-xs font-medium text-brand-strong">
              <Sparkles className="size-3.5" />
              Recurring billing for Indian teams
            </span>
            <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Subscriptions that bill themselves —{" "}
              <span className="text-brand">and never twice.</span>
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              Brightloop runs your daily, weekly, monthly and yearly billing on a
              schedule, turns quotations into subscriptions, applies GST and
              discounts in exact paise, and hands your customers a portal of their
              own.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild className="bg-brand text-brand-foreground hover:bg-brand-strong">
                <Link to="/admin/login">
                  Admin Back Office <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/portal/login">Customer Portal Sign In</Link>
              </Button>
              <Button size="lg" variant="secondary" asChild className="border border-border/80 gap-1.5 text-foreground hover:bg-muted">
                <a href="/presentation.html" target="_blank">
                  ▶ Watch Video Tour
                </a>
              </Button>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-border/70 pt-6">
              <div>
                <dt className="text-xs text-muted-foreground">Money as</dt>
                <dd className="text-sm font-semibold">Integer paise</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Billing days</dt>
                <dd className="text-sm font-semibold">Asia/Kolkata</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Duplicate invoices</dt>
                <dd className="text-sm font-semibold">Structurally impossible</dd>
              </div>
            </dl>
          </div>

          {/* product card */}
          <div className="relative">
            <div className="card-layer overflow-hidden">
              <div className="flex items-center justify-between border-b border-border/70 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-rose-400" />
                  <span className="size-2.5 rounded-full bg-amber-400" />
                  <span className="size-2.5 rounded-full bg-emerald-400" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  Billing run · today
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  4 invoices · 0 duplicates
                </span>
              </div>

              <div className="space-y-3 px-5 py-4">
                {[
                  { id: "SUB-2026-000118", name: "Nebula Foods Pvt Ltd", period: "1 Oct – 31 Oct", total: 951900 },
                  { id: "SUB-2026-000121", name: "Kochi Marine Exports", period: "24 Oct – 30 Oct", total: 412820 },
                  { id: "SUB-2026-000126", name: "DriveTrack Labs", period: "5 Nov – 4 Nov 2027", total: 1965660 },
                ].map((row, index) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.id} · {row.period}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatINR(row.total)}
                      </p>
                      <p className="text-[11px] text-brand-strong">
                        {index === 2 ? "Draft · yearly" : "Confirmed"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border/70 bg-background/60 px-5 py-4">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">Billed today</span>
                  <span className="font-semibold tabular-nums">
                    {formatINR(3330380)}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">Collected in October</span>
                  <span className="font-semibold tabular-nums">
                    {formatINR(4712400)}
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-[72%] rounded-full bg-brand" />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  72% of this month's invoiced value collected
                </p>
              </div>
            </div>

            <div className="card-layer absolute -bottom-6 -left-4 hidden w-64 px-4 py-3 sm:block">
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <CheckCircle2 className="size-3.5 text-brand" />
                period_key unenforced twice
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                <code className="rounded bg-muted px-1">SUB-2026-000118|2026-10-01</code>{" "}
                exists once — the run advances instead of re-billing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------- features -------------------------------- */}
      <section id="product" className="border-t border-border/70 bg-card/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
              Product
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Everything between the quote and the reconciliation
            </h2>
            <p className="mt-3 text-muted-foreground">
              Built for SaaS, services and retainers sold on recurring terms in
              India — where the plan period, the tax treatment and the payment
              terms all have to agree with each other.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className="card-layer group p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-24px_oklch(0.3_0.06_190_45%)]"
              >
                <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand-strong transition-colors group-hover:bg-brand group-hover:text-white">
                  {feature.icon}
                </div>
                <h3 className="text-sm font-semibold">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------- billing safety ---------------------------- */}
      <section id="safety" className="border-t border-border/70">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
              Billing safety
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              The same period is billed once. Even when things go wrong.
            </h2>
            <ul className="mt-6 space-y-4">
              {[
                {
                  icon: <Lock className="size-4" />,
                  title: "A unique key per subscription and period",
                  body: "The invoice insert carries a key derived from the subscription and the period start, backed by a unique index. The loser of a race fails its insert and simply moves on.",
                },
                {
                  icon: <CalendarRange className="size-4" />,
                  title: "Catch-up, not skip",
                  body: "The run walks from the last billed date up to today, so a redeployed server on the 12th bills the 5th through the 12th instead of pretending they never happened.",
                },
                {
                  icon: <Layers className="size-4" />,
                  title: "Bounded, observable batches",
                  body: "Each run records what it processed, what it created and what it could not finish. Three failures park a subscription in a visible stuck list instead of looping forever.",
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-strong">
                    {item.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card-layer p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Invoice preview</p>
                <p className="text-xs text-muted-foreground">
                  Nebula Foods Pvt Ltd · 1 Oct – 31 Oct 2026
                </p>
              </div>
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-strong">
                Draft
              </span>
            </div>
            <table className="mt-5 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Line</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {PRICE_ROWS.map((row) => (
                  <tr key={row.label}>
                    <td className="py-2.5 pr-3">{row.label}</td>
                    <td className="py-2.5 text-right tabular-nums">{row.qty}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {formatINR(row.amount)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2.5 text-muted-foreground">Loyalty ₹500 off</td>
                  <td />
                  <td className="py-2.5 text-right tabular-nums text-brand-strong">
                    −{formatINR(50000)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 text-muted-foreground">GST 18%</td>
                  <td />
                  <td className="py-2.5 text-right tabular-nums">
                    {formatINR(145080)}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-medium">Total due</span>
              <span className="text-lg font-semibold tabular-nums">
                {formatINR(1001980)}
              </span>
            </div>
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-brand" />
              Discount redemption, tax split and totals were computed as integers
              and written in the same transaction as the invoice.
            </p>
          </div>
        </div>
      </section>

      {/* -------------------------------- how it works ----------------------------- */}
      <section id="how" className="border-t border-border/70 bg-card/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
              How it works
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Three moves from first quote to collected cash
            </h2>
          </div>
          <ol className="mt-10 grid gap-5 lg:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.step} className="card-layer relative p-6">
                <span className="text-4xl font-semibold text-brand/25">{step.step}</span>
                <h3 className="mt-3 text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ----------------------------------- CTA ----------------------------------- */}
      <section className="border-t border-border/70">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="relative overflow-hidden rounded-2xl bg-[var(--ink)] px-6 py-12 text-center sm:px-12">
            <div className="pointer-events-none absolute inset-0 hairline-grid opacity-20" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight text-white">
                Bring your recurring revenue on a loop you can trust
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-white/65">
                Sign in to the back office, seed a realistic demo tenant in one
                click, and watch a billing run produce invoices you can audit line
                by line.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" className="bg-brand hover:bg-brand-strong" asChild>
                  <Link to="/auth">
                    Open the back office <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  asChild
                >
                  <Link to="/auth?returnTo=/portal">Go to the customer portal</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <Logo className="size-5 text-brand" />
            <span className="font-medium text-foreground">Brightloop</span>
            <span className="text-xs">· recurring subscription management &amp; billing</span>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs">
            <span>Money in integer paise</span>
            <span>Billing days in Asia/Kolkata</span>
            <Link to="/auth" className="hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
