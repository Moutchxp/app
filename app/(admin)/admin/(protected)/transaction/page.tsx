import { EnTetePage } from '../_composants/EnTetePage';
import { accesTransaction, REFUS_TRANSACTION } from './acces';
import { AccueilTransaction } from './EcransTransaction';
import { ARIANE, FilAriane } from './FilAriane';

/**
 * Module « TRANSACTION » (Arno, 27/10/2026) — l'accueil de la tuile. LOT L (28/10/2026) : trois cases, « Transaction » (CRITERIMMO,
 * MACJ), « Gestion », « CA global ». MODULE GARDÉ par `perm_transaction` (migration 433) : le droit ouvre tout l'arbre.
 */
export default async function TransactionPage() {
  const { autorise } = await accesTransaction();
  return (
    <section className="gst-page">
      {/* 🔴 LOT DM (Arno) — « Suivi Chiffre d'affaires » (ex-« Transaction ») ; l'adresse ne change pas. */}
      <EnTetePage titre="Suivi Chiffre d’affaires" intro="Le chiffre d’affaires : la transaction vente (CRITERIMMO, MACJ et leur fusion), la gestion, et le CA global."><FilAriane etapes={ARIANE.accueil} /></EnTetePage>
      {autorise ? <AccueilTransaction /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_TRANSACTION}</div>}
    </section>
  );
}
