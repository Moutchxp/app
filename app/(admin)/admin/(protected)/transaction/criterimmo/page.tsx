import { EnTetePage } from '../../_composants/EnTetePage';
import { accesTransaction, REFUS_TRANSACTION } from '../acces';
import { EcranSociete } from '../EcransTransaction';

/** TUILE TRANSACTION — « Transaction CRITERIMMO » : le mois (?vue=mois, défaut) et l'année (?vue=annee), saisie et modification des ventes. */
export default async function Page() {
  const { autorise } = await accesTransaction();
  return (
    <section className="gst-page">
      <EnTetePage titre="Transaction CRITERIMMO" intro="Les ventes et compromis de CRITERIMMO : le mois, l’année, les négociateurs et les apporteurs." retour="/admin/transaction" />
      {autorise ? <EcranSociete societe="criterimmo" /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_TRANSACTION}</div>}
    </section>
  );
}
