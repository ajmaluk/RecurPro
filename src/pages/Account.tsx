import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { KeyRound } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ROLE_LABELS, type Role } from "@/shared/enums";

export default function Account() {
  const { user } = useAuth();
  const changePassword = useAction(api.accounts.changePassword);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await changePassword({ currentPassword, newPassword });
      toast.success("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Account & Security"
        description="Manage your profile information and update your login password."
      />

      <SectionCard title="Profile Details" description="Information associated with your Brightloop account">
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Full Name</Label>
            <p className="mt-1 font-medium text-foreground">{user?.name ?? "—"}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Email Address</Label>
            <p className="mt-1 font-medium text-foreground">{user?.email ?? "—"}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Role</Label>
            <p className="mt-1">
              <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
                {ROLE_LABELS[user?.role as Role] ?? user?.role ?? "Customer"}
              </span>
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Change Password"
        description="Ensure your account is protected with a secure password"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Current Password</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full sm:w-auto">
            <KeyRound className="mr-1.5 size-4" />
            {loading ? "Updating Password…" : "Update Password"}
          </Button>
        </form>
      </SectionCard>
    </div>
  );
}
