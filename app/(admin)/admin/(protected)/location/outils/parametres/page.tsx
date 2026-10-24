import { accesLocation, REFUS_LOCATION } from '../../acces';
import { PageParametresLocation } from '../../ParametresLocation';
import { ongletDe } from '../../parametresAdresse';

/**
 * 🔴 Arno (25/10/2026) — « PARAMÈTRES LOCATION » EN PAGE, depuis Outils de suivi : `/admin/location/outils/parametres?onglet=…` (+
 * `&apporteur=…&panneau=…`), dans le gabarit de l'admin (colonne de gauche conservée). Le MÊME composant que la modale (un seul jeu de
 * composants) ; la modale reste pour les autres raccourcis de l'application. Comme la roue et la brique : administrateurs seulement.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { autorise, administrateur } = await accesLocation();
  const onglet = ongletDe((await searchParams).onglet) ?? 'apporteurs';
  return (
    <section className="gst-page">
      {!autorise ? <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>
        : !administrateur ? <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }} data-parametres-refus>Paramètres Location : réservé aux administrateurs.</div>
        : <PageParametresLocation ongletInitial={onglet} />}
    </section>
  );
}
