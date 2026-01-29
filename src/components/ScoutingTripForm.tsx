"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  MapPin,
  DollarSign,
  Settings,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Link as LinkIcon,
  Image,
  Save,
  Send,
  ClipboardCheck,
  Paperclip,
  Building,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobileSelect, type SelectOption } from "@/components/ui/mobile-select";
import { useScoutingTrips } from "@/hooks/useScoutingTrips";
import { TripChecklist } from "@/components/TripChecklist";
import { AttachmentGallery } from "@/components/attachments";
import { processFileToAttachment } from "@/utils/attachmentUtils";
import type { Attachment } from "@/types/attachments";
import type {
  ScoutingTrip,
  PropertyType,
  ConditionStatus,
  VisibilityLevel,
  AccessLevel,
  LinkedItem,
  ChecklistItem,
} from "@/types/scouting";
import {
  propertyTypeLabels,
  conditionLabels,
  visibilityLabels,
  accessLabels,
  createDefaultChecklist,
} from "@/types/scouting";

// Props for the form modal
interface ScoutingTripFormProps {
  isOpen: boolean;
  onClose: () => void;
  cityId: string;
  existingTrip?: ScoutingTrip | null; // For editing existing trips
  pendingLinkedItems?: LinkedItem[]; // Items added from map linking
  onStartLinking?: () => void; // Called when user wants to link POIs/areas
}

// Collapsible section component
function FormSection({
  title,
  icon: Icon,
  children,
  defaultExpanded = true,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border-b border-zinc-200 last:border-0">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center gap-3 hover:bg-zinc-50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-zinc-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-400" />
        )}
        <Icon className="w-4 h-4 text-zinc-600" />
        <span className="font-medium text-sm text-zinc-900">{title}</span>
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

// Form field wrapper with error state
function FormField({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className={cn(
        "text-xs font-medium",
        error ? "text-red-600" : "text-zinc-700"
      )}>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// Select dropdown component
function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: T | undefined;
  onChange: (value: T) => void;
  options: Record<T, string>;
  placeholder?: string;
}) {
  // Convert Record to SelectOption array
  const selectOptions: SelectOption[] = Object.entries(options).map(([key, label]) => ({
    value: key,
    label: label as string,
  }));

  return (
    <MobileSelect
      value={value || ''}
      onChange={(v) => onChange(v as T)}
      options={selectOptions}
      placeholder={placeholder || 'Select...'}
      searchable={false}
    />
  );
}

// Linked item badge
function LinkedItemBadge({
  item,
  onRemove,
}: {
  item: LinkedItem;
  onRemove: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-100 rounded-md text-xs">
      <MapPin className="w-3 h-3 text-zinc-500" />
      <span className="text-zinc-700 max-w-[150px] truncate">{item.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-zinc-400 hover:text-zinc-600"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

export function ScoutingTripForm({
  isOpen,
  onClose,
  cityId,
  existingTrip,
  pendingLinkedItems = [],
  onStartLinking,
}: ScoutingTripFormProps) {
  const { createTrip, updateTrip, submitTrip, addAttachment, removeAttachment, updateChecklist } = useScoutingTrips();

  // Form state - initialize from existing trip or empty
  const [tripId, setTripId] = useState<string | null>(existingTrip?.id || null);
  const [name, setName] = useState(existingTrip?.name || '');

  // New: Property and related places (replaces linkedItems)
  const [property, setProperty] = useState<LinkedItem | null>(existingTrip?.property || null);
  const [relatedPlaces, setRelatedPlaces] = useState<LinkedItem[]>(existingTrip?.relatedPlaces || []);

  // New: Checklist and attachments
  const [checklist, setChecklist] = useState<ChecklistItem[]>(existingTrip?.checklist || createDefaultChecklist());
  const [attachments, setAttachments] = useState<Attachment[]>(existingTrip?.attachments || []);

  // Location fields
  const [address, setAddress] = useState(existingTrip?.address || '');
  const [areaSqm, setAreaSqm] = useState<string>(existingTrip?.areaSqm?.toString() || '');
  const [storageSqm, setStorageSqm] = useState<string>(existingTrip?.storageSqm?.toString() || '');
  const [propertyType, setPropertyType] = useState<PropertyType | undefined>(existingTrip?.propertyType);
  const [footfallEstimate, setFootfallEstimate] = useState<string>(existingTrip?.footfallEstimate?.toString() || '');
  const [neighbourhoodProfile, setNeighbourhoodProfile] = useState(existingTrip?.neighbourhoodProfile || '');
  const [nearbyCompetitors, setNearbyCompetitors] = useState(existingTrip?.nearbyCompetitors || '');

  // Financial fields
  const [monthlyRent, setMonthlyRent] = useState<string>(existingTrip?.monthlyRent?.toString() || '');
  const [serviceFees, setServiceFees] = useState<string>(existingTrip?.serviceFees?.toString() || '');
  const [deposit, setDeposit] = useState<string>(existingTrip?.deposit?.toString() || '');
  const [fitoutCost, setFitoutCost] = useState<string>(existingTrip?.fitoutCost?.toString() || '');
  const [openingInvestment, setOpeningInvestment] = useState<string>(existingTrip?.openingInvestment?.toString() || '');
  const [expectedDailyRevenue, setExpectedDailyRevenue] = useState<string>(existingTrip?.expectedDailyRevenue?.toString() || '');
  const [monthlyRevenueRange, setMonthlyRevenueRange] = useState(existingTrip?.monthlyRevenueRange || '');
  const [paybackMonths, setPaybackMonths] = useState<string>(existingTrip?.paybackMonths?.toString() || '');

  // Operational fields
  const [ventilation, setVentilation] = useState<ConditionStatus | undefined>(existingTrip?.ventilation);
  const [waterWaste, setWaterWaste] = useState<ConditionStatus | undefined>(existingTrip?.waterWaste);
  const [powerCapacity, setPowerCapacity] = useState<ConditionStatus | undefined>(existingTrip?.powerCapacity);
  const [visibility, setVisibility] = useState<VisibilityLevel | undefined>(existingTrip?.visibility);
  const [deliveryAccess, setDeliveryAccess] = useState<AccessLevel | undefined>(existingTrip?.deliveryAccess);
  const [seatingCapacity, setSeatingCapacity] = useState<string>(existingTrip?.seatingCapacity?.toString() || '');
  const [outdoorSeating, setOutdoorSeating] = useState(existingTrip?.outdoorSeating || false);

  // Other fields
  const [risks, setRisks] = useState(existingTrip?.risks || '');

  // Validation state
  const [showErrors, setShowErrors] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // Validation checks
  const errors = {
    name: !name.trim(),
    address: !address.trim(),
  };
  const hasErrors = errors.name || errors.address;
  const isValid = !hasErrors;

  // Reset form when trip changes
  useEffect(() => {
    if (existingTrip) {
      setTripId(existingTrip.id);
      setName(existingTrip.name || '');
      setProperty(existingTrip.property || null);
      setRelatedPlaces(existingTrip.relatedPlaces || []);
      setChecklist(existingTrip.checklist || createDefaultChecklist());
      setAttachments(existingTrip.attachments || []);
      setAddress(existingTrip.address || '');
      setAreaSqm(existingTrip.areaSqm?.toString() || '');
      setStorageSqm(existingTrip.storageSqm?.toString() || '');
      setPropertyType(existingTrip.propertyType);
      setFootfallEstimate(existingTrip.footfallEstimate?.toString() || '');
      setNeighbourhoodProfile(existingTrip.neighbourhoodProfile || '');
      setNearbyCompetitors(existingTrip.nearbyCompetitors || '');
      setMonthlyRent(existingTrip.monthlyRent?.toString() || '');
      setServiceFees(existingTrip.serviceFees?.toString() || '');
      setDeposit(existingTrip.deposit?.toString() || '');
      setFitoutCost(existingTrip.fitoutCost?.toString() || '');
      setOpeningInvestment(existingTrip.openingInvestment?.toString() || '');
      setExpectedDailyRevenue(existingTrip.expectedDailyRevenue?.toString() || '');
      setMonthlyRevenueRange(existingTrip.monthlyRevenueRange || '');
      setPaybackMonths(existingTrip.paybackMonths?.toString() || '');
      setVentilation(existingTrip.ventilation);
      setWaterWaste(existingTrip.waterWaste);
      setPowerCapacity(existingTrip.powerCapacity);
      setVisibility(existingTrip.visibility);
      setDeliveryAccess(existingTrip.deliveryAccess);
      setSeatingCapacity(existingTrip.seatingCapacity?.toString() || '');
      setOutdoorSeating(existingTrip.outdoorSeating || false);
      setRisks(existingTrip.risks || '');
    } else {
      // Reset to empty form
      setTripId(null);
      setName('');
      setProperty(null);
      setRelatedPlaces([]);
      setChecklist(createDefaultChecklist());
      setAttachments([]);
      setAddress('');
      setAreaSqm('');
      setStorageSqm('');
      setPropertyType(undefined);
      setFootfallEstimate('');
      setNeighbourhoodProfile('');
      setNearbyCompetitors('');
      setMonthlyRent('');
      setServiceFees('');
      setDeposit('');
      setFitoutCost('');
      setOpeningInvestment('');
      setExpectedDailyRevenue('');
      setMonthlyRevenueRange('');
      setPaybackMonths('');
      setVentilation(undefined);
      setWaterWaste(undefined);
      setPowerCapacity(undefined);
      setVisibility(undefined);
      setDeliveryAccess(undefined);
      setSeatingCapacity('');
      setOutdoorSeating(false);
      setRisks('');
    }
    // Reset validation state
    setShowErrors(false);
    setAttemptedSubmit(false);
  }, [existingTrip]);

  // Merge pending linked items from map selection
  // First item becomes property (if no property set), rest become related places
  useEffect(() => {
    if (pendingLinkedItems.length > 0) {
      // If no property is set, use first pending item as property
      if (!property && pendingLinkedItems.length > 0) {
        const firstItem = pendingLinkedItems[0];
        setProperty(firstItem);
        // Auto-fill address and name from property
        if (!address && firstItem.address) {
          setAddress(firstItem.address);
        }
        if (!name && firstItem.name) {
          setName(firstItem.name);
        }
        // Add remaining items as related places
        if (pendingLinkedItems.length > 1) {
          const remaining = pendingLinkedItems.slice(1);
          setRelatedPlaces(prev => {
            const newItems = remaining.filter(
              item => !prev.some(existing => existing.id === item.id)
            );
            return [...prev, ...newItems];
          });
        }
      } else {
        // Property already set, add all pending items as related places
        setRelatedPlaces(prev => {
          const newItems = pendingLinkedItems.filter(
            item => !prev.some(existing => existing.id === item.id) && item.id !== property?.id
          );
          return [...prev, ...newItems];
        });
      }
    }
  }, [pendingLinkedItems, property, address, name]);

  // Build the trip data from form state
  const buildTripData = (): Partial<ScoutingTrip> => ({
    name,
    property,
    relatedPlaces,
    checklist,
    attachments,
    address,
    areaSqm: areaSqm ? parseFloat(areaSqm) : undefined,
    storageSqm: storageSqm ? parseFloat(storageSqm) : undefined,
    propertyType,
    footfallEstimate: footfallEstimate ? parseInt(footfallEstimate) : undefined,
    neighbourhoodProfile,
    nearbyCompetitors,
    monthlyRent: monthlyRent ? parseFloat(monthlyRent) : undefined,
    serviceFees: serviceFees ? parseFloat(serviceFees) : undefined,
    deposit: deposit ? parseFloat(deposit) : undefined,
    fitoutCost: fitoutCost ? parseFloat(fitoutCost) : undefined,
    openingInvestment: openingInvestment ? parseFloat(openingInvestment) : undefined,
    expectedDailyRevenue: expectedDailyRevenue ? parseFloat(expectedDailyRevenue) : undefined,
    monthlyRevenueRange,
    paybackMonths: paybackMonths ? parseInt(paybackMonths) : undefined,
    ventilation,
    waterWaste,
    powerCapacity,
    visibility,
    deliveryAccess,
    seatingCapacity: seatingCapacity ? parseInt(seatingCapacity) : undefined,
    outdoorSeating,
    risks,
  });

  // Save as draft
  const handleSaveDraft = () => {
    const data = buildTripData();

    if (tripId) {
      // Update existing trip
      updateTrip(tripId, data);
    } else {
      // Create new trip
      const newTrip = createTrip(cityId, 'Guest');
      setTripId(newTrip.id);
      updateTrip(newTrip.id, data);
    }

    onClose();
  };

  // Submit for review
  const handleSubmit = () => {
    setAttemptedSubmit(true);
    setShowErrors(true);

    // Don't submit if there are validation errors
    if (!isValid) {
      return;
    }

    const data = buildTripData();

    if (tripId) {
      updateTrip(tripId, data);
      submitTrip(tripId);
    } else {
      const newTrip = createTrip(cityId, 'Guest');
      updateTrip(newTrip.id, data);
      submitTrip(newTrip.id);
    }

    onClose();
  };

  // Handle removing a related place
  const handleRemoveRelatedPlace = (itemId: string) => {
    setRelatedPlaces(prev => prev.filter(i => i.id !== itemId));
  };

  // Handle adding an attachment
  const handleAddAttachment = async (file: File) => {
    const result = await processFileToAttachment(file, 'Guest');
    if (result.success && result.attachment) {
      setAttachments(prev => [...prev, result.attachment!]);
    }
    return result;
  };

  // Handle removing an attachment
  const handleRemoveAttachment = (attachmentId: string) => {
    setAttachments(prev => prev.filter(a => a.id !== attachmentId));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-bold text-zinc-900">
            {existingTrip ? 'Edit Scouting Trip' : 'New Scouting Trip'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        {/* Form content - scrollable */}
        <div className="flex-1 overflow-y-auto">
          {/* Trip name */}
          <div className="px-6 py-4 border-b border-zinc-200">
            <FormField label="Trip Name" required error={showErrors && errors.name}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Gran Via Location"
                className={cn(showErrors && errors.name && "border-red-500 focus:ring-red-500/20")}
              />
              {showErrors && errors.name && (
                <p className="text-xs text-red-500 mt-1">Trip name is required</p>
              )}
            </FormField>
          </div>

          {/* Property Being Scouted */}
          <div className="px-6 py-4 border-b border-zinc-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-amber-600" />
                <label className="text-xs font-medium text-zinc-700">Property Being Scouted</label>
              </div>
              {onStartLinking && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onStartLinking}
                  className="h-7 text-xs gap-1"
                >
                  <MapPin className="w-3 h-3" />
                  {property ? 'Change' : 'Select Property'}
                </Button>
              )}
            </div>
            {property ? (
              <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <MapPin className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{property.name}</p>
                  {property.address && (
                    <p className="text-xs text-zinc-500 truncate">{property.address}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 border-dashed text-center">
                <p className="text-xs text-zinc-400">
                  No property selected yet
                </p>
              </div>
            )}
          </div>

          {/* Related Places (context from list) */}
          {relatedPlaces.length > 0 && (
            <div className="px-6 py-4 border-b border-zinc-200">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-medium text-zinc-700">Related Places</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onStartLinking}
                  className="h-7 text-xs gap-1"
                >
                  <LinkIcon className="w-3 h-3" />
                  Add More
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {relatedPlaces.map(item => (
                  <LinkedItemBadge
                    key={item.id}
                    item={item}
                    onRemove={() => handleRemoveRelatedPlace(item.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Checklist Section */}
          <FormSection title="Checklist" icon={ClipboardCheck} defaultExpanded={true}>
            <TripChecklist
              items={checklist}
              onChange={setChecklist}
            />
          </FormSection>

          {/* Attachments Section */}
          <FormSection title="Attachments" icon={Paperclip} defaultExpanded={true}>
            <AttachmentGallery
              attachments={attachments}
              onUpload={handleAddAttachment}
              onRemove={handleRemoveAttachment}
            />
          </FormSection>

          {/* Location Section */}
          <FormSection title="Location" icon={MapPin}>
            <FormField label="Address" required error={showErrors && errors.address}>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street address"
                className={cn(showErrors && errors.address && "border-red-500 focus:ring-red-500/20")}
              />
              {showErrors && errors.address && (
                <p className="text-xs text-red-500 mt-1">Address is required</p>
              )}
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Area (m²)">
                <Input
                  type="number"
                  value={areaSqm}
                  onChange={(e) => setAreaSqm(e.target.value)}
                  placeholder="e.g., 80"
                />
              </FormField>
              <FormField label="Storage (m²)">
                <Input
                  type="number"
                  value={storageSqm}
                  onChange={(e) => setStorageSqm(e.target.value)}
                  placeholder="e.g., 15"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Property Type">
                <Select
                  value={propertyType}
                  onChange={setPropertyType}
                  options={propertyTypeLabels}
                  placeholder="Select type"
                />
              </FormField>
              <FormField label="Footfall Estimate">
                <Input
                  type="number"
                  value={footfallEstimate}
                  onChange={(e) => setFootfallEstimate(e.target.value)}
                  placeholder="Pedestrians/day"
                />
              </FormField>
            </div>

            <FormField label="Neighbourhood Profile">
              <textarea
                value={neighbourhoodProfile}
                onChange={(e) => setNeighbourhoodProfile(e.target.value)}
                placeholder="Describe the area demographics, character..."
                className="w-full h-20 px-3 py-2 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 resize-none"
              />
            </FormField>

            <FormField label="Nearby Competitors">
              <textarea
                value={nearbyCompetitors}
                onChange={(e) => setNearbyCompetitors(e.target.value)}
                placeholder="List nearby cafes and competitors..."
                className="w-full h-20 px-3 py-2 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 resize-none"
              />
            </FormField>
          </FormSection>

          {/* Financial Section */}
          <FormSection title="Financial" icon={DollarSign} defaultExpanded={false}>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Monthly Rent (€)">
                <Input
                  type="number"
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(e.target.value)}
                  placeholder="e.g., 2500"
                />
              </FormField>
              <FormField label="Service Fees (€)">
                <Input
                  type="number"
                  value={serviceFees}
                  onChange={(e) => setServiceFees(e.target.value)}
                  placeholder="e.g., 300"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Deposit (€)">
                <Input
                  type="number"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  placeholder="e.g., 5000"
                />
              </FormField>
              <FormField label="Fit-out Cost (€)">
                <Input
                  type="number"
                  value={fitoutCost}
                  onChange={(e) => setFitoutCost(e.target.value)}
                  placeholder="e.g., 40000"
                />
              </FormField>
            </div>

            <FormField label="Opening Investment Total (€)">
              <Input
                type="number"
                value={openingInvestment}
                onChange={(e) => setOpeningInvestment(e.target.value)}
                placeholder="Total initial investment"
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Expected Daily Revenue (€)">
                <Input
                  type="number"
                  value={expectedDailyRevenue}
                  onChange={(e) => setExpectedDailyRevenue(e.target.value)}
                  placeholder="e.g., 800"
                />
              </FormField>
              <FormField label="Monthly Revenue Range">
                <Input
                  value={monthlyRevenueRange}
                  onChange={(e) => setMonthlyRevenueRange(e.target.value)}
                  placeholder="e.g., €8,000 - €12,000"
                />
              </FormField>
            </div>

            <FormField label="Payback Period (months)">
              <Input
                type="number"
                value={paybackMonths}
                onChange={(e) => setPaybackMonths(e.target.value)}
                placeholder="e.g., 24"
              />
            </FormField>
          </FormSection>

          {/* Operational Section */}
          <FormSection title="Operational" icon={Settings} defaultExpanded={false}>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Ventilation">
                <Select
                  value={ventilation}
                  onChange={setVentilation}
                  options={conditionLabels}
                />
              </FormField>
              <FormField label="Water/Waste">
                <Select
                  value={waterWaste}
                  onChange={setWaterWaste}
                  options={conditionLabels}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Power Capacity">
                <Select
                  value={powerCapacity}
                  onChange={setPowerCapacity}
                  options={conditionLabels}
                />
              </FormField>
              <FormField label="Visibility">
                <Select
                  value={visibility}
                  onChange={setVisibility}
                  options={visibilityLabels}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Delivery Access">
                <Select
                  value={deliveryAccess}
                  onChange={setDeliveryAccess}
                  options={accessLabels}
                />
              </FormField>
              <FormField label="Seating Capacity">
                <Input
                  type="number"
                  value={seatingCapacity}
                  onChange={(e) => setSeatingCapacity(e.target.value)}
                  placeholder="Number of seats"
                />
              </FormField>
            </div>

            <FormField label="Outdoor Seating">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={outdoorSeating}
                  onChange={(e) => setOutdoorSeating(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-300"
                />
                <span className="text-sm text-zinc-700">Available</span>
              </label>
            </FormField>
          </FormSection>

          {/* Risks Section */}
          <FormSection title="Risks & Notes" icon={AlertTriangle} defaultExpanded={false}>
            <FormField label="Potential Risks">
              <textarea
                value={risks}
                onChange={(e) => setRisks(e.target.value)}
                placeholder="List any risks or concerns..."
                className="w-full h-24 px-3 py-2 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 resize-none"
              />
            </FormField>

          </FormSection>
        </div>

        {/* Footer with actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-200 bg-zinc-50">
          {/* Validation message */}
          <div className="text-xs text-red-500">
            {showErrors && hasErrors && (
              <span>Please fill in required fields: {[
                errors.name && "Trip Name",
                errors.address && "Address"
              ].filter(Boolean).join(", ")}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleSaveDraft} className="gap-1.5">
              <Save className="w-4 h-4" />
              Save Draft
            </Button>
            <div className="relative group">
              <Button
                onClick={handleSubmit}
                disabled={attemptedSubmit && !isValid}
                className={cn(
                  "gap-1.5",
                  attemptedSubmit && !isValid && "opacity-50 cursor-not-allowed"
                )}
              >
                <Send className="w-4 h-4" />
                Submit
              </Button>
              {/* Tooltip on hover when disabled */}
              {attemptedSubmit && !isValid && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Fill required fields first
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
