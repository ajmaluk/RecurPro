# Brightloop — Modern Recurring Billing & Subscription Management Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS_v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com/)

**Brightloop** is an enterprise-grade recurring billing, subscription lifecycle, and customer invoicing platform built for SaaS, modern digital services, and subscription businesses.

It features complete relational **MySQL database** persistence, robust JWT session management, dedicated back-office and customer portals, automated billing runs with dunning schedules, and a comprehensive **Tax Invoicing** system with **instant PDF printing**, **quick-print modal**, and **direct sharing** (WhatsApp, Email, shareable public link).

---

## Table of Contents

- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Demo Credentials](#demo-credentials)
- [Portals & Access Roles](#portals--access-roles)
- [Invoice Print & Direct Share](#invoice-print--direct-share)
- [Getting Started](#getting-started)
- [Database Setup & MySQL Schema](#database-setup--mysql-schema)
- [API & Convex Bridge Architecture](#api--convex-bridge-architecture)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Project Structure](#project-structure)
- [License](#license)

---

## Key Features

### 1. Subscription Lifecycle & Automation
- **Multi-interval Recurring Billing**: Supports daily, weekly, monthly, and annual subscription cycles.
- **Automated Billing Runs**: Preview next billing runs, generate invoice batches, and inspect execution history.
- **Proration & Dunning**: Automated state transitions for past-due collections, grace periods, and retry schedules.
- **Subscription Wizard**: Guided customer onboarding and plan assignment with custom discounts and trial days.

### 2. Tax Invoicing & Direct PDF / Print Engine
- **Tax Invoice Compliance**: Complete GST (18%) and multi-currency billing breakdown with legal tax IDs.
- **1-Click Print / PDF**: Formatted print stylesheet (`@media print`) that removes web chrome and outputs a clean, official A4 Tax Invoice document via browser print dialog.
- **Quick Print Modal**: Instant preview and print modal accessible directly from both Back Office and Customer Portal invoice rows.
- **Direct Share**: Integrated modal to share invoices directly via:
  - **WhatsApp**: Pre-filled invoice summary and direct public payment link.
  - **Email**: Pre-formatted subject, client snapshot, line totals, and access URL.
  - **Copy Link**: 1-click clipboard copy of the public view link.
- **Public Shareable View (`/invoice/view/:id`)**: Standalone, public page allowing clients to inspect line items, review tax summaries, and print or download receipts without logging into an account.

### 3. Role-Based Portals
- **Back Office Operations Portal**: Full access to dashboard analytics, customers, plans, catalog products, invoices, billing runs, reports, and staff management.
- **Dedicated Admin Login (`/admin-login`)**: Separate, direct gateway for administrators with explicit privilege verification.
- **Customer Self-Service Portal (`/portal`)**: Allows subscribers to review active plans, view past invoices, download receipts, and update their billing profile.

### 4. Enterprise-Ready Architecture
- **MySQL Relational Datastore**: Production schema with foreign keys, indexes, and full relational integrity.
- **Resilient Auto Fallback**: Automatically activates a persistent in-memory fallback store if MySQL is temporarily offline, ensuring zero downtime during development or testing.
- **Audit Logging**: Comprehensive activity tracking for compliance and change monitoring.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Brightloop Frontend (React 19)              │
│       Vite • Tailwind CSS v4 • Radix UI • Framer Motion     │
├──────────────────────────────┬──────────────────────────────┤
│      Back Office Portal      │    Customer Portal (/portal) │
│      • Dashboard Analytics   │    • Active Subscriptions    │
│      • Invoicing & Billing   │    • Invoice History & PDF   │
│      • Customer & Catalog    │    • Direct Share Dialog     │
└──────────────┬───────────────┴──────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Convex-Compatible Bridge Layer                │
│       (src/lib/convex-adapter.tsx + src/lib/api.ts)         │
│     Translates useQuery/useMutation calls to REST API       │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / JSON (Bearer JWT)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Express Backend (server/index.ts)           │
│         Auth Router • API Router • Convex Bridge Router     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 MySQL 8.0 Database (server/db.ts)           │
│   users • customers • products • plans • subscriptions      │
│            invoices • invoice_items • audit_logs            │
│   (Automatic in-memory fallback if MySQL service is idle)   │
└─────────────────────────────────────────────────────────────┘
```

---

## Demo Credentials

The platform initializes with pre-configured demo accounts covering all user roles:

| Role | Email | Password | Primary Access |
| :--- | :--- | :--- | :--- |
| **System Administrator** | `admin@brightloop.io` | `Password123!` | Complete Back Office, Admin Controls, Staff & Audit Logs |
| **Operations Staff** | `staff@brightloop.io` | `Password123!` | Invoices, Customers, Subscriptions, Catalog, Billing Runs |
| **Customer (Apex Logistics)** | `arjun@apexlogistics.in` | `Password123!` | Customer Portal (`/portal/dashboard`), Invoices & Receipts |
| **Customer (Zenith Tech)** | `neha@zenithtech.in` | `Password123!` | Customer Portal (`/portal/dashboard`), Invoices & Receipts |

> **Quick Switcher**: The `/auth` page includes 1-click credential buttons to instantly log in as any role without manual typing.

---

## Portals & Access Roles

### 1. Back Office Operations (`/dashboard`)
- **Dashboard**: Real-time Monthly Recurring Revenue (MRR), ARR, Net Revenue, Active Subscribers, and Churn Rate charts.
- **Subscriptions (`/subscriptions`)**: Real-time subscriber table with status filters (Active, Past Due, Trialling, Cancelled). Includes the multi-step Subscription Wizard.
- **Invoices (`/invoices`)**: Invoice management with status badges (`DRAFT`, `CONFIRMED`, `PAID`, `VOID`), payment recording, and row-level Print and Share actions.
- **Customers (`/customers`)**: Detailed customer profiles, GSTIN / Tax IDs, addresses, and transaction histories.
- **Catalog & Plans (`/catalog`, `/plans`)**: Products and recurring tiers with pricing intervals and currency configuration.
- **Billing Runs (`/billing`)**: Manual or scheduled batch invoice generation engine.
- **Reports & Analytics (`/reports`)**: Revenue forecasting, collections breakdown, and overdue tracking.
- **Admin & Audit (`/admin`)**: Staff team management and audit event logs.

### 2. Dedicated Admin Login (`/admin-login`)
A dedicated entry point specifically for system administrators, enforcing role verification and direct redirection to administrative panels.

### 3. Customer Self-Service Portal (`/portal`)
Subscribers can log in to:
- Review their active subscription plan, billing interval, and renewal date.
- Access their complete invoice ledger.
- Print official tax receipts and generate share links.
- View company billing information and tax registration details.

---

## Invoice Print & Direct Share

Brightloop provides multiple ways to view, print, and share invoices:

1. **Row Quick Actions**:
   - In both `/invoices` and `/portal/invoices`, click the **Printer icon** on any invoice row to open the **Quick Print Modal** with instant 1-click browser printing (`window.print()`).
   - Click the **Share icon** to open the **Direct Share Dialog**.
2. **Direct Share Dialog**:
   - **WhatsApp**: Generates an encoded link with invoice number, amount, customer name, and link to share via WhatsApp Web or mobile.
   - **Email**: Pre-fills `mailto:` with subject, detailed breakdown, and public link.
   - **Copy Link**: Copies the direct public link (`http://localhost:5173/invoice/view/:id`) to clipboard.
3. **Public Invoice Route (`/invoice/view/:id`)**:
   - Unauthenticated, clean layout containing company details, customer snapshot, line item ledger, subtotal, tax calculation, and direct print button.

---

## Getting Started

### Prerequisites
- [Bun](https://bun.sh/) (Recommended) or Node.js (v20+)
- MySQL Server 8.0+ (Optional: if not running, Brightloop automatically runs on its in-memory fallback store)

### 1. Clone the Repository
```bash
git clone <repository-url>
cd Brightloop
```

### 2. Install Dependencies
```bash
bun install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Review the `.env` settings:
```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=brightloop
JWT_SECRET=brightloop_jwt_secret_key_2026_super_secure
PORT=3001
VITE_CONVEX_URL=https://placeholder-app.convex.cloud
CONVEX_SITE_URL=http://localhost:5173
```

### 4. Start the Application

You can run both backend and frontend concurrently:

**Terminal 1 — Backend API Server:**
```bash
bun run server
```
*Starts Express on `http://localhost:3001` with database initialization and seed data.*

**Terminal 2 — Frontend Dev Server:**
```bash
bun run dev
```
*Starts Vite dev server on `http://localhost:5173`.*

Open your browser at `http://localhost:5173` to explore Brightloop.

---

## Database Setup & MySQL Schema

If you have MySQL running locally (via MySQL Server, Docker, or XAMPP), Brightloop automatically creates the `brightloop` database and all required tables upon starting the backend.

### Schema Structure:
- `users`: Staff, admin, and customer credentials with bcrypt hashes.
- `customers`: Customer profiles, company names, billing addresses, tax IDs, and currencies.
- `products`: Product catalog with categories and descriptions.
- `plans`: Multi-tier pricing plans with billing intervals and trial periods.
- `subscriptions`: Active customer subscriptions linked to plans with auto-renew flags.
- `invoices`: Invoices with status (`draft`, `posted`, `paid`, `void`), dates, and tax totals.
- `invoice_items`: Granular invoice lines, unit prices, quantities, and line amounts.
- `audit_logs`: Administrative event trail.

> **Zero Configuration Fallback**: If MySQL is not detected on port 3306, the server displays an informative notice and immediately loads the built-in memory store, allowing the entire application to be demoed without database prerequisites.

---

## Testing & Quality Assurance

Brightloop includes a comprehensive end-to-end integration test suite verifying authentication, billing runs, CRUD operations, catalog items, and customer portal endpoints.

### Run End-to-End Test Suite:
```bash
bun scratch/e2e_flow_test.mjs
```
*Verifies all 28 critical user flows across auth, invoices, customers, catalog, and portal APIs.*

### Run Static Analysis & Linter:
```bash
bun run lint
```

### Run Production Build:
```bash
bun run build
```

---

## Project Structure

```
Brightloop/
├── server/                    # Node / Express Backend
│   ├── index.ts               # Express server entrypoint & seed logic
│   ├── db.ts                  # MySQL connection, queries & memory fallback
│   ├── auth.ts                # JWT authentication middleware & routes
│   └── convex-bridge.ts       # Convex-compatible query & mutation dispatcher
├── src/                       # Frontend Application
│   ├── components/            # UI Components & Primitives
│   │   ├── app/               # Back-office layout & components
│   │   ├── portal/            # Customer portal layout & navigation
│   │   ├── ui/                # Radix UI + Tailwind design primitives
│   │   ├── InvoicePrintView.tsx   # Clean A4 printable tax invoice component
│   │   └── InvoiceShareDialog.tsx # WhatsApp, Email, & Link sharing modal
│   ├── context/               # React Context Providers (AuthContext)
│   ├── lib/                   # API clients & Convex bridge adapter
│   │   ├── api.ts             # Direct REST API client
│   │   └── convex-adapter.tsx # Drop-in Convex hook replacement
│   ├── pages/                 # Application Screens
│   │   ├── app/               # Back-office screens (Dashboard, Invoices, etc.)
│   │   ├── portal/            # Customer portal screens (Dashboard, Invoices)
│   │   ├── AdminLogin.tsx     # Dedicated Admin Login
│   │   ├── Auth.tsx           # Universal Login with Demo Role Switcher
│   │   ├── PublicInvoiceView.tsx # Standalone shareable invoice page
│   │   └── Landing.tsx        # High-converting modern SaaS landing page
│   └── main.tsx               # Route definitions & React entrypoint
├── scratch/                   # Integration & E2E test scripts
│   └── e2e_flow_test.mjs      # 28-point automated test suite
├── .env.example               # Template environment configuration
└── package.json               # Dependencies & build scripts
```

---

## Available Scripts

| Command | Action |
| :--- | :--- |
| `bun run dev` | Starts the Vite development server on port 5173 |
| `bun run server` | Starts the Express backend on port 3001 |
| `bun run build` | Compiles TypeScript and builds production bundle |
| `bun run lint` | Runs ESLint across the codebase |
| `bun scratch/e2e_flow_test.mjs` | Executes the 28-point automated integration suite |

---

## License

This project is licensed under the MIT License.
