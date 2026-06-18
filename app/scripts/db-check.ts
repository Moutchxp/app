import { query, closePool } from "../lib/db/client";

async function main() {
  console.log("→ Connexion à la base sansvisavis…");
  const v = await query<{ postgis_version: string }>("SELECT postgis_version()");
  console.log("✓ PostGIS :", v.rows[0].postgis_version);
  const c = await query<{ n: number }>("SELECT count(*)::int AS n FROM bdtopo_batiment");
  console.log("✓ Bâtiments (bdtopo_batiment) :", c.rows[0].n);
  console.log("✓ Connexion OK.");
}

main()
  .catch((err) => { console.error("✗ Échec connexion :", err.message); process.exitCode = 1; })
  .finally(() => closePool());
