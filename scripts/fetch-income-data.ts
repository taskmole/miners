/**
 * INE ADRH 2023 Income Data Fetcher
 *
 * Fetches average income per person data for Madrid, Barcelona, and Seville (census sections)
 * from the Spanish National Statistics Institute (INE) ArcGIS API.
 *
 * Run with: npx ts-node scripts/fetch-income-data.ts
 *
 * Data source: https://www.ine.es/ADRH/
 * API: https://services7.arcgis.com/SEjlCWTAIsMEEXNx/arcgis/rest/services/ADRH_2023_Renta_media_por_persona/FeatureServer/3
 */

import * as fs from "fs";

// INE ArcGIS FeatureServer endpoint for ADRH 2023 census sections (layer 3)
// Note: The old WMS_Test endpoint was returning stale 2021 data
const BASE_URL = "https://services7.arcgis.com/SEjlCWTAIsMEEXNx/arcgis/rest/services/ADRH_2023_Renta_media_por_persona/FeatureServer/3/query";
const OUTPUT_FILE = "income_2023.geojson";
const PAGE_SIZE = 2000;

// Madrid province code 28, Barcelona province code 08, Seville province code 41
const FILTER = "CPRO='28' OR CPRO='08' OR CPRO='41'";

// Madrid district codes → names mapping
const MADRID_DISTRICTS: Record<string, string> = {
  "01": "Centro",
  "02": "Arganzuela",
  "03": "Retiro",
  "04": "Salamanca",
  "05": "Chamartín",
  "06": "Tetuán",
  "07": "Chamberí",
  "08": "Fuencarral-El Pardo",
  "09": "Moncloa-Aravaca",
  "10": "Latina",
  "11": "Carabanchel",
  "12": "Usera",
  "13": "Puente de Vallecas",
  "14": "Moratalaz",
  "15": "Ciudad Lineal",
  "16": "Hortaleza",
  "17": "Villaverde",
  "18": "Villa de Vallecas",
  "19": "Vicálvaro",
  "20": "San Blas-Canillejas",
  "21": "Barajas"
};

// Barcelona district codes → names mapping
const BARCELONA_DISTRICTS: Record<string, string> = {
  "01": "Ciutat Vella",
  "02": "Eixample",
  "03": "Sants-Montjuïc",
  "04": "Les Corts",
  "05": "Sarrià-Sant Gervasi",
  "06": "Gràcia",
  "07": "Horta-Guinardó",
  "08": "Nou Barris",
  "09": "Sant Andreu",
  "10": "Sant Martí"
};

// Seville district codes → names mapping
const SEVILLE_DISTRICTS: Record<string, string> = {
  "01": "Casco Antiguo",
  "02": "Macarena",
  "03": "Nervión",
  "04": "Cerro-Amate",
  "05": "Sur",
  "06": "Triana",
  "07": "Norte",
  "08": "San Pablo-Santa Justa",
  "09": "Este-Alcosa-Torreblanca",
  "10": "Bellavista-La Palmera",
  "11": "Los Remedios"
};

interface INEFeature {
  type: "Feature";
  properties: {
    CUSEC: string;      // Census section ID (primary key)
    CPRO: string;       // Province code (28=Madrid, 08=Barcelona, 41=Seville)
    CDIS: string;       // District code
    NCA: string;        // Autonomous community
    NPRO: string;       // Province name
    NMUN: string;       // Municipality name
    dato1: number;      // Average income per person (€)
    dato2: number;      // Average income per household (€)
    dato5: number;      // % of people above 200% median income
    [key: string]: unknown;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

interface INEResponse {
  type: "FeatureCollection";
  features: INEFeature[];
}

interface NormalizedFeature {
  type: "Feature";
  properties: {
    cusec: string;
    provinceCode: string;        // "28" for Madrid, "08" for Barcelona, "41" for Seville
    district: string;            // District code
    districtName: string | null; // District name (for Madrid/Barcelona city)
    community: string;
    province: string;
    municipality: string;
    avgIncome: number | null;
    avgHouseholdIncome: number | null;
    wealthyPct: number | null;   // % above 200% median
    year: number;
    source: string;
  };
  geometry: INEFeature["geometry"];
}

async function fetchPage(offset: number): Promise<INEFeature[]> {
  const params = new URLSearchParams({
    where: FILTER,
    outFields: "CUSEC,CPRO,CDIS,NCA,NPRO,NMUN,dato1,dato2,dato5",
    outSR: "4326",
    f: "geojson",
    resultRecordCount: String(PAGE_SIZE),
    resultOffset: String(offset)
  });

  const url = `${BASE_URL}?${params}`;
  console.log(`Fetching offset ${offset}...`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data: INEResponse = await response.json();
  return data.features || [];
}

async function fetchAllPages(): Promise<NormalizedFeature[]> {
  const allFeatures: NormalizedFeature[] = [];
  let offset = 0;
  let pageNumber = 1;

  console.log("Starting INE ADRH 2023 income data fetch for Madrid, Barcelona, and Seville...\n");
  console.log(`API: ${BASE_URL}`);
  console.log(`Filter: ${FILTER}\n`);

  while (true) {
    const features = await fetchPage(offset);

    if (features.length === 0) {
      console.log("\nNo more features to fetch.");
      break;
    }

    // Normalize features
    const normalized = features.map((f): NormalizedFeature => {
      const provinceCode = f.properties.CPRO;
      const districtCode = f.properties.CDIS;
      const isMadridCity = f.properties.NMUN === "Madrid";
      const isBarcelonaCity = f.properties.NMUN === "Barcelona";
      const isSevilleCity = f.properties.NMUN === "Sevilla";

      // Get district name for Madrid, Barcelona, or Seville city
      let districtName: string | null = null;
      if (isMadridCity) {
        districtName = MADRID_DISTRICTS[districtCode] || null;
      } else if (isBarcelonaCity) {
        districtName = BARCELONA_DISTRICTS[districtCode] || null;
      } else if (isSevilleCity) {
        districtName = SEVILLE_DISTRICTS[districtCode] || null;
      }

      return {
        type: "Feature",
        properties: {
          cusec: f.properties.CUSEC,
          provinceCode,
          district: districtCode,
          districtName,
          community: f.properties.NCA,
          province: f.properties.NPRO,
          municipality: f.properties.NMUN,
          avgIncome: f.properties.dato1,
          avgHouseholdIncome: f.properties.dato2,
          wealthyPct: f.properties.dato5,
          year: 2023,
          source: "INE ADRH"
        },
        geometry: f.geometry
      };
    });

    allFeatures.push(...normalized);
    console.log(`  Page ${pageNumber}: ${features.length} features (total: ${allFeatures.length})`);

    if (features.length < PAGE_SIZE) {
      // Last page
      break;
    }

    offset += PAGE_SIZE;
    pageNumber++;

    // Small delay to be respectful to the API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return allFeatures;
}

async function main() {
  try {
    const features = await fetchAllPages();

    if (features.length === 0) {
      console.error("\nError: No features fetched. Check the API or query parameters.");
      process.exit(1);
    }

    // Build GeoJSON FeatureCollection
    const geojson = {
      type: "FeatureCollection" as const,
      features
    };

    // Calculate some stats
    const incomeValues = features
      .map(f => f.properties.avgIncome)
      .filter((v): v is number => v !== null && !isNaN(v));

    const householdIncomeValues = features
      .map(f => f.properties.avgHouseholdIncome)
      .filter((v): v is number => v !== null && !isNaN(v));

    const wealthyValues = features
      .map(f => f.properties.wealthyPct)
      .filter((v): v is number => v !== null && !isNaN(v));

    const minIncome = Math.min(...incomeValues);
    const maxIncome = Math.max(...incomeValues);
    const avgIncome = incomeValues.reduce((a, b) => a + b, 0) / incomeValues.length;

    const minHouseholdIncome = Math.min(...householdIncomeValues);
    const maxHouseholdIncome = Math.max(...householdIncomeValues);

    const minWealthy = Math.min(...wealthyValues);
    const maxWealthy = Math.max(...wealthyValues);

    // Get unique municipalities and city districts
    const municipalities = [...new Set(features.map(f => f.properties.municipality))];

    const madridProvinceSections = features.filter(f => f.properties.provinceCode === "28");
    const madridCitySections = features.filter(f => f.properties.municipality === "Madrid");
    const madridDistricts = [...new Set(madridCitySections.map(f => f.properties.districtName).filter(Boolean))];

    const barcelonaProvinceSections = features.filter(f => f.properties.provinceCode === "08");
    const barcelonaCitySections = features.filter(f => f.properties.municipality === "Barcelona");
    const barcelonaDistricts = [...new Set(barcelonaCitySections.map(f => f.properties.districtName).filter(Boolean))];

    const sevilleProvinceSections = features.filter(f => f.properties.provinceCode === "41");
    const sevilleCitySections = features.filter(f => f.properties.municipality === "Sevilla");
    const sevilleDistricts = [...new Set(sevilleCitySections.map(f => f.properties.districtName).filter(Boolean))];

    console.log("\n=== Summary ===");
    console.log(`Total census sections: ${features.length}`);
    console.log(`Municipalities: ${municipalities.length}`);
    console.log(`\nMadrid province: ${madridProvinceSections.length} sections`);
    console.log(`  Madrid city: ${madridCitySections.length} sections (${madridDistricts.length} districts)`);
    console.log(`\nBarcelona province: ${barcelonaProvinceSections.length} sections`);
    console.log(`  Barcelona city: ${barcelonaCitySections.length} sections (${barcelonaDistricts.length} districts)`);
    console.log(`\nSeville province: ${sevilleProvinceSections.length} sections`);
    console.log(`  Seville city: ${sevilleCitySections.length} sections (${sevilleDistricts.length} districts)`);
    console.log(`\nPer-person income: €${minIncome.toLocaleString()} - €${maxIncome.toLocaleString()}`);
    console.log(`Average: €${avgIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
    console.log(`\nHousehold income: €${minHouseholdIncome.toLocaleString()} - €${maxHouseholdIncome.toLocaleString()}`);
    console.log(`Wealthy % range: ${minWealthy.toFixed(1)}% - ${maxWealthy.toFixed(1)}%`);

    // Save to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(geojson));
    const fileSizeMB = (fs.statSync(OUTPUT_FILE).size / (1024 * 1024)).toFixed(2);

    console.log(`\nSaved to: ${OUTPUT_FILE} (${fileSizeMB} MB)`);

  } catch (error) {
    console.error("\nFetch failed:", error);
    process.exit(1);
  }
}

main();
