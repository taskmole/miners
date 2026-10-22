"use client";

/**
 * Map cards for cafes (EU Coffee Trip, Google, our own Miners cafes) and for
 * other places (metro, gyms, offices…). No main button: these are for
 * looking up, so the bottom row is just their links and More.
 */
import React from "react";
import { Facebook, Globe, Instagram, Star } from "lucide-react";
import type { CafeData, OtherPoiData } from "@/hooks/useMapData";
import { CATEGORY_LABELS, type CafeProfile } from "@/hooks/useCafeProfiles";
import type { PlaceType } from "@/types/lists";
import { PoiCard, MoreMenu, LinkTile, MapsTile } from "./PoiCard";
import type { PlaceNotes } from "./NotesFilesView";
import { usePlaceCard, FactList, AgeChip, NotesCount } from "./CardSteps";
import { isShown, todayHours } from "./card-format";

/** Address with the notes count on the right; nothing when both are empty. */
function AddressRow({ address, notes, onOpen }: { address: string; notes: PlaceNotes; onOpen: () => void }) {
  if (!address && notes.count === 0) return null;
  return (
    <div className="poi-factrow is-address">
      <span className="poi-facts">{address}</span>
      <NotesCount notes={notes} onOpen={onOpen} />
    </div>
  );
}

// ── Cafes ───────────────────────────────────────────────────────────────

interface CafeCardProps {
  cafe: CafeData;
  placeId: string;
  mapsUrl: string;
  /** EU Coffee Trip or a Google cafe; decides Share/Save type and the logo. */
  isEuCoffeeTrip: boolean;
  /** Our own cafe's profile (category, seats…), once loaded. */
  profile: CafeProfile | null;
  canSeeRevenue: boolean;
  onClose?: () => void;
}

function formatRevenue(v: number): string {
  if (v >= 1000) {
    const k = v / 1000;
    return `€${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K/mo`;
  }
  return `€${v}/mo`;
}

export function CafeCard({ cafe, placeId, mapsUrl, isEuCoffeeTrip, profile, canSeeRevenue, onClose }: CafeCardProps) {
  const own = !!cafe.franchisePartner;
  const placeType = isEuCoffeeTrip ? "eu_coffee_trip" : "regular_cafe";
  const card = usePlaceCard({
    place: { placeId, placeType, placeName: cafe.name, placeAddress: cafe.address, lat: cafe.lat, lon: cafe.lon },
    notesType: "cafe",
    share: { placeId, placeType, title: cafe.name, address: cafe.address, photoUrl: cafe.image },
    subtitle: cafe.name,
  });
  // Our own cafes are never saved to a list.
  const items = [card.items.share, ...(own ? [] : [card.items.save]), card.items.notes, card.items.hide];

  // The monthly refresh re-reads Google's details; fetchedAt is only when
  // the cafe first appeared.
  const updatedAt = isEuCoffeeTrip ? cafe.fetchedAt : (cafe.refreshedAt ?? cafe.fetchedAt);
  const hours = todayHours(cafe.openingHours);
  const rating = isShown(cafe.rating) ? cafe.rating : null;
  const reviews = isShown(cafe.reviewCount) ? cafe.reviewCount : null;

  const chips = (
    <>
      {own && <span className="poi-tag"><Star aria-hidden />Miners</span>}
      {own && canSeeRevenue && isShown(profile?.monthlyRevenue) && (
        <span className="poi-tag is-sales">{formatRevenue(profile.monthlyRevenue)} sales</span>
      )}
      {cafe.premium && <span className="poi-tag"><Star aria-hidden />Premium</span>}
      <AgeChip date={updatedAt} hidden={card.hidden} />
    </>
  );

  const meta = [
    rating && (
      <span key="r" className="poi-rating"><Star aria-hidden />{rating.toFixed(1)}{reviews && <span>({reviews})</span>}</span>
    ),
    cafe.priceRange && <span key="p">{cafe.priceRange}</span>,
    hours && <span key="h">{hours}</span>,
  ].filter(Boolean);

  const headline = (
    <>
      <div className="poi-name">{cafe.name}</div>
      {meta.length > 0 && <div className="poi-meta">{meta}</div>}
    </>
  );

  // Own cafes: what kind of shop it is leads, then its size.
  const facts: string[] = [];
  if (own && profile?.category) {
    facts.push(CATEGORY_LABELS[profile.category]);
    const seats = (profile.interiorSeats || 0) + (profile.exteriorSeats || 0);
    if (seats > 0) facts.push(`${seats} seats`);
    if (isShown(profile.areaSqm)) facts.push(`${profile.areaSqm} m²`);
    if (profile.hasKitchen) facts.push("Kitchen");
  }

  const body = (
    <>
      <AddressRow address={cafe.address} notes={card.notes} onOpen={() => card.setStep("notes")} />
      {facts.length > 0 && (
        <div className="poi-factrow is-tight">
          <FactList facts={facts} />
        </div>
      )}
    </>
  );

  const actions = (
    <>
      <span className="poi-tiles">
        {isEuCoffeeTrip && cafe.link && (
          <LinkTile href={cafe.link} label="Open on European Coffee Trip" kind="fill">
            <img src="/assets/eu_coffee_trip_logo.png" alt="" />
          </LinkTile>
        )}
        <MapsTile href={mapsUrl} />
        {cafe.instagram && <LinkTile href={cafe.instagram} label="Instagram" kind="glyph"><Instagram aria-hidden /></LinkTile>}
        {cafe.facebook && <LinkTile href={cafe.facebook} label="Facebook" kind="glyph"><Facebook aria-hidden /></LinkTile>}
        {cafe.website && <LinkTile href={cafe.website} label="Website" kind="glyph"><Globe aria-hidden /></LinkTile>}
      </span>
      <span className="poi-bar-spacer" />
      <MoreMenu items={items} />
    </>
  );

  return (
    <PoiCard
      onClose={onClose}
      photos={cafe.image ? [cafe.image] : []}
      photoAlt={cafe.name}
      chips={chips}
      headline={headline}
      body={body}
      actions={actions}
      steps={card.steps}
      step={card.step}
      onStepChange={card.setStep}
    />
  );
}

// ── Other places ────────────────────────────────────────────────────────

export function PlaceCard({ poi, placeId, mapsUrl, onClose }: {
  poi: OtherPoiData;
  placeId: string;
  mapsUrl: string;
  onClose?: () => void;
}) {
  const card = usePlaceCard({
    place: { placeId, placeType: poi.type as PlaceType, placeName: poi.name, placeAddress: poi.address, lat: poi.lat, lon: poi.lon },
    notesType: poi.type,
    share: { placeId, placeType: poi.type, title: poi.name, address: poi.address },
    subtitle: poi.name,
  });

  const chips = (
    <>
      <span className="poi-tag">{poi.category}</span>
      <AgeChip hidden={card.hidden} />
    </>
  );

  const body = <AddressRow address={poi.address} notes={card.notes} onOpen={() => card.setStep("notes")} />;

  const actions = (
    <>
      <span className="poi-tiles">
        <MapsTile href={mapsUrl} />
        {poi.website && <LinkTile href={poi.website} label="Website" kind="glyph"><Globe aria-hidden /></LinkTile>}
      </span>
      <span className="poi-bar-spacer" />
      <MoreMenu items={[card.items.share, card.items.save, card.items.notes, card.items.hide]} />
    </>
  );

  return (
    <PoiCard
      onClose={onClose}
      photoAlt={poi.name}
      chips={chips}
      headline={<div className="poi-name">{poi.name}</div>}
      body={body}
      actions={actions}
      steps={card.steps}
      step={card.step}
      onStepChange={card.setStep}
    />
  );
}
