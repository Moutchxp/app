/**
 * M2 — LOT 2. Moitié CLIENT (navigateur) du canal analytique. AUCUN import serveur (pas de `server-only`,
 * pas de writer/pool/DB) : ce module est bundlé côté client. Il POSTe des événements au beacon
 * `/api/mesure` en FIRE-AND-FORGET — jamais awaité, ne bloque/casse jamais l'UI, toute erreur est avalée.
 *
 * SESSION ÉPHÉMÈRE (preuve « pas un traceur ») : `session_id` = UUID v4 aléatoire (`crypto.randomUUID`)
 * gardé en `sessionStorage` — donc PAR ONGLET, JETÉ à la fermeture de l'onglet, JAMAIS un cookie, JAMAIS
 * persistant entre deux visites, JAMAIS envoyé à un tiers. On mesure des VISITES, pas des visiteurs ; un
 * visiteur qui revient obtient un NOUVEL identifiant → non ré-identifiable (décision Q-B, SPEC_M2_rgpd).
 *
 * PROVENANCE : `document.referrer` (d'où vient la visite) et les UTM de l'URL d'atterrissage sont joints
 * UNIQUEMENT à `session_debut` ; le serveur les RÉDUIT (host seul, allowlist) avant tout stockage.
 */

const CLE_SID = 'svv_sid';

/** UUID v4 de session (créé au 1er appel, réutilisé dans l'onglet). `null` si sessionStorage indisponible. */
function sessionId(): string | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    let sid = window.sessionStorage.getItem(CLE_SID);
    if (!sid) {
      sid = crypto.randomUUID(); // v4 aléatoire (imposé par le CHECK 018)
      window.sessionStorage.setItem(CLE_SID, sid);
    }
    return sid;
  } catch {
    return null; // mode privé strict / storage bloqué → pas de session (les compteurs partent quand même)
  }
}

/** Paramètres d'acquisition de l'URL d'atterrissage (source/medium/campagne SEULEMENT ; reste ignoré). */
function utmAtterrissage(): { source?: string; medium?: string; campagne?: string } {
  try {
    const p = new URLSearchParams(window.location.search);
    const o: { source?: string; medium?: string; campagne?: string } = {};
    const s = p.get('utm_source');
    const m = p.get('utm_medium');
    const c = p.get('utm_campaign');
    if (s) o.source = s;
    if (m) o.medium = m;
    if (c) o.campagne = c;
    return o;
  } catch {
    return {};
  }
}

export interface ExtraMesure {
  etape?: string;
  raison?: string;
  commune?: string;
  /** `session_debut` : joindre provenance (document.referrer) + UTM d'atterrissage. */
  provenance?: boolean;
}

/**
 * Émet un événement analytique vers `/api/mesure`. FIRE-AND-FORGET absolu : jamais awaité, jamais d'impact
 * sur l'UI, toute exception avalée. `sendBeacon` de préférence (survit à la navigation / fermeture d'onglet),
 * sinon `fetch(keepalive)`. Ne renvoie rien.
 */
export function mesure(nom: string, extra: ExtraMesure = {}): void {
  try {
    if (typeof window === 'undefined') return;
    const corps: Record<string, unknown> = { nom, sid: sessionId() };
    if (extra.etape) corps.etape = extra.etape;
    if (extra.raison) corps.raison = extra.raison;
    if (extra.commune) corps.commune = extra.commune;
    if (extra.provenance) {
      Object.assign(corps, utmAtterrissage());
      if (document.referrer) corps.referer = document.referrer; // réduit en host côté serveur
    }
    const donnees = JSON.stringify(corps);
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/mesure', new Blob([donnees], { type: 'application/json' }));
    } else {
      void fetch('/api/mesure', {
        method: 'POST',
        body: donnees,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // analytics best-effort : jamais d'impact UI.
  }
}
