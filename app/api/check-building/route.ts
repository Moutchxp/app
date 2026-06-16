import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // 1. Récupération sichère des coordonnées envoyées par ton composant Map
    const body = await request.json();
    const { latitude, longitude } = body;

    if (!latitude || !longitude) {
      return NextResponse.json(
        { error: "Coordonnées GPS manquantes dans la requête." },
        { status: 400 }
      );
    }

    console.log(`[API] Analyse demandée pour Lat: ${latitude}, Lon: ${longitude}`);

    // 2. Construction de la requête Overpass (cherche les bâtiments autour du point)
    // On cherche dans un rayon de 100 mètres autour du point cliqué
    const overpassQuery = `[out:json][timeout:25];
      (
        way["building"](around:100, ${latitude}, ${longitude});
        relation["building"](around:100, ${latitude}, ${longitude});
      );
      out body;
      >;
      out skel qt;`;

    // 3. Appel à l'API Overpass avec les en-têtes requis pour éviter l'erreur 406
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        // Overpass attend un format de formulaire standard
        "Content-Type": "application/x-www-form-urlencoded",
        // Crucial : On s'identifie pour que le serveur ne nous rejette pas avec une 406
        "User-Agent": "SansVisAVisMVP/1.0 (a.jorel@sansvisavis.com)", 
      },
      // Le corps de la requête doit être formatté en 'data=...' encodé pour les URLs
      body: `data=${encodeURIComponent(overpassQuery)}`,
    });

    // Si le serveur Overpass s'énerve quand même, on capture l'erreur proprement
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[API] Erreur Overpass:", errorText);
      return NextResponse.json(
        { error: "Le serveur cartographique distant a rejeté la requête." },
        { status: response.status }
      );
    }

    const data = await response.json();

    // 4. Extraction rapide des bâtiments trouvés pour renvoyer une réponse au Front
    const hasBuildings = data.elements && data.elements.length > 0;
    const buildingId = hasBuildings ? data.elements[0].id : null;

    // On prépare une réponse structurée pour page.tsx
    return NextResponse.json({
      success: true,
      isInsideBuilding: hasBuildings, // À affiner plus tard avec un vrai calcul d'intersection polygonale
      detectedBuildingId: buildingId,
      message: hasBuildings ? `Bâtiment détecté : ${buildingId}` : "Aucun bâtiment à proximité immédiate."
    });

  } catch (error: any) {
    console.error("[API] Erreur serveur interne:", error);
    return NextResponse.json(
      { error: "Erreur interne lors du calcul du bâtiment." },
      { status: 500 }
    );
  }
}