/**
 * /api/import/route.ts — API d'import restaurant
 * 
 * POST /api/import/search-place    → Cherche un resto sur Google Places
 * POST /api/import/from-place      → Import depuis Google Places (infos + photos + horaires)
 * POST /api/import/scan-menu       → Scan photo(s) de menu via IA
 * POST /api/import/scrape-website  → Scrape page web du resto pour le menu
 * POST /api/import/full            → Pipeline complet (combine tout)
 * POST /api/import/from-json       → Import direct depuis JSON
 * POST /api/import/persist         → Sauvegarde en BDD
 */

import { NextRequest, NextResponse } from "next/server";
import {
  searchGooglePlace,
  importFromGooglePlaces,
  extractMenuFromPhotos,
  extractMenuFromWebsite,
  importRestaurant,
  persistImport,
  type ImportResult,
  type ImportSource,
} from "@/services/restaurant-import.service";

// ---- Recherche Google Places ----
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    switch (action) {

      // Étape 1 : Rechercher le resto
      case "search-place": {
        const { query, city } = await req.json();
        const results = await searchGooglePlace(query, city);
        return NextResponse.json({ results });
      }

      // Étape 2 : Importer infos depuis Google Places
      case "from-place": {
        const { placeId } = await req.json();
        const result = await importFromGooglePlaces(placeId);
        return NextResponse.json(result);
      }

      // Étape 3a : Scanner des photos de menu
      case "scan-menu": {
        const formData = await req.formData();
        const files = formData.getAll("photos") as File[];

        const images = await Promise.all(
          files.map(async (file) => {
            const buffer = Buffer.from(await file.arrayBuffer());
            return {
              base64: buffer.toString("base64"),
              mimeType: file.type || "image/jpeg",
            };
          })
        );

        const menu = await extractMenuFromPhotos(images);
        return NextResponse.json(menu);
      }

      // Étape 3b : Scraper le site web
      case "scrape-website": {
        const { websiteUrl } = await req.json();
        const menu = await extractMenuFromWebsite(websiteUrl);
        return NextResponse.json(menu);
      }

      // Pipeline complet
      case "full": {
        const { sources } = await req.json() as { sources: ImportSource[] };
        const result = await importRestaurant(sources);
        return NextResponse.json(result);
      }

      // Import JSON direct
      case "from-json": {
        const data = await req.json() as ImportResult;
        return NextResponse.json(data);
      }

      // Sauvegarder en BDD
      case "persist": {
        const data = await req.json() as ImportResult;
        const restaurantId = await persistImport(data);
        return NextResponse.json({ success: true, restaurantId });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error(`Import error [${action}]:`, error);
    return NextResponse.json(
      { error: error.message || "Import failed" },
      { status: 500 }
    );
  }
}
