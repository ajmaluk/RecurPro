/**
 * Scheduled jobs.
 *
 * The billing run fires at 19:00 UTC, which is 00:30 the next day in
 * Asia/Kolkata — after the day has rolled over, so `today()` is the billing
 * date the run is meant to cover. Run frequency and the idempotency contract
 * are documented in docs/DECISIONS.md.
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "daily billing run",
  { hourUTC: 19, minuteUTC: 0 },
  internal.billing.dailyRun,
  {},
);

export default crons;
