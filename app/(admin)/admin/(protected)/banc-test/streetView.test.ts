import { describe, it, expect } from "vitest";
import { urlStreetView } from "./streetView";

describe("urlStreetView — URL Google Street View (pano) au point snappé, orienté azimut", () => {
  it("format officiel exact (api=1, pano, viewpoint lat,lon, heading)", () => {
    expect(urlStreetView({ lat: 48.90693182287072, lon: 2.269431435588249 }, 90)).toBe(
      "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=48.90693182287072,2.269431435588249&heading=90",
    );
  });

  it("préserve la précision complète de lat/lon (jamais arrondi)", () => {
    const url = urlStreetView({ lat: 48.90693182287072, lon: 2.269431435588249 }, 0);
    expect(url).toContain("viewpoint=48.90693182287072,2.269431435588249");
  });

  it("normalise le heading dans [0, 360)", () => {
    expect(urlStreetView({ lat: 1, lon: 2 }, 450)).toContain("heading=90"); // 450 - 360
    expect(urlStreetView({ lat: 1, lon: 2 }, -10)).toContain("heading=350"); // -10 + 360
    expect(urlStreetView({ lat: 1, lon: 2 }, 360)).toContain("heading=0");
    expect(urlStreetView({ lat: 1, lon: 2 }, 0)).toContain("heading=0");
  });

  it("heading = azimut brut si déjà dans [0,360)", () => {
    expect(urlStreetView({ lat: 1, lon: 2 }, 217)).toContain("heading=217");
  });
});
