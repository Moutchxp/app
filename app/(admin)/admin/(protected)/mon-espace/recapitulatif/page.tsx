import { LienRetour } from '../../_composants/EnTetePage';
import { accesRecapCouts, REFUS_RECAP_COUTS } from '../acces';
import { RecapCoutsCa } from '../RecapCoutsCa';

/**
 * MON ESPACE › « COÛTS ET CA » — 🔴 Arno (13/11/2026) : le TABLEAU RÉCAPITULATIF des coûts et du CA gestion, en pleine page, avec « ← Retour » vers
 * la page d'origine. Réservé aux comptes qui ont « Coûts et CA » (vérifié ici, côté serveur : un autre compte ne reçoit que le refus).
 */
export default async function Page() {
  const autorise = await accesRecapCouts();
  return (
    <section className="gst-page">
      {autorise ? <><LienRetour href="/admin/mon-espace" /><RecapCoutsCa /></>
        : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }} data-recap-refuse>{REFUS_RECAP_COUTS}</div>}
    </section>
  );
}
