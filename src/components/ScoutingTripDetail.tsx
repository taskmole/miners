"use client";

import React, { useState } from "react";
import {
  X,
  MapPin,
  Calendar,
  User,
  FileText,
  Building2,
  DollarSign,
  Settings,
  AlertTriangle,
  ChevronDown,
  Clock,
  Check,
  XCircle,
  FileDown,
  Download,
  MessageSquare,
  ClipboardCheck,
  Paperclip,
  Building,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useMobile } from "@/hooks/useMobile";
import { useScoutingTrips } from "@/hooks/useScoutingTrips";
import { usePoiComments } from "@/hooks/usePoiComments";
import { ToastProvider, useToast } from "@/contexts/ToastContext";
import { formatRelativeTime } from "@/types/comments";
import { statusLabels, statusColors, outdoorSeatingLabels, conditionLabels, visibilityLabels, accessLabels } from "@/types/scouting";
import type { OutdoorSeatingType, ConditionStatus, VisibilityLevel, AccessLevel, CompetitorEntry } from "@/types/scouting";
import { parseCompetitors } from "@/components/NearbyCompetitors";
import { TripChecklist } from "@/components/TripChecklist";
import { AttachmentGallery } from "@/components/attachments";
import { generateTripPdf } from "@/components/TripPdfExport";
import { generateTripDocx } from "@/components/TripDocxExport";
import type { ScoutingTrip, ScoutingTripStatus } from "@/types/scouting";

interface ScoutingTripDetailProps {
  tripId: string;
  onClose: () => void;
  onEdit?: (trip: ScoutingTrip) => void;
}

// Format date for display
function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Format currency
function formatCurrency(amount?: number): string {
  if (amount === undefined || amount === null) return "—";
  return `€${amount.toLocaleString()}`;
}

// Collapsible section component (accordion style - only one open at a time)
function DetailSection({
  id,
  title,
  icon: Icon,
  children,
  expandedSection,
  onToggle,
}: {
  id: string;
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  expandedSection: string | null;
  onToggle: (id: string) => void;
}) {
  const isExpanded = expandedSection === id;

  return (
    <div className="border-t border-zinc-200">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-6 py-3 hover:bg-zinc-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-zinc-500" />
          <span className="text-sm font-medium text-zinc-900">{title}</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-zinc-400 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>
      {isExpanded && <div className="px-6 pb-4">{children}</div>}
    </div>
  );
}

// Detail row component
function DetailRow({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex justify-between py-1.5 ${className || ""}`}>
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs text-zinc-900 font-medium">{value}</span>
    </div>
  );
}

// Status badge component
function StatusBadge({ status }: { status: ScoutingTripStatus }) {
  const label = statusLabels[status];
  const colors = statusColors[status];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors}`}
    >
      {status === "approved" && <Check className="w-3 h-3" />}
      {status === "rejected" && <XCircle className="w-3 h-3" />}
      {status === "submitted" && <Clock className="w-3 h-3" />}
      {label}
    </span>
  );
}

// Inline comments section for trips (no nested expand)
function TripCommentsSection({ tripId }: { tripId: string }) {
  const { getComments, addComment, removeComment } = usePoiComments();
  const { showToast } = useToast();
  const [newComment, setNewComment] = React.useState("");

  const placeId = `pitch-${tripId}`;
  const comments = getComments(placeId);

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    addComment(placeId, newComment);
    setNewComment("");
    showToast("Comment added");
  };

  const handleDeleteComment = (commentId: string) => {
    removeComment(placeId, commentId);
    showToast("Comment deleted");
  };

  return (
    <div className="space-y-3">
      {/* Comments list */}
      {comments.length > 0 ? (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {[...comments].reverse().map((comment) => (
            <div
              key={comment.id}
              className="bg-zinc-50 rounded-lg p-3 group relative"
            >
              <p className="text-xs text-zinc-700 leading-relaxed pr-6">
                {comment.content}
              </p>
              <div className="text-[10px] text-zinc-400 mt-1.5">
                <span className="font-medium">{comment.authorName}</span>
                <span className="mx-1">·</span>
                <span>{formatRelativeTime(comment.createdAt)}</span>
              </div>
              <button
                onClick={() => handleDeleteComment(comment.id)}
                className="absolute top-2.5 right-2.5 p-1 rounded hover:bg-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete comment"
              >
                <Trash2 className="w-3 h-3 text-zinc-400 hover:text-red-500" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-400">No comments yet</p>
      )}

      {/* Add comment input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newComment.trim()) {
              e.preventDefault();
              handleAddComment();
            }
          }}
          placeholder="Add a comment..."
          className="flex-1 text-xs px-3 py-2 rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
        />
        <Button
          size="sm"
          onClick={handleAddComment}
          disabled={!newComment.trim()}
          className="h-8 px-3 text-xs"
        >
          Add
        </Button>
      </div>
    </div>
  );
}

// Linked item chip
function LinkedItemChip({
  name,
  onNavigate,
}: {
  name: string;
  onNavigate?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onNavigate}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-md text-xs transition-colors"
    >
      <MapPin className="w-3 h-3 text-zinc-500" />
      <span className="text-zinc-700 max-w-[150px] truncate">{name}</span>
    </button>
  );
}

export function ScoutingTripDetail({
  tripId,
  onClose,
  onEdit,
}: ScoutingTripDetailProps) {
  const isMobile = useMobile();
  const { getTrips, deleteTrip, updateChecklist, getTripAssessment } = useScoutingTrips();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const trips = getTrips();
  const trip = trips.find((t) => t.id === tripId);
  const assessment = trip ? getTripAssessment(trip.id) : undefined;

  // Accordion state - only one section expanded at a time
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const handleSectionToggle = (sectionId: string) => {
    setExpandedSection(prev => prev === sectionId ? null : sectionId);
  };

  // Handle delete confirmation
  const handleConfirmDelete = () => {
    if (!trip) return;
    deleteTrip(trip.id);
    setShowDeleteConfirm(false);
    onClose();
  };

  if (!trip) {
    return (
      <ToastProvider>
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="relative bg-white rounded-2xl p-6 text-center">
            <p className="text-zinc-600">Trip not found</p>
            <Button onClick={onClose} className="mt-4">
              Close
            </Button>
          </div>
        </div>
      </ToastProvider>
    );
  }

  // Handle download of uploaded document
  const handleDownloadDocument = () => {
    if (!trip.uploadedDocument) return;
    const link = document.createElement("a");
    link.href = trip.uploadedDocument.data;
    link.download = trip.uploadedDocument.name;
    link.click();
  };

  // Handle navigation to a linked item
  const handleNavigateToLinkedItem = (linkedItem: { id: string; type: string; name: string; data?: any }) => {
    // Close the detail modal first
    onClose();

    // For POIs (type 'place'), parse coordinates from the ID
    // Format: "type-lat-lon" where lon can be negative (e.g., "cafe-40.4168--3.7038")
    if (linkedItem.type === 'place') {
      // Use regex to extract coordinates - handles negative numbers correctly
      // Match: type-<number>-<number> where numbers can be negative
      const match = linkedItem.id.match(/^([a-z_]+)-(-?\d+\.?\d*)-(-?\d+\.?\d*)$/i);

      if (match) {
        const placeType = match[1];
        const lat = parseFloat(match[2]);
        const lon = parseFloat(match[3]);

        if (!isNaN(lat) && !isNaN(lon)) {
          // Dispatch with POI data for fast popup (avoids O(n) search)
          window.dispatchEvent(
            new CustomEvent("navigate-and-open-popup", {
              detail: {
                lat,
                lon,
                placeId: linkedItem.id,
                placeType,
                data: linkedItem.data, // Pass full POI data if available
              },
            })
          );
        }
      }
    } else {
      // For drawn areas, select the shape
      window.dispatchEvent(
        new CustomEvent("select-drawn-shape", {
          detail: { shapeId: linkedItem.id },
        })
      );
    }
  };

  const hasLocationData =
    trip.address ||
    trip.areaSqm ||
    trip.storageSqm ||
    trip.propertyType ||
    trip.footfallEstimate ||
    trip.neighbourhoodProfile ||
    trip.nearbyCompetitors;

  const hasFinancialData =
    trip.monthlyRent ||
    trip.serviceFees ||
    trip.deposit ||
    trip.fitoutCost ||
    trip.openingInvestment ||
    trip.expectedDailyRevenue ||
    trip.monthlyRevenueRange ||
    trip.paybackMonths;

  const hasOperationalData =
    trip.ventilation ||
    trip.waterWaste ||
    trip.powerCapacity ||
    trip.visibility ||
    trip.deliveryAccess ||
    trip.seatingCapacity ||
    trip.outdoorSeating !== undefined ||
    trip.flatSurface !== undefined;

  return (
    <ToastProvider>
      {/* Main detail modal - hidden when delete confirmation is shown */}
      {!showDeleteConfirm && (
      <div className={`fixed inset-0 z-[100] flex ${isMobile ? 'items-end' : 'items-center justify-center'}`}>
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal - full height from bottom on mobile, centered on desktop */}
        <div className={`relative w-full bg-white shadow-2xl overflow-hidden flex flex-col ${
          isMobile
            ? 'max-h-[90vh] rounded-t-2xl'
            : 'max-w-lg mx-4 rounded-2xl max-h-[90vh]'
        }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-white" style={isMobile ? { paddingTop: "calc(16px + env(safe-area-inset-top, 0px))" } : undefined}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-zinc-900 truncate">
                {trip.name}
              </h2>
              <StatusBadge status={trip.status} />
            </div>
            {trip.address && (
              <p className="text-sm text-zinc-500 truncate">{trip.address}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 transition-colors flex-shrink-0 ml-2"
          >
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Meta info */}
          <div className="px-6 py-4 bg-zinc-50 border-b border-zinc-200">
            <div className="flex items-center gap-4 text-xs text-zinc-500">
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                <span>{trip.authorName}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Created {formatDate(trip.createdAt)}</span>
              </div>
              {trip.submittedAt && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Submitted {formatDate(trip.submittedAt)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Uploaded document (if any) */}
          {trip.uploadedDocument && (
            <div className="px-6 py-4 border-b border-zinc-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {trip.uploadedDocument.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {(trip.uploadedDocument.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadDocument}
                  className="gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </Button>
              </div>
            </div>
          )}

          {/* Trip Assessment */}
          {assessment && assessment.scoredPillarCount >= 2 && assessment.compositeScore != null && (
            <div className="px-6 py-4 border-b border-zinc-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-900">Trip Assessment</span>
                  <span className="text-[10px] text-zinc-400 border border-zinc-200 rounded px-1.5 py-0.5">Experimental</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  assessment.confidence === 'high' ? 'bg-green-100 text-green-700' :
                  assessment.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                  'bg-zinc-100 text-zinc-600'
                }`}>
                  {assessment.confidence} confidence
                </span>
              </div>

              <div className="flex items-baseline gap-2 mb-3">
                <span className={`text-2xl font-bold ${
                  assessment.compositeScore >= 4 ? 'text-green-600' :
                  assessment.compositeScore >= 3 ? 'text-amber-600' :
                  assessment.compositeScore >= 2 ? 'text-zinc-600' :
                  'text-red-600'
                }`}>
                  {assessment.compositeScore.toFixed(1)}
                </span>
                <span className="text-sm text-zinc-400">/ 5</span>
                <span className={`text-xs font-medium ml-1 ${
                  assessment.compositeScore >= 4 ? 'text-green-600' :
                  assessment.compositeScore >= 3 ? 'text-amber-600' :
                  assessment.compositeScore >= 2 ? 'text-zinc-600' :
                  'text-red-600'
                }`}>
                  {assessment.compositeScore >= 4.5 ? 'Prime' :
                   assessment.compositeScore >= 3.7 ? 'Strong' :
                   assessment.compositeScore >= 3.0 ? 'Needs strong concept' :
                   'High risk'}
                </span>
              </div>

              {/* Pillar breakdown */}
              <div className="space-y-1.5">
                {assessment.pillars.filter(p => p.score != null).map(p => (
                  <div key={p.pillar} className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-28 flex-shrink-0">{p.label}</span>
                    <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          p.score! >= 4 ? 'bg-green-500' :
                          p.score! >= 3 ? 'bg-amber-500' :
                          p.score! >= 2 ? 'bg-zinc-400' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${(p.score! / 5) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-zinc-600 w-7 text-right">{p.score!.toFixed(1)}</span>
                  </div>
                ))}
              </div>

              {/* Operations risk */}
              {assessment.operationsRisk !== 'unknown' && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-100">
                  <span className={`w-2 h-2 rounded-full ${
                    assessment.operationsRisk === 'low' ? 'bg-green-500' :
                    assessment.operationsRisk === 'medium' ? 'bg-amber-500' :
                    'bg-red-500'
                  }`} />
                  <span className="text-xs text-zinc-500">
                    Operations risk: {assessment.operationsRisk}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Fill-in prompt when not enough data */}
          {assessment && assessment.scoredPillarCount < 2 && (
            <div className="px-6 py-3 border-b border-zinc-200">
              <p className="text-xs text-zinc-400 italic">Fill in more details to see the location assessment.</p>
            </div>
          )}

          {/* Property Being Scouted */}
          {trip.property && (
            <div className="px-6 py-4 border-b border-zinc-200">
              <div className="flex items-center gap-2 mb-3">
                <Building className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-medium text-zinc-900">
                  Property Being Scouted
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleNavigateToLinkedItem({ id: trip.property!.id, type: trip.property!.type, name: trip.property!.name, data: trip.property!.data })}
                className="w-full flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors text-left"
              >
                <MapPin className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{trip.property.name}</p>
                  {trip.property.address && (
                    <p className="text-xs text-zinc-500 truncate">{trip.property.address}</p>
                  )}
                </div>
              </button>
            </div>
          )}

          {/* Related Places */}
          {trip.relatedPlaces && trip.relatedPlaces.length > 0 && (
            <div className="px-6 py-4 border-b border-zinc-200">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-900">
                  Related Places
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {trip.relatedPlaces.map((item) => (
                  <LinkedItemChip
                    key={item.id}
                    name={item.name}
                    onNavigate={() => handleNavigateToLinkedItem({ id: item.id, type: item.type, name: item.name, data: item.data })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Checklist */}
          {trip.checklist && trip.checklist.length > 0 && (
            <DetailSection id="checklist" title="Checklist" icon={ClipboardCheck} expandedSection={expandedSection} onToggle={handleSectionToggle}>
              <TripChecklist
                items={trip.checklist}
                onChange={(items) => updateChecklist(trip.id, items)}
              />
            </DetailSection>
          )}

          {/* Attachments */}
          {trip.attachments && trip.attachments.length > 0 && (
            <DetailSection id="attachments" title="Attachments" icon={Paperclip} expandedSection={expandedSection} onToggle={handleSectionToggle}>
              <AttachmentGallery
                attachments={trip.attachments}
                onUpload={async () => ({ success: false, error: 'Read only' })}
                onRemove={() => {}}
                disabled={true}
              />
            </DetailSection>
          )}

          {/* Location Section */}
          {hasLocationData && (
            <DetailSection id="location" title="Location" icon={Building2} expandedSection={expandedSection} onToggle={handleSectionToggle}>
              <div className="space-y-0.5">
                {trip.address && (
                  <DetailRow label="Address" value={trip.address} />
                )}
                {trip.areaSqm && (
                  <DetailRow label="Area" value={`${trip.areaSqm} m²`} />
                )}
                {trip.storageSqm && (
                  <DetailRow label="Storage" value={`${trip.storageSqm} m²`} />
                )}
                {trip.propertyType && (
                  <DetailRow label="Property Type" value={trip.propertyType} />
                )}
                {trip.footfallEstimate && (
                  <DetailRow
                    label="Footfall"
                    value={`${trip.footfallEstimate.toLocaleString()}/day`}
                  />
                )}
              </div>
              {trip.neighbourhoodProfile && (
                <div className="mt-3 pt-3 border-t border-zinc-100">
                  <p className="text-xs text-zinc-500 mb-1">
                    Neighbourhood Profile
                  </p>
                  <p className="text-xs text-zinc-700 whitespace-pre-wrap">
                    {trip.neighbourhoodProfile}
                  </p>
                </div>
              )}
              {trip.nearbyCompetitors && (() => {
                const entries = parseCompetitors(trip.nearbyCompetitors);
                if (entries.length === 0) return null;
                return (
                  <div className="mt-3 pt-3 border-t border-zinc-100">
                    <p className="text-xs text-zinc-500 mb-1">
                      Nearby Competitors
                    </p>
                    <div className="space-y-1">
                      {entries.map((entry: CompetitorEntry, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-zinc-700">{entry.name}</span>
                          {entry.distance != null && (
                            <span className="text-zinc-400 ml-2">{entry.distance < 1000 ? `${Math.round(entry.distance)}m` : `${(entry.distance / 1000).toFixed(1)}km`}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </DetailSection>
          )}

          {/* Financial Section */}
          {hasFinancialData && (
            <DetailSection id="financial" title="Financial" icon={DollarSign} expandedSection={expandedSection} onToggle={handleSectionToggle}>
              <div className="space-y-0.5">
                {trip.monthlyRent && (
                  <DetailRow
                    label="Monthly Rent"
                    value={`${formatCurrency(trip.monthlyRent)}/mo`}
                  />
                )}
                {trip.serviceFees && (
                  <DetailRow
                    label="Service Fees"
                    value={`${formatCurrency(trip.serviceFees)}/mo`}
                  />
                )}
                {trip.deposit && (
                  <DetailRow label="Deposit" value={formatCurrency(trip.deposit)} />
                )}
                {trip.fitoutCost && (
                  <DetailRow
                    label="Fit-out Cost"
                    value={formatCurrency(trip.fitoutCost)}
                  />
                )}
                {trip.openingInvestment && (
                  <DetailRow
                    label="Opening Investment"
                    value={formatCurrency(trip.openingInvestment)}
                  />
                )}
                {trip.expectedDailyRevenue && (
                  <DetailRow
                    label="Expected Daily Revenue"
                    value={formatCurrency(trip.expectedDailyRevenue)}
                  />
                )}
                {trip.monthlyRevenueRange && (
                  <DetailRow
                    label="Monthly Revenue Range"
                    value={trip.monthlyRevenueRange}
                  />
                )}
                {trip.paybackMonths && (
                  <DetailRow
                    label="Payback Period"
                    value={`${trip.paybackMonths} months`}
                  />
                )}
              </div>
            </DetailSection>
          )}

          {/* Operational Section */}
          {hasOperationalData && (
            <DetailSection id="operational" title="Operational" icon={Settings} expandedSection={expandedSection} onToggle={handleSectionToggle}>
              <div className="space-y-0.5">
                {trip.ventilation && (
                  <DetailRow label="Ventilation" value={conditionLabels[trip.ventilation as ConditionStatus] ?? trip.ventilation} />
                )}
                {trip.waterWaste && (
                  <DetailRow label="Water/Waste" value={conditionLabels[trip.waterWaste as ConditionStatus] ?? trip.waterWaste} />
                )}
                {trip.powerCapacity && (
                  <DetailRow label="Power Capacity" value={conditionLabels[trip.powerCapacity as ConditionStatus] ?? trip.powerCapacity} />
                )}
                {trip.visibility && (
                  <DetailRow label="Visibility" value={visibilityLabels[trip.visibility as VisibilityLevel] ?? trip.visibility} />
                )}
                {trip.deliveryAccess && (
                  <DetailRow label="Delivery Access" value={accessLabels[trip.deliveryAccess as AccessLevel] ?? trip.deliveryAccess} />
                )}
                {trip.seatingCapacity && (
                  <DetailRow
                    label="Seating Capacity"
                    value={trip.seatingCapacity}
                  />
                )}
                {trip.outdoorSeating && (
                  <DetailRow
                    label="Outdoor Seating"
                    value={
                      typeof trip.outdoorSeating === 'boolean'
                        ? 'Yes'
                        : outdoorSeatingLabels[trip.outdoorSeating as OutdoorSeatingType] ?? trip.outdoorSeating
                    }
                  />
                )}
                {trip.flatSurface !== undefined && (
                  <DetailRow
                    label="Flat Surface"
                    value={trip.flatSurface ? "Yes" : "No"}
                  />
                )}
              </div>
            </DetailSection>
          )}

          {/* Risks Section */}
          {trip.risks && (
            <DetailSection id="risks" title="Risks" icon={AlertTriangle} expandedSection={expandedSection} onToggle={handleSectionToggle}>
              <p className="text-xs text-zinc-700 whitespace-pre-wrap">
                {trip.risks}
              </p>
            </DetailSection>
          )}

          {/* Comments Section */}
          <DetailSection id="comments" title="Comments" icon={MessageSquare} expandedSection={expandedSection} onToggle={handleSectionToggle}>
            <TripCommentsSection tripId={trip.id} />
          </DetailSection>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-zinc-200 bg-zinc-50">
          <div>
            {onEdit && trip.status === "draft" && (
              <Button size="lg" onClick={() => onEdit(trip)} className="h-11 border border-transparent">Edit Trip</Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-11 h-11 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 border-zinc-200 hover:border-red-300"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="lg"
                  disabled={isExporting}
                  onClick={(e) => e.stopPropagation()}
                  className="h-11 gap-1.5"
                >
                  {isExporting ? "Exporting..." : "Export"}
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExporting(true);
                    generateTripPdf(trip).finally(() => setIsExporting(false));
                  }}
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExporting(true);
                    generateTripDocx(trip).finally(() => setIsExporting(false));
                  }}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Export as Word
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        </div>
      </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent showCloseButton={false} className="max-w-sm z-[200]">
          <DialogHeader>
            <DialogTitle>Delete Trip</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{trip.name || 'this trip'}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-3">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ToastProvider>
  );
}
