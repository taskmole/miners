"use client";

import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users, FileText, Check, X, ChevronDown, ChevronUp, Download, RefreshCw } from 'lucide-react';
import { useUserProfiles } from '@/hooks/useUserProfiles';
import { useAdminSubmissions, AdminPitch } from '@/hooks/useAdminSubmissions';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  statusColors,
  propertyTypeLabels,
  conditionLabels,
  visibilityLabels,
  accessLabels,
} from '@/types/scouting';

type Tab = 'submissions' | 'users';

// Error Boundary to catch crashes and show a friendly error
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AdminErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AdminErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-zinc-200 p-6 max-w-md w-full text-center">
            <div className="text-red-500 text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-bold text-zinc-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-zinc-600 mb-4">
              The admin dashboard encountered an error. This is usually temporary.
            </p>
            <p className="text-xs text-zinc-400 mb-4 font-mono bg-zinc-50 p-2 rounded">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

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

// Format currency for display
function formatCurrency(value?: number): string {
  if (value === undefined || value === null) return '—';
  return `€${value.toLocaleString()}`;
}

// Sanitize filename for download
function sanitizeFilename(str: string): string {
  return str.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'submission';
}

// Generate printable PDF (opens in new window for Save as PDF)
function downloadPitchAsPdf(pitch: AdminPitch) {
  const date = new Date(pitch.submittedAt || pitch.createdAt).toLocaleDateString();
  const checkedCount = pitch.checklist?.filter(c => c.isChecked).length || 0;
  const totalChecklist = pitch.checklist?.length || 0;

  // Build checklist HTML
  const checklistHtml = pitch.checklist?.map(item => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e5e5e5;">${item.isChecked ? '✓' : '○'}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e5e5;">${item.question}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e5e5; color: #666;">${item.notes || '—'}</td>
    </tr>
  `).join('') || '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Location Pitch - ${pitch.address || 'Submission'}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #333; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        .subtitle { color: #666; margin-bottom: 32px; }
        .section { margin-bottom: 24px; }
        .section-title { font-size: 14px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; border-bottom: 2px solid #e5e5e5; padding-bottom: 4px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; }
        .field { }
        .label { font-size: 12px; color: #888; margin-bottom: 2px; }
        .value { font-size: 14px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; padding: 8px; background: #f5f5f5; font-weight: 600; }
        .notes { background: #f9f9f9; padding: 16px; border-radius: 8px; margin-top: 8px; }
        .status { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
        .status-submitted { background: #dbeafe; color: #1d4ed8; }
        .status-approved { background: #dcfce7; color: #15803d; }
        .status-rejected { background: #fee2e2; color: #dc2626; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <h1>📍 ${pitch.address || pitch.name || 'Location Pitch'}</h1>
      <div class="subtitle">
        Submitted by ${pitch.authorName || 'Unknown'} • ${date}
        <span class="status status-${pitch.status}" style="margin-left: 12px;">${pitch.status.toUpperCase()}</span>
      </div>

      <div class="section">
        <div class="section-title">Location Details</div>
        <div class="grid">
          <div class="field"><div class="label">Area</div><div class="value">${pitch.areaSqm ? pitch.areaSqm + ' sqm' : '—'}</div></div>
          <div class="field"><div class="label">Storage</div><div class="value">${pitch.storageSqm ? pitch.storageSqm + ' sqm' : '—'}</div></div>
          <div class="field"><div class="label">Property Type</div><div class="value">${pitch.propertyType ? (propertyTypeLabels[pitch.propertyType as keyof typeof propertyTypeLabels] || pitch.propertyType) : '—'}</div></div>
          <div class="field"><div class="label">Footfall</div><div class="value">${pitch.footfallEstimate ? pitch.footfallEstimate + '/day' : '—'}</div></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Financial</div>
        <div class="grid">
          <div class="field"><div class="label">Monthly Rent</div><div class="value">${pitch.monthlyRent ? '€' + pitch.monthlyRent.toLocaleString() : '—'}</div></div>
          <div class="field"><div class="label">Service Fees</div><div class="value">${pitch.serviceFees ? '€' + pitch.serviceFees.toLocaleString() + '/mo' : '—'}</div></div>
          <div class="field"><div class="label">Deposit</div><div class="value">${pitch.deposit ? '€' + pitch.deposit.toLocaleString() : '—'}</div></div>
          <div class="field"><div class="label">Transfer Fee</div><div class="value">${pitch.transferFee ? '€' + pitch.transferFee.toLocaleString() : '—'}</div></div>
          <div class="field"><div class="label">Fitout Cost</div><div class="value">${pitch.fitoutCost ? '€' + pitch.fitoutCost.toLocaleString() : '—'}</div></div>
          <div class="field"><div class="label">Expected Daily Revenue</div><div class="value">${pitch.expectedDailyRevenue ? '€' + pitch.expectedDailyRevenue.toLocaleString() : '—'}</div></div>
          <div class="field"><div class="label">Payback</div><div class="value">${pitch.paybackMonths ? pitch.paybackMonths + ' months' : '—'}</div></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Operational</div>
        <div class="grid">
          <div class="field"><div class="label">Ventilation</div><div class="value">${pitch.ventilation ? (conditionLabels[pitch.ventilation as keyof typeof conditionLabels] || pitch.ventilation) : '—'}</div></div>
          <div class="field"><div class="label">Visibility</div><div class="value">${pitch.visibility ? (visibilityLabels[pitch.visibility as keyof typeof visibilityLabels] || pitch.visibility) : '—'}</div></div>
          <div class="field"><div class="label">Delivery Access</div><div class="value">${pitch.deliveryAccess ? (accessLabels[pitch.deliveryAccess as keyof typeof accessLabels] || pitch.deliveryAccess) : '—'}</div></div>
          <div class="field"><div class="label">Seating</div><div class="value">${pitch.seatingCapacity ? pitch.seatingCapacity + ' seats' : '—'}</div></div>
        </div>
      </div>

      ${pitch.checklist && pitch.checklist.length > 0 ? `
      <div class="section">
        <div class="section-title">Checklist (${checkedCount}/${totalChecklist} completed)</div>
        <table>
          <tr><th style="width: 40px;"></th><th>Question</th><th>Notes</th></tr>
          ${checklistHtml}
        </table>
      </div>
      ` : ''}

      ${pitch.neighbourhoodProfile || pitch.nearbyCompetitors || pitch.notes || pitch.risks ? `
      <div class="section">
        <div class="section-title">Notes & Analysis</div>
        ${pitch.neighbourhoodProfile ? `<div class="notes"><strong>Neighbourhood:</strong> ${pitch.neighbourhoodProfile}</div>` : ''}
        ${pitch.nearbyCompetitors ? `<div class="notes"><strong>Competitors:</strong> ${pitch.nearbyCompetitors}</div>` : ''}
        ${pitch.notes ? `<div class="notes"><strong>Condition Notes:</strong> ${pitch.notes}</div>` : ''}
        ${pitch.risks && pitch.risks.length > 0 ? `<div class="notes"><strong>Risks:</strong> ${pitch.risks.join(', ')}</div>` : ''}
      </div>
      ` : ''}

      ${pitch.status === 'rejected' && pitch.rejectionNotes ? `
      <div class="section">
        <div class="section-title" style="color: #dc2626;">Rejection Reason</div>
        <div class="notes" style="background: #fee2e2;">${pitch.rejectionNotes}</div>
      </div>
      ` : ''}

      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #888;">
        Generated on ${new Date().toLocaleString()} • Miners Location Scout
      </div>
    </body>
    </html>
  `;

  // Open in new window and trigger print dialog
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    // Small delay to ensure styles load before print dialog
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}

// Submission detail view component
function SubmissionDetails({ pitch }: { pitch: AdminPitch }) {
  const checkedCount = pitch.checklist?.filter(c => c.isChecked).length || 0;
  const totalChecklist = pitch.checklist?.length || 0;

  return (
    <div className="mt-3 pt-3 border-t border-zinc-200 space-y-3 text-sm">
      {/* Location info */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {pitch.areaSqm && (
          <div>
            <span className="text-zinc-500">Area:</span>{' '}
            <span className="text-zinc-900">{pitch.areaSqm} sqm</span>
          </div>
        )}
        {pitch.storageSqm && (
          <div>
            <span className="text-zinc-500">Storage:</span>{' '}
            <span className="text-zinc-900">{pitch.storageSqm} sqm</span>
          </div>
        )}
        {pitch.propertyType && (
          <div>
            <span className="text-zinc-500">Type:</span>{' '}
            <span className="text-zinc-900">{propertyTypeLabels[pitch.propertyType as keyof typeof propertyTypeLabels] || pitch.propertyType}</span>
          </div>
        )}
        {pitch.footfallEstimate && (
          <div>
            <span className="text-zinc-500">Footfall:</span>{' '}
            <span className="text-zinc-900">{pitch.footfallEstimate}/day</span>
          </div>
        )}
      </div>

      {/* Financial info */}
      {(pitch.monthlyRent || pitch.serviceFees || pitch.deposit) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {pitch.monthlyRent && (
            <div>
              <span className="text-zinc-500">Rent:</span>{' '}
              <span className="text-zinc-900">{formatCurrency(pitch.monthlyRent)}/mo</span>
            </div>
          )}
          {pitch.serviceFees && (
            <div>
              <span className="text-zinc-500">Fees:</span>{' '}
              <span className="text-zinc-900">{formatCurrency(pitch.serviceFees)}/mo</span>
            </div>
          )}
          {pitch.deposit && (
            <div>
              <span className="text-zinc-500">Deposit:</span>{' '}
              <span className="text-zinc-900">{formatCurrency(pitch.deposit)}</span>
            </div>
          )}
          {pitch.transferFee && (
            <div>
              <span className="text-zinc-500">Transfer:</span>{' '}
              <span className="text-zinc-900">{formatCurrency(pitch.transferFee)}</span>
            </div>
          )}
          {pitch.fitoutCost && (
            <div>
              <span className="text-zinc-500">Fitout:</span>{' '}
              <span className="text-zinc-900">{formatCurrency(pitch.fitoutCost)}</span>
            </div>
          )}
          {pitch.expectedDailyRevenue && (
            <div>
              <span className="text-zinc-500">Expected Rev:</span>{' '}
              <span className="text-zinc-900">{formatCurrency(pitch.expectedDailyRevenue)}/day</span>
            </div>
          )}
        </div>
      )}

      {/* Operational info */}
      {(pitch.ventilation || pitch.visibility || pitch.deliveryAccess) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {pitch.ventilation && (
            <div>
              <span className="text-zinc-500">Ventilation:</span>{' '}
              <span className="text-zinc-900">{conditionLabels[pitch.ventilation as keyof typeof conditionLabels] || pitch.ventilation}</span>
            </div>
          )}
          {pitch.visibility && (
            <div>
              <span className="text-zinc-500">Visibility:</span>{' '}
              <span className="text-zinc-900">{visibilityLabels[pitch.visibility as keyof typeof visibilityLabels] || pitch.visibility}</span>
            </div>
          )}
          {pitch.deliveryAccess && (
            <div>
              <span className="text-zinc-500">Delivery:</span>{' '}
              <span className="text-zinc-900">{accessLabels[pitch.deliveryAccess as keyof typeof accessLabels] || pitch.deliveryAccess}</span>
            </div>
          )}
          {pitch.seatingCapacity && (
            <div>
              <span className="text-zinc-500">Seating:</span>{' '}
              <span className="text-zinc-900">{pitch.seatingCapacity} seats</span>
            </div>
          )}
        </div>
      )}

      {/* Checklist */}
      {totalChecklist > 0 && (
        <div>
          <span className="text-zinc-500">Checklist:</span>{' '}
          <span className="text-zinc-900">{checkedCount}/{totalChecklist} items checked</span>
        </div>
      )}

      {/* Attachments */}
      {pitch.attachmentPaths && pitch.attachmentPaths.length > 0 && (
        <div>
          <span className="text-zinc-500">Attachments:</span>{' '}
          <span className="text-zinc-900">{pitch.attachmentPaths.length} files</span>
        </div>
      )}

      {/* Notes */}
      {pitch.notes && (
        <div>
          <span className="text-zinc-500">Notes:</span>{' '}
          <span className="text-zinc-900">{pitch.notes}</span>
        </div>
      )}

      {/* Risks */}
      {pitch.risks && pitch.risks.length > 0 && (
        <div>
          <span className="text-zinc-500">Risks:</span>{' '}
          <span className="text-zinc-900">{pitch.risks.join(', ')}</span>
        </div>
      )}

      {/* Neighbourhood */}
      {pitch.neighbourhoodProfile && (
        <div>
          <span className="text-zinc-500">Neighbourhood:</span>{' '}
          <span className="text-zinc-900">{pitch.neighbourhoodProfile}</span>
        </div>
      )}

      {/* Competitors */}
      {pitch.nearbyCompetitors && (
        <div>
          <span className="text-zinc-500">Competitors:</span>{' '}
          <span className="text-zinc-900">{pitch.nearbyCompetitors}</span>
        </div>
      )}
    </div>
  );
}

function AdminContent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('submissions');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    users,
    currentUserRole,
    isAdmin,
    loading: usersLoading,
    error: usersError,
    updateRole,
    toggleActive,
  } = useUserProfiles();

  // Use admin submissions hook for full data from Supabase
  const {
    pending: pendingSubmissions,
    processed: processedSubmissions,
    loading: submissionsLoading,
    error: submissionsError,
    refetch: refetchSubmissions,
  } = useAdminSubmissions();

  // Auth check - redirect non-admins
  useEffect(() => {
    if (!usersLoading && currentUserRole && !isAdmin) {
      router.replace('/');
    }
  }, [usersLoading, currentUserRole, isAdmin, router]);

  // Handlers
  const handleRoleChange = async (userId: string, newRole: string) => {
    setActionError(null);
    const success = await updateRole(userId, newRole as typeof ROLE_OPTIONS[number]);
    if (!success) {
      setActionError('Failed to update role');
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    setActionError(null);
    const success = await toggleActive(userId, !currentActive);
    if (!success) {
      setActionError('Failed to update status');
    }
  };

  const handleApprove = async (pitchId: string) => {
    setActionError(null);
    if (!isSupabaseConfigured() || !supabase) {
      setActionError('Database not configured');
      return;
    }
    try {
      const { error } = await supabase
        .from('pitches')
        .update({
          status: 'approved',
          reviewed_by: 'Admin',
          final_reviewed_at: new Date().toISOString(),
        })
        .eq('id', pitchId);

      if (error) throw error;
      refetchSubmissions();
    } catch {
      setActionError('Failed to approve');
    }
  };

  const handleReject = async (pitchId: string) => {
    setActionError(null);
    if (!rejectNotes.trim()) {
      setActionError('Please enter rejection notes');
      return;
    }
    if (!isSupabaseConfigured() || !supabase) {
      setActionError('Database not configured');
      return;
    }
    try {
      const { error } = await supabase
        .from('pitches')
        .update({
          status: 'rejected',
          rejection_notes: rejectNotes,
          reviewed_by: 'Admin',
          final_reviewed_at: new Date().toISOString(),
        })
        .eq('id', pitchId);

      if (error) throw error;
      setRejectingId(null);
      setRejectNotes('');
      refetchSubmissions();
    } catch {
      setActionError('Failed to reject');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Loading state
  if (usersLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  // Not admin - will redirect
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-zinc-500">Redirecting...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="p-2 -ml-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-600" />
          </button>
          <h1 className="text-lg font-bold text-zinc-900">Admin Dashboard</h1>
        </div>
      </header>

      {/* Tabs - Submissions FIRST */}
      <div className="bg-white border-b border-zinc-200">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex">
            <button
              onClick={() => setActiveTab('submissions')}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === 'submissions'
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              )}
            >
              <FileText className="w-4 h-4" />
              Submissions
              {pendingSubmissions.length > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {pendingSubmissions.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === 'users'
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              )}
            >
              <Users className="w-4 h-4" />
              User Roles
            </button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {actionError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2">
          <div className="max-w-4xl mx-auto text-sm text-red-600">
            {actionError}
            <button
              onClick={() => setActionError(null)}
              className="ml-2 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {activeTab === 'submissions' && (
          <div className="space-y-6">
            {submissionsError && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                {submissionsError}
              </div>
            )}

            {submissionsLoading && (
              <div className="text-center py-8 text-zinc-500">Loading submissions...</div>
            )}

            {/* New submissions */}
            <section>
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                New — Awaiting Review ({pendingSubmissions.length})
              </h2>
              {pendingSubmissions.length === 0 ? (
                <div className="bg-white rounded-lg border border-zinc-200 px-4 py-8 text-center text-zinc-500">
                  No pending submissions
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingSubmissions.map((pitch) => (
                    <div
                      key={pitch.id}
                      className="bg-white rounded-lg border border-zinc-200 p-4"
                    >
                      <div className="flex flex-col gap-3">
                        {/* Header with expand toggle */}
                        <div
                          className="cursor-pointer"
                          onClick={() => toggleExpand(pitch.id)}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-medium text-zinc-900">
                                📍 {pitch.address || pitch.name || 'Untitled'}
                              </div>
                              <div className="text-sm text-zinc-500">
                                Submitted by {pitch.authorName || 'Unknown'} • {new Date(pitch.submittedAt || pitch.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                            <button className="p-1 text-zinc-400 hover:text-zinc-600">
                              {expandedId === pitch.id ? (
                                <ChevronUp className="w-5 h-5" />
                              ) : (
                                <ChevronDown className="w-5 h-5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Expanded details */}
                        {expandedId === pitch.id && <SubmissionDetails pitch={pitch} />}

                        {/* Reject dialog */}
                        {rejectingId === pitch.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={rejectNotes}
                              onChange={(e) => setRejectNotes(e.target.value)}
                              placeholder="Reason for rejection..."
                              className="w-full h-20 px-3 py-2 text-sm border border-zinc-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400"
                            />
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleReject(pitch.id)}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                              >
                                Confirm Reject
                              </Button>
                              <Button
                                onClick={() => {
                                  setRejectingId(null);
                                  setRejectNotes('');
                                }}
                                variant="outline"
                                className="flex-1"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                              onClick={() => handleApprove(pitch.id)}
                              className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white h-12"
                            >
                              <Check className="w-4 h-4 mr-2" />
                              Approve
                            </Button>
                            <Button
                              onClick={() => setRejectingId(pitch.id)}
                              variant="outline"
                              className="flex-1 border-red-300 text-red-600 hover:bg-red-50 h-12"
                            >
                              <X className="w-4 h-4 mr-2" />
                              Reject
                            </Button>
                            <Button
                              onClick={() => downloadPitchAsPdf(pitch)}
                              variant="outline"
                              className="border-zinc-300 text-zinc-600 hover:bg-zinc-50 h-12 sm:flex-none"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              PDF
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Processed submissions */}
            <section>
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                Processed ({processedSubmissions.length})
              </h2>
              {processedSubmissions.length === 0 ? (
                <div className="bg-white rounded-lg border border-zinc-200 px-4 py-8 text-center text-zinc-500">
                  No processed submissions yet
                </div>
              ) : (
                <div className="space-y-3">
                  {processedSubmissions.map((pitch) => (
                    <div
                      key={pitch.id}
                      className="bg-white rounded-lg border border-zinc-200 p-4"
                    >
                      {/* Header with expand toggle */}
                      <div
                        className="cursor-pointer"
                        onClick={() => toggleExpand(pitch.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-zinc-900 truncate">
                              📍 {pitch.address || pitch.name || 'Untitled'}
                            </div>
                            <div className="text-sm text-zinc-500">
                              Reviewed by {pitch.reviewedBy || 'Admin'} • {new Date(pitch.reviewedAt || pitch.createdAt).toLocaleDateString()}
                            </div>
                            {pitch.status === 'rejected' && pitch.rejectionNotes && (
                              <div className="text-sm text-red-600 mt-1">
                                Reason: {pitch.rejectionNotes}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "px-2 py-1 text-xs font-semibold rounded-full shrink-0",
                                pitch.status === 'approved'
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                              )}
                            >
                              {pitch.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                            </span>
                            <button className="p-1 text-zinc-400 hover:text-zinc-600">
                              {expandedId === pitch.id ? (
                                <ChevronUp className="w-5 h-5" />
                              ) : (
                                <ChevronDown className="w-5 h-5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {expandedId === pitch.id && (
                        <>
                          <SubmissionDetails pitch={pitch} />
                          <div className="mt-3 pt-3 border-t border-zinc-200">
                            <Button
                              onClick={() => downloadPitchAsPdf(pitch)}
                              variant="outline"
                              className="border-zinc-300 text-zinc-600 hover:bg-zinc-50"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download PDF
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-3">
            {usersError && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                {usersError}
              </div>
            )}

            {users.length === 0 ? (
              <div className="bg-white rounded-lg border border-zinc-200 px-4 py-8 text-center text-zinc-500">
                No users yet. Users appear here after signing in via OAuth.
              </div>
            ) : (
              users.map((user) => (
                <div
                  key={user.id}
                  className="bg-white rounded-lg border border-zinc-200 p-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* User info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-zinc-900 truncate">
                        {user.display_name || 'No name'}
                      </div>
                      <div className="text-sm text-zinc-500 truncate">
                        {user.email || 'No email'}
                      </div>
                    </div>

                    {/* Role selector */}
                    <div className="flex items-center gap-3">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className="h-11 px-3 text-sm border border-zinc-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>

                      {/* Active toggle */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Active</span>
                        <Switch
                          checked={user.is_active}
                          onCheckedChange={() => handleToggleActive(user.id, user.is_active)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Export with error boundary wrapper
export default function AdminPage() {
  return (
    <AdminErrorBoundary>
      <AdminContent />
    </AdminErrorBoundary>
  );
}
