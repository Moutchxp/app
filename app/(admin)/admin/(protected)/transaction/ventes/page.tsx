import { EnTetePage } from '../../_composants/EnTetePage';
import { accesTransaction, REFUS_TRANSACTION } from '../acces';
import { AccueilVentes } from '../EcransTransaction';
import { ARIANE, FilAriane } from '../FilAriane';

/** TUILE TRANSACTION, LOT L — « Transaction » : les deux sociétés, « CRITERIMMO » et « MACJ » (chacune ouvre son écran, sur « Compromis »). */
export default async function Page() {
  const { autorise } = await accesTransaction();
  return (
    <section className="gst-page">
      {/* 🔴 LOT DM — « Transaction vente » : CRITERIMMO, MACJ et leur FUSION */}
      <EnTetePage titre="Transaction vente" intro="Les ventes et compromis de CRITERIMMO, de MACJ, et des deux sociétés réunies." retour="/admin/transaction"><FilAriane etapes={ARIANE.ventes} /></EnTetePage>
      {autorise ? <AccueilVentes /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_TRANSACTION}</div>}
    </section>
  );
}
