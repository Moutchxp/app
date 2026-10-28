import { EnTetePage } from '../../_composants/EnTetePage';
import { accesTransaction, REFUS_TRANSACTION } from '../acces';
import { EcranGlobal } from '../EcransTransaction';
import { ARIANE, FilAriane } from '../FilAriane';

/** TUILE TRANSACTION — « CA global transaction et gestion » : vente CRITERIMMO + vente MACJ + location (Suivi de la Location) + gestion. */
export default async function Page() {
  const { autorise } = await accesTransaction();
  return (
    <section className="gst-page">
      <EnTetePage titre="CA global" intro="Tous les CA réunis : CRITERIMMO (vente, location lue dans le Suivi de la Location, gestion), MACJ (vente), puis le global des deux — mois par mois et par année, face à N−1 (HT)." retour="/admin/transaction"><FilAriane etapes={ARIANE.global} /></EnTetePage>
      {autorise ? <EcranGlobal /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_TRANSACTION}</div>}
    </section>
  );
}
