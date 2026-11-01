import { EnTetePage } from '../../_composants/EnTetePage';
import { accesTransaction, REFUS_TRANSACTION } from '../acces';
import { EcranLocationCA } from '../EcranLocationCA';
import { ARIANE, FilAriane } from '../FilAriane';

/**
 * 🔴 LOT DX / LO1 (Arno, 01/11/2026) — « Location » (sous « Location & Gestion ») : l'activité économique de la location — les lignes du Suivi du mois
 * de la Location, avec les mécaniques de la Transaction vente (Le mois, L'année, tuiles, graphique, cartes, Résultat, Espace par négociateur). LECTURE SEULE.
 */
export default async function Page() {
  const { autorise } = await accesTransaction();
  return (
    <section className="gst-page">
      <EnTetePage titre="Location" intro="Les honoraires de location : baux signés, propriétaire et locataire, par mois et par année." retour="/admin/transaction/location-gestion">
        <FilAriane etapes={ARIANE.location} /></EnTetePage>
      {autorise ? <EcranLocationCA /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_TRANSACTION}</div>}
    </section>
  );
}
