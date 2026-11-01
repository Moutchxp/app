import { EnTetePage } from '../../../_composants/EnTetePage';
import { accesTransaction, REFUS_TRANSACTION } from '../../acces';
import { EcranFusionLocationGestion } from '../../EcranFusionLG';
import { ARIANE, FilAriane } from '../../FilAriane';

/**
 * 🔴 LOT DX (Arno, 01/11/2026) — « FUSION Location & Gestion ». 🔴 LOT LG1 — le cumul des activités Location et Gestion (mêmes mécaniques, mêmes
 * fonctions de calcul que leurs pages ; chaque chiffre = sa page d'origine). LECTURE SEULE.
 */
export default async function Page() {
  const { autorise } = await accesTransaction();
  return (
    <section className="gst-page">
      <EnTetePage titre="FUSION Location & Gestion" intro="Les CA de la location et de la gestion réunis." retour="/admin/transaction/location-gestion">
        <FilAriane etapes={ARIANE.fusionLocationGestion} /></EnTetePage>
      {autorise ? <EcranFusionLocationGestion /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_TRANSACTION}</div>}
    </section>
  );
}
