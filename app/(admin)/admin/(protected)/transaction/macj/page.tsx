import { EnTetePage } from '../../_composants/EnTetePage';
import { accesTransaction, REFUS_TRANSACTION } from '../acces';
import { EcranSociete } from '../EcransTransaction';

/** TUILE TRANSACTION — « Transaction MACJ » : le mois (?vue=mois, défaut) et l'année (?vue=annee), saisie et modification des ventes. */
export default async function Page() {
  const { autorise } = await accesTransaction();
  return (
    <section className="gst-page">
      <EnTetePage titre="Transaction MACJ" intro="Les ventes et compromis de MACJ : le mois, l’année, les négociateurs et les apporteurs." retour="/admin/transaction" />
      {autorise ? <EcranSociete societe="macj" /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_TRANSACTION}</div>}
    </section>
  );
}
