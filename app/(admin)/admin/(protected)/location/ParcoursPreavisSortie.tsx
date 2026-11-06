'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EtatLecture, envoyer, useLecture, type EtatMail, type EtatMailsAvis } from './commun';
import { BlocsEnvois, CSS_CONFIRMATION_ENVOIS, InfoDestinataires } from './ConfirmationEnvois';
import { CSS_MODALE_ISSUE } from './ModaleIssue';
import { libelleMail, mailInterneSortie, mailsDepuisAvis, type MailParti } from '../../../../lib/location/confirmationEnvois';
import { MENTION_SANS_EMAIL } from '../../../../lib/location/mailsPreavisSortie';
import { AUCUN_MAIL_ENVOYE, AUCUN_MAIL_PREVU, sortDuLogementPreavis, sortDuLogementSortie } from '../../../../lib/location/parcoursPreavisSortie';
import { dateFrPreavis, dateIsoValide, dateMaxPreavis, MOTIF_MAX, verifierPreavis, type DureeMois, type ModePreavis } from '../../../../lib/location/preavis';
import { dateFr, dateMinSortie, verifierSortie, type BailLogement } from '../../../../lib/location/sortieLocataires';
import type { PreavisDuBail } from '../../../../lib/location/preavisRepo';

/**
 * ══ 🔴🔴 LOCATION — LE PARCOURS « PRÉAVIS / SORTIE », UNE SEULE PASSE (Arno, 06/11/2026) ═══════════════════════════════════════════════════════
 * Constaté en production : une modale « Modification enregistrée » s'affichait alors que rien n'était enregistré (l'aperçu des mails, une lecture,
 * était annoncé comme une écriture). Le parcours, identique sur l'écran de sortie, l'accueil et la fiche locataire :
 *   ① les locataires sélectionnés sur leurs cartes (aucun d'office) ; ② Préavis ou Sortie ; ③ les dates ; ④ DEUX boutons :
 *      « Enregistrer » (AUCUN mail) et « Enregistrer et envoyer les mails » (picto « i » : les adresses configurées) ;
 *   ⑤ le RÉCAPITULATIF (rien n'est encore enregistré) : locataires, dates, sort du logement, mails qui partiront — « Revenir » garde la saisie ;
 *   ⑥ « Confirmer » : la MÊME fenêtre dit le RÉSULTAT, construit sur la seule réponse du serveur (échec en rouge, adresse comprise) ; un échec
 *      d'enregistrement n'affiche JAMAIS de succès. « Fermer » : l'écran se relit (préavis en bleu, sortis retirés).
 * Les requêtes portent l'en-tête « je confirme moi-même » : jamais deux fenêtres pour un geste.
 */

export interface LocataireParcours { occupationId: number; nom: string; entree: string | null;
  /** Le préavis déjà ouvert (sa date maximale) ; null : aucun. */
  dateMaxPreavis: string | null }

export type Geste = 'preavis' | 'sortie';
/** Ce que l'écran garde une fois la fenêtre fermée (son bandeau de bilan). */
export interface FinParcours { geste: Geste; noms: string[]; phrase: string; avecMails: boolean; mail?: EtatMail; mails?: EtatMailsAvis; adhoc?: EtatMailsAvis; dateMax?: string }

type MailRecap = { sorte: string; objet: string; a: string[]; cc: string[]; texte?: string };
type Fenetre =
  | { etape: 'recap'; avecMails: boolean; mails: MailRecap[] | null; sansEmail: string[]; enGestion: boolean | null; motifMails: string | null; envoi: boolean; refus: string | null }
  | { etape: 'resultat'; avecMails: boolean; mails: MailParti[]; motifGlobal: string | null; fin: FinParcours };

type Duree = '1' | '3' | 'manuelle';
const aujourdhui = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });

export function ParcoursPreavisSortie({ bail, occupationId, locataires, choix, dureeProposee, raison, preavisDisponible, gestion, onFini, libellePreavis, libelleSortie }: {
  bail: BailLogement; occupationId: number;
  /** Les locataires en place (et leur préavis ouvert) ; `choix` : ceux sélectionnés sur les cartes. */
  locataires: readonly LocataireParcours[]; choix: readonly number[];
  dureeProposee: DureeMois; raison: string; preavisDisponible: boolean;
  /** Le droit « Gestion » : la sortie officielle lui est réservée (le serveur le revérifie). */
  gestion: boolean;
  /** La fenêtre fermée après un enregistrement réussi : l'écran se relit. */
  onFini: (f: FinParcours) => void;
  libellePreavis: string; libelleSortie: string;
}) {
  const id = useId();
  const jour = aujourdhui();
  const [geste, setGeste] = useState<Geste | null>(null);
  const [recuLe, setRecuLe] = useState('');
  const [duree, setDuree] = useState<Duree>(String(dureeProposee) as Duree);
  const [dateManuelle, setDateManuelle] = useState('');
  const [motif, setMotif] = useState('');
  const [dateSortie, setDateSortie] = useState('');
  const [tente, setTente] = useState(false);
  const [fenetre, setFenetre] = useState<Fenetre | null>(null);
  const choisis = locataires.filter((l) => choix.includes(l.occupationId));
  const concernes = geste === 'preavis' ? choisis.filter((l) => l.dateMaxPreavis === null) : choisis;
  const mode: ModePreavis = duree === 'manuelle' ? { mode: 'date_manuelle', dateMax: dateManuelle } : { mode: 'mois', duree: Number(duree) as DureeMois };
  const dateMax = dateIsoValide(recuLe) && (mode.mode === 'mois' || dateIsoValide(mode.dateMax)) ? dateMaxPreavis(recuLe, mode) : null;
  // Les règles du serveur, à l'écran (il refait le contrôle).
  const verdict = geste === 'preavis'
    ? (concernes.length === 0 ? { ok: false as const, motif: choisis.length > 0 ? 'Les locataires sélectionnés sont déjà en préavis.' : 'Sélectionnez au moins un locataire (cliquez sur sa carte).' }
      : verifierPreavis({ recuLe, choix: mode, motif, entrees: concernes.map((l) => l.entree) }, jour))
    : geste === 'sortie' ? (choisis.length === 0 ? { ok: false as const, motif: 'Sélectionnez au moins un locataire (cliquez sur sa carte).' } : verifierSortie(bail, choisis.map((l) => l.occupationId), dateSortie, jour))
      : { ok: false as const, motif: '' };
  const message = geste === null || verdict.ok ? null : tente || (geste === 'preavis' ? recuLe !== '' : dateSortie !== '') ? verdict.motif : null;
  const noms = concernes.map((l) => l.nom);
  const sort = geste === 'sortie' ? sortDuLogementSortie(bail, concernes.map((l) => l.occupationId))
    : sortDuLogementPreavis(bail, new Map(locataires.filter((l) => l.dateMaxPreavis !== null).map((l) => [l.occupationId, l.dateMaxPreavis as string])),
      concernes.map((l) => l.occupationId), dateMax ?? recuLe);

  const ouvrirRecap = async (avecMails: boolean): Promise<void> => {
    setTente(true);
    if (geste === null || !verdict.ok) return;
    setFenetre({ etape: 'recap', avecMails, mails: avecMails ? null : [], sansEmail: [], enGestion: null, motifMails: null, envoi: false, refus: null });
    if (!avecMails) return;
    const r = geste === 'preavis'
      ? await envoyer({ action: 'apercu-preavis', occupationIds: concernes.map((l) => l.occupationId), recuLe, choix: mode }, { propre: true })
      : await envoyer({ action: 'apercu-sortie', occupationId }, { propre: true });
    if (r.motif !== null) { setFenetre((f) => (f?.etape === 'recap' ? { ...f, mails: [], motifMails: r.motif } : f)); return; }
    const d = r.data as { mails?: MailRecap[]; sansEmail?: string[]; enGestion?: boolean; envoiPossible?: boolean } | undefined;
    setFenetre((f) => (f?.etape === 'recap' ? { ...f, mails: d?.mails ?? [], sansEmail: d?.sansEmail ?? [], enGestion: d?.enGestion ?? null,
      motifMails: d?.envoiPossible === false ? 'la mise à jour de la base (migration 457) n’est pas appliquée : aucun mail ne partira.' : null } : f));
  };

  const confirmer = async (): Promise<void> => {
    if (fenetre?.etape !== 'recap' || geste === null) return;
    const avecMails = fenetre.avecMails;
    setFenetre({ ...fenetre, envoi: true, refus: null });
    if (geste === 'preavis') {
      const r = await envoyer({ action: 'enregistrer-preavis', occupationIds: concernes.map((l) => l.occupationId), recuLe, choix: mode,
        motif: motif.trim() === '' ? null : motif.trim(), envoyerMails: avecMails, informerPartenaires: true }, { propre: true });
      if (r.motif !== null) { setFenetre({ ...fenetre, envoi: false, refus: `Le préavis n’a pas été enregistré : ${r.motif}` }); return; }
      const fin = (r.data as { dateMax?: string } | undefined)?.dateMax;
      const lus = mailsDepuisAvis(r.mails);
      setFenetre({ etape: 'resultat', avecMails, mails: lus.mails, motifGlobal: lus.motifGlobal,
        fin: { geste, noms, phrase: sort.phrase, avecMails, ...(r.mails !== undefined ? { mails: r.mails } : {}), ...(fin !== undefined ? { dateMax: fin } : {}) } });
      return;
    }
    const r = await envoyer({ action: 'sortie-locataires', occupationId, sortants: concernes.map((l) => l.occupationId), date: dateSortie, envoyerMails: avecMails, informerPartenaires: true },
      { propre: true });
    if (r.motif !== null) { setFenetre({ ...fenetre, envoi: false, refus: `La sortie n’a pas été enregistrée : ${r.motif}` }); return; }
    const interne = mailInterneSortie(r.mail);
    const adhoc = mailsDepuisAvis(r.adhoc);
    const d = r.data as { vacant?: boolean; restants?: string[] } | undefined;
    const phrase = d?.vacant === true ? 'Le logement devient vacant.' : d?.restants !== undefined && d.restants.length > 0 ? `Le logement reste occupé par : ${d.restants.join(', ')}.` : sort.phrase;
    setFenetre({ etape: 'resultat', avecMails, mails: avecMails ? [...(interne === null ? [] : [interne]), ...adhoc.mails] : [], motifGlobal: avecMails ? adhoc.motifGlobal : null,
      fin: { geste, noms, phrase, avecMails, ...(r.mail !== undefined ? { mail: r.mail } : {}), ...(r.adhoc !== undefined ? { adhoc: r.adhoc } : {}) } });
  };

  const fermer = (): void => {
    if (fenetre?.etape === 'resultat') {
      const f = fenetre.fin;
      setFenetre(null); setGeste(null); setTente(false); setRecuLe(''); setDateManuelle(''); setMotif(''); setDateSortie(''); setDuree(String(dureeProposee) as Duree);
      onFini(f);
      return;
    }
    setFenetre(null);
  };

  const segments: { cle: Duree; mot: string }[] = [
    { cle: '1', mot: `1 mois${dureeProposee === 1 ? ' (proposé)' : ''}` },
    { cle: '3', mot: `3 mois${dureeProposee === 3 ? ' (proposé)' : ''}` },
    { cle: 'manuelle', mot: 'À la main' },
  ];
  const choisir = (g: Geste): void => { setGeste(geste === g ? null : g); setTente(false); };

  return (
    <div className="pss" data-parcours-preavis-sortie>
      <style>{CSS_PARCOURS + CSS_MODALE_ISSUE + CSS_CONFIRMATION_ENVOIS}</style>
      <div className="sor-deux-boutons" data-choix-geste>
        <button type="button" className="arc-gros sor-bascule" aria-pressed={geste === 'preavis'} disabled={!preavisDisponible || locataires.length === 0}
          title={!preavisDisponible ? 'Préavis : mise à jour de la base à appliquer (migration 383)' : undefined}
          onClick={() => choisir('preavis')} data-enregistrer-un-preavis>
          {geste === 'preavis' ? <span className="sor-coche" aria-hidden="true">✓ </span> : null}{libellePreavis}</button>
        {gestion ? (
          <button type="button" className="arc-gros sor-bascule" aria-pressed={geste === 'sortie'} disabled={locataires.length === 0} onClick={() => choisir('sortie')} data-faire-sortir>
            {geste === 'sortie' ? <span className="sor-coche" aria-hidden="true">✓ </span> : null}{libelleSortie}</button>
        ) : <p className="arc-gros sor-gestion-seule" role="note" data-sortie-gestion-seule>La sortie officielle est validée par un utilisateur de la Gestion.</p>}
      </div>
      {geste !== null && (
        <div className="loc-confirmation pss-saisie" role="group" aria-label={geste === 'preavis' ? 'Enregistrer un préavis' : 'Faire sortir'} data-saisie-geste={geste}>
          <div className="pss-ligne" data-concernes>
            <span className="pss-libelle">Locataires sélectionnés :</span>
            {choisis.length === 0 ? <span className="loc-muet" data-aucun-choisi>aucun — cliquez sur la carte d’un locataire</span> : choisis.map((l) => (
              <span key={l.occupationId} className={`sor-etiquette${geste === 'preavis' && l.dateMaxPreavis !== null ? ' sor-etiquette--exclue' : ''}`} data-concerne={l.occupationId}>
                <strong>{l.nom}</strong>{geste === 'preavis' && l.dateMaxPreavis !== null ? ' · déjà en préavis' : ''}</span>
            ))}
          </div>
          {geste === 'preavis' ? <>
            <div className="pss-ligne">
              <label className="pss-champ" htmlFor={`${id}-recu`}><span className="pss-libelle">Réception du recommandé *</span>
                <input id={`${id}-recu`} type="date" value={recuLe} max={jour} onChange={(e) => setRecuLe(e.target.value)} required aria-required="true" data-recu-le /></label>
              <span className="pvs-segments" role="group" aria-label="Durée du préavis" title={`Proposé : ${raison}`}>
                {segments.map((x) => <button key={x.cle} type="button" className="pvs-segment" aria-pressed={duree === x.cle} onClick={() => setDuree(x.cle)}
                  data-duree={x.cle === String(dureeProposee) ? 'proposee' : x.cle === 'manuelle' ? 'manuelle' : 'autre'}>{x.mot}</button>)}
              </span>
              {duree === 'manuelle' && <input type="date" className="pvs-date-manuelle" value={dateManuelle} min={dateIsoValide(recuLe) ? recuLe : undefined}
                onChange={(e) => setDateManuelle(e.target.value)} aria-label="Date maximale de sortie" data-date-manuelle />}
              <span className="pss-max" data-date-max>→ fin du bail au plus tard le <strong className="pvs-max-valeur">{dateMax === null ? '—' : dateFrPreavis(dateMax)}</strong></span>
            </div>
            <div className="pss-ligne">
              <label className="pss-champ pss-motif"><span className="pss-libelle">Motif (facultatif)</span>
                <input type="text" value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={MOTIF_MAX} placeholder="ex. mutation professionnelle" data-motif /></label>
            </div>
            <p className="loc-muet pss-raison" data-raison>Durée proposée : {dureeProposee} mois ({raison}).</p>
          </> : (
            <div className="pss-ligne">
              <label className="pss-champ" htmlFor={`${id}-sortie`}><span className="pss-libelle">Date de sortie *</span>
                <input id={`${id}-sortie`} type="date" value={dateSortie} max={jour} min={[bail.entree, dateMinSortie(jour)].filter((x): x is string => x !== null).sort().pop()}
                  onChange={(e) => setDateSortie(e.target.value)} required aria-required="true" data-date-sortie /></label>
            </div>
          )}
          {message !== null && <p className="cp-refus" role="alert" data-message-parcours>{message}</p>}
          <div className="pss-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setGeste(null); setTente(false); }} data-annuler-parcours>Annuler</button>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void ouvrirRecap(false)} data-enregistrer-sans-mail>Enregistrer</button>
            <span className="pss-envoi">
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => void ouvrirRecap(true)} data-enregistrer-avec-mails>Enregistrer et envoyer les mails</button>
              <InfoDestinataires action={geste} />
            </span>
          </div>
        </div>
      )}
      {fenetre !== null && <FenetreParcours geste={geste ?? 'preavis'} fenetre={fenetre} noms={noms} sort={sort.phrase}
        dates={geste === 'sortie' ? [['Date de sortie', dateFrPreavis(dateSortie)]] : [['Réception du recommandé', dateFrPreavis(recuLe)], ['Fin du bail au plus tard', dateMax === null ? '—' : dateFrPreavis(dateMax)]]}
        onRevenir={() => setFenetre(null)} onConfirmer={() => void confirmer()} onFermer={fermer} />}
    </div>
  );
}

/**
 * 🔴 Arno (06/11/2026) — LE MÊME PARCOURS SUR LA FICHE LOCATAIRE ET L'ACCUEIL : les cartes des locataires en place (aucune présélectionnée ; un clic
 * sélectionne, rouge ; un préavis ouvert : le nom en bleu), puis `ParcoursPreavisSortie`. `onFini` : l'écran se relit depuis le serveur.
 */
export function ParcoursSurBail({ bail, occupationId, gestion, onFini }: { bail: BailLogement; occupationId: number; gestion: boolean; onFini: (f: FinParcours) => void }) {
  const [version, setVersion] = useState(0);
  const lu = useLecture<PreavisDuBail>(`preavisBail=${occupationId}&p=${version}`);
  const [choix, setChoix] = useState<number[]>([]);
  if (lu.etat.etat === 'charge') return <EtatLecture etat={lu.etat} />;
  const pv = lu.etat.etat === 'ok' ? lu.etat.data : null;
  // Une réponse sans la liste attendue ne fait jamais tomber l'écran : aucun préavis lu.
  const locsPv = Array.isArray(pv?.locataires) ? pv.locataires : [];
  const dateMaxDe = (o: number): string | null => locsPv.find((x) => x.occupationId === o)?.preavis?.dateMax ?? null;
  const basculer = (o: number): void => setChoix((c) => (c.includes(o) ? c.filter((x) => x !== o) : [...c, o]));
  const n = choix.length;
  return (
    <div className="pss-sur-bail" data-parcours-sur-bail={occupationId}>
      <ul className="arc-biens-liste pss-cartes" data-cartes-parcours>
        {bail.locataires.map((l) => {
          const pris = choix.includes(l.occupationId);
          const dm = dateMaxDe(l.occupationId);
          return (
            <li key={l.occupationId} className={`arc-bien-carte sor-carte-cliquable${pris ? ' arc-bien-carte--choisi' : ''}`} data-locataire={l.occupationId}
              onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button, input, select, textarea, summary')) basculer(l.occupationId); }}>
              <ul className="arc-noms"><li>{dm !== null ? <mark className="arc-surligne sor-surligne--preavis" data-en-preavis>{l.nom}</mark>
                : <mark className="arc-surligne arc-surligne--en-place" data-en-place>{l.nom}</mark>}</li></ul>
              <span className="loc-muet" data-entree-le>{l.entree === null ? 'Date d’entrée non renseignée' : `Entré(e) dans les lieux le ${dateFr(l.entree)}`}</span>
              {dm !== null && <span className="pvs-mention" data-preavis-carte>en préavis — fin du bail au plus tard le {dateFr(dm)}</span>}
              <button type="button" className="arc-choisir" aria-pressed={pris} data-choisir={l.occupationId} onClick={() => basculer(l.occupationId)}>{pris ? '✓ Sélectionné' : 'Sélectionner'}</button>
            </li>
          );
        })}
      </ul>
      <ParcoursPreavisSortie bail={bail} occupationId={occupationId} choix={choix} gestion={gestion}
        locataires={bail.locataires.map((l) => ({ occupationId: l.occupationId, nom: l.nom, entree: l.entree, dateMaxPreavis: dateMaxDe(l.occupationId) }))}
        dureeProposee={pv?.dureeProposee ?? 1} raison={pv?.raison ?? ''} preavisDisponible={pv?.disponible === true}
        libellePreavis={n > 1 ? `Enregistrer le préavis de ${n} locataires` : 'Enregistrer un préavis'} libelleSortie={n > 1 ? `Faire sortir ${n} locataires` : 'Faire sortir'}
        onFini={(f) => { setChoix([]); setVersion((v) => v + 1); onFini(f); }} />
    </div>
  );
}

/** La fenêtre : le récapitulatif (« Revenir » / « Confirmer »), puis le résultat (« Fermer »). */
function FenetreParcours({ geste, fenetre, noms, sort, dates, onRevenir, onConfirmer, onFermer }: {
  geste: Geste; fenetre: Fenetre; noms: string[]; sort: string; dates: [string, string][]; onRevenir: () => void; onConfirmer: () => void; onFermer: () => void;
}) {
  const titreId = useId();
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !(fenetre.etape === 'recap' && fenetre.envoi)) (fenetre.etape === 'resultat' ? onFermer : onRevenir)(); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [fenetre, onFermer, onRevenir]);
  const lignes: [string, ReactNode][] = [[noms.length > 1 ? 'Locataires' : 'Locataire', noms.join(', ')], ...dates, ['Le logement', sort]];
  const resume = <dl className="mis-resume" data-resume>{lignes.map(([mot, valeur]) => <div key={mot}><dt>{mot}</dt><dd>{valeur}</dd></div>)}</dl>;
  let contenu: ReactNode;
  if (fenetre.etape === 'recap') {
    const titre = geste === 'preavis' ? 'Récapitulatif du préavis' : 'Récapitulatif de la sortie';
    contenu = <>
      <h2 id={titreId} className="mis-titre" data-titre-parcours>{titre}</h2>
      <p className="loc-muet pss-rien" data-rien-enregistre>Rien n’est encore enregistré : vérifiez, puis « Confirmer ».</p>
      {resume}
      {!fenetre.avecMails ? <p className="mis-note pss-note-neutre" data-aucun-mail-prevu>{AUCUN_MAIL_PREVU}</p> : fenetre.mails === null
        ? <p className="loc-muet" role="status" data-mails-en-preparation>Préparation de la liste des mails…</p> : <>
          {fenetre.motifMails !== null && <p className="cev-alerte" role="alert" data-mails-impossibles>Les mails ne peuvent pas être préparés : {fenetre.motifMails}</p>}
          {fenetre.enGestion === false && <p className="mis-note pss-note-neutre" data-hors-gestion>Bien hors gestion : aucun mail aux partenaires —
            {geste === 'preavis' ? ' seulement aux locataires, avec les copies internes.' : ' seulement le compte rendu interne.'}</p>}
          {fenetre.mails.length === 0 && fenetre.motifMails === null && <p className="mis-note pss-note-neutre" data-aucun-mail-prevu>{AUCUN_MAIL_PREVU}</p>}
          {fenetre.mails.length > 0 && <><p className="pss-sous-titre">Les mails qui partiront :</p>
            <ul className="cev-mails" data-mails-prevus>{fenetre.mails.map((m, i) => (
              <li key={`${i}-${m.sorte}`} className="cev-mail" data-mail-prevu={m.sorte}>
                <p className="cev-mail-titre">{libelleMail(m)}</p>
                <dl className="cev-dl"><dt>Objet</dt><dd data-objet>{m.objet}</dd><dt>Destinataires</dt><dd data-a>{m.a.join(', ') || '—'}</dd>
                  <dt>En copie</dt><dd data-cc>{m.cc.length > 0 ? m.cc.join(', ') : 'aucune'}</dd></dl>
                {m.texte !== undefined && <details className="pss-texte"><summary>Voir le texte du mail</summary><pre className="pss-pre" data-texte-mail>{m.texte}</pre></details>}
              </li>))}</ul></>}
          {fenetre.sansEmail.map((n) => <p key={n} className="mis-note" data-sans-email>⚠ {n} : {MENTION_SANS_EMAIL}</p>)}
        </>}
      {fenetre.refus !== null && <p className="cev-alerte" role="alert" data-echec-enregistrement>{fenetre.refus}</p>}
      <div className="mis-actions">
        <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={onRevenir} disabled={fenetre.envoi} data-revenir-parcours>Revenir</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={onConfirmer}
          disabled={fenetre.envoi || (fenetre.avecMails && (fenetre.mails === null || fenetre.motifMails !== null))} data-confirmer-parcours>
          {fenetre.envoi ? 'Enregistrement…' : 'Confirmer'}</button>
      </div>
    </>;
  } else {
    const titre = geste === 'preavis' ? 'Préavis enregistré' : 'Sortie enregistrée';
    contenu = <>
      <h2 id={titreId} className="mis-titre" data-titre-parcours>✓ {titre}</h2>
      {resume}
      {!fenetre.avecMails ? <p className="mis-note pss-note-neutre" data-aucun-mail-envoye>{AUCUN_MAIL_ENVOYE}</p>
        : <BlocsEnvois issue={{ informer: true, mails: fenetre.mails, motifGlobal: fenetre.motifGlobal }} />}
      <div className="mis-actions">
        <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={onFermer} data-fermer-parcours>Fermer</button>
      </div>
    </>;
  }
  const echec = fenetre.etape === 'resultat' && (fenetre.motifGlobal !== null || fenetre.mails.some((m) => !m.envoye));
  const boite = (
    <div className="mis-voile">
      <div className={`mis-boite ${fenetre.etape === 'resultat' ? (echec ? 'mis-boite--attention' : 'mis-boite--succes') : 'pss-boite-recap'}`} role="dialog" aria-modal="true"
        aria-labelledby={titreId} data-fenetre-parcours={fenetre.etape}>
        {contenu}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? boite : createPortal(boite, document.querySelector('.svv-adm-root') ?? document.body);
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px ; une colonne au telephone. */
export const CSS_PARCOURS = `
.pss{display:flex;flex-direction:column;gap:10px}
.pss-sur-bail{display:flex;flex-direction:column;gap:12px}
.sor-carte-cliquable{cursor:pointer}
.pss-saisie{display:flex;flex-direction:column;gap:10px}
.pss-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}
.pss-libelle{font-weight:700;margin-right:4px}
.pss-champ{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px}
.pss-champ input{min-height:44px}
.pss-motif{flex:1 1 280px}
.pss-motif input{flex:1 1 200px}
.pss-max{font-size:.95rem}
.pss-raison{margin:0;font-size:.85rem}
.pss-boutons{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;align-items:center}
.pss-boutons .gst-btn{min-height:44px;width:auto}
.pss-envoi{display:inline-flex;align-items:center;gap:2px}
.pss-boite-recap{border-color:var(--color-svv-ink)}
.pss-rien{margin:0}
.pss-sous-titre{margin:0;font-weight:800}
.pss-note-neutre{border-color:var(--color-svv-line-strong);background:var(--color-svv-field)}
.pss-texte summary{cursor:pointer;font-weight:700;min-height:32px}
.pss-pre{white-space:pre-wrap;font-family:inherit;font-size:.85rem;margin:6px 0 0;max-height:260px;overflow:auto;background:var(--color-svv-field);padding:8px;border-radius:8px}
@media (max-width:640px){ .pss-boutons{justify-content:stretch} .pss-boutons .gst-btn{width:100%} .pss-envoi{width:100%} .pss-envoi .gst-btn{flex:1} }
`;
