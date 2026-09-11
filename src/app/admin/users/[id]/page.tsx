"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useUserProfiles, type UserProfile } from '@/hooks/useUserProfiles';
import { useTeams } from '@/hooks/useTeams';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { cityOptions, cityNames } from '@/lib/cities';
import { CityAccessEditor, SuperAdminBanner } from '@/components/admin/CityAccessEditor';
import { UserHistory, type HistoryEntry } from '@/components/admin/UserHistory';
import { toGrants, type CityGrant, type CityGrantRow } from '@/lib/permissions';

/**
 * One person's page. Everything true about them, on one screen.
 *
 * The order is itself a decision. Account status comes first because whether
 * somebody can sign in at all is the biggest switch on the page, and it used
 * to be buried at the bottom under a "Danger Zone" heading where nobody could
 * find it.
 *
 *   1. Account status
 *   2. Name, email, team
 *   3. Access: the Super Admin switch, then a row per city
 *   4. Save
 *   5. History: what they submitted, and what they decided
 *
 * Gone from this screen: the Role dropdown (replaced by the switch and the
 * city rows), the editable Team dropdown (a duplicate record that mostly
 * disagreed with the real team membership and that no security rule ever
 * read), and the global Property Alert Emails switch (alerts are per city
 * now, sitting next to the access they depend on).
 */

interface HistoryResponse {
  canSee: boolean;
  scope?: string[] | null;
  submitted: HistoryEntry[];
  decided: HistoryEntry[];
}

export default function UserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;

  const {
    canAccessDashboard,
    isSuperAdmin,
    approverCities,
    accessResolved,
    loading: authLoading,
    updateGrants,
    setSuperAdmin,
    toggleActive,
  } = useUserProfiles();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);

  // Form state
  const [formActive, setFormActive] = useState(true);
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formSuperAdmin, setFormSuperAdmin] = useState(false);
  const [formGrants, setFormGrants] = useState<CityGrant[]>([]);
  const [savedGrants, setSavedGrants] = useState<CityGrant[]>([]);

  /**
   * The grants a person had before the Super Admin switch was turned on.
   *
   * Switching it on collapses the city list, because there is genuinely
   * nothing left to choose. Switching it off has to put back what was there
   * rather than leaving them with nothing, which would quietly demote someone
   * to no access at all on a mis-click.
   */
  const [grantsBeforeSuperAdmin, setGrantsBeforeSuperAdmin] = useState<CityGrant[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { teams } = useTeams();
  const teamName = useMemo(
    () => teams.find((t) => t.id === user?.team_id)?.name ?? null,
    [teams, user?.team_id],
  );

  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    setUserLoading(true);
    setUserError(null);
    try {
      const [profile, grantRows] = await Promise.all([
        apiFetch<UserProfile>(`/api/db/user-profiles?mode=single&id=${userId}`),
        apiFetch<(CityGrantRow & { user_id: string })[]>(
          `/api/db/user-grants?mode=single&user_id=${userId}`,
        ),
      ]);
      if (!profile) {
        setUserError('User not found');
        return;
      }
      const grants = toGrants(grantRows);
      setUser(profile);
      setFormActive(profile.is_active);
      setFormDisplayName(profile.display_name || '');
      setFormSuperAdmin(profile.is_super_admin === true);
      setFormGrants(grants);
      setSavedGrants(grants);
      setGrantsBeforeSuperAdmin(grants);
    } catch {
      setUserError('Failed to load user');
    } finally {
      setUserLoading(false);
    }
  }, [userId]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setHistory(await apiFetch<HistoryResponse>(`/api/db/user-history?user_id=${userId}`));
    } catch {
      // A failed fetch is not a refusal, so it must not render as the locked
      // panel. Leave it null and say nothing rather than accuse the viewer of
      // lacking a permission they have.
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (authLoading || !accessResolved) return;
    if (!canAccessDashboard) {
      router.replace('/');
      return;
    }
    fetchUser();
    fetchHistory();
  }, [authLoading, accessResolved, canAccessDashboard, router, fetchUser, fetchHistory]);

  /**
   * What this viewer may change on this person.
   *
   * Only a super admin edits access; that is enforced by RLS on the grants
   * table, and repeated here so the controls are visibly disabled rather than
   * pressable and then refused.
   *
   * An Approver may switch somebody on and off, but only somebody who lives
   * entirely inside the Approver's own cities, and never a super admin.
   */
  const subjectIsSuperAdmin = user?.is_super_admin === true;
  const canEditAccess = isSuperAdmin;
  const canToggleActive =
    isSuperAdmin ||
    (!subjectIsSuperAdmin &&
      savedGrants.length > 0 &&
      savedGrants.every((g) => approverCities.includes(g.cityId)));

  const grantsChanged = useMemo(() => {
    const key = (list: CityGrant[]) =>
      JSON.stringify(
        [...list]
          .sort((a, b) => a.cityId.localeCompare(b.cityId))
          .map((g) => [g.cityId, g.level, g.canSeeFinancials, g.receivesAlerts]),
      );
    return key(formGrants) !== key(savedGrants);
  }, [formGrants, savedGrants]);

  const isDirty = useMemo(() => {
    if (!user) return false;
    return (
      formActive !== user.is_active ||
      formDisplayName !== (user.display_name || '') ||
      formSuperAdmin !== (user.is_super_admin === true) ||
      grantsChanged
    );
  }, [user, formActive, formDisplayName, formSuperAdmin, grantsChanged]);

  const handleSuperAdminToggle = (on: boolean) => {
    if (on) {
      setGrantsBeforeSuperAdmin(formGrants);
    } else {
      setFormGrants(grantsBeforeSuperAdmin);
    }
    setFormSuperAdmin(on);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveError(null);

    try {
      if (formActive !== user.is_active) {
        if (!(await toggleActive(user.id, formActive))) {
          setSaveError('Could not change whether they can sign in.');
          return;
        }
      }

      if (formSuperAdmin !== (user.is_super_admin === true)) {
        if (!(await setSuperAdmin(user.id, formSuperAdmin))) {
          setSaveError('Only a super admin can grant or remove the Super Admin switch.');
          return;
        }
      }

      if (grantsChanged) {
        if (!(await updateGrants(user.id, formGrants))) {
          setSaveError('Could not save city access. Only a super admin can change it.');
          return;
        }
      }

      if (formDisplayName !== (user.display_name || '')) {
        await apiFetch('/api/db/user-profiles', {
          method: 'PATCH',
          body: JSON.stringify({ id: user.id, display_name: formDisplayName || null }),
        });
      }

      await fetchUser();
    } catch {
      setSaveError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

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

  const scopeNote =
    history?.scope && history.scope.length > 0
      ? `${history.scope.map((c) => cityNames[c] ?? c).join(' and ')} only, because that is where you approve`
      : undefined;

  return (
    <div className="min-h-screen bg-zinc-50">
      <header
        className="bg-white border-b border-zinc-200 sticky top-0 z-10"
        style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}
      >
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
        {/* 1. Account status. First, because it is the biggest switch here,
               and it turns the whole block amber when it is off so a
               suspended account cannot be mistaken for a working one. */}
        <section
          className={cn(
            'rounded-xl border p-4',
            formActive ? 'bg-white border-zinc-200' : 'bg-amber-50 border-amber-300',
          )}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <span
                className={cn(
                  'w-2.5 h-2.5 rounded-full mt-1.5 shrink-0',
                  formActive ? 'bg-emerald-500' : 'bg-amber-500',
                )}
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">
                  {formActive ? 'Account is on' : 'Account is off'}
                </div>
                <p className={cn('text-sm', formActive ? 'text-zinc-600' : 'text-amber-800')}>
                  {formActive
                    ? 'They can sign in and use the app.'
                    : 'They cannot sign in. Their work is kept.'}
                </p>
              </div>
            </div>
            <Switch
              checked={formActive}
              disabled={!canToggleActive}
              onCheckedChange={setFormActive}
            />
          </div>
          {!canToggleActive && (
            <p className="text-xs text-zinc-500 mt-2 pl-[22px]">
              {subjectIsSuperAdmin
                ? 'Only a super admin can switch a super admin off.'
                : 'You can only switch people on and off in your own cities.'}
            </p>
          )}
        </section>

        {/* 2. Who they are. */}
        <section className="bg-white rounded-xl border border-zinc-200 p-4 space-y-3">
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

          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Email</label>
            <div className="px-3 py-2.5 text-sm text-zinc-900 bg-zinc-50 rounded-lg border border-zinc-200">
              {user.email || 'No email'}
            </div>
          </div>

          {/* Team is shown, not edited. Seeing who is paired with whom is
              worth keeping; the dropdown that used to be here wrote a second,
              disagreeing copy of team membership that nothing read. */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Team</label>
            <div className="px-3 py-2.5 text-sm bg-zinc-50 rounded-lg border border-zinc-200 flex items-center justify-between gap-2">
              <span className={teamName ? 'text-zinc-900' : 'text-zinc-400'}>
                {teamName ?? 'No team'}
              </span>
              <button
                type="button"
                onClick={() => router.push('/admin?tab=teams')}
                className="text-xs text-zinc-500 hover:text-zinc-900 underline shrink-0"
              >
                Manage in Teams
              </button>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              A team lets people edit each other&apos;s lists and drafts. It never
              changes what anyone can see.
            </p>
          </div>

          <div className="text-xs text-zinc-400 pt-1">
            Member since {new Date(user.created_at).toLocaleDateString()}
          </div>
        </section>

        {/* 3. Access. */}
        <section className="bg-white rounded-xl border border-zinc-200 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">Access</h2>

          <div className="flex items-center justify-between gap-4 min-h-[44px]">
            <div className="min-w-0">
              <div className="text-sm font-medium text-zinc-900">Super Admin</div>
              <p className="text-xs text-zinc-500">
                Everything everywhere, plus users, settings, scoring and cities.
              </p>
            </div>
            <Switch
              checked={formSuperAdmin}
              disabled={!isSuperAdmin}
              onCheckedChange={handleSuperAdminToggle}
            />
          </div>

          {formSuperAdmin ? (
            <SuperAdminBanner />
          ) : (
            <CityAccessEditor
              cities={cityOptions}
              grants={formGrants}
              onChange={setFormGrants}
              // An empty allow-list disables every row, which is what an
              // Approver looking at somebody else's page should see: the
              // levels are visible so the shape of the person is readable,
              // and nothing is pressable.
              allowedCityIds={canEditAccess ? undefined : []}
              maxLevel={canEditAccess ? 'approve' : 'contribute'}
            />
          )}

          {!canEditAccess && (
            <p className="text-xs text-zinc-500">
              Only a super admin can change city access. You can invite people
              into your own cities from the Users tab.
            </p>
          )}

          {saveError && <div className="text-xs text-red-600">{saveError}</div>}

          <Button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={cn(
              'w-full h-10',
              isDirty
                ? 'bg-zinc-900 hover:bg-zinc-800 text-white'
                : 'bg-zinc-200 text-zinc-500 cursor-not-allowed',
            )}
          >
            {saving ? 'Saving...' : isDirty ? 'Save Changes' : 'No Changes'}
          </Button>
        </section>

        {/* 5. History. */}
        {historyLoading ? (
          <section className="bg-white rounded-xl border border-zinc-200 p-5 text-sm text-zinc-400">
            Loading history...
          </section>
        ) : history ? (
          <UserHistory
            submitted={history.submitted}
            decided={history.decided}
            cityNames={cityNames}
            canSee={history.canSee}
            scopeNote={scopeNote}
          />
        ) : null}
      </main>
    </div>
  );
}
