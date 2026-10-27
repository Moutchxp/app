import { EnTetePage } from '../_composants/EnTetePage';
import { accesTransaction, REFUS_TRANSACTION } from './acces';
import { AccueilTransaction } from './EcransTransaction';

/**
 * Module « TRANSACTION » (Arno, 27/10/2026) — l'accueil de la tuile : trois cases, « Transaction CRITERIMMO », « Transaction MACJ »,
 * « CA global transaction et gestion ». MODULE GARDÉ par `perm_transaction` (migration 433).
 */
export default async function TransactionPage() {
  const { autorise } = await accesTransaction();
  return (
    <section className="gst-page">
      <EnTetePage titre="Transaction" intro="Le chiffre d’affaires de la vente de CRITERIMMO et de MACJ, et le CA global transaction et gestion." />
      {autorise ? <AccueilTransaction /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_TRANSACTION}</div>}
    </section>
  );
}
