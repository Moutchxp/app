import { EnTetePage } from '../../_composants/EnTetePage';
import { accesTransaction, REFUS_TRANSACTION } from '../acces';
import { AccueilVentes } from '../EcransTransaction';
import { ARIANE, FilAriane } from '../FilAriane';

/** TUILE TRANSACTION, LOT L — « Transaction » : les deux sociétés, « CRITERIMMO » et « MACJ » (chacune ouvre son écran, sur « Compromis »). */
export default async function Page() {
  const { autorise } = await accesTransaction();
  return (
    <section className="gst-page">
      <EnTetePage titre="Transaction" intro="Les ventes et compromis de CRITERIMMO et de MACJ." retour="/admin/transaction"><FilAriane etapes={ARIANE.ventes} /></EnTetePage>
      {autorise ? <AccueilVentes /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_TRANSACTION}</div>}
    </section>
  );
}
