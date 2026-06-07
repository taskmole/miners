"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, FileText, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useUserProfiles, type UserProfile, type UserRole } from '@/hooks/useUserProfiles';
import { useTeams } from '@/hooks/useTeams';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  head_office_exec: 'Head Office',
  finance_reviewer: 'Finance',
  area_coordinator: 'Coordinator',
  franchisee: 'Franchisee',
};

const ROLE_OPTIONS = [
  'super_admin',
  'head_office_exec',
  'finance_reviewer',
  'area_coordinator',
  'franchisee',
] as const;

const CITY_OPTIONS = [
  { id: 'madrid', label: 'Madrid' },
  { id: 'prague', label: 'Prague' },
];

interface PitchSummary {
  id: string;
  address?: string;
  name?: string;
  status: string;
  submitted_at?: string;
  created_at: string;
  city_id?: string;
}

export default function UserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;

  const { canAccessDashboard, isAdmin, loading: authLoading, currentUserRole, updateRole, toggleActive } = useUserProfiles();

  // User data
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);

  // Form state
  const [formRole, setFormRole] = useState('');
  const [formTeamId, setFormTeamId] = useState<string | null>(null);
  const [formCityIds, setFormCityIds] = useState<string[]>([]);
  const [formActive, setFormActive] = useState(true);
  const [formScraperEmails, setFormScraperEmails] = useState(false);
  const [formDisplayName, setFormDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Teams
  const { teams, createTeam, addMember, removeMember } = useTeams();
  const [newTeamName, setNewTeamName] = useState('');
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Pitches
  const [pitches, setPitches] = useState<PitchSummary[]>([]);
  const [pitchesLoading, setPitchesLoading] = useState(true);
  const [pitchesError, setPitchesError] = useState<string | null>(null);

  // Deactivate dialog
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  // Fetch user
  const fetchUser = useCallback(async () => {
    setUserLoading(true);
    setUserError(null);
    try {
      const data = await apiFetch<UserProfile>(`/api/db/user-profiles?mode=single&id=${userId}`);
      if (!data) {
        setUserError('User not found');
        return;
      }
      setUser(data);
      setFormRole(data.role);
      setFormTeamId(data.team_id);
      setFormCityIds(data.city_ids || []);
      setFormActive(data.is_active);
      setFormScraperEmails(data.receives_scraper_emails);
      setFormDisplayName(data.display_name || '');
    } catch {
      setUserError('Failed to load user');
    } finally {
      setUserLoading(false);
    }
  }, [userId]);

  // Fetch pitches
  const fetchPitches = useCallback(async () => {
    setPitchesLoading(true);
    setPitchesError(null);
    try {
      const data = await apiFetch<PitchSummary[]>(`/api/db/pitches?mode=admin&user_id=${userId}`);
      setPitches(data || []);
    } catch {
      setPitchesError('Failed to load pitches');
    } finally {
      setPitchesLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!authLoading && currentUserRole) {
      if (!canAccessDashboard) {
        router.replace('/');
        return;
      }
      fetchUser();
      fetchPitches();
    }
  }, [authLoading, currentUserRole, canAccessDashboard, router, fetchUser, fetchPitches]);

  // Dirty state detection
  const isDirty = useMemo(() => {
    if (!user) return false;
    return (
      formRole !== user.role ||
      formTeamId !== user.team_id ||
      JSON.stringify(formCityIds.sort()) !== JSON.stringify((user.city_ids || []).sort()) ||
      formActive !== user.is_active ||
      formScraperEmails !== user.receives_scraper_emails ||
      formDisplayName !== (user.display_name || '')
    );
  }, [user, formRole, formTeamId, formCityIds, formActive, formScraperEmails, formDisplayName]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveError(null);

    try {
      // Update role separately (uses existing method with escalation prevention)
      if (formRole !== user.role) {
        const success = await updateRole(user.id, formRole as UserRole);
        if (!success) {
          setSaveError('Failed to update role');
          setSaving(false);
          return;
        }
      }

      // Update active status separately
      if (formActive !== user.is_active) {
        const success = await toggleActive(user.id, formActive);
        if (!success) {
          setSaveError('Failed to update active status');
          setSaving(false);
          return;
        }
      }

      // Update remaining fields
      const updates: Record<string, unknown> = {};
      if (formDisplayName !== (user.display_name || '')) updates.display_name = formDisplayName || null;
      if (formTeamId !== user.team_id) updates.team_id = formTeamId;
      if (JSON.stringify(formCityIds.sort()) !== JSON.stringify((user.city_ids || []).sort())) updates.city_ids = formCityIds;
      if (formScraperEmails !== user.receives_scraper_emails) updates.receives_scraper_emails = formScraperEmails;

      if (Object.keys(updates).length > 0) {
        await apiFetch('/api/db/user-profiles', {
          method: 'PATCH',
          body: JSON.stringify({ id: user.id, ...updates }),
        });
      }

      // Keep team_members (the source of truth the app reads for team pitches
      // and notifications) in sync with this single-team selector. The team_id
      // column above is kept only as the selector's backing value. Best effort:
      // membership errors (last-owner guard, already-a-member) must not block save.
      if (formTeamId !== user.team_id) {
        if (user.team_id) {
          try { await removeMember(user.team_id, user.id); } catch { /* e.g. last owner */ }
        }
        if (formTeamId) {
          try { await addMember(formTeamId, user.id, 'member'); } catch { /* e.g. already a member */ }
        }
      }

      // Refresh user data
      await fetchUser();
    } catch {
      setSaveError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    try {
      const team = await createTeam(newTeamName.trim());
      if (team) {
        setFormTeamId(team.id);
        setNewTeamName('');
        setShowNewTeam(false);
      }
    } catch {
      // Error handled by hook
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleDeactivate = async () => {
    if (!user) return;
    setDeactivating(true);
    try {
      await toggleActive(user.id, false);
      setShowDeactivate(false);
      router.push('/admin?tab=users');
    } catch {
      // Error handled by hook
    } finally {
      setDeactivating(false);
    }
  };

  const toggleCity = (cityId: string) => {
    setFormCityIds(prev =>
      prev.includes(cityId)
        ? prev.filter(c => c !== cityId)
        : [...prev, cityId]
    );
  };

  // Loading / auth states
  if (authLoading || (userLoading && !userError)) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (userError || !user) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg border border-zinc-200 p-6 max-w-sm w-full text-center">
          <h2 className="text-lg font-bold text-zinc-900 mb-2">User not found</h2>
          <p className="text-sm text-zinc-600 mb-4">
            {userError || 'This user does not exist or you do not have access.'}
          </p>
          <button
            onClick={() => router.push('/admin?tab=users')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Users
          </button>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    submitted: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    returned: 'bg-amber-100 text-amber-700',
    draft: 'bg-zinc-100 text-zinc-600',
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10" style={{ paddingTop: "calc(12px + env(safe-area-inset-top, 0px))" }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => router.push('/admin?tab=users')}
            className="p-2 -ml-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-600" />
          </button>
          <h1 className="text-lg font-bold text-zinc-900 truncate">
            {user.display_name || 'User Details'}
          </h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Profile + Settings combined */}
        <section className="bg-white rounded-xl border border-zinc-200 p-4 space-y-3">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Name</label>
            <input
              type="text"
              value={formDisplayName}
              onChange={(e) => setFormDisplayName(e.target.value)}
              placeholder="Full name"
              className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Email</label>
            <div className="px-3 py-2.5 text-sm text-zinc-900 bg-zinc-50 rounded-lg border border-zinc-200">
              {user.email || 'No email'}
            </div>
          </div>

          {/* Role */}
          {isAdmin && (
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Role</label>
              <select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                ))}
              </select>
            </div>
          )}

          {/* Team */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Team</label>
            {!showNewTeam ? (
              <div className="flex gap-2">
                <select
                  value={formTeamId || ''}
                  onChange={(e) => setFormTeamId(e.target.value || null)}
                  className="flex-1 px-3 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                >
                  <option value="">No team</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewTeam(true)}
                  className="px-3 py-2.5 border border-zinc-200 rounded-lg text-sm text-zinc-600 hover:bg-zinc-50 whitespace-nowrap"
                >
                  + New
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Team name"
                  className="flex-1 px-3 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateTeam();
                    if (e.key === 'Escape') { setShowNewTeam(false); setNewTeamName(''); }
                  }}
                />
                <button onClick={handleCreateTeam} disabled={creatingTeam || !newTeamName.trim()} className="px-3 py-2.5 bg-zinc-900 text-white rounded-lg text-sm disabled:opacity-50">
                  {creatingTeam ? '...' : 'Create'}
                </button>
                <button onClick={() => { setShowNewTeam(false); setNewTeamName(''); }} className="px-3 py-2.5 border border-zinc-200 rounded-lg text-sm text-zinc-600 hover:bg-zinc-50">
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Cities - green chips with check */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-2">Cities</label>
            <div className="flex flex-wrap gap-2">
              {CITY_OPTIONS.map((city) => {
                const selected = formCityIds.includes(city.id);
                return (
                  <button
                    key={city.id}
                    type="button"
                    onClick={() => toggleCity(city.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                      selected
                        ? "bg-green-100 text-green-700 ring-1 ring-green-300"
                        : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    )}
                  >
                    {selected && <Check className="w-3.5 h-3.5" />}
                    {city.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active + Alert Emails toggles */}
          <div className="flex items-center justify-between min-h-[44px]">
            <label className="text-xs font-medium text-zinc-500">Active</label>
            <Switch checked={formActive} onCheckedChange={setFormActive} />
          </div>
          <div className="flex items-center justify-between min-h-[44px]">
            <label className="text-xs font-medium text-zinc-500">Property Alert Emails</label>
            <Switch checked={formScraperEmails} onCheckedChange={setFormScraperEmails} />
          </div>

          {/* Member since */}
          <div className="text-xs text-zinc-400 pt-1">
            Member since {new Date(user.created_at).toLocaleDateString()}
          </div>

          {/* Save */}
          {saveError && (
            <div className="text-xs text-red-600">{saveError}</div>
          )}
          <Button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={cn(
              "w-full h-10",
              isDirty
                ? "bg-zinc-900 hover:bg-zinc-800 text-white"
                : "bg-zinc-200 text-zinc-500 cursor-not-allowed"
            )}
          >
            {saving ? 'Saving...' : isDirty ? 'Save Changes' : 'No Changes'}
          </Button>
        </section>

        {/* Pitches Section */}
        <section className="bg-white rounded-xl border border-zinc-200 p-5">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-4">
            Pitches ({pitches.length})
          </h2>

          {pitchesLoading && (
            <div className="text-sm text-zinc-400 py-4 text-center">Loading pitches...</div>
          )}

          {pitchesError && (
            <div className="text-sm text-red-600 py-4 text-center">{pitchesError}</div>
          )}

          {!pitchesLoading && !pitchesError && pitches.length === 0 && (
            <div className="text-sm text-zinc-400 py-8 text-center">
              <FileText className="w-8 h-8 mx-auto mb-2 text-zinc-300" />
              No pitches submitted yet
            </div>
          )}

          {!pitchesLoading && pitches.length > 0 && (
            <div className="divide-y divide-zinc-100">
              {pitches.map((pitch) => (
                <div key={pitch.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-900 truncate">
                      {pitch.address || pitch.name || 'Untitled'}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {new Date(pitch.submitted_at || pitch.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span className={cn(
                    "px-2 py-1 text-xs font-semibold rounded-full shrink-0",
                    statusColors[pitch.status] || 'bg-zinc-100 text-zinc-600'
                  )}>
                    {pitch.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Danger Zone */}
        {isAdmin && user.is_active && (
          <section className="bg-white rounded-xl border border-red-200 p-5">
            <h2 className="text-sm font-semibold text-red-500 uppercase tracking-wide mb-3">Danger Zone</h2>
            <p className="text-sm text-zinc-600 mb-4">
              Deactivating this user will revoke their access to the app. They will not be able to sign in or access any features.
            </p>
            <Button
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50 h-12"
              onClick={() => setShowDeactivate(true)}
            >
              Deactivate User
            </Button>
          </section>
        )}
      </main>

      {/* Deactivate Confirmation Dialog */}
      <Dialog open={showDeactivate} onOpenChange={setShowDeactivate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate User</DialogTitle>
            <DialogDescription>
              This will deactivate <strong>{user.display_name || user.email}</strong> and revoke their access to the app. You can reactivate them later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeactivate(false)}
              className="h-11"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeactivate}
              disabled={deactivating}
              className="h-11 bg-red-600 hover:bg-red-700 text-white"
            >
              {deactivating ? 'Deactivating...' : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
