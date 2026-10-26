import { accesLocation, identifiantPage, REFUS_LOCATION } from '../acces';
import { CreationLocataire } from '../CreationLocataire';

/**
 * TUILE LOCATION — « Nouveau locataire » rattaché à un bien du portefeuille (refonte de l'accueil, 17/10/2026).
 * 🔴 Arno (26/10/2026, 430) — `?bien=<id>&enPlace=1` : ouvert dans la foulée de « Nouveau bien » (« loué au moment de la prise en
 * gestion ? » Oui), le MÊME formulaire complet, bien choisi d'office, pour le locataire en place.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ bien?: string; enPlace?: string }> }) {
  const { autorise } = await accesLocation();
  const sp = await searchParams;
  const bienInitial = identifiantPage(sp.bien);
  return (
    <section className="gst-page">
      {autorise ? <CreationLocataire bienInitial={bienInitial} enPlace={sp.enPlace === '1'} /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>}
    </section>
  );
}
