// Trip assessment scoring: maps scouting trip form fields to 6-pillar scores.
// Pure function, no side effects. Runs client-side on save and load.

import type {
  ScoutingTrip,
  TripAssessment,
  TripPillarScore,
} from '@/types/scouting';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreStickiness(trip: ScoutingTrip): TripPillarScore {
  const fields: number[] = [];
  let score = 0;

  if (trip.seatingCapacity != null) {
    fields.push(trip.seatingCapacity);
    if (trip.seatingCapacity <= 10) score += 1.5;
    else if (trip.seatingCapacity <= 25) score += 3;
    else if (trip.seatingCapacity <= 50) score += 4;
    else score += 5;
  }

  if (trip.outdoorSeating) {
    fields.push(1);
    if (trip.outdoorSeating === 'street' || trip.outdoorSeating === 'courtyard') {
      score += 1;
    } else {
      score += 0.5;
    }
  }

  if (trip.flatSurface != null) {
    fields.push(1);
    if (trip.flatSurface) score += 0.5;
  }

  if (trip.areaSqm != null && trip.areaSqm > 60) {
    fields.push(trip.areaSqm);
    score += 0.5;
  }

  if (fields.length === 0) {
    return { pillar: 'Stickiness', weight: 20, score: null, confidence: 'no_data', label: 'Stickiness', explanation: 'No seating or space data entered' };
  }

  return {
    pillar: 'Stickiness',
    weight: 20,
    score: clamp(score, 0, 5),
    confidence: fields.length >= 3 ? 'high' : fields.length >= 2 ? 'medium' : 'low',
    label: 'Stickiness',
    explanation: `${trip.seatingCapacity ?? '?'} seats, ${trip.outdoorSeating ?? 'no'} outdoor`,
  };
}

function scoreScalability(trip: ScoutingTrip): TripPillarScore {
  if (trip.areaSqm == null) {
    return { pillar: 'Scalability', weight: 0, score: null, confidence: 'no_data', label: 'Scalability', explanation: 'No area data entered' };
  }

  let score = 0;
  if (trip.areaSqm < 40) score = 1;
  else if (trip.areaSqm < 60) score = 2;
  else if (trip.areaSqm < 80) score = 3;
  else if (trip.areaSqm < 100) score = 4;
  else score = 5;

  if (trip.storageSqm != null && trip.storageSqm > 10) score += 0.5;
  if (trip.propertyType === 'retail') score += 0.5;

  return {
    pillar: 'Scalability',
    weight: 0,
    score: clamp(score, 0, 5),
    confidence: 'medium',
    label: 'Scalability',
    explanation: `${trip.areaSqm}m², ${trip.storageSqm ?? 0}m² storage`,
  };
}

function scoreDemand(trip: ScoutingTrip): TripPillarScore {
  const hasFootfall = trip.footfallEstimate != null;
  const hasVisibility = trip.visibility != null;
  const hasDelivery = trip.deliveryAccess != null;

  if (!hasFootfall && !hasVisibility && !hasDelivery) {
    return { pillar: 'Demand', weight: 30, score: null, confidence: 'no_data', label: 'Demand Validation', explanation: 'No footfall or visibility data' };
  }

  let score = 0;
  let dataPoints = 0;

  if (hasFootfall) {
    dataPoints++;
    const f = trip.footfallEstimate!;
    if (f < 500) score += 1;
    else if (f < 1500) score += 2;
    else if (f < 3000) score += 3;
    else if (f < 5000) score += 4;
    else score += 5;
  }

  if (hasVisibility) {
    dataPoints++;
    if (trip.visibility === 'strong') score += 1;
    else if (trip.visibility === 'medium') score += 0.5;
  }

  if (hasDelivery) {
    dataPoints++;
    if (trip.deliveryAccess === 'good') score += 0.5;
  }

  return {
    pillar: 'Demand',
    weight: 30,
    score: clamp(score, 0, 5),
    confidence: dataPoints >= 2 ? 'high' : 'low',
    label: 'Demand Validation',
    explanation: `${trip.footfallEstimate ?? '?'} daily footfall, ${trip.visibility ?? '?'} visibility`,
  };
}

function scoreSpendingPower(trip: ScoutingTrip): TripPillarScore {
  if (trip.monthlyRent == null) {
    return { pillar: 'SpendingPower', weight: 15, score: null, confidence: 'no_data', label: 'Spending Power', explanation: 'No rent data' };
  }

  let value: number;
  let conf: 'high' | 'medium' | 'low';

  if (trip.areaSqm != null && trip.areaSqm > 0) {
    value = trip.monthlyRent / trip.areaSqm;
    conf = 'medium';
    // Rent per sqm scoring (EUR/sqm/month for Madrid commercial)
    let score: number;
    if (value < 15) score = 1;
    else if (value < 25) score = 2;
    else if (value < 40) score = 3;
    else if (value < 60) score = 4;
    else score = 5;

    return {
      pillar: 'SpendingPower',
      weight: 15,
      score: clamp(score, 0, 5),
      confidence: conf,
      label: 'Spending Power',
      explanation: `€${Math.round(value)}/m²/month`,
    };
  }

  // Only raw rent available
  let score: number;
  if (trip.monthlyRent < 1000) score = 1;
  else if (trip.monthlyRent < 2000) score = 2;
  else if (trip.monthlyRent < 3500) score = 3;
  else if (trip.monthlyRent < 5000) score = 4;
  else score = 5;

  return {
    pillar: 'SpendingPower',
    weight: 15,
    score: clamp(score, 0, 5),
    confidence: 'low',
    label: 'Spending Power',
    explanation: `€${trip.monthlyRent}/month (no area for normalization)`,
  };
}

function scoreOperationsRisk(trip: ScoutingTrip): 'low' | 'medium' | 'high' | 'unknown' {
  const fields = [trip.ventilation, trip.waterWaste, trip.powerCapacity].filter(Boolean);
  if (fields.length === 0) return 'unknown';

  let penalty = 0;
  for (const f of fields) {
    if (f === 'needs_upgrade') penalty += 1;
    if (f === 'complex') penalty += 2;
  }

  if (penalty === 0) return 'low';
  if (penalty <= 2) return 'medium';
  return 'high';
}

export function computeTripAssessment(trip: ScoutingTrip): TripAssessment {
  const pillars: TripPillarScore[] = [
    scoreStickiness(trip),
    scoreScalability(trip),
    scoreDemand(trip),
    scoreSpendingPower(trip),
    // Competition and Customer Type are free-text, not auto-scored
    { pillar: 'Competition', weight: 15, score: null, confidence: 'no_data', label: 'Competition', explanation: 'Needs manual review' },
    { pillar: 'CustomerType', weight: 20, score: null, confidence: 'no_data', label: 'Customer Type', explanation: 'Needs manual review' },
  ];

  const scored = pillars.filter(p => p.score != null && p.weight > 0);
  const scoredCount = scored.length;

  let compositeScore: number | null = null;
  if (scoredCount >= 2) {
    const totalWeight = scored.reduce((sum, p) => sum + p.weight, 0);
    const weightedSum = scored.reduce((sum, p) => sum + (p.score! * p.weight), 0);
    compositeScore = Math.round((weightedSum / totalWeight) * 10) / 10;
  }

  let confidence: 'high' | 'medium' | 'low';
  if (scoredCount >= 3) confidence = 'high';
  else if (scoredCount >= 2) confidence = 'medium';
  else confidence = 'low';

  return {
    compositeScore,
    confidence,
    pillars,
    operationsRisk: scoreOperationsRisk(trip),
    scoredPillarCount: scoredCount,
  };
}
