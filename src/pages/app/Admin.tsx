import { useState } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Shield, History, Database } from "lucide-react";
import { LoadingBlock, PageHeader, SectionCard } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROLES, ROLE_LABELS, type Role } from "@/shared/enums";
import { toast } from "sonner";

export default function Admin() {
  const [tab, setTab] = useState<"staff" | "audit">("staff");
  const staff = useQuery(api.staff.list);
  const auditLogs = useQuery(api.audit.list, { paginationOpts: { numItems: 30, cursor: null } });
  const updateStaff = useMutation(api.staff.update);
  const seedDemo = useAction(api.seed.seedDemo);
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async () => {
    if (!confirm("This will seed initial demo data for plans, customers, and subscriptions. Continue?")) {
      return;
    }
    setSeeding(true);
    try {
      await seedDemo({});
      toast.success("Demo data seeded successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to seed demo data");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administration & Staff"
        description="Manage internal user permissions, inspect audit logs, and configure system data."
        actions={
          <Button variant="outline" onClick={handleSeed} disabled={seeding}>
            <Database className="mr-1.5 size-4" />
            {seeding ? "Seeding…" : "Seed Demo Data"}
          </Button>
        }
      />

      <div className="flex gap-2 border-b border-border/70 pb-3">
        <button
          onClick={() => setTab("staff")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "staff"
              ? "bg-brand text-brand-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Shield className="size-4" /> Staff & Accounts
        </button>
        <button
          onClick={() => setTab("audit")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "audit"
              ? "bg-brand text-brand-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <History className="size-4" /> Audit Log
        </button>
      </div>

      {tab === "staff" ? (
        !staff ? (
          <LoadingBlock label="Loading staff accounts…" />
        ) : (
          <SectionCard title="Active Team Accounts" description="System users with administrative or operations access">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-xs font-medium text-muted-foreground">
                    <th className="pb-3">User</th>
                    <th className="pb-3">Role</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {staff.map((u) => (
                    <tr key={u._id} className="hover:bg-muted/30">
                      <td className="py-3 font-medium">
                        <div>
                          <p className="text-foreground">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge variant={u.role === ROLES.ADMIN ? "default" : "secondary"}>
                          {ROLE_LABELS[u.role as Role] ?? u.role}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            u.isActive
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {u.isActive ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {!u.isSelf && (
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                const nextRole = u.role === ROLES.ADMIN ? ROLES.INTERNAL : ROLES.ADMIN;
                                try {
                                  await updateStaff({ userId: u._id, role: nextRole });
                                  toast.success("Role updated");
                                } catch (e: any) {
                                  toast.error(e.message || "Failed to update role");
                                }
                              }}
                            >
                              Toggle Role
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={u.isActive ? "text-destructive" : "text-emerald-600"}
                              onClick={async () => {
                                try {
                                  await updateStaff({ userId: u._id, isActive: !u.isActive });
                                  toast.success(u.isActive ? "Account disabled" : "Account re-enabled");
                                } catch (e: any) {
                                  toast.error(e.message || "Action failed");
                                }
                              }}
                            >
                              {u.isActive ? "Disable" : "Enable"}
                            </Button>
                          </div>
                        )}
                        {u.isSelf && (
                          <span className="text-xs text-muted-foreground italic">Current user</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )
      ) : !auditLogs ? (
        <LoadingBlock label="Fetching audit log…" />
      ) : (
        <SectionCard title="System Audit Logs" description="Immutable trace of administrative events and data modifications">
          <div className="space-y-3">
            {auditLogs.page.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No audit entries logged yet.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {auditLogs.page.map((log: any) => (
                  <div key={log._id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium text-foreground">
                        <span className="font-semibold text-brand">{log.actorLabel}</span> performed{" "}
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                          {log.action}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Target: {log.entityType} ({log.entityId})
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
