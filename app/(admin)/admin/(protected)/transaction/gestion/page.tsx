import { EnTetePage } from '../../_composants/EnTetePage';
import { accesTransaction, REFUS_TRANSACTION } from '../acces';
import { EcranGestion } from '../EcransTransaction';
import { ARIANE, FilAriane } from '../FilAriane';

/** TUILE TRANSACTION, LOT L — « Gestion » : la saisie mensuelle des honoraires du parc (déplacée du CA global), par mois et par année. */
export default async function Page() {
  const { autorise } = await accesTransaction();
  return (
    <section className="gst-page">
      <EnTetePage titre="Gestion" intro="Les honoraires du parc envoyés chaque mois par le comptable : nombre de lots, honoraires HT, ADHOC, salarié, reste." retour="/admin/transaction">
        <FilAriane etapes={ARIANE.gestion} /></EnTetePage>
      {autorise ? <EcranGestion /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_TRANSACTION}</div>}
    </section>
  );
}
