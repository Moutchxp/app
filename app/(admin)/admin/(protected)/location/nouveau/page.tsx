import { query } from '../../../../../lib/db/client';
import { accesLocation, identifiantPage, REFUS_LOCATION } from '../acces';
import { CreationProprietaireBien } from '../CreationProprietaireBien';

/** TUILE LOCATION — « Nouveau propriétaire + bien + annexes ». `?proprietaire=N` part d'un propriétaire existant. */
export default async function NouveauPage({ searchParams }: { searchParams: Promise<{ proprietaire?: string }> }) {
  const { autorise } = await accesLocation();
  if (!autorise) return <section className="gst-page"><div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div></section>;
  const id = identifiantPage((await searchParams).proprietaire);
  const proprietaire = id === null ? null
    : (await query<{ nom: string }>('SELECT nom_complet AS nom FROM gestion_annuaire_proprietaire WHERE id = $1', [id])).rows[0];
  return (
    <section className="gst-page">
      <CreationProprietaireBien proprietaireInitial={id !== null && proprietaire !== undefined && proprietaire !== null ? { id, nom: proprietaire.nom } : null} />
    </section>
  );
}
