import { EnTetePage } from '../../_composants/EnTetePage';
import { accesTransaction, REFUS_TRANSACTION } from '../acces';
import { EcranSociete } from '../EcransTransaction';
import { ARIANE, FilAriane } from '../FilAriane';

/** TUILE TRANSACTION — « Transaction MACJ » : les compromis (à l'arrivée, LOT L), le mois (?vue=mois) et l'année (?vue=annee), saisie et modification des ventes. */
export default async function Page() {
  const { autorise } = await accesTransaction();
  return (
    <section className="gst-page">
      <EnTetePage titre="Transaction MACJ" intro="Les ventes et compromis de MACJ : le mois, l’année, les négociateurs et les apporteurs." retour="/admin/transaction/ventes"><FilAriane etapes={ARIANE.macj} /></EnTetePage>
      {autorise ? <EcranSociete societe="macj" /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_TRANSACTION}</div>}
    </section>
  );
}
