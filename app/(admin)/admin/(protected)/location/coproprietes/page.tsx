import { accesLocation, REFUS_LOCATION } from '../acces';
import { LienRetour } from '../../_composants/EnTetePage';
import { EcranCoproprietes } from '../../gestion/EcranCoproprietes';

/**
 * 🔴 Arno (16/11/2026, fiche Copropriété, lot 4) — TUILE LOCATION : la liste « Copropriétés », ouverte depuis le groupe « Copropriétés » de la
 * recherche ; `?ouvrir=<immeuble>` ouvre aussitôt la fiche de cette copropriété. Le MÊME écran que celui de la Gestion.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ ouvrir?: string | string[] }> }) {
  const { autorise } = await accesLocation();
  const brut = (await searchParams).ouvrir;
  const ouvrir = typeof brut === 'string' && brut.trim() !== '' ? brut.slice(0, 300) : null;
  return (
    <section className="gst-page">
      {!autorise ? <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>
        : <EcranCoproprietes retour={<LienRetour href="/admin/location" />} ouvrirDepart={ouvrir} />}
    </section>
  );
}
