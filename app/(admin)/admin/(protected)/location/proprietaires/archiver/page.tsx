import { accesLocation, REFUS_FICHE_COMMUNE, REFUS_LOCATION } from '../../acces';
import { EcranArchivageProprietaire } from '../../ArchivageProprietaire';

/**
 * TUILE LOCATION — « Supprimer un propriétaire » (Arno, 18/10/2026) : chercher un propriétaire, consulter sa fiche commune
 * et ses biens, puis l'ARCHIVER (sortie du portefeuille : rien n'est effacé, réactivable).
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { autorise, gestion } = await accesLocation();
  // `?mode=biens` : « Supprimer un des biens d'un propriétaire » (Arno, 18/10/2026) ; sans lui, l'archivage du propriétaire.
  const mode = (await searchParams).mode === 'biens' ? 'biens' : 'proprietaire';
  return (
    <section className="gst-page">
      {autorise ? <EcranArchivageProprietaire refusFiche={gestion ? null : REFUS_FICHE_COMMUNE} mode={mode} />
        : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>}
    </section>
  );
}
