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
  Save,
  Send,
  ClipboardCheck,
  Paperclip,
  Building,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMobile } from "@/hooks/useMobile";
import { MobileSelect, type SelectOption } from "@/components/ui/mobile-select";
import { useScoutingTrips } from "@/hooks/useScoutingTrips";
import { TripChecklist } from "@/components/TripChecklist";
import { AttachmentGallery } from "@/components/attachments";
import { NearbyCompetitors, parseCompetitors } from "@/components/NearbyCompetitors";
import { useScoutingDefaults } from "@/hooks/useScoutingDefaults";
import { processFileToAttachment } from "@/utils/attachmentUtils";
import type { Attachment } from "@/types/attachments";
import type {
  ScoutingTrip,
  PropertyType,
  ConditionStatus,
  VisibilityLevel,
  AccessLevel,
  OutdoorSeatingType,
  CompetitorEntry,
  LinkedItem,
  ChecklistItem,
} from "@/types/scouting";
import {
  propertyTypeLabels,
  conditionLabels,
  visibilityLabels,
  accessLabels,
  outdoorSeatingLabels,
  createDefaultChecklist,
} from "@/types/scouting";

interface ScoutingTripFormProps {
  isOpen: boolean;
  onClose: () => void;
  cityId: string;
  existingTrip?: ScoutingTrip | null;
  pendingLinkedItems?: LinkedItem[];
  onStartLinking?: () => void;
}

function FormSection({
  id,
  title,
  icon: Icon,
  badge,
  children,
  expandedSection,
  onToggle,
}: {
  id: string;
  title: string;
  icon: React.ElementType;
  badge?: string;
  children: React.ReactNode;
  expandedSection: string | null;
  onToggle: (id: string) => void;
}) {
  const isExpanded = expandedSection === id;

  return (
    <div className="border-b border-zinc-200 last:border-0">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full p-4 flex items-center gap-3 hover:bg-zinc-50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-zinc-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-400" />
        )}
        <Icon className="w-4 h-4 text-zinc-600" />
        <span className="text-base font-semibold font-heading text-zinc-900">{title}</span>
        {badge && (
          <span className="text-xs text-zinc-400 font-normal">{badge}</span>
        )}
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

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
        "text-sm font-medium",
        error ? "text-red-600" : "text-zinc-700"
      )}>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function AutoInput({
  value,
  onChange,
  isAuto,
  type = "text",
  placeholder,
}: {
  value: string;
  onChange: (val: string, manual: boolean) => void;
  isAuto: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value, true)}
        placeholder={placeholder}
      />
      {isAuto && value && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded pointer-events-none">
          auto
        </span>
      )}
    </div>
  );
}

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

const CURRENCY_MAP = { '€': 'EUR', 'Kč': 'CZK', 'zł': 'PLN' } as const;
const CODE_TO_SYMBOL: Record<string, '€' | 'Kč' | 'zł'> = { EUR: '€', CZK: 'Kč', PLN: 'zł' };

function currencyForCity(cityId: string): '€' | 'Kč' | 'zł' {
  if (cityId === 'prague') return 'Kč';
  // Future: if (cityId === 'warsaw' || cityId === 'krakow') return 'zł';
  return '€';
}

export function ScoutingTripForm({
  isOpen,
  onClose,
  cityId,
  existingTrip,
  pendingLinkedItems = [],
  onStartLinking,
}: ScoutingTripFormProps) {
  const isMobile = useMobile();
  const { createTrip, updateTrip, submitTrip } = useScoutingTrips();
  const { defaults } = useScoutingDefaults();

  // Form state
  const [tripId, setTripId] = useState<string | null>(existingTrip?.id || null);
  const [name, setName] = useState(existingTrip?.name || '');
  const [property, setProperty] = useState<LinkedItem | null>(existingTrip?.property || null);
  const [relatedPlaces, setRelatedPlaces] = useState<LinkedItem[]>(existingTrip?.relatedPlaces || []);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(existingTrip?.checklist || createDefaultChecklist());
  const [attachments, setAttachments] = useState<Attachment[]>(existingTrip?.attachments || []);

  // Currency: auto-select from city, override if existing trip has one saved
  const [currency, setCurrency] = useState<'€' | 'Kč' | 'zł'>(
    CODE_TO_SYMBOL[existingTrip?.currencyCode || ''] || currencyForCity(cityId)
  );

  // Location fields
  const [address, setAddress] = useState(existingTrip?.address || '');
  const [areaSqm, setAreaSqm] = useState<string>(existingTrip?.areaSqm?.toString() || '');
  const [storageSqm, setStorageSqm] = useState<string>(existingTrip?.storageSqm?.toString() || '');
  const [propertyType, setPropertyType] = useState<PropertyType | undefined>(existingTrip?.propertyType);
  const [footfallEstimate, setFootfallEstimate] = useState<string>(existingTrip?.footfallEstimate?.toString() || '');
  const [neighbourhoodProfile, setNeighbourhoodProfile] = useState(existingTrip?.neighbourhoodProfile || '');
  const [competitorEntries, setCompetitorEntries] = useState<CompetitorEntry[]>(
    () => parseCompetitors(existingTrip?.nearbyCompetitors)
  );

  // Financial fields
  const [monthlyRent, setMonthlyRent] = useState<string>(existingTrip?.monthlyRent?.toString() || '');
  const [serviceFees, setServiceFees] = useState<string>(existingTrip?.serviceFees?.toString() || '');
  const [deposit, setDeposit] = useState<string>(existingTrip?.deposit?.toString() || '');
  const [transferFee, setTransferFee] = useState<string>(existingTrip?.transferFee?.toString() || '');
  const [fitoutCost, setFitoutCost] = useState<string>(existingTrip?.fitoutCost?.toString() || '');
  const [openingInvestment, setOpeningInvestment] = useState<string>(existingTrip?.openingInvestment?.toString() || '');
  const [expectedDailyRevenue, setExpectedDailyRevenue] = useState<string>(existingTrip?.expectedDailyRevenue?.toString() || '');
  const [monthlyRevenueRange, setMonthlyRevenueRange] = useState(existingTrip?.monthlyRevenueRange || '');
  const [paybackMonths, setPaybackMonths] = useState<string>(existingTrip?.paybackMonths?.toString() || '');

  // Dirty tracking for auto-calculated fields
  const [investmentManual, setInvestmentManual] = useState(!!existingTrip?.openingInvestment);
  const [dailyRevenueManual, setDailyRevenueManual] = useState(!!existingTrip?.expectedDailyRevenue);
  const [monthlyRevenueManual, setMonthlyRevenueManual] = useState(!!existingTrip?.monthlyRevenueRange);
  const [paybackManual, setPaybackManual] = useState(!!existingTrip?.paybackMonths);

  // Operational fields
  const [ventilation, setVentilation] = useState<ConditionStatus | undefined>(existingTrip?.ventilation);
  const [waterWaste, setWaterWaste] = useState<ConditionStatus | undefined>(existingTrip?.waterWaste);
  const [powerCapacity, setPowerCapacity] = useState<ConditionStatus | undefined>(existingTrip?.powerCapacity);
  const [visibility, setVisibility] = useState<VisibilityLevel | undefined>(existingTrip?.visibility);
  const [deliveryAccess, setDeliveryAccess] = useState<AccessLevel | undefined>(existingTrip?.deliveryAccess);
  const [seatingCapacity, setSeatingCapacity] = useState<string>(existingTrip?.seatingCapacity?.toString() || '');
  const [outdoorSeating, setOutdoorSeating] = useState<OutdoorSeatingType | undefined>(
    typeof existingTrip?.outdoorSeating === 'boolean'
      ? (existingTrip.outdoorSeating ? 'street' : undefined)
      : existingTrip?.outdoorSeating
  );
  const [flatSurface, setFlatSurface] = useState(existingTrip?.flatSurface || false);
  const [risks, setRisks] = useState(existingTrip?.risks || '');

  // Validation state
  const [showErrors, setShowErrors] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const handleSectionToggle = (sectionId: string) => {
    setExpandedSection(prev => prev === sectionId ? null : sectionId);
  };

  // Property-first gate
  const showPropertyGate = !property && !existingTrip;

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
      setCurrency(CODE_TO_SYMBOL[existingTrip.currencyCode || ''] || currencyForCity(cityId));

      const propertyData = existingTrip.property?.data;
      const isProp = propertyData && propertyData.type === 'property';

      setAddress(existingTrip.address || existingTrip.property?.address || '');
      setAreaSqm(existingTrip.areaSqm?.toString() || (isProp && propertyData.size ? propertyData.size.toString() : ''));
      setStorageSqm(existingTrip.storageSqm?.toString() || '');
      setPropertyType(existingTrip.propertyType);
      setFootfallEstimate(existingTrip.footfallEstimate?.toString() || '');
      setNeighbourhoodProfile(existingTrip.neighbourhoodProfile || (isProp && propertyData.district ? propertyData.district : ''));
      setCompetitorEntries(parseCompetitors(existingTrip.nearbyCompetitors));

      setMonthlyRent(existingTrip.monthlyRent?.toString() || (isProp && propertyData.price ? propertyData.price.toString() : ''));
      setServiceFees(existingTrip.serviceFees?.toString() || '');
      setDeposit(existingTrip.deposit?.toString() || (isProp && propertyData.price ? (propertyData.price * 2).toString() : ''));
      setTransferFee(existingTrip.transferFee?.toString() || (isProp && propertyData.transfer ? propertyData.transfer.toString() : ''));
      setFitoutCost(existingTrip.fitoutCost?.toString() || '');
      setOpeningInvestment(existingTrip.openingInvestment?.toString() || '');
      setExpectedDailyRevenue(existingTrip.expectedDailyRevenue?.toString() || '');
      setMonthlyRevenueRange(existingTrip.monthlyRevenueRange || '');
      setPaybackMonths(existingTrip.paybackMonths?.toString() || '');

      setInvestmentManual(!!existingTrip.openingInvestment);
      setDailyRevenueManual(!!existingTrip.expectedDailyRevenue);
      setMonthlyRevenueManual(!!existingTrip.monthlyRevenueRange);
      setPaybackManual(!!existingTrip.paybackMonths);

      setVentilation(existingTrip.ventilation);
      setWaterWaste(existingTrip.waterWaste);
      setPowerCapacity(existingTrip.powerCapacity);
      setVisibility(existingTrip.visibility);
      setDeliveryAccess(existingTrip.deliveryAccess);
      setSeatingCapacity(existingTrip.seatingCapacity?.toString() || '');
      setOutdoorSeating(
        typeof existingTrip.outdoorSeating === 'boolean'
          ? (existingTrip.outdoorSeating ? 'street' : undefined)
          : existingTrip.outdoorSeating
      );
      setFlatSurface(existingTrip.flatSurface || false);
      setRisks(existingTrip.risks || '');
    } else {
      setTripId(null);
      setName('');
      setProperty(null);
      setRelatedPlaces([]);
      setChecklist(createDefaultChecklist());
      setAttachments([]);
      setCurrency(currencyForCity(cityId));
      setAddress('');
      setAreaSqm('');
      setStorageSqm('');
      setPropertyType(undefined);
      setFootfallEstimate('');
      setNeighbourhoodProfile('');
      setCompetitorEntries([]);
      setMonthlyRent('');
      setServiceFees('');
      setDeposit('');
      setTransferFee('');
      setFitoutCost('');
      setOpeningInvestment('');
      setExpectedDailyRevenue('');
      setMonthlyRevenueRange('');
      setPaybackMonths('');
      setInvestmentManual(false);
      setDailyRevenueManual(false);
      setMonthlyRevenueManual(false);
      setPaybackManual(false);
      setVentilation(undefined);
      setWaterWaste(undefined);
      setPowerCapacity(undefined);
      setVisibility(undefined);
      setDeliveryAccess(undefined);
      setSeatingCapacity('');
      setOutdoorSeating(undefined);
      setFlatSurface(false);
      setRisks('');
    }
    setShowErrors(false);
    setAttemptedSubmit(false);
  }, [existingTrip]);

  // Pre-populate from linked property
  useEffect(() => {
    if (pendingLinkedItems.length > 0) {
      const firstItem = pendingLinkedItems[0];
      setProperty(firstItem);
      if (firstItem.address) setAddress(firstItem.address);
      if (!name && firstItem.name) setName(firstItem.name);

      const pd = firstItem.data;
      if (pd && pd.type === 'property') {
        if (!areaSqm && pd.size) setAreaSqm(pd.size.toString());
        if (!neighbourhoodProfile && pd.district) setNeighbourhoodProfile(pd.district);
        if (!monthlyRent && pd.price) setMonthlyRent(pd.price.toString());
        if (!deposit && pd.price) setDeposit((pd.price * 2).toString());
        if (!transferFee && pd.transfer) setTransferFee(pd.transfer.toString());
      }

      // Pre-populate from market defaults
      const currencyCode = CURRENCY_MAP[currency] as keyof typeof defaults;
      const md = defaults[currencyCode];
      if (md) {
        if (!fitoutCost && md.fitoutCost) setFitoutCost(md.fitoutCost.toString());
        if (!footfallEstimate && md.avgFootfall) setFootfallEstimate(md.avgFootfall.toString());
      }

      // Reset dirty flags so auto-calc kicks in
      setInvestmentManual(false);
      setDailyRevenueManual(false);
      setMonthlyRevenueManual(false);
      setPaybackManual(false);
    }
  }, [pendingLinkedItems, areaSqm, neighbourhoodProfile, monthlyRent, deposit, transferFee, name, defaults, fitoutCost, footfallEstimate, currency]);

  // Auto-calculate: Total Investment
  useEffect(() => {
    if (investmentManual) return;
    const dep = parseFloat(deposit) || 0;
    const tf = parseFloat(transferFee) || 0;
    const fc = parseFloat(fitoutCost) || 0;
    if (dep > 0 || tf > 0 || fc > 0) {
      setOpeningInvestment(Math.round(dep + tf + fc).toString());
    }
  }, [deposit, transferFee, fitoutCost, investmentManual]);

  // Auto-calculate: Revenue + Payback
  useEffect(() => {
    if (!defaults) return;
    const footfall = parseFloat(footfallEstimate);
    if (isNaN(footfall) || footfall <= 0) return;

    const currencyCode = CURRENCY_MAP[currency] as keyof typeof defaults;
    const cd = defaults[currencyCode];
    if (!cd) return;
    const rate = cd.conversionRate / 100;
    const ticket = cd.avgTicket;

    const dailyRev = Math.round(footfall * rate * ticket);
    const monthlyRev = dailyRev * 30;

    if (!dailyRevenueManual) {
      setExpectedDailyRevenue(dailyRev.toString());
    }
    if (!monthlyRevenueManual) {
      setMonthlyRevenueRange(monthlyRev.toLocaleString());
    }
    if (!paybackManual) {
      const rent = parseFloat(monthlyRent) || 0;
      const fees = parseFloat(serviceFees) || 0;
      const investment = investmentManual
        ? (parseFloat(openingInvestment) || 0)
        : (parseFloat(deposit) || 0) + (parseFloat(transferFee) || 0) + (parseFloat(fitoutCost) || 0);
      const monthlyProfit = monthlyRev - rent - fees;
      if (monthlyProfit > 0 && investment > 0) {
        setPaybackMonths(Math.ceil(investment / monthlyProfit).toString());
      }
    }
  }, [footfallEstimate, monthlyRent, serviceFees, openingInvestment, deposit, transferFee, fitoutCost, investmentManual, currency, defaults, dailyRevenueManual, monthlyRevenueManual, paybackManual]);

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
    nearbyCompetitors: competitorEntries.length > 0 ? JSON.stringify(competitorEntries) : '',
    monthlyRent: monthlyRent ? parseFloat(monthlyRent) : undefined,
    serviceFees: serviceFees ? parseFloat(serviceFees) : undefined,
    deposit: deposit ? parseFloat(deposit) : undefined,
    transferFee: transferFee ? parseFloat(transferFee) : undefined,
    fitoutCost: fitoutCost ? parseFloat(fitoutCost) : undefined,
    openingInvestment: openingInvestment ? parseFloat(openingInvestment) : undefined,
    expectedDailyRevenue: expectedDailyRevenue ? parseFloat(expectedDailyRevenue) : undefined,
    monthlyRevenueRange,
    paybackMonths: paybackMonths ? parseInt(paybackMonths) : undefined,
    currencyCode: CURRENCY_MAP[currency],
    ventilation,
    waterWaste,
    powerCapacity,
    visibility,
    deliveryAccess,
    seatingCapacity: seatingCapacity ? parseInt(seatingCapacity) : undefined,
    outdoorSeating,
    flatSurface,
    risks,
  });

  const handleSaveDraft = () => {
    const data = buildTripData();
    if (tripId) {
      updateTrip(tripId, data);
    } else {
      const newTrip = createTrip(cityId, 'Guest');
      setTripId(newTrip.id);
      updateTrip(newTrip.id, data);
    }
    onClose();
  };

  const handleSubmit = () => {
    setAttemptedSubmit(true);
    setShowErrors(true);
    if (!isValid) return;

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

  const handleAddAttachment = async (file: File) => {
    const result = await processFileToAttachment(file, 'Guest');
    if (result.success && result.attachment) {
      setAttachments(prev => [...prev, result.attachment!]);
    }
    return result;
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    setAttachments(prev => prev.filter(a => a.id !== attachmentId));
  };

  const handleNavigateToCompetitor = (lat: number, lon: number) => {
    handleSaveDraft();
    const placeId = `cafe-${lat.toFixed(5)}-${lon.toFixed(5)}`;
    window.dispatchEvent(new CustomEvent('navigate-and-open-popup', {
      detail: { lat, lon, placeId, placeType: 'cafe' },
    }));
  };

  const handleNavigateToProperty = () => {
    if (!property?.data) return;
    const lat = property.data.latitude ?? property.data.lat;
    const lon = property.data.longitude ?? property.data.lon;
    if (lat == null || lon == null) return;
    handleSaveDraft();
    window.dispatchEvent(new CustomEvent('navigate-and-open-popup', {
      detail: { lat, lon, placeId: property.id, placeType: 'property', data: property.data },
    }));
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[100] flex ${isMobile ? 'items-end' : 'items-center justify-center'}`}>
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className={`relative w-full bg-white shadow-2xl overflow-hidden flex flex-col ${
        isMobile
          ? 'max-h-[90vh] rounded-t-2xl'
          : 'max-w-2xl mx-4 rounded-2xl max-h-[90vh]'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={isMobile ? { paddingTop: "calc(16px + env(safe-area-inset-top, 0px))" } : undefined}>
          <h2 className="text-xl font-bold font-heading text-zinc-900">
            {existingTrip ? 'Edit Scouting Trip' : 'New Scouting Trip'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        {/* Form content */}
        <div className="flex-1 overflow-y-auto">
          {showPropertyGate ? (
            /* Property-first gate */
            <div className="px-6 py-12 text-center">
              <Building className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
              <h3 className="text-base font-semibold font-heading text-zinc-900 mb-1">Start by selecting a property</h3>
              <p className="text-sm text-zinc-500 mb-6">
                Choose a property from the map to begin your scouting trip
              </p>
              {onStartLinking && (
                <Button onClick={onStartLinking} size="lg" className="h-11 gap-2">
                  <MapPin className="w-4 h-4" />
                  Select Property from Map
                </Button>
              )}
            </div>
          ) : (
            /* Full form */
            <>
              {/* Currency toggle */}
              <div className="px-6 py-2">
                <div className="flex rounded-lg bg-zinc-200/70 p-0.5">
                  {([['€', 'EUR'], ['Kč', 'CZK'], ['zł', 'PLN']] as const).map(([sym, code]) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setCurrency(sym as typeof currency)}
                      className={cn(
                        "flex-1 py-1.5 text-xs font-medium rounded-[7px] transition-all",
                        currency === sym
                          ? "bg-white text-zinc-900 shadow-sm"
                          : "text-zinc-500 hover:text-zinc-700"
                      )}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>

              {/* Trip name */}
              <div className="px-6 py-4 border-b border-zinc-200">
                <FormField label="Name" required error={showErrors && errors.name}>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder=""
                    className={cn(showErrors && errors.name && "border-red-500 focus:ring-red-500/20")}
                  />
                  {showErrors && errors.name && (
                    <p className="text-xs text-red-500 mt-1">Trip name is required</p>
                  )}
                </FormField>
              </div>

              {/* Property */}
              <div className="px-6 py-4 border-b border-zinc-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-amber-600" />
                    <label className="text-sm font-medium text-zinc-700">Property</label>
                  </div>
                  {onStartLinking && property && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onStartLinking}
                      className="h-7 text-xs gap-1"
                    >
                      <MapPin className="w-3 h-3" />
                      Change
                    </Button>
                  )}
                </div>
                {property ? (
                  <button
                    type="button"
                    onClick={handleNavigateToProperty}
                    className="w-full flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors text-left group"
                  >
                    <MapPin className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{property.name}</p>
                      {property.address && (
                        <p className="text-xs text-zinc-500 truncate">{property.address}</p>
                      )}
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-amber-400 group-hover:text-amber-600 flex-shrink-0" />
                  </button>
                ) : onStartLinking ? (
                  <button
                    type="button"
                    onClick={onStartLinking}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/50 hover:bg-amber-50 hover:border-amber-400 transition-colors text-amber-700"
                  >
                    <MapPin className="w-4 h-4" />
                    <span className="text-sm font-medium">Select a property from the map</span>
                  </button>
                ) : null}
              </div>

              {/* Checklist */}
              <FormSection id="checklist" title="Checklist" icon={ClipboardCheck} badge={`${checklist.filter(i => i.isChecked).length}/${checklist.length}`} expandedSection={expandedSection} onToggle={handleSectionToggle}>
                <TripChecklist
                  items={checklist}
                  onChange={setChecklist}
                />
              </FormSection>

              {/* Attachments */}
              <FormSection id="attachments" title="Attachments" icon={Paperclip} expandedSection={expandedSection} onToggle={handleSectionToggle}>
                <AttachmentGallery
                  attachments={attachments}
                  onUpload={handleAddAttachment}
                  onRemove={handleRemoveAttachment}
                />
              </FormSection>

              {/* Location */}
              <FormSection id="location" title="Location" icon={MapPin} expandedSection={expandedSection} onToggle={handleSectionToggle}>
                <FormField label="Address" required error={showErrors && errors.address}>
                  {property ? (
                    <Input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder=""
                      className={cn(showErrors && errors.address && "border-red-500 focus:ring-red-500/20")}
                    />
                  ) : (
                    <p className="text-sm text-zinc-500 italic py-2">
                      Select a property above to populate the address
                    </p>
                  )}
                  {showErrors && errors.address && (
                    <p className="text-xs text-red-500 mt-1">Address is required</p>
                  )}
                </FormField>

                <div className="grid grid-cols-1 gap-4">
                  <FormField label="Area (m²)">
                    <Input type="number" value={areaSqm} onChange={(e) => setAreaSqm(e.target.value)} placeholder="" />
                  </FormField>
                  <FormField label="Storage (m²)">
                    <Input type="number" value={storageSqm} onChange={(e) => setStorageSqm(e.target.value)} placeholder="" />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <FormField label="Property Type">
                    <Select value={propertyType} onChange={setPropertyType} options={propertyTypeLabels} />
                  </FormField>
                  <FormField label="Footfall (daily)">
                    <Input type="number" value={footfallEstimate} onChange={(e) => setFootfallEstimate(e.target.value)} placeholder="" />
                  </FormField>
                </div>

                <FormField label="Neighbourhood">
                  <textarea
                    value={neighbourhoodProfile}
                    onChange={(e) => setNeighbourhoodProfile(e.target.value)}
                    placeholder="Area demographics, character..."
                    className="w-full h-20 px-3 py-2 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 resize-none"
                  />
                </FormField>

                <FormField label="Competitors">
                  <NearbyCompetitors
                    cityId={cityId}
                    propertyLat={property?.data?.latitude ?? property?.data?.lat}
                    propertyLon={property?.data?.longitude ?? property?.data?.lon}
                    entries={competitorEntries}
                    onEntriesChange={setCompetitorEntries}
                    onNavigate={handleNavigateToCompetitor}
                  />
                </FormField>
              </FormSection>

              {/* Financial */}
              <FormSection id="financial" title="Financial" icon={DollarSign} expandedSection={expandedSection} onToggle={handleSectionToggle}>
                <div className="grid grid-cols-1 gap-4">
                  <FormField label="Rent (monthly)">
                    <Input type="number" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} placeholder="" />
                  </FormField>
                  <FormField label="Service Fees (monthly)">
                    <Input type="number" value={serviceFees} onChange={(e) => setServiceFees(e.target.value)} placeholder="" />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <FormField label="Deposit">
                    <Input type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="" />
                  </FormField>
                  <FormField label="Transfer Fee">
                    <Input type="number" value={transferFee} onChange={(e) => setTransferFee(e.target.value)} placeholder="" />
                  </FormField>
                </div>

                <FormField label="Fit-out">
                  <Input type="number" value={fitoutCost} onChange={(e) => setFitoutCost(e.target.value)} placeholder="" />
                </FormField>

                <FormField label="Total Investment">
                  <AutoInput
                    type="number"
                    value={openingInvestment}
                    onChange={(val, manual) => { setOpeningInvestment(val); if (manual) setInvestmentManual(true); }}
                    isAuto={!investmentManual}
                  />
                </FormField>

                <div className="grid grid-cols-1 gap-4">
                  <FormField label="Revenue (daily)">
                    <AutoInput
                      type="number"
                      value={expectedDailyRevenue}
                      onChange={(val, manual) => { setExpectedDailyRevenue(val); if (manual) setDailyRevenueManual(true); }}
                      isAuto={!dailyRevenueManual}
                    />
                  </FormField>
                  <FormField label="Revenue Range (monthly)">
                    <AutoInput
                      value={monthlyRevenueRange}
                      onChange={(val, manual) => { setMonthlyRevenueRange(val); if (manual) setMonthlyRevenueManual(true); }}
                      isAuto={!monthlyRevenueManual}
                      placeholder="e.g. 8,000 - 12,000"
                    />
                  </FormField>
                </div>

                <FormField label="Payback (months)">
                  <AutoInput
                    type="number"
                    value={paybackMonths}
                    onChange={(val, manual) => { setPaybackMonths(val); if (manual) setPaybackManual(true); }}
                    isAuto={!paybackManual}
                  />
                </FormField>
              </FormSection>

              {/* Operational */}
              <FormSection id="operational" title="Operational" icon={Settings} expandedSection={expandedSection} onToggle={handleSectionToggle}>
                <div className="grid grid-cols-1 gap-4">
                  <FormField label="Ventilation">
                    <Select value={ventilation} onChange={setVentilation} options={conditionLabels} />
                  </FormField>
                  <FormField label="Water/Waste">
                    <Select value={waterWaste} onChange={setWaterWaste} options={conditionLabels} />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <FormField label="Power">
                    <Select value={powerCapacity} onChange={setPowerCapacity} options={conditionLabels} />
                  </FormField>
                  <FormField label="Visibility">
                    <Select value={visibility} onChange={setVisibility} options={visibilityLabels} />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <FormField label="Delivery">
                    <Select value={deliveryAccess} onChange={setDeliveryAccess} options={accessLabels} />
                  </FormField>
                  <FormField label="Seats">
                    <Input type="number" value={seatingCapacity} onChange={(e) => setSeatingCapacity(e.target.value)} placeholder="" />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <FormField label="Outdoor Seating">
                    <Select value={outdoorSeating} onChange={setOutdoorSeating} options={outdoorSeatingLabels} />
                  </FormField>
                  <FormField label="Flat Surface">
                    <label className="flex items-center gap-2 cursor-pointer h-10">
                      <input
                        type="checkbox"
                        checked={flatSurface}
                        onChange={(e) => setFlatSurface(e.target.checked)}
                        className="w-4 h-4 rounded border-zinc-300"
                      />
                      <span className="text-sm text-zinc-700">Yes</span>
                    </label>
                  </FormField>
                </div>
              </FormSection>

              {/* Risks */}
              <FormSection id="risks" title="Risks" icon={AlertTriangle} expandedSection={expandedSection} onToggle={handleSectionToggle}>
                <FormField label="Risks">
                  <textarea
                    value={risks}
                    onChange={(e) => setRisks(e.target.value)}
                    placeholder="Any risks or concerns..."
                    className="w-full h-24 px-3 py-2 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 resize-none"
                  />
                </FormField>
              </FormSection>
            </>
          )}
        </div>

        {/* Footer */}
        {!showPropertyGate && (
          <div className="flex flex-col gap-2 px-4 sm:px-6 py-3 border-t border-zinc-200 bg-zinc-50">
            {showErrors && hasErrors && (
              <p className="text-xs text-red-500">
                Please fill in required fields: {[
                  errors.name && "Name",
                  errors.address && "Address"
                ].filter(Boolean).join(", ")}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="relative group">
                <Button
                  size="lg"
                  onClick={handleSubmit}
                  disabled={attemptedSubmit && !isValid}
                  className={cn(
                    "w-full h-11 gap-1.5 border border-transparent",
                    attemptedSubmit && !isValid && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <Send className="w-4 h-4" />
                  Submit
                </Button>
                {attemptedSubmit && !isValid && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    Fill required fields first
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900" />
                  </div>
                )}
              </div>
              <Button variant="outline" size="lg" onClick={handleSaveDraft} className="w-full h-11 gap-1.5">
                <Save className="w-4 h-4" />
                Save Draft
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
