import { EnTetePage } from '../../_composants/EnTetePage';
import { accesTransaction, REFUS_TRANSACTION } from '../acces';
import { EcranGlobal } from '../EcransTransaction';

/** TUILE TRANSACTION — « CA global transaction et gestion » : vente CRITERIMMO + vente MACJ + location (Suivi de la Location) + gestion. */
export default async function Page() {
  const { autorise } = await accesTransaction();
  return (
    <section className="gst-page">
      <EnTetePage titre="CA global transaction et gestion" intro="Vente CRITERIMMO et MACJ, location (lue dans le Suivi de la Location) et gestion, mois par mois et par année (HT)." retour="/admin/transaction" />
      {autorise ? <EcranGlobal /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_TRANSACTION}</div>}
    </section>
  );
}
