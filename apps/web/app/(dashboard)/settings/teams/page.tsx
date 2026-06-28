"use client";
import { JSX, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { clientFetch } from "@/lib/client-fetch";
import { toast } from "sonner";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  fullName: string;
  email: string;
  role: string;
  teamRole: "lead" | "member";
}

interface Team {
  id: string;
  name: string;
  description: string | null;
  viewAllContacts: boolean;
  members: TeamMember[];
}

interface UserOption {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

// A row in the slide-over member list
interface MemberRow {
  userId: string;
  fullName: string;
  email: string;
  teamRole: "lead" | "member";
}

interface OrgSettings {
  teamControls?: {
    showTeamMembersInAssignee?: boolean;
  };
}

interface OrgData {
  settings: OrgSettings;
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TeamsPage(): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: orgData } = useQuery<{ data: OrgData }>({
    queryKey: ["org-me"],
    queryFn: async () => {
      const token = await getToken();
      return clientFetch(`${API_URL}/v1/organizations/me`, {
        token: token ?? "",
        silent: true,
      }).then((r) => r.json() as Promise<{ data: OrgData }>);
    },
  });

  const showTeamMembersInAssignee =
    orgData?.data?.settings?.teamControls?.showTeamMembersInAssignee ?? false;

  const updateOrgSettings = useMutation({
    mutationFn: async (settings: OrgSettings) => {
      const token = await getToken();
      const res = await clientFetch(`${API_URL}/v1/organizations/me`, {
        method: "PATCH",
        token: token ?? "",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error("Failed to update setting");
      return res.json();
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["org-me"] }),
    onError: () => toast.error("Failed to save setting"),
  });

  const { data: teamsData, isLoading: teamsLoading } = useQuery<{ data: Team[] }>({
    queryKey: ["teams"],
    queryFn: async () => {
      const token = await getToken();
      return clientFetch(`${API_URL}/v1/teams`, {
        token: token ?? "",
        silent: true,
      }).then((r) => r.json() as Promise<{ data: Team[] }>);
    },
  });

  // Reuse the queryKey ["team-members"] already used by members/page.tsx
  const { data: usersData } = useQuery<{ data: UserOption[] }>({
    queryKey: ["team-members"],
    queryFn: async () => {
      const token = await getToken();
      return clientFetch(`${API_URL}/v1/users`, {
        token: token ?? "",
        silent: true,
      }).then((r) => r.json() as Promise<{ data: UserOption[] }>);
    },
  });

  const teams = teamsData?.data ?? [];
  const users = usersData?.data ?? [];

  // ── Delete mutation ────────────────────────────────────────────────────────

  const deleteTeam = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const res = await clientFetch(`${API_URL}/v1/teams/${id}`, {
        method: "DELETE",
        token: token ?? "",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Failed to delete team");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["teams"] });
      setDeleteTarget(null);
      toast.success("Team deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingTeam(null);
    setFormOpen(true);
  }

  function openEdit(team: Team) {
    setEditingTeam(team);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingTeam(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-600 text-white shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Manage Teams</h1>
            <p className="text-sm text-gray-500">Organise agents into teams and control contact visibility.</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Team
        </button>
      </div>

      {/* Team Controls */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Team Controls</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Show only same-team members in assignee list</p>
            <p className="text-xs text-gray-500 mt-0.5">Agents will only see teammates when assigning conversations.</p>
          </div>
          <button
            type="button"
            onClick={() =>
              updateOrgSettings.mutate({
                teamControls: { showTeamMembersInAssignee: !showTeamMembersInAssignee },
              })
            }
            disabled={updateOrgSettings.isPending}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-60 ${
              showTeamMembersInAssignee ? "bg-emerald-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                showTeamMembersInAssignee ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Team Name</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Team Lead(s)</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Team Members</th>
              <th className="w-24 px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {teamsLoading ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-sm text-gray-400">
                  Loading teams…
                </td>
              </tr>
            ) : teams.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-sm text-gray-400">
                  No teams yet. Click &quot;Create Team&quot; to add one.
                </td>
              </tr>
            ) : (
              teams.map((team) => {
                const leads = team.members.filter((m) => m.teamRole === "lead");
                const members = team.members.filter((m) => m.teamRole === "member");
                return (
                  <tr key={team.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold shrink-0">
                          {team.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="font-medium text-gray-900">{team.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {leads.length === 0
                        ? <span className="text-gray-400 italic">None</span>
                        : leads.map((l) => l.fullName).join(", ")}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {members.length === 0
                        ? <span className="text-gray-400 italic">—</span>
                        : (
                          <span>
                            {members.slice(0, 3).map((m) => m.fullName).join(", ")}
                            {members.length > 3 && (
                              <span className="ml-1 text-xs text-gray-400">+{members.length - 3} more</span>
                            )}
                          </span>
                        )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3 justify-end">
                        <button
                          onClick={() => openEdit(team)}
                          className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget(team)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Slide-over form */}
      {formOpen && (
        <TeamSlideOver
          team={editingTeam}
          users={users}
          onClose={closeForm}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ["teams"] });
            closeForm();
          }}
        />
      )}

      {/* Delete confirm dialog */}
      {deleteTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Delete Team</h2>
            <p className="text-sm text-gray-600">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? Team-based contact
              visibility rules will be removed and members may lose access to contacts scoped to this team.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteTeam.mutate(deleteTarget.id)}
                disabled={deleteTeam.isPending}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteTeam.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TeamSlideOver ──────────────────────────────────────────────────────────────

function TeamSlideOver({
  team,
  users,
  onClose,
  onSuccess,
}: {
  team: Team | null;
  users: UserOption[];
  onClose: () => void;
  onSuccess: () => void;
}): JSX.Element {
  const { getToken } = useAuth();

  const isEdit = team !== null;
  const title = isEdit ? "Edit Team" : "Create a Team";

  // ── Form state ─────────────────────────────────────────────────────────────

  const [name, setName] = useState<string>("");
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [viewAllContacts, setViewAllContacts] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Populate when editing ──────────────────────────────────────────────────

  useEffect(() => {
    if (team !== null) {
      setName(team.name);
      setViewAllContacts(team.viewAllContacts);
      setRows(
        team.members.map((m) => ({
          userId: m.id,
          fullName: m.fullName,
          email: m.email,
          teamRole: m.teamRole,
        })),
      );
    } else {
      setName("");
      setViewAllContacts(false);
      setRows([]);
    }
    setFormError(null);
  }, [team]);

  // ── Validation ─────────────────────────────────────────────────────────────

  const hasLead = rows.some((r) => r.teamRole === "lead");
  const canSave = name.trim().length > 0 && hasLead;

  // ── Member picker ──────────────────────────────────────────────────────────

  // Users not yet in the rows list
  const availableUsers = users.filter((u) => !rows.some((r) => r.userId === u.id));

  function addUser(userId: string) {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    // Default teamRole: lead if user's global role is manager, otherwise member
    const teamRole: "lead" | "member" = user.role === "manager" ? "lead" : "member";
    setRows((prev) => [
      ...prev,
      { userId: user.id, fullName: user.fullName, email: user.email, teamRole },
    ]);
  }

  function setTeamRole(userId: string, teamRole: "lead" | "member") {
    setRows((prev) => prev.map((r) => (r.userId === userId ? { ...r, teamRole } : r)));
  }

  function removeRow(userId: string) {
    setRows((prev) => prev.filter((r) => r.userId !== userId));
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setFormError(null);
    try {
      const token = await getToken();
      const body = JSON.stringify({
        name,
        viewAllContacts,
        members: rows.map((r) => ({ userId: r.userId, teamRole: r.teamRole })),
      });
      const url = isEdit
        ? `${API_URL}/v1/teams/${team.id}`
        : `${API_URL}/v1/teams`;
      const method = isEdit ? "PATCH" : "POST";
      const res = await clientFetch(url, {
        method,
        token: token ?? "",
        headers: { "Content-Type": "application/json" },
        body,
        silent: true, // handle errors ourselves so we can show them in the form
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
        const code = json?.error?.code ?? "";
        const message =
          code === "NO_LEAD"
            ? "At least one team member must be assigned as Lead."
            : code === "DUPLICATE_NAME"
              ? "A team with this name already exists."
              : code === "INVALID_MEMBER"
                ? "One or more selected members do not belong to your organisation."
                : (json?.error?.message ?? "Failed to save team. Please try again.");
        setFormError(message);
        return;
      }
      toast.success(isEdit ? "Team updated" : "Team created");
      onSuccess();
    } catch {
      setFormError("Unexpected error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white w-full max-w-md h-full shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
            &times;
          </button>
        </div>

        {/* Body */}
        <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex-1 px-6 py-5 space-y-5">
            {/* Error banner */}
            {formError !== null && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-sm px-3 py-2 rounded-lg">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formError}
              </div>
            )}

            {/* Team Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Team Name</label>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sales North"
                required
              />
            </div>

            {/* Member picker */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Add Members</label>
              <select
                className={inputCls}
                value=""
                onChange={(e) => {
                  if (e.target.value) addUser(e.target.value);
                  // reset to placeholder after selection
                  e.target.value = "";
                }}
              >
                <option value="">— Select a member to add —</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            {/* Selected members */}
            {rows.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Selected Members
                </p>
                {rows.map((row) => (
                  <div
                    key={row.userId}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5"
                  >
                    {/* Avatar */}
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold shrink-0">
                      {row.fullName.charAt(0).toUpperCase()}
                    </span>

                    {/* Name + email */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{row.fullName}</p>
                      <p className="text-xs text-gray-500 truncate">{row.email}</p>
                    </div>

                    {/* Lead / Member radio */}
                    <div className="flex items-center gap-3 text-sm shrink-0">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name={`teamRole-${row.userId}`}
                          checked={row.teamRole === "lead"}
                          onChange={() => setTeamRole(row.userId, "lead")}
                        />
                        <span className="text-xs text-gray-700">Lead</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name={`teamRole-${row.userId}`}
                          checked={row.teamRole === "member"}
                          onChange={() => setTeamRole(row.userId, "member")}
                        />
                        <span className="text-xs text-gray-700">Member</span>
                      </label>
                    </div>

                    {/* Remove */}
                    <button
                      type="button"
                      onClick={() => removeRow(row.userId)}
                      className="text-gray-400 hover:text-red-500 text-lg leading-none shrink-0"
                      title="Remove member"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Lead required hint */}
            {rows.length > 0 && !hasLead && (
              <p className="text-xs text-amber-600">
                Assign at least one member as <strong>Lead</strong> to enable Save.
              </p>
            )}

            {/* View all contacts toggle */}
            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Members can view all contacts</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  When enabled, team members can see contacts assigned to other teams.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewAllContacts((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  viewAllContacts ? "bg-emerald-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    viewAllContacts ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200">
            <button
              type="submit"
              disabled={saving || !canSave}
              className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Team"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
