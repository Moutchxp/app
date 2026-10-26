import { accesLocation, identifiantPage, REFUS_FICHE_COMMUNE, REFUS_LOCATION } from '../../acces';
import { FicheCommuneLocation } from '../../../gestion/FicheCommune';
import { LienRetour } from '../../../_composants/EnTetePage';
import { AlerteIndiceBien } from '../../IndicesLoyers';
import { BauxEnPlace } from '../../BauxEnPlace';

/**
 * TUILE LOCATION — la fiche du bien, ouverte depuis la Location : c'est LA fiche de la Gestion (même composant, même
 * contenu, historique compris), sans écriture de mail. Règle d'Arno du 17/10/2026 : une seule fiche dans l'application.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ parCle?: string }> }) {
  const { autorise, gestion } = await accesLocation();
  const id = identifiantPage((await params).id);
  // `?parCle=1` : l'identifiant est le NUMÉRO WIPPIMMO (`bien-<n>` de la Gestion), pas l'identifiant interne.
  const parCle = (await searchParams).parCle === '1';
  return (
    <section className="gst-page">
      {!autorise ? <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>
        : !gestion ? <>{/* Arno (22/10/2026) — sans la fiche, un « ← Retour » vers la Location. */}<LienRetour href="/admin/location" /><div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_FICHE_COMMUNE}</div></>
          : id === null ? <><LienRetour href="/admin/location" /><div className="svv-card">Adresse incomplète : identifiant manquant.</div></>
            : <>{/* 🔴 Arno (25/10/2026) — l'alerte « indice manquant » du bail de ce bien, au-dessus de la fiche (rien s'il n'en manque aucun). */}
              <AlerteIndiceBien lotId={id} parCle={parCle} />{!parCle && <BauxEnPlace lotId={id} />}<FicheCommuneLocation fiche={{ sorte: parCle ? 'bien' : 'lot', id }} /></>}
    </section>
  );
}
