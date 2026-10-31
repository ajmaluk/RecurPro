/** RecurPro mark: a recurring billing loop with a ledger dot at its centre. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      <path
        d="M16 4.5a11.5 11.5 0 1 1-10.4 6.6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M4.2 5.4v6.4h6.4"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="4.2" fill="currentColor" />
    </svg>
  );
}
