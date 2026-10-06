/**
 * ══ 🔴🔴 LOT MONGA-1, POINT 1 — LIRE UN MAIL MONGA. MODULE PUR ═══════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONTEXTE (Arno, 06/10/2026) : Monga est notre prestataire d'interventions. Il prend les rendez-vous, suit le
 * devis jusqu'à la clôture, et nous envoie un mail à chaque étape. Chaque mail porte une RÉFÉRENCE unique par
 * intervention — « MNG-23987 ».
 *
 * 🔴 CE MODULE NE FAIT QUE LIRE. Il dit ce qu'un mail Monga contient ; c'est le dépôt qui écrit, et l'écran qui
 * demande. Aucune base, aucun réseau, aucun React.
 *
 * ═══ 🔴🔴 CE QUE L'AUDIT DU 06/10/2026 A MESURÉ, ET QUI DICTE CHAQUE RÈGLE D'ICI ════════════════════════════════
 *
 * Sur 156 mails Monga (dont 97 du gabarit `noreply@monga.io`), 40 références, 365 lots actifs :
 *   · référence lisible : **95 / 97** des mails gabarités ;
 *   · libellé : **93 / 97** ; adresse : **93 / 97** ; lien « Vers Mission » : **93 / 97** ;
 *   · DEUX gabarits coexistent, et il faut les deux (voir plus bas) ;
 *   · 18 références donnent un lot unique, **19 en donnent plusieurs** (jusqu'à 76 lots à la même adresse),
 *     3 aucun. D'où la décision d'Arno : **le premier rattachement est TOUJOURS un clic**, jamais une déduction.
 *
 * 🔴🔴 LE DÉFAUT QUE CE MODULE CORRIGE, ET QUI A FAILLI FAIRE CONCLURE « IMPOSSIBLE ». La première passe de
 * l'audit lisait « MNG-20354 » comme une adresse, parce que la référence **contient cinq chiffres** et qu'on
 * cherchait un code postal par `\d{5}`. 36 références sur 40 se retrouvaient alors « sans bien ». Une adresse
 * exige donc ici un code postal qui n'est **pas** collé à un `MNG-`, et la ligne doit venir APRÈS celle de la
 * référence. Corrigé, le compte est devenu 18 / 19 / 3.
 *
 * ═══ LES DEUX GABARITS ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * GABARIT A (actuel) :            GABARIT B (plus ancien, « V3 ») :
 *   Monga                           <libellé>
 *   <libellé> MNG-<ref>             MNG-<ref>
 *   <adresse>                       "<libellé>"
 *   <libellé>                       <adresse>
 *   Bonjour <destinataire>          …
 *   …                               Vers Mission [https://app.monga.io/mng/<numéro>]
 *   Vers Mission [https://app.monga.io/missions/view/<uuid>]
 *
 * ⚠️ ON LIT LE TEXTE, PAS LE HTML, et c'est délibéré : le HTML de ces mails est une maquette d'infolettre de
 * 30 ko, régénérée à chaque campagne. Le texte porte les mêmes champs dans un ordre stable depuis mars 2026. Un
 * extracteur accroché au HTML casserait au premier changement de maquette — sans prévenir.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { adresseCitee, normaliser, type BienConnu } from './propositionsBien';

/** Le domaine de Monga, sous-domaines compris (`comptabilite@leanpay.monga.io`). */
export function estAdresseMonga(adresse: string | null | undefined): boolean {
  return /@([a-z0-9-]+\.)*monga\.io$/i.test((adresse ?? '').trim());
}

/**
 * La RÉFÉRENCE d'une intervention, normalisée en « MNG-23987 ». PUR.
 *
 * ⚠️ LE GABARIT B N'ÉCRIT PAS LE TIRET DANS L'OBJET (« Le ticket MONGA 20354 requiert votre attention ») : c'est
 * pourtant la même référence, et la rater couperait en deux l'historique d'une intervention.
 */
export function referenceMonga(objet: string | null | undefined, texte?: string | null): string | null {
  const o = objet ?? '';
  const t = texte ?? '';
  const direct = /MNG-(\d{4,6})/i.exec(o) ?? /MNG-(\d{4,6})/i.exec(t);
  if (direct !== null) return `MNG-${direct[1]}`;
  const ticket = /ticket\s+MONGA\s+(\d{4,6})/i.exec(o) ?? /ticket\s+MONGA\s+(\d{4,6})/i.exec(t);
  return ticket === null ? null : `MNG-${ticket[1]}`;
}

/** TOUTES les références citées, dans l'ordre d'apparition. Sert à repérer les mails ambigus. PUR. */
export function referencesMonga(objet: string | null | undefined, texte?: string | null): string[] {
  const vues: string[] = [];
  const ajouter = (r: string): void => { if (!vues.includes(r)) vues.push(r); };
  for (const m of `${objet ?? ''}\n${texte ?? ''}`.matchAll(/MNG-(\d{4,6})/gi)) ajouter(`MNG-${m[1]}`);
  for (const m of `${objet ?? ''}\n${texte ?? ''}`.matchAll(/ticket\s+MONGA\s+(\d{4,6})/gi)) ajouter(`MNG-${m[1]}`);
  return vues;
}

/**
 * Les lignes utiles d'un corps : rognées, sans les vides, et DÉBARRASSÉES DES MARQUES DE CITATION. PUR.
 *
 * ⚠️ MESURÉ SUR LES TRANSFERTS, et c'est la seule raison de cette fonction. Un mail Monga transféré depuis une
 * boîte de la maison arrive cité : chaque ligne porte un `>` (parfois deux), et Monga lui-même puce certaines
 * lignes. Sans ce nettoyage, l'adresse sortait « > 2 rue Mars et Roty, 92800 Puteaux » et « > • Adresse : 54
 * avenue… » — lisible pour un humain, inutilisable pour rapprocher un lot.
 */
function lignes(texte: string): string[] {
  return texte.split('\n')
    .map((l) => l.replace(/^[\s>]*>/, '').replace(/^\s*[•*·▪-]\s+/, '').trim())
    .filter((l) => l !== '');
}

/**
 * Une ligne d'en-tête recopiée par un transfert (« Subject: … », « Objet : … », « Objet - … »). PUR.
 *
 * ⚠️ LE TIRET COMPTE AUTANT QUE LES DEUX-POINTS : mesuré sur MNG-19733, dont le corps commence par « Objet -
 * Rappel 2 : Devis en attende de validation ». Sans le tiret, cette ligne passait pour le libellé de
 * l'intervention, et l'encart annonçait « Objet - Rappel 2 : … » au lieu du vrai libellé.
 */
function estEnTeteRecopie(l: string): boolean {
  const mot = '(?:subject|objet|de|from|à|to|date|envoyé le|sent|expéditeur|destinataire)';
  /* ⚠️ LE TIRET EXIGE UNE ESPACE APRÈS LUI, les deux-points non. Sans cette nuance, « De-bouchage douche » —
     un libellé de plomberie parfaitement ordinaire — passait pour un en-tête de transfert et disparaissait. */
  return new RegExp(`^${mot}\\s*:`, 'i').test(l) || new RegExp(`^${mot}\\s*[-–—]\\s`, 'i').test(l);
}

/**
 * Un libellé qui ne dit rien ne vaut pas mieux que rien. PUR.
 *
 * ⚠️ MESURÉ : sur un mail TRANSFÉRÉ, la ligne de la référence peut n'être qu'un « ** » de mise en gras, ou une
 * ligne de facture « • FACT-… ». Cinq références n'avaient pas de libellé lisible avant ce filtre.
 */
export function libelleUtile(l: string | null | undefined): string | null {
  if (l === null || l === undefined) return null;
  const net = l.replace(/[*_>]+/g, '').replace(/\s+/g, ' ').replace(/\s*[:;,\-–—]+$/, '').trim();
  if (net.length < 3) return null;
  if (estEnTeteRecopie(net)) return null;
  if (/^[•\-–—\s]*FACT-/i.test(net)) return null;
  /* ⚠️ UN HORODATAGE N'EST JAMAIS UN LIBELLÉ D'INTERVENTION, et il est là pour une raison : quand la ligne de la
     référence ne porte que la référence, on prend la ligne d'AVANT — et sur un transfert, la ligne d'avant est
     souvent « Date 11/05/2026 09:00:44 » (mesuré sur MNG-19733). Mieux vaut rendre `null`, et laisser l'objet
     répondre, que d'afficher une date à la place du libellé dans l'encart « Intervention Monga ». */
  if (/^(?:date|envoyé|sent|reçu)\b/i.test(net) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(net)) return null;
  return net;
}

/**
 * Le libellé tiré de l'OBJET — la seconde source. PUR.
 *
 * « MNG-23987 - Rappel 1 : Devis en attende de validation - barre de douche defixer » → le dernier segment.
 */
export function libelleDeLObjet(objet: string | null | undefined): string | null {
  const o = (objet ?? '').replace(/^(?:re|fw|fwd|tr)\s*:\s*/gi, '').trim();
  if (!/MNG-\d{4,6}/i.test(o)) return null;
  const bouts = o.split(/\s+-\s+/).map((b) => b.trim()).filter((b) => b !== '');
  if (bouts.length < 2) return null;
  const dernier = bouts[bouts.length - 1];
  return /MNG-\d{4,6}/i.test(dernier) ? null : libelleUtile(dernier);
}

/**
 * ══ 🔴🔴 LE LIBELLÉ ET L'ADRESSE DE L'EN-TÊTE ═══════════════════════════════════════════════════════════════════
 *
 * 🔴 LE LIBELLÉ EST LA LIGNE QUI PORTE LA RÉFÉRENCE, moins la référence — c'est le seul endroit où Monga l'écrit
 * sans guillemets ni ponctuation ajoutée, dans les DEUX gabarits. Quand cette ligne ne porte QUE la référence
 * (gabarit B), le libellé est la ligne d'avant.
 *
 * 🔴🔴 L'ADRESSE EXIGE TROIS CHOSES, et chacune a coûté une mesure :
 *   ① un code postal qui n'est PAS collé à un `MNG-` — « MNG-20354 » contient cinq chiffres (le défaut de
 *      l'audit, qui faisait passer 36 références sur 40 pour « sans bien ») ;
 *   ② des lettres — un code postal seul ne désigne rien ;
 *   ③ venir APRÈS la ligne de la référence — c'est sa place dans les deux gabarits, et cela écarte d'un coup
 *      tous les en-têtes de transfert recopiés en tête de corps.
 */
export interface EnTeteMonga {
  reference: string | null;
  libelle: string | null;
  adresse: string | null;
  lienMission: string | null;
}

export function lireEnTeteMonga(objet: string | null | undefined, texte: string | null | undefined): EnTeteMonga {
  const t = texte ?? '';
  const ls = lignes(t);
  let libelle: string | null = null;
  let adresse: string | null = null;
  for (let i = 0; i < ls.length; i += 1) {
    const l = ls[i];
    if (estEnTeteRecopie(l)) continue;
    if (libelle === null && /MNG-\d{4,6}/i.test(l)) {
      const sansRef = l.replace(/MNG-\d{4,6}/i, '')
        .replace(/^["«\s]+|["»\s]+$/g, '').replace(/^[-–—\s]+|[-–—\s]+$/g, '').trim();
      libelle = libelleUtile(sansRef) ?? (i > 0 ? libelleUtile(ls[i - 1]) : null);
    }
    if (adresse === null && libelle !== null
      && /(?:^|[^-\d])\d{5}(?:[^\d]|$)/.test(l) && /[A-Za-zÀ-ÿ]{3,}/.test(l)
      /* ⚠️ `MNG-` EST UN SECOND VERROU, MESURÉ COMME TEL. La garde du code postal suffit déjà à écarter
         « MNG-20354 » (le 5 chiffres y est collé à un tiret) : retirer `MNG-` de cette liste ne fait tomber
         aucune épreuve. On le garde parce qu'il dit l'intention à qui relit, mais c'est la garde du code postal
         qui tient la règle — et c'est elle que `monga.test.ts` éprouve seule, sur le numéro de facture. */
      && !/MNG-|monga|rgpd|capital|rcs|@/i.test(l)) {
      /* ⚠️ « Adresse : 54 avenue… » — Monga étiquette la ligne dans ses rappels de rendez-vous (mesuré sur
         MNG-19724). On garde la ligne et on retire l'étiquette : c'est bien l'adresse, simplement annoncée. */
      adresse = l.replace(/^(?:adresse|lieu|lieu d['’]intervention)\s*[:\-–—]\s*/i, '')
        .replace(/^["«\s]+|["»\s]+$/g, '').replace(/\s*,\s*$/, '').trim();
    }
    if (libelle !== null && adresse !== null) break;
  }
  return {
    reference: referenceMonga(objet, t),
    /* 🔴 LE CORPS D'ABORD, L'OBJET EN SECOURS : le corps porte le libellé tel que Monga l'écrit ; l'objet le
       répète, mais un transfert peut l'avoir préfixé. */
    libelle: libelleUtile(libelle) ?? libelleDeLObjet(objet),
    adresse,
    lienMission: lienMissionMonga(t),
  };
}

/** Le lien « Vers Mission », les deux formes d'URL. PUR. */
export function lienMissionMonga(texte: string | null | undefined): string | null {
  const m = /https:\/\/app\.monga\.io\/(?:missions\/view\/[0-9a-f-]+|mng\/\d+)/i.exec(texte ?? '');
  return m === null ? null : m[0];
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LES ÉTAPES D'UNE INTERVENTION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   🔴 L'OBJET DÉCIDE, ET LE CORPS CONFIRME. L'objet de Monga est gabarité ; le corps ne l'est qu'à moitié. Classer
   sur le corps aurait rangé par hasard les mails dont le texte est vide (deux dans le corpus audité).

   ⚠️ « commentaire » EST UN FOURRE-TOUT ASSUMÉ, et c'est la mesure la plus importante : c'est le type le plus
   nombreux (54 mails sur 156), et son contenu est du TEXTE LIBRE écrit par un humain de chez Monga. Ce qu'il
   annonce — un rendez-vous, un report, un échec d'appel — n'est PAS lisible par une règle. */

export type EtapeMonga = 'devis_envoye' | 'devis_rappel' | 'commentaire' | 'attention' | 'terminee'
  | 'facture' | 'relance_facture' | 'compte_rendu' | 'service' | 'autre';

export function etapeMonga(objet: string | null | undefined, texte?: string | null): EtapeMonga {
  const o = (objet ?? '').toLowerCase();
  const tout = `${o} ${texte ?? ''}`;
  if (/mission terminée|paiement a été reçu/i.test(tout)) return 'terminee';
  if (/devis envoyé/i.test(o)) return 'devis_envoye';
  if (/rappel\s*\d\s*:\s*devis/i.test(o)) return 'devis_rappel';
  if (/nouveau commentaire/i.test(o)) return 'commentaire';
  if (/requiert votre attention/i.test(o)) return 'attention';
  if (/^facture monga|facture n°|fact-/i.test(o)) return 'facture';
  if (/rappel de l['’]échéance|factures impayées|factures en attente|relevé de factures/i.test(o)) {
    return 'relance_facture';
  }
  if (/compte-rendu/i.test(o)) return 'compte_rendu';
  if (/\[monga\]|invitation:|onboarding|formation/i.test(o)) return 'service';
  return 'autre';
}

/** Le mot d'une étape, tel qu'il s'affiche. Écrit ici, lu partout. PUR. */
export function motEtapeMonga(e: EtapeMonga | null | undefined): string {
  switch (e) {
    case 'devis_envoye': return 'Devis envoyé, à valider';
    case 'devis_rappel': return 'Devis en attente de validation';
    case 'commentaire': return 'Nouveau commentaire';
    case 'attention': return 'Le ticket requiert votre attention';
    case 'terminee': return 'Mission terminée';
    case 'facture': return 'Facture';
    case 'relance_facture': return 'Relance de facture';
    case 'compte_rendu': return 'Compte-rendu';
    case 'service': return 'Service Monga';
    default: return 'Étape inconnue';
  }
}

/**
 * 🔴🔴 CE QUI MARQUE LA FIN D'UNE INTERVENTION — et rien d'autre.
 *
 * ⚠️ MESURÉ : **UN SEUL** mail « Mission terminée » dans tout le corpus, pour 40 références. La clôture n'est donc
 * jamais déduite : Arno la décide, et l'écran se contente de la PROPOSER quand ce mail arrive. Une règle qui
 * fermerait l'événement toute seule ne fermerait presque rien, et fermerait parfois à tort.
 */
export function finDIntervention(e: EtapeMonga): boolean {
  return e === 'terminee';
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LE NOM DE L'ÉVÉNEMENT — RÈGLE D'ARNO
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * RÈGLE D'ARNO (06/10/2026), mot pour mot : « Quand une référence est reliée à un événement EXISTANT, l'événement
 * PREND le libellé Monga. L'ancien nom est conservé et visible dans l'historique de l'événement. Ensuite, le nom
 * est verrouillé : le modifier demande une confirmation. Une intervention sans Monga n'est pas concernée. »
 *
 * ⚠️ `null` QUAND LE NOM NE CHANGE PAS : on ne journalise pas une modification qui n'en est pas une, et l'écran
 * n'annonce alors aucun renommage.
 */
export function renommageAFaire(nomActuel: string, libelleMonga: string): string | null {
  const a = nomActuel.trim();
  const b = libelleMonga.trim();
  return b === '' || a === b ? null : b;
}

/** La phrase qui annonce le renommage AVANT de relier. PUR. */
export function motRenommageMonga(libelleMonga: string): string {
  return `Le nom deviendra « ${libelleMonga} » (nom Monga). Ancien nom conservé dans l’historique.`;
}

/**
 * La question posée quand on veut renommer un événement DÉJÀ relié à Monga. PUR.
 *
 * 🔴 ELLE NE BLOQUE PAS, ELLE DEMANDE : « Modifier quand même ? ». Le nom reste modifiable — c'est une
 * confirmation, pas un verrou. Un verrou dur aurait fini par obliger à délier l'intervention pour corriger une
 * faute de frappe.
 */
export function questionNomVerrouille(reference: string): string {
  return `Cet événement est lié à l’intervention Monga ${reference} : son nom doit rester identique à celui de `
    + 'Monga. Modifier quand même ?';
}

/** Le badge porté par un événement relié. PUR. */
export function badgeMonga(reference: string): string {
  return `Monga ${reference}`;
}

/** « Devis en attente de validation · 05/10 ». `null` quand on ne sait rien. PUR. */
export function motDerniereEtape(etape: EtapeMonga | null, le: string | null): string | null {
  if (etape === null) return null;
  const mot = motEtapeMonga(etape);
  if (le === null || le === '') return mot;
  const d = new Date(le);
  if (Number.isNaN(d.getTime())) return mot;
  const jour = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit',
  }).format(d);
  return `${mot} · ${jour}`;
}

/**
 * UN JOUR CIVIL `AAAA-MM-JJ` ÉCRIT COMME ON L'ÉCRIT EN FRANÇAIS : « 06/10/2026 ». PUR.
 *
 * ⚠️ AUCUN `new Date()` ICI, ET C'EST VOULU. La chaîne est DÉJÀ un jour civil, calculé côté serveur à l'heure de
 * Paris ; la repasser par un `Date` la relirait en UTC et ferait reculer d'un jour les cartes ouvertes après
 * 22 h. On découpe, on remet dans l'ordre, et c'est tout.
 */
export function jourFrancais(jour: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((jour ?? '').trim());
  return m === null ? (jour ?? '') : `${m[3]}/${m[2]}/${m[1]}`;
}

/** L'encart en tête de la fenêtre « Classer » : « Intervention Monga MNG-… · libellé · adresse ». PUR. */
export function motEncartMonga(e: { reference: string; libelle: string | null; adresse: string | null }): string {
  return [`Intervention Monga ${e.reference}`, e.libelle, e.adresse]
    .filter((x) => x !== null && x !== '').join(' · ');
}

/** Le mot du filtre de « À rattacher ». PUR. */
export function motFiltreMonga(n: number): string {
  return `Interventions Monga à relier (${n})`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT MONGA-1, POINT 2 — LE CLASSEMENT AUTOMATIQUE : CE QUE LA RÈGLE DÉCIDE. PUR.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO (06/10/2026), mot pour mot : « Un mail Monga dont la référence est DÉJÀ reliée est rattaché
   automatiquement à l'événement, à son ou ses biens, avec le propriétaire et le locataire à la date du mail,
   statut « Auto », PAR LA PORTE D'ÉCRITURE EXISTANTE (la porte de ce mail uniquement : aucune fenêtre de suivi
   de conversation créée ni modifiée). Il ne passe plus par « À classer » ni par « À rattacher ». » */

/** Le motif écrit sur chaque lien posé par le classement automatique. Il NOMME la référence : six mois après,
 *  « pourquoi ce mail est-il dans ce dossier ? » doit se lire sur le lien lui-même. PUR. */
export function motifClassementMonga(reference: string): string {
  return `classé automatiquement — intervention Monga ${reference}`;
}

/** Ce que l'examen du rattachement retient quand le classement a eu lieu. PUR. */
export function motifExamenMonga(reference: string): string {
  return `intervention Monga ${reference} reliée à un événement`;
}

/**
 * ══ 🔴🔴 POURQUOI UN MAIL PEUT NE PAS ÊTRE CLASSÉ AUTOMATIQUEMENT ════════════════════════════════════════════════
 *
 * Les quatre premiers cas sont des ABSENCES (on ne sait pas quoi faire) ; les deux derniers sont des DÉCISIONS
 * HUMAINES qu'une automatisation n'a pas à défaire.
 */
export type RefusClassementMonga =
  | 'pas_un_mail_monga'   // aucune lecture Monga : ce n'est pas notre affaire
  | 'sans_reference'      // mesuré : 2 mails sur 97. On ne peut rien relier à une référence qu'on n'a pas
  | 'reference_a_relier'  // la référence n'a pas d'événement : c'est le point 3, et c'est un clic d'Arno
  | 'evenement_sans_bien' // l'événement ne porte aucun bien : on ne DEVINE pas le bien (règle d'Arno)
  | 'mail_interne'        // 🔴 un humain a dit « interne » : on ne le classe pas dans un dossier client
  | 'mail_inerte';        // 🔴 jeté sans statut (lot CORBEILLE-SANS-STATUT) : il ne demande plus rien

/** Ce qu'on DIT d'un refus, là où il faut l'expliquer. PUR. */
export function motRefusClassementMonga(r: RefusClassementMonga): string {
  switch (r) {
    case 'pas_un_mail_monga': return 'Ce mail n’est pas un mail Monga.';
    case 'sans_reference': return 'Ce mail Monga ne porte aucune référence lisible.';
    case 'reference_a_relier': return 'Cette intervention Monga n’est pas encore reliée à un événement.';
    case 'evenement_sans_bien': return 'L’événement de cette intervention ne porte aucun bien.';
    case 'mail_interne': return 'Ce mail est marqué « interne » : son classement reste une décision humaine.';
    default: return 'Ce mail est à la corbeille sans statut : il ne demande plus de classement.';
  }
}

/**
 * 🔴🔴 LE PROPRIÉTAIRE ET LE LOCATAIRE **À LA DATE DU MAIL**, et eux seuls. PUR.
 *
 * `personnesDesBiens` rend TOUT le monde — les anciens propriétaires d'un bien vendu, les locataires partis, ceux
 * qui n'ont pas encore emménagé — parce que l'étape 2 les MONTRE à l'écran, où un humain choisit. Un classement
 * automatique, lui, n'a personne pour choisir : il ne retient donc que les deux personnes qu'Arno a nommées.
 *
 * ⚠️ `locataire_sortant` ET `locataire_a_venir` SONT ÉCARTÉS, et c'est le cœur de la règle. Un mail d'octobre
 * concerne l'occupant d'octobre ; poser le locataire parti en août mettrait le courrier d'un logement dans le
 * dossier de quelqu'un qui n'y habite plus — exactement l'erreur qu'on ne veut jamais commettre.
 *
 * ⚠️ UN BIEN PEUT N'AVOIR AUCUN LOCATAIRE À CETTE DATE (vacance, ou bien occupé par son propriétaire), et ce
 * n'est pas une anomalie : on pose alors le propriétaire seul.
 */
export function personnesEnVigueur<P extends {
  sorte: 'proprietaire' | 'locataire'; role: string; actif?: boolean;
}>(personnes: readonly P[]): P[] {
  return personnes.filter((p) => (p.sorte === 'proprietaire' ? p.actif === true : p.role === 'locataire_occupant'));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT MONGA-1, POINT 3 — LES LOTS CANDIDATS D'UNE ADRESSE MONGA. PUR.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO : l'encart propose « les événements OUVERTS des lots candidats » ou « Créer l'événement sur le
   lot choisi (lot unique présélectionné mais PAS validé ; plusieurs lots : liste avec propriétaire et locataire
   actuel de chacun ; aucun : moteur de recherche) ».

   🔴🔴 ON RÉEMPLOIE `adresseCitee`, LE RAPPROCHEUR D'ADRESSE DE LA MAISON — et c'est la décision qui compte ici.
   L'audit du 06/10 avait écrit le sien (numéro + mots de voie, avec sa propre liste de mots vides et de communes).
   Deux rapprocheurs d'adresse dans le même dépôt, c'est deux réponses possibles à « quel lot est-ce ? », et celle
   qu'on regarde le moins qui garde l'ancienne règle. Mesuré AVANT de choisir : sur les 40 références réelles,
   `adresseCitee` retrouve exactement le compte de l'audit — **18 lot unique, 19 plusieurs, 3 aucun**.

   ⚠️ IL FAUT LE NUMÉRO **ET** LE NOM DE VOIE (règle de `adresseCitee`, et elle est juste) : « rue Danton » seul
   désigne toute une rue, où nous gérons parfois trois immeubles. D'où le cas « aucun lot » de MNG-20354, dont
   Monga écrit l'adresse SANS numéro (« Rue Camille Deschanel, 92400 Courbevoie ») — un moteur de recherche, et
   pas une devinette. */


/**
 * Les lots dont l'adresse est celle que Monga a écrite. PUR.
 *
 * ⚠️ `null` OU ADRESSE ILLISIBLE ⇒ LISTE VIDE, jamais « tous les lots ». Une liste vide fait apparaître le moteur
 * de recherche ; une liste de 365 lots ferait cliquer Arno au hasard.
 */
export function lotsPourLAdresseMonga<B extends BienConnu>(
  adresse: string | null, lots: readonly B[],
): B[] {
  if (adresse === null || adresse.trim() === '') return [];
  const texte = normaliser(adresse);
  return lots.filter((l) => adresseCitee(l, texte));
}

/** Combien de lots, et donc quel geste l'encart propose. PUR. */
export type CasLotsMonga = 'unique' | 'plusieurs' | 'aucun';

export function casLotsMonga(n: number): CasLotsMonga {
  return n === 1 ? 'unique' : n > 1 ? 'plusieurs' : 'aucun';
}

/**
 * Ce que l'encart DIT selon le cas. PUR.
 *
 * 🔴 « PRÉSÉLECTIONNÉ MAIS PAS VALIDÉ » (Arno) : même quand le lot est unique, rien n'est écrit avant le clic.
 * C'est la décision n° 1 d'Arno sur ce lot — « premier rattachement d'une référence = TOUJOURS un clic d'Arno,
 * même quand le lot est unique » — et elle se voit à l'écran : le lot est coché, le bouton attend.
 */
export function motCasLotsMonga(cas: CasLotsMonga): string {
  switch (cas) {
    case 'unique': return 'Un seul bien à cette adresse. Vérifiez, puis validez.';
    case 'plusieurs': return 'Plusieurs biens à cette adresse : choisissez lequel.';
    default: return 'Aucun bien reconnu à cette adresse : cherchez-le.';
  }
}
