import type { ReactNode } from 'react';
import type { EtatConfirmation, ContexteConfirmation } from '../../lib/veille/saisineCadaRepo';

/**
 * X5 — rendu PUR de la page publique de confirmation de saisine CADA (renderToStaticMarkup-testable, aucun DOM). Affiche
 * l'identification du dossier (référence, commune, dates, jours avant forclusion, dossiers dus) — AUCUNE donnée personnelle —
 * puis un message franc par état, et ne rend le `bouton` (confirmation client) QUE si l'acte est réellement possible
 * ('saisissable'). Jamais de bouton inerte. La couleur n'est qu'un appui : le TEXTE porte l'information.
 */
export type EtatPageCada = 'jeton_invalide' | 'jeton_expire' | EtatConfirmation;

/** Formate une date en 'AAAA-MM-JJ' (déterministe, sans dépendance de fuseau pour les tests). */
function fmt(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : '—';
}

/** Détail d'identification du dossier — rendu uniquement quand la demande a été chargée (référence connue). */
function DetailDossier({ ctx }: { ctx: ContexteConfirmation }) {
  if (!ctx.reference) return null;
  return (
    <dl className="mt-2 grid grid-cols-1 gap-1 text-sm text-svv-ink">
      <div><span className="text-svv-muted">Référence : </span><span className="font-mono font-semibold">{ctx.reference}</span></div>
      <div><span className="text-svv-muted">Commune : </span>{ctx.communeNom ?? '(commune inconnue)'}</div>
      <div><span className="text-svv-muted">Demande envoyée le : </span>{fmt(ctx.envoyeLe)}</div>
      {ctx.refusTaciteLe && <div><span className="text-svv-muted">Refus tacite acquis le : </span>{fmt(ctx.refusTaciteLe)}</div>}
      {ctx.joursAvantForclusion !== null && (
        <div>
          <span className="text-svv-muted">Jours avant forclusion : </span>
          <span className={ctx.joursAvantForclusion <= 7 ? 'font-semibold text-svv-red' : ''}>
            {ctx.joursAvantForclusion} {ctx.forclusionLe ? `(forclusion le ${fmt(ctx.forclusionLe)})` : ''}
          </span>
        </div>
      )}
      {ctx.dossiersDusNums.length > 0 && (
        <div><span className="text-svv-muted">Dossiers dus : </span>{ctx.dossiersDusNums.join(', ')}</div>
      )}
    </dl>
  );
}

/** Message franc pour chaque état (le TEXTE porte tout). Le POST re-garde de toute façon : ici c'est un guidage, pas la décision. */
function messageEtat(etat: EtatPageCada, ctx: ContexteConfirmation | null, urlOnglet: string): ReactNode {
  switch (etat) {
    case 'jeton_invalide':
      return <p className="leading-relaxed text-svv-ink">Ce lien de saisine CADA n’est pas valide. Vérifiez que vous avez copié l’adresse complète depuis votre e-mail.</p>;
    case 'jeton_expire':
      return (
        <p className="leading-relaxed text-svv-ink">
          Ce lien a expiré (il est valable 7 jours). La saisine reste possible : ouvrez l’onglet «&nbsp;Saisines CADA&nbsp;» de
          l’espace d’administration, le bouton y fonctionne toujours. <a className="underline" href={urlOnglet}>Ouvrir l’onglet Saisines CADA</a>
        </p>
      );
    case 'demande_absente':
      return <p className="leading-relaxed text-svv-ink">La demande liée à ce lien est introuvable.</p>;
    case 'demande_hors_etat':
      return <p className="leading-relaxed text-svv-ink">Cette demande n’est plus au stade permettant une saisine CADA.</p>;
    case 'deja_lancee':
      return <p className="leading-relaxed text-svv-ink">Une saisine a déjà été lancée pour cette demande{ctx?.dejaLanceeLe ? ` le ${fmt(ctx.dejaLanceeLe)}` : ' (en préparation)'}. Rien de plus à faire ici.</p>;
    case 'forclose':
      return <p className="leading-relaxed text-svv-ink">Le délai de saisine (deux mois après le refus tacite) est forclos{ctx?.forclusionLe ? ` depuis le ${fmt(ctx.forclusionLe)}` : ''}. Il n’est plus possible de saisir la CADA pour cette demande.</p>;
    case 'refus_non_acquis':
      return <p className="leading-relaxed text-svv-ink">Le refus tacite n’est pas encore acquis : il faut attendre un mois après l’envoi de la demande avant de pouvoir saisir la CADA.</p>;
    case 'delai_non_atteint':
      return <p className="leading-relaxed text-svv-ink">Le refus tacite est acquis, mais la date de dépôt annoncée à la mairie (quelques jours après l’échéance) n’est pas encore atteinte. La saisine sera possible à cette date — déposer avant contredirait ce qui a été écrit à la mairie.</p>;
    case 'plus_de_dossier':
      return <p className="leading-relaxed text-svv-ink">Tous les dossiers réclamés ont été obtenus : il n’y a plus rien à saisir devant la CADA.</p>;
    case 'silence_non_verifie':
      return <p className="leading-relaxed text-svv-ink">La relève des réponses n’est pas assez récente pour lancer la saisine : on ne peut pas encore affirmer que la mairie n’a pas répondu.</p>;
    case 'saisissable':
      return <p className="leading-relaxed text-svv-ink">Le silence gardé plus d’un mois vaut refus : vous pouvez saisir la CADA pour ce dossier. La saisine ne partira qu’au clic sur le bouton ci-dessous.</p>;
  }
}

export function ConfirmationCadaRendu({ etat, ctx, urlOnglet, bouton }: {
  etat: EtatPageCada; ctx?: ContexteConfirmation | null; urlOnglet: string; bouton?: ReactNode;
}) {
  return (
    <section className="svv-card flex flex-col gap-3">
      <h2 className="text-base font-bold text-svv-ink">Saisine de la CADA</h2>
      {ctx && ctx.reference ? <DetailDossier ctx={ctx} /> : null}
      {messageEtat(etat, ctx ?? null, urlOnglet)}
      {/* Le bouton n'apparaît QUE si l'acte est réellement possible — jamais un bouton inerte. */}
      {etat === 'saisissable' ? bouton : null}
    </section>
  );
}
