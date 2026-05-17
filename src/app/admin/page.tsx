"use client";

import { useState, useEffect, Component, ErrorInfo, ReactNode, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Users, FileText, Check, X, ChevronDown, ChevronUp, ChevronRight, Download, RefreshCw, Coffee, UtensilsCrossed, Plus, Filter, SlidersHorizontal, Info, Search } from 'lucide-react';
import { useUserProfiles } from '@/hooks/useUserProfiles';
import { useAdminSubmissions, AdminPitch } from '@/hooks/useAdminSubmissions';
import { useCafeProfiles, CafeProfile, CafeCategory, CATEGORY_LABELS } from '@/hooks/useCafeProfiles';
import { useTeams } from '@/hooks/useTeams';
import { apiFetch } from '@/lib/api-client';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  propertyTypeLabels,
  conditionLabels,
  visibilityLabels,
  accessLabels,
} from '@/types/scouting';
import { parseCompetitors } from '@/components/NearbyCompetitors';
import { useScoutingDefaults, type ScoutingDefaults, type CurrencyCode, type MarketDefaults, MARKET_LABELS } from '@/hooks/useScoutingDefaults';
import { Input } from '@/components/ui/input';

type Tab = 'submissions' | 'users' | 'settings' | 'cafe-profiles';

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

function formatCurrency(value?: number): string {
  if (value === undefined || value === null) return '—';
  return `€${value.toLocaleString()}`;
}

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
        ${pitch.nearbyCompetitors ? `<div class="notes"><strong>Competitors:</strong> ${parseCompetitors(pitch.nearbyCompetitors).map(e => e.name + (e.distance != null ? ` (${Math.round(e.distance)}m)` : '')).join(', ')}</div>` : ''}
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
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}

function SubmissionDetails({ pitch }: { pitch: AdminPitch }) {
  const checkedCount = pitch.checklist?.filter(c => c.isChecked).length || 0;
  const totalChecklist = pitch.checklist?.length || 0;

  return (
    <div className="mt-3 pt-3 border-t border-zinc-100 space-y-3 text-sm">
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
      {pitch.nearbyCompetitors && (() => {
        const entries = parseCompetitors(pitch.nearbyCompetitors);
        if (entries.length === 0) return null;
        return (
          <div>
            <span className="text-zinc-500">Competitors:</span>{' '}
            <span className="text-zinc-900">
              {entries.map(e => e.name + (e.distance != null ? ` (${Math.round(e.distance)}m)` : '')).join(', ')}
            </span>
          </div>
        );
      })()}
    </div>
  );
}

// Category badge colors
const CATEGORY_COLORS: Record<CafeCategory, string> = {
  to_go_mini: 'bg-blue-100 text-blue-700',
  core: 'bg-amber-100 text-amber-700',
  flagship: 'bg-purple-100 text-purple-700',
};

// City display labels
const CITY_LABELS: Record<string, string> = {
  madrid: 'Madrid',
  barcelona: 'Barcelona',
  prague: 'Prague',
};

// Inline edit form for a cafe profile
function CafeProfileForm({
  cafe,
  canSeeRevenue,
  onSave,
}: {
  cafe: CafeProfile;
  canSeeRevenue: boolean;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [category, setCategory] = useState<CafeCategory>(cafe.category || 'core');
  const [interiorSeats, setInteriorSeats] = useState(cafe.interiorSeats?.toString() ?? '');
  const [exteriorSeats, setExteriorSeats] = useState(cafe.exteriorSeats?.toString() ?? '');
  const [areaSqm, setAreaSqm] = useState(cafe.areaSqm?.toString() ?? '');
  const [monthlyRevenue, setMonthlyRevenue] = useState(cafe.monthlyRevenue?.toString() ?? '');
  const [hasKitchen, setHasKitchen] = useState(cafe.hasKitchen ?? false);
  const [notes, setNotes] = useState(cafe.notes ?? '');
  const [saving, setSaving] = useState(false);

  const toNum = (v: string) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        placeId: cafe.placeId,
        category,
        interiorSeats: toNum(interiorSeats),
        exteriorSeats: toNum(exteriorSeats),
        areaSqm: areaSqm ? parseFloat(areaSqm) : null,
        monthlyRevenue: monthlyRevenue ? parseFloat(monthlyRevenue) : null,
        hasKitchen,
        notes: notes || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-zinc-100 space-y-4 text-sm">
      {/* Category */}
      <div>
        <label className="block text-zinc-500 mb-1">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as CafeCategory)}
          className="h-11 w-full px-3 border border-zinc-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          {(Object.keys(CATEGORY_LABELS) as CafeCategory[]).map((cat) => (
            <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
          ))}
        </select>
      </div>

      {/* Seating */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-zinc-500 mb-1">Interior seats</label>
          <input
            type="number"
            min={0}
            value={interiorSeats}
            onChange={(e) => setInteriorSeats(e.target.value)}
            className="h-11 w-full px-3 border border-zinc-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
        </div>
        <div>
          <label className="block text-zinc-500 mb-1">Exterior seats</label>
          <input
            type="number"
            min={0}
            value={exteriorSeats}
            onChange={(e) => setExteriorSeats(e.target.value)}
            className="h-11 w-full px-3 border border-zinc-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
        </div>
      </div>

      {/* Area + Kitchen */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-zinc-500 mb-1">Area (sqm)</label>
          <input
            type="number"
            min={0}
            value={areaSqm}
            onChange={(e) => setAreaSqm(e.target.value)}
            className="h-11 w-full px-3 border border-zinc-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
        </div>
        <div>
          <label className="block text-zinc-500 mb-1">Kitchen</label>
          <div className="h-11 flex items-center gap-2">
            <Switch
              checked={hasKitchen}
              onCheckedChange={setHasKitchen}
            />
            <span className="text-zinc-700">{hasKitchen ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </div>

      {/* Revenue (finance roles only) */}
      {canSeeRevenue && (
        <div>
          <label className="block text-zinc-500 mb-1">Monthly revenue (EUR, before admin fees)</label>
          <input
            type="number"
            min={0}
            value={monthlyRevenue}
            onChange={(e) => setMonthlyRevenue(e.target.value)}
            className="h-11 w-full px-3 border border-zinc-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-zinc-500 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
          className="w-full h-20 px-3 py-2 border border-zinc-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
      </div>

      {/* Save */}
      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-zinc-900 hover:bg-zinc-800 text-white h-12"
      >
        {saving ? 'Saving...' : 'Save'}
      </Button>
    </div>
  );
}

interface AddressSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

function AddCafeForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [selectedAddress, setSelectedAddress] = useState<{ display: string; lat: number; lon: number } | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cityId, setCityId] = useState('madrid');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchAddress = React.useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 3) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
          { headers: { 'User-Agent': 'MinersLocationScout/1.0' } }
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
          setShowSuggestions(data.length > 0);
        }
      } catch { /* ignore */ }
    }, 400);
  }, []);

  const handleSelectAddress = (s: AddressSuggestion) => {
    const parts = s.display_name.split(',').map(p => p.trim());
    const shortAddress = parts.slice(0, 3).join(', ');
    setAddressQuery(shortAddress);
    setSelectedAddress({ display: shortAddress, lat: parseFloat(s.lat), lon: parseFloat(s.lon) });
    setShowSuggestions(false);
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!selectedAddress) { setError('Select an address from the suggestions'); return; }
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/db/cafe-profiles', {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          address: selectedAddress.display,
          cityId,
          latitude: selectedAddress.lat,
          longitude: selectedAddress.lon,
        }),
      });
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add cafe');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl p-4 space-y-3 border border-zinc-200">
      <div className="text-sm font-semibold text-zinc-900">Add New Miners Cafe</div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Miners ..."
            className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>
        <div className="relative">
          <label className="block text-xs font-medium text-zinc-500 mb-1">Address</label>
          <input
            type="text"
            value={addressQuery}
            onChange={(e) => {
              setAddressQuery(e.target.value);
              setSelectedAddress(null);
              searchAddress(e.target.value);
            }}
            placeholder="Start typing an address..."
            className={cn(
              "w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10",
              selectedAddress ? "border-green-300 bg-green-50/50" : "border-zinc-200"
            )}
          />
          {selectedAddress && (
            <span className="absolute right-3 top-[calc(50%+8px)] -translate-y-1/2 text-green-500">
              <Check className="w-4 h-4" />
            </span>
          )}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {suggestions.map((s, i) => {
                const parts = s.display_name.split(',').map(p => p.trim());
                return (
                  <button
                    key={i}
                    onClick={() => handleSelectAddress(s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 border-b border-zinc-50 last:border-0"
                  >
                    <div className="font-medium text-zinc-900 truncate">{parts.slice(0, 2).join(', ')}</div>
                    <div className="text-xs text-zinc-500 truncate">{parts.slice(2).join(', ')}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">City</label>
          <select
            value={cityId}
            onChange={(e) => setCityId(e.target.value)}
            className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          >
            {Object.entries(CITY_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          onClick={handleSubmit}
          disabled={saving || !selectedAddress}
          className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white h-10"
        >
          {saving ? 'Adding...' : 'Add Cafe'}
        </Button>
        <Button
          onClick={onCancel}
          variant="outline"
          className="h-10"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function AddUserForm({ onSave, onCancel, teams }: {
  onSave: () => void;
  onCancel: () => void;
  teams: { id: string; name: string }[];
}) {
  const { addUser } = useUserProfiles();
  const { createTeam } = useTeams(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('franchisee');
  const [cityIds, setCityIds] = useState<string[]>(['madrid', 'barcelona', 'prague']);
  const [teamId, setTeamId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);

  const toggleCity = (id: string) => {
    setCityIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    try {
      const team = await createTeam(newTeamName.trim());
      if (team) {
        setTeamId(team.id);
        setNewTeamName('');
        setShowNewTeam(false);
      }
    } catch {
      setError('Failed to create team');
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleSubmit = async () => {
    if (!email.trim()) { setError('Email is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Please enter a valid email address'); return; }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await addUser({
        display_name: displayName.trim() || undefined,
        email: email.trim(),
        role,
        city_ids: cityIds,
        team_id: teamId || null,
      });
      setSuccess(`Profile created for ${email.trim()}. Settings apply when they sign in with Google.`);
      setTimeout(() => onSave(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl p-4 space-y-4 border border-zinc-200">
      <div className="text-sm font-semibold text-zinc-900">Add New User</div>

      {error && <div className="text-xs text-red-600">{error}</div>}
      {success && <div className="text-xs text-green-600">{success}</div>}

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Full name"
            className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">Email *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">Team</label>
          {!showNewTeam ? (
            <div className="flex gap-2">
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="flex-1 px-3 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              >
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
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
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-2">Cities</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CITY_LABELS).map(([id, label]) => {
              const selected = cityIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleCity(id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                    selected
                      ? "bg-green-100 text-green-700 ring-1 ring-green-300"
                      : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                  )}
                >
                  {selected && <Check className="w-3.5 h-3.5" />}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          onClick={handleSubmit}
          disabled={saving || !email.trim() || !!success}
          className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white h-10"
        >
          {saving ? 'Adding...' : 'Add User'}
        </Button>
        <Button onClick={onCancel} variant="outline" className="h-10">
          Cancel
        </Button>
      </div>
    </div>
  );
}

function AdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'submissions';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [cafesCityFilter, setCafesCityFilter] = useState<string>('all');
  const [showAddCafe, setShowAddCafe] = useState(false);

  // Users tab state
  const [usersSearch, setUsersSearch] = useState('');
  const [usersCityFilter, setUsersCityFilter] = useState<string>('all');
  const [showAddUser, setShowAddUser] = useState(false);

  const {
    users,
    currentUserRole,
    isAdmin,
    canAccessDashboard,
    canReviewSubmissions,
    canSeeRevenue,
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

  // Cafe profiles hook
  const {
    cafes: cafeProfiles,
    loading: cafesLoading,
    error: cafesError,
    saveProfile: saveCafeProfile,
    refetch: refetchCafes,
  } = useCafeProfiles(activeTab === 'cafe-profiles');

  // Teams hook (fetch when users tab is active)
  const { teams } = useTeams(activeTab === 'users');

  // Sync tab to URL
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());
  };

  // Auth check - redirect users without dashboard access
  useEffect(() => {
    if (!usersLoading && currentUserRole && !canAccessDashboard) {
      router.replace('/');
    }
  }, [usersLoading, currentUserRole, canAccessDashboard, router]);

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
    try {
      await apiFetch('/api/db/pitches', {
        method: 'PATCH',
        body: JSON.stringify({
          id: pitchId,
          status: 'approved',
          reviewed_by: 'Admin',
          final_reviewed_at: new Date().toISOString(),
        }),
      });
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
    try {
      await apiFetch('/api/db/pitches', {
        method: 'PATCH',
        body: JSON.stringify({
          id: pitchId,
          status: 'rejected',
          rejection_notes: rejectNotes,
          reviewed_by: 'Admin',
          final_reviewed_at: new Date().toISOString(),
        }),
      });
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

  // Not authenticated — show sign-in prompt
  if (!currentUserRole) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg border border-zinc-200 p-6 max-w-sm w-full text-center">
          <h2 className="text-lg font-bold text-zinc-900 mb-2">Admin Access</h2>
          <p className="text-sm text-zinc-600 mb-4">
            Please sign in with an admin account to access this page.
          </p>
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Go to App
          </button>
        </div>
      </div>
    );
  }

  // No dashboard access - will redirect
  if (!canAccessDashboard) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-zinc-500">Redirecting...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10" style={{ paddingTop: "calc(12px + env(safe-area-inset-top, 0px))" }}>
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

      {/* Tabs */}
      <div className="bg-white overflow-x-auto scrollbar-hide">
        <div className="max-w-4xl mx-auto px-4 flex gap-1 min-w-max">
          <button
            onClick={() => handleTabChange('submissions')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === 'submissions'
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            )}
          >
            <FileText className="w-4 h-4" />
            Pitches
            {pendingSubmissions.length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {pendingSubmissions.length}
              </span>
            )}
          </button>
          <button
            onClick={() => handleTabChange('cafe-profiles')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === 'cafe-profiles'
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            )}
          >
            <Coffee className="w-4 h-4" />
            Cafes
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => handleTabChange('settings')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  activeTab === 'settings'
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-500 hover:text-zinc-700"
                )}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Inputs
              </button>
              <button
                onClick={() => handleTabChange('users')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  activeTab === 'users'
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-500 hover:text-zinc-700"
                )}
              >
                <Users className="w-4 h-4" />
                Users
              </button>
            </>
          )}
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
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                Awaiting Review ({pendingSubmissions.length})
              </h2>
              {pendingSubmissions.length === 0 ? (
                <div className="bg-white rounded-xl px-4 py-8 text-center text-zinc-400 text-sm">
                  No pending submissions
                </div>
              ) : (
                <div className="bg-white rounded-xl divide-y divide-zinc-100">
                  {pendingSubmissions.map((pitch) => (
                    <div
                      key={pitch.id}
                      className="p-4"
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

                        {/* Reject dialog (reviewers only) */}
                        {canReviewSubmissions && rejectingId === pitch.id && (
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
                        )}

                        {/* Action buttons */}
                        {!(canReviewSubmissions && rejectingId === pitch.id) && (
                          <div className="flex flex-col sm:flex-row gap-2">
                            {canReviewSubmissions && (
                              <>
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
                              </>
                            )}
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
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                Processed ({processedSubmissions.length})
              </h2>
              {processedSubmissions.length === 0 ? (
                <div className="bg-white rounded-xl px-4 py-8 text-center text-zinc-400 text-sm">
                  No processed submissions yet
                </div>
              ) : (
                <div className="bg-white rounded-xl divide-y divide-zinc-100">
                  {processedSubmissions.map((pitch) => (
                    <div
                      key={pitch.id}
                      className="p-4"
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
                          <div className="mt-3 pt-3 border-t border-zinc-100">
                            <Button
                              onClick={() => downloadPitchAsPdf(pitch)}
                              variant="outline"
                              className="border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              PDF
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

        {activeTab === 'cafe-profiles' && (
          <div className="space-y-4">
            {cafesError && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                {cafesError}
              </div>
            )}

            {/* Toolbar: city filter + add cafe */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <select
                  value={cafesCityFilter}
                  onChange={(e) => setCafesCityFilter(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-lg text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                >
                  <option value="all">All cities ({cafeProfiles.length})</option>
                  {Object.entries(CITY_LABELS).map(([id, label]) => {
                    const count = cafeProfiles.filter(c => c.cityId === id).length;
                    if (count === 0) return null;
                    return (
                      <option key={id} value={id}>{label} ({count})</option>
                    );
                  })}
                </select>
              </div>
              <button
                onClick={() => setShowAddCafe(!showAddCafe)}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Add Cafe
              </button>
            </div>

            {/* Add Cafe form */}
            {showAddCafe && (
              <AddCafeForm
                onSave={async () => {
                  setShowAddCafe(false);
                  await refetchCafes();
                }}
                onCancel={() => setShowAddCafe(false)}
              />
            )}

            {cafesLoading && (
              <div className="text-center py-8 text-zinc-500">Loading cafe profiles...</div>
            )}

            {!cafesLoading && !showAddCafe && cafeProfiles.length === 0 && (
              <div className="bg-white rounded-xl px-4 py-8 text-center text-zinc-400 text-sm">
                No Miners cafes found
              </div>
            )}

            {/* Cafe list - grouped by city when showing all, flat when filtered */}
            {!cafesLoading && !showAddCafe && (() => {
              const filtered = cafesCityFilter === 'all'
                ? cafeProfiles
                : cafeProfiles.filter(c => c.cityId === cafesCityFilter);

              const grouped = filtered.reduce<Record<string, CafeProfile[]>>((acc, cafe) => {
                const city = cafe.cityId || 'unknown';
                if (!acc[city]) acc[city] = [];
                acc[city].push(cafe);
                return acc;
              }, {});

              return Object.entries(grouped).map(([cityId, cityCafes]) => (
                <section key={cityId}>
                  {cafesCityFilter === 'all' && (
                    <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                      {CITY_LABELS[cityId] || cityId} ({cityCafes.length})
                    </h2>
                  )}
                  <div className="bg-white rounded-xl divide-y divide-zinc-100">
                    {cityCafes.map((cafe) => (
                      <div
                        key={cafe.placeId}
                        className="p-4"
                      >
                        <div
                          className="cursor-pointer"
                          onClick={() => setExpandedId(expandedId === cafe.placeId ? null : cafe.placeId)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-zinc-900 truncate">
                                {cafe.name}
                              </div>
                              <div className="text-sm text-zinc-500 truncate">
                                {cafe.address}
                              </div>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {cafe.category && (
                                  <span className={cn(
                                    "px-2 py-0.5 text-xs font-semibold rounded-full",
                                    CATEGORY_COLORS[cafe.category]
                                  )}>
                                    {CATEGORY_LABELS[cafe.category]}
                                  </span>
                                )}
                                {(cafe.interiorSeats || cafe.exteriorSeats) ? (
                                  <span className="text-xs text-zinc-500">
                                    {(cafe.interiorSeats || 0) + (cafe.exteriorSeats || 0)} seats
                                  </span>
                                ) : null}
                                {cafe.areaSqm ? (
                                  <span className="text-xs text-zinc-500">{cafe.areaSqm} sqm</span>
                                ) : null}
                                {cafe.hasKitchen && (
                                  <span className="text-xs text-zinc-500 flex items-center gap-0.5">
                                    <UtensilsCrossed className="w-3 h-3" /> Kitchen
                                  </span>
                                )}
                                {canSeeRevenue && cafe.monthlyRevenue ? (
                                  <span className="text-xs text-green-600 font-medium">
                                    €{cafe.monthlyRevenue.toLocaleString()}/mo
                                  </span>
                                ) : null}
                                {!cafe.category && (
                                  <span className="text-xs text-zinc-400 italic">No profile yet</span>
                                )}
                              </div>
                            </div>
                            <button className="p-1 text-zinc-400 hover:text-zinc-600 ml-2">
                              {expandedId === cafe.placeId ? (
                                <ChevronUp className="w-5 h-5" />
                              ) : (
                                <ChevronDown className="w-5 h-5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {expandedId === cafe.placeId && (
                          <CafeProfileForm
                            cafe={cafe}
                            canSeeRevenue={canSeeRevenue}
                            onSave={async (data) => {
                              setActionError(null);
                              try {
                                await saveCafeProfile(data as Parameters<typeof saveCafeProfile>[0]);
                              } catch {
                                setActionError('Failed to save cafe profile');
                              }
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ));
            })()}
          </div>
        )}

        {activeTab === 'users' && isAdmin && (() => {
          const searchLower = usersSearch.toLowerCase();
          const filteredUsers = users.filter(user => {
            if (!searchLower) return true;
            return (user.display_name || '').toLowerCase().includes(searchLower) ||
              (user.email || '').toLowerCase().includes(searchLower);
          });

          return (
            <div className="space-y-4">
              {usersError && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {usersError}
                </div>
              )}

              {/* Toolbar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    value={usersSearch}
                    onChange={(e) => setUsersSearch(e.target.value)}
                    placeholder="Search users..."
                    className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                  />
                </div>
                <button
                  onClick={() => setShowAddUser(!showAddUser)}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Add User
                </button>
              </div>

              {/* Add User form */}
              {showAddUser && (
                <AddUserForm
                  teams={teams}
                  onSave={async () => {
                    setShowAddUser(false);
                    // Users list auto-updates via addUser in hook
                  }}
                  onCancel={() => setShowAddUser(false)}
                />
              )}

              {/* User list */}
              {!showAddUser && filteredUsers.length === 0 ? (
                <div className="bg-white rounded-xl px-4 py-8 text-center text-zinc-400 text-sm">
                  {usersSearch ? 'No users match your search' : 'No users yet'}
                </div>
              ) : !showAddUser && (
                <div className="bg-white rounded-xl divide-y divide-zinc-100">
                  {filteredUsers.map((user) => {
                    const teamName = teams.find(t => t.id === user.team_id)?.name;
                    return (
                      <div
                        key={user.id}
                        className="p-4 cursor-pointer hover:bg-zinc-50 transition-colors"
                        onClick={() => router.push(`/admin/users/${user.id}`)}
                      >
                        <div className="flex items-center gap-3">
                          {/* Active indicator */}
                          <div className={cn(
                            "w-2 h-2 rounded-full shrink-0",
                            user.is_active ? "bg-green-500" : "bg-zinc-300"
                          )} />
                          {/* User info */}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-zinc-900 truncate">
                              {user.display_name || 'No name'}
                            </div>
                            <div className="text-sm text-zinc-500 truncate">
                              {user.email || 'No email'}
                            </div>
                          </div>
                          {/* Role badge + team */}
                          <div className="flex items-center gap-2 shrink-0">
                            {teamName && (
                              <span className="hidden sm:inline px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                                {teamName}
                              </span>
                            )}
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-zinc-100 text-zinc-600">
                              {ROLE_LABELS[user.role] || user.role}
                            </span>
                            <ChevronRight className="w-4 h-4 text-zinc-400" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
        {activeTab === 'settings' && isAdmin && (
          <ScoutingSettingsPanel />
        )}
      </main>
    </div>
  );
}

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = { EUR: '€', CZK: 'Kč', PLN: 'zł' };

const SCOUTING_FIELDS: { key: keyof MarketDefaults; label: string; tooltip: string; step: string; isMoney?: boolean }[] = [
  { key: 'conversionRate', label: 'Conversion (%)', tooltip: 'Percentage of daily foot traffic that becomes paying customers', step: '0.1' },
  { key: 'avgTicket', label: 'Avg Ticket', tooltip: 'Average spend per customer in local currency', step: '0.10', isMoney: true },
  { key: 'fitoutCost', label: 'Fit-out', tooltip: 'Typical build-out cost for a new location in this market', step: '1000', isMoney: true },
  { key: 'avgFootfall', label: 'Footfall', tooltip: 'Estimated daily foot traffic past an average location', step: '10' },
];

function ScoutingSettingsPanel() {
  const { defaults, isLoading, updateDefaults } = useScoutingDefaults();
  const [form, setForm] = useState<ScoutingDefaults>(defaults);
  const [activeMarket, setActiveMarket] = useState<CurrencyCode>('EUR');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isLoading) setForm(defaults);
  }, [defaults, isLoading]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateDefaults(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save defaults:", err);
    } finally {
      setSaving(false);
    }
  };

  const current = form[activeMarket];
  const updateField = (field: keyof MarketDefaults, value: number) => {
    setForm({ ...form, [activeMarket]: { ...current, [field]: value } });
  };

  return (
    <div className="max-w-4xl mx-auto mt-6 px-4">
      <div className="max-w-lg">
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-5">
          <div className="flex rounded-lg bg-zinc-100 p-1">
            {(Object.keys(MARKET_LABELS) as CurrencyCode[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setActiveMarket(code)}
                className={cn(
                  "flex-1 text-sm font-medium py-2 rounded-[7px] transition-all",
                  activeMarket === code
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700"
                )}
              >
                {MARKET_LABELS[code]}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {SCOUTING_FIELDS.map(({ key, label, tooltip, step, isMoney }) => (
              <div key={key} className="space-y-1">
                <label className="text-sm font-medium text-zinc-700 flex items-center gap-1.5">
                  {label}
                  <button
                    type="button"
                    className="info-tip relative text-zinc-400 hover:text-zinc-600"
                    onClick={(e) => {
                      const tip = e.currentTarget.querySelector('.badge-tooltip');
                      if (tip) tip.classList.toggle('visible');
                    }}
                    onBlur={(e) => {
                      const tip = e.currentTarget.querySelector('.badge-tooltip');
                      if (tip) tip.classList.remove('visible');
                    }}
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span className="badge-tooltip badge-tooltip-lg" style={{ whiteSpace: 'normal', width: 200, left: '50%', transform: 'translateX(-50%)' }}>{tooltip}</span>
                  </button>
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    step={step}
                    value={current[key]}
                    onChange={(e) => updateField(key, parseFloat(e.target.value) || 0)}
                    className={isMoney ? "pr-10" : ""}
                  />
                  {isMoney && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400 pointer-events-none">
                      {CURRENCY_SYMBOLS[activeMarket]}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            {saved && <span className="text-sm text-green-600">Saved</span>}
            <Button onClick={handleSave} disabled={saving} className="h-11 px-10">
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AdminErrorBoundary>
      <Suspense fallback={
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
          <div className="text-zinc-500">Loading...</div>
        </div>
      }>
        <AdminContent />
      </Suspense>
    </AdminErrorBoundary>
  );
}
