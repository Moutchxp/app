import { NextResponse } from "next/server";

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
};

function isPointInPolygon(
  point: { latitude: number; longitude: number },
  polygon: { latitude: number; longitude: number }[]
) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;

    const intersect =
      yi > point.latitude !== yj > point.latitude &&
      point.longitude <
        ((xj - xi) * (point.latitude - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

export async function GET() {
  return NextResponse.json({
    message: "API check-building active",
  });
}

export async function POST(request: Request) {
  try {
    const { latitude, longitude } = await request.json();

    const radius = 40;

    const query = `
      [out:json][timeout:10];
      (
        way["building"](around:${radius},${latitude},${longitude});
      );
      out body;
      >;
      out skel qt;
    `;

    const overpassUrl =
"https://overpass-api.de/api/interpreter?data=" +
encodeURIComponent(query);

const response = await fetch(overpassUrl, {
  method: "GET",
  headers: {
    Accept: "application/json",
    "User-Agent": "SansVisAvisMVP/1.0 contact@example.com",
  },
});

const text = await response.text();

if (!response.ok || text.trim().startsWith("<")) {
  console.error("Réponse Overpass invalide :", text.slice(0, 300));

  return NextResponse.json({
    isInsideBuilding: false,
    error: "Réponse Overpass invalide",
  });
}

const data = JSON.parse(text);

    const elements: OverpassElement[] = data.elements || [];

    const nodes = new Map<number, { latitude: number; longitude: number }>();

    for (const element of elements) {
      if (
        element.type === "node" &&
        typeof element.lat === "number" &&
        typeof element.lon === "number"
      ) {
        nodes.set(element.id, {
          latitude: element.lat,
          longitude: element.lon,
        });
      }
    }

    const buildingWays = elements.filter(
      (element) =>
        element.type === "way" &&
        Array.isArray(element.nodes) &&
        element.nodes.length > 2
    );

    for (const way of buildingWays) {
      const polygon =
        way.nodes
          ?.map((nodeId) => nodes.get(nodeId))
          .filter(Boolean) as { latitude: number; longitude: number }[];

      if (polygon.length > 2) {
        const isInside = isPointInPolygon({ latitude, longitude }, polygon);

        if (isInside) {
            console.log("BATIMENT DETECTE :", way.id);
          return NextResponse.json({
            isInsideBuilding: true,
            buildingId: way.id,
          });
        }
      }
    }

    return NextResponse.json({
      isInsideBuilding: false,
    });
  } catch (error) {
    console.error("Erreur check-building :", error);

    return NextResponse.json({
      isInsideBuilding: false,
      error: "Erreur lors de la vérification bâtiment",
    });
  }
}