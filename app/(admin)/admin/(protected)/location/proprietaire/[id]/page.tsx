import { accesLocation, identifiantPage, REFUS_FICHE_COMMUNE, REFUS_LOCATION } from '../../acces';
import { FicheCommuneLocation } from '../../../gestion/FicheCommune';

/**
 * TUILE LOCATION — la fiche propriétaire, ouverte depuis la Location : c'est LA fiche de la Gestion (même composant, même
 * contenu, historique compris), sans écriture de mail. Règle d'Arno du 17/10/2026 : une seule fiche dans l'application.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { autorise, gestion } = await accesLocation();
  const id = identifiantPage((await params).id);
  return (
    <section className="gst-page">
      {!autorise ? <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>
        : !gestion ? <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_FICHE_COMMUNE}</div>
          : id === null ? <div className="svv-card">Adresse incomplète : identifiant manquant.</div>
            : <FicheCommuneLocation fiche={{ sorte: 'proprietaire', id }} />}
    </section>
  );
}
