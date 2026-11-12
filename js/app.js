import { ACCESS_CODE, VENUE } from '../config.js';
import * as appConfig from '../config.js';
import { DRIVE_FOLDER, driveClientId, loadGis, requestDriveToken, shareableBackupName, uploadBackupToDrive } from './drive.js';
import { createStore } from './store.js';
import { usageLevel, usageSummary, usageTotals, writeFailureText } from './usage.js';
import { parseMatchesFromText, parsePlayedMatchesFromText } from './parser.js';
import { normalizePhone, displayFromWa, WA_CHOICE_KEY, waSendUrl } from './phone.js';
import { usualPlayers } from './regulars.js';
import {
  todayISO, weekdayOf, labelDate, numericDate, weekdayDate, matchSwitchLabel, matchTitleLabel, addDays, compensationWhen, shortHour, clockTime, capitalize, relativeLabel, attendanceWhen, toEpoch, transferReminderText, transferReminderWhen,
  DIAS_CORTOS, MESES_CORTOS,
} from './dates.js';
import { autoCreditExcess, autoCreditTake, awaitingItems, awaitingText, collectedLine, formatARS, isFreePlay, organizerReceipts, parseAmount, payBatchCollectorNames, payBatchSnapshot, paymentFailureText, paymentHeadline, paymentParts, paymentRecord, paymentShares, paymentStatusText, paymentWithoutShare, pendingStatusText, revertPayBatch, samePaySnapshot, hasPaymentDirection, settleOldestDebts, settlementSummary, splitLeftoverCredit, writePaymentsInOrder, annulCreditDeltas } from './payments.js';
import { moveWaiting, nextWaitOrder, overflowPatches, rosterSplit, sortWaiting } from './waiting.js';
import {
  attendanceMessage, cancelLinks, confirmPageUrl, confirmStatus, confirmSummary, matchesCrossingReminderWindow,
  needsReminderBanner, playersForOrganizer, promotionMessage, reminderDueAt, reminderLinks, reminderProgress,
  reservationClearedByAnswer,
} from './reminders.js';
import { isShortCode, shortConfirmUrl } from './short.js';
import { shortenExternal } from './shorten.js';
import { PRIVATE_WA_TEXT } from './privacy.js';
import { activityNoticeText, activityNotices } from './notify.js';
import { ROSTER_DENIED_WRITE, SUSPENDED_TEXT, activeSuspensions, blockingSuspensions, canonicalPhone, cleanShortName, displayName, foldText, fullNameBehind, givenName, nickOf, isRosterDenied, personKey, phoneIdentity, playerMatchesPerson, rosterByIdentity, rosterByPhone, rosterForOrganizer, rosterHeldBy, rosterIdForSuspension, searchRoster, suspensionHistoryOf, visibleRosterHits, visibleRosterPhone } from './roster.js';
import { ALREADY_IN_MATCH, alreadyInMatch, firstDuplicate, groupByInviter, inviteBlock, isAutoGuestName, isGuest, normName, placeGroup, resolveFriendNames, rootInviterId, sameDayPromoGuestRenames, waitWarning } from './guests.js';
import { MAX_NOTES, MAX_NOTE_TEXT, POSITIONS, currentMatches, filterLevelTyping, formatLevel, keptSignupIds, levelCaretAfterStep, levelStepSide, matchAlreadyPlayed, matchSignupState, noteWhen, parseLevel, pastMatches, playerRecord, playerStats, rosterDeleteReasons, sortedNotes, splitNear, stepLevel, storedLevel, upcomingMatches } from './profile.js';
import { organizerChoices, organizerTagClass, sameOrganizer, sameOrganizerIdentity } from './organizers.js';
import { EDIT_LOCK_TEXT, canEditPlayer, canEditRoster, canEditRosterNick, canWritePlayer } from './edit-lock.js';
import { amountOwed, organizerMatchDebt, owesOrganizer, playerDebt } from './ledger.js';
import { compensationDoneDates, diaDatesForOrganizer, matchOrganizedBy, organizerDayShare, organizerShareByPeriod, organizerViewTake, periodBuckets, playerOrganizerMonths } from './stats.js';
import { logText, logWhen, weekRange } from './log.js';
import { autoCreditPassKey, canOfferCredit, creditAgainstDebts, creditAvailableLine, creditBalance, creditBalances, creditLoadSummary, creditPanelRows, creditReturnPlan, retroactiveCreditIds } from './credit.js';
import { openSession, staffUsers } from './auth.js';
import { addedCount, buildAccess, canAdd, canDelete, canEditAccess, canEditMatch, compensationApplies, importAccess, limitFor, limitMessage, matchStaff, payeeNames, publicAccess, signupForMatch, signupOptions } from './access.js';
import { TEXT_SIZES, applyTextSize, readTextSize, saveTextSize, stepTextSize } from './text-size.js';
import { applyTheme, readTheme, saveTheme, watchTheme } from './theme.js';
import { PRICES_DENIED_WRITE, allocateGuestPromo, normalizePrices, parsePriceInput, priceOfMatch, priceRecord, promoForPlayer, promoRefundAfterFree, promoSettleJoining, promoSettleLeaving, sameDayTitulars, splitPaymentAcross } from './prices.js';
import { planRows } from './settle.js';
import { compensationFingerprint, dayCompensation, reconcileTransfers, splitModeOf } from './compensate.js';
import { balanceTeams, dropPlayerOn, emptyTeams, goaliesLeft, movePlayer, normalizeScore, normalizeTeams, orderTeamsByGoal, teamsBalance, teamsMessage } from './teams.js';
import { appInstallUrl, appShareMessage, isPlayerDeepLink, playerLink } from './share.js';
import { isTrialPage } from './trial.js';
import { tapChose } from './tap.js';
import { BACKUP_COLLECTIONS, BACKUP_LOADED_OK, COLLECTION_LABELS, backupFilename, backupProgressText, backupSurfaceMessage, clearTrialResume, parseBackup, readTrialResume, trialBackupResultText, trialResumeId, writeTrialResume } from './backup.js';
import {
  DEFAULT_VENUE_ID, DEFAULT_VENUE_NAME, VENUES_DENIED_WRITE, capacityFor, cleanCourt, courtLabel, courtMark, defaultVenueId, filterHistoryByVenues, footballLabel, footballPhrase, historyVenueOptions, isVenueDenied, matchCapacity, matchVenueId, perTeamOf, perTeamOptions, venueChoices, venueLabel,
} from './venues.js';

/* ───────── utilidades ───────── */
const APP_VERSION = 'f7c-v162';
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function phoneHidden(p) {
  return !!(p && !String(p.phone || '').trim() && (p.phonePrivate || p.hasPhone));
}
/** Si el partido no muestra el número pero la ficha de este organizador sí, usa esa. */
function withAgendaPhone(player) {
  if (String(player?.phone || '').trim()) return player;
  const phone = visibleRosterPhone(player, app.roster, actor());
  if (!phone) return player;
  return { ...player, phone, phonePrivate: false, hasPhone: true };
}
function phoneSub(p) {
  const view = withAgendaPhone(p);
  if (view?.phone) return `<span class="phone-line">${esc(displayFromWa(view.phone))}</span>`;
  if (phoneHidden(view)) return `<span class="private-wa">${esc(PRIVATE_WA_TEXT)}</span>`;
  return '<span>Sin número</span>';
}
const WA_SHARE_LABEL = 'Permitir que otros organizadores vean su WhatsApp';
function waShareControl(id, { checked = false, named = false } = {}) {
  const lineId = id === 'phone-share' ? 'phone-share-line' : 'wa-share-line';
  return `<label class="checkline wa-share" id="${lineId}"><input type="checkbox" id="${id}"${named ? ' name="waShare"' : ''}${checked ? ' checked' : ''}><span>${WA_SHARE_LABEL}</span></label>`;
}
function slotSide(p, m, readOnly, payText) {
  const pay = readOnly ? '' : `<button type="button" class="pay-btn ${p.paid === true ? ' on' : ''}" data-pay="${esc(p.id)}" aria-label="Pago de ${esc(p.name)}${payText ? ': ' + esc(payText) : ''}"><span class="pay-mark" aria-hidden="true">$</span></button>`;
  const wa = waButton(p, waMessage(m, p));
  const more = readOnly ? '' : `<button class="more-btn" data-menu="${esc(p.id)}" aria-label="Opciones de ${esc(p.name)}">${ICON.more}</button>`;
  const stack = (wa || pay) ? `<div class="slot-actions">${wa}${pay}</div>` : '';
  if (!stack && !more) return '';
  return `<div class="slot-side">${stack}${more}</div>`;
}
function waButton(p, text) {
  const view = withAgendaPhone(p);
  if (view?.phone) {
    const code = isShortCode(view?.shortCode) ? view.shortCode : '';
    const shorten = code ? ` data-short-code="${esc(code)}" data-wa-phone="${esc(view.phone)}" data-wa-text="${esc(text || '').replace(/\n/g, '&#10;')}"` : '';
    return `<a class="wa-btn" href="${esc(waHref(view.phone, text || ''))}"${shorten} target="_blank" rel="noopener" aria-label="WhatsApp a ${esc(view.name)}">${ICON.wa}</a>`;
  }
  if (phoneHidden(view)) return `<button type="button" class="wa-btn" disabled aria-label="${esc(PRIVATE_WA_TEXT)}">${ICON.wa}</button>`;
  return '';
}
function rosterIdentity(person) {
  return { phone: person?.phone || '', phoneKey: person?.phoneKey || '', rosterId: person?.id || '', name: person?.name || '' };
}
const CODE_KEY = 'f7c-code';
const ICON = {
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  paste: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v14"/></svg>',
  shareNodes: '<svg class="share-nodes" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.1 11.1 15.1 7.2M8.1 12.9 15.1 16.8"/><circle cx="5.6" cy="12" r="2.5"/><circle cx="18.2" cy="5.8" r="2.5"/><circle cx="18.2" cy="18.2" r="2.5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>',
};

const app = {
  store: null,
  matches: [],
  players: [],
  roster: [],
  rosterError: null,
  organizers: [],
  organizersError: null,
  venues: [],
  venuesError: null,
  prices: null,
  pricesError: null,
  credits: [],
  creditsError: null,
  creditsReady: false,
  playersReady: false,
  log: [],
  logError: '',
  logRange: null,
  users: [],
  role: '',
  session: null,
  signupDraft: null,
  who: '',
  loaded: false,
  history: [],
  historyFilter: null,
  historyVenues: null,
  historyMeta: null,
  historyError: '',
  historyDebtors: false,
  oweOpen: new Set(),
  matchMiss: {},
  showLater: false,
  profileMatchId: null,
  profileViaMatchId: null,
};
window.__app = app; // útil para depurar / tests

function clearWaChoice() {
  try { localStorage.removeItem(WA_CHOICE_KEY); } catch { /* modo privado */ }
}
function clearMineFilter() {
  try {
    localStorage.removeItem('f7c-mine');
    sessionStorage.removeItem('f7c-mine');
  } catch { /* modo privado */ }
}
function waHref(phone, text) {
  return waSendUrl({ phone: phone || '', text: text || '' });
}

/* ───────── toast ───────── */
let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  t.classList.toggle('ok', msg === BACKUP_LOADED_OK);
  clearTimeout(toastTimer);
  toastTimer = 0;
  if (ms > 0) toastTimer = setTimeout(() => { t.hidden = true; t.classList.remove('ok'); }, ms);
}
$('#toast')?.addEventListener('click', () => {
  const t = $('#toast');
  t.hidden = true;
  t.classList.remove('ok');
  clearTimeout(toastTimer);
});
function showError(msg) {
  const b = $('#error-banner'); b.textContent = msg; b.hidden = !msg;
}
// El aviso de éxito espera a que el servidor confirme. Si Firebase rechaza
// (límite diario o reglas), no se dice que se guardó: el aviso es el error
// y el snapshot devuelve la lista a lo que quedó en el servidor.
const RULES_MSG = 'Firebase rechazó el acceso. Hay que actualizar las reglas de Firestore (publicar firestore.rules).';
function isPermissionDenied(error) {
  const code = error?.code || '';
  return code === 'permission-denied' || code === 'permission_denied';
}
function withWriteTimeout(promise, ms = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error('La base no respondió.'), { code: 'deadline-exceeded' }));
    }, ms);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
function run(p, okMsg, deniedMsg) {
  return withWriteTimeout(p).then((value) => {
    if (okMsg) toast(okMsg);
    return value;
  }).catch((e) => {
    console.error(e);
    if (e?.code === 'already-in-match') toast(e.message || ALREADY_IN_MATCH);
    else if (e?.code === 'suspended') askNotice(e.message || SUSPENDED_TEXT);
    else if (e?.paymentWrite) toast(paymentFailureText(e, e.playerId), 4500);
    else if (deniedMsg && isPermissionDenied(e)) toast(deniedMsg);
    else toast(writeFailureText(e), 4500);
  });
}
/** Un Guardar: los pagos y el saldo, y el recuerdo para poder anularlo entero. */
async function applyPaySave(entries, credits) {
  const moves = (Array.isArray(credits) ? credits : [credits]).filter((move) => move && roundMoney(move.delta));
  const running = new Map();
  const done = [];
  try {
    for (const move of moves) {
      await app.store.adjustCredit(move, app.who);
      done.push(move);
    }
    for (const entry of entries || []) {
      if (!entry?.id) continue;
      if (entry.awaitingOnly) {
        await app.store.updatePlayer(entry.id, { awaiting: entry.awaitingOnly });
        continue;
      }
      let state = running.get(entry.id);
      if (!state) {
        const player = app.players.find((item) => item.id === entry.id) || { id: entry.id };
        state = { player: { ...player }, before: payBatchSnapshot(player) };
        running.set(entry.id, state);
      }
      await app.store.setPayment(entry.id, entry.input, app.who);
      const rec = paymentRecord(entry.input, app.who);
      if (rec.ok) {
        state.player = { ...state.player, ...rec.patch, id: entry.id };
        state.after = payBatchSnapshot(state.player);
      }
    }
    const payments = [...running.values()].filter((state) => state.after).map((state) => ({
      playerId: state.before.playerId || state.player.id,
      before: state.before,
      after: state.after,
    }));
    if (payments.length && app.store.savePayBatch) await app.store.savePayBatch({ payments, credits: moves });
  } catch (error) {
    for (const move of done) await app.store.adjustCredit({ ...move, delta: roundMoney(-move.delta) }, app.who);
    throw error;
  }
}

function savePayments(entries, okMsg) {
  return run(applyPaySave(entries, []), okMsg);
}

/** Cada delta suma al saldo (negativo lo gasta). Si el pago falla, el saldo vuelve. */
function savePaymentsSpendingCredit(entries, okMsg, creditMove) {
  return run(applyPaySave(entries, creditMove), okMsg);
}

/** uid y nombre canónico. «Gus» es Gustavo si ese es el nombre de la cuenta. */
function collectorIdentity(name) {
  const me = actor();
  const raw = String(name || '').trim();
  const people = [];
  for (const user of staffUsers(app.users)) {
    const uid = String(user?.uid || '').trim();
    const full = String(user?.name || '').trim();
    if (!uid || !full || people.some((item) => item.uid === uid)) continue;
    people.push({ uid, name: full });
  }
  if (me.uid && !people.some((item) => item.uid === me.uid) && me.name) people.unshift({ uid: me.uid, name: me.name });
  if (!raw) return { uid: me.uid || '', name: me.name || '' };
  if (sameOrganizerIdentity(raw, me) && me.uid) return { uid: me.uid, name: me.name || raw };
  const found = people.find((item) => sameOrganizerIdentity(item, raw));
  if (found) return { uid: found.uid, name: found.name };
  return { uid: '', name: raw };
}

function organizerUidByName(name) {
  return collectorIdentity(name).uid;
}

function mergeCreditMoves(moves) {
  const by = new Map();
  for (const move of moves || []) {
    const delta = roundMoney(move?.delta || 0);
    if (!move?.organizerUid || !delta) continue;
    const prev = by.get(move.organizerUid);
    if (prev) prev.delta = roundMoney(prev.delta + delta);
    else by.set(move.organizerUid, { ...move, delta });
  }
  return [...by.values()];
}

/** Si un invitado pagó por el anfitrión, el saldo es de quien pagó: el anfitrión. */
function promoPayer(player) {
  const hostId = String(player?.invitedBy || '').trim();
  if (!hostId) return player;
  return app.players.find((item) => item.id === hostId) || player;
}

function creditOrganizerOf(player) {
  const uid = String(player?.signedUpWith || '').trim();
  const name = String(player?.signedUpWithName || player?.addedBy || '').trim();
  if (uid) return { uid, name: name || actor().name };
  if (!name) return null;
  if (sameOrganizerIdentity(name, actor()) && actor().uid) return { uid: actor().uid, name: actor().name };
  const found = organizerUidByName(name);
  return found ? { uid: found, name } : null;
}
/** Si la promo bajó el precio, devuelve al saldo la parte de más del crédito automático. */
async function releaseAutoCreditExcess(playerId) {
  const player = app.players.find((item) => item.id === playerId);
  if (!player || player.autoCredit !== true || player.waiting === true || isFreePlay(player)) return 0;
  const matches = knownMatches();
  const match = matches.find((item) => item.id === player.matchId);
  if (!match || match.cancelled === true || matchAlreadyPlayed(match)) return 0;
  const promo = promoForPlayer({ player, players: app.players, matches, prices: livePrices() });
  if (!promo) return 0;
  const prev = paymentParts(player);
  const excess = autoCreditExcess({ received: prev.received, fromCredit: prev.credit, auto: true, share: promo.share });
  if (!(excess > 0)) return 0;
  const org = creditOrganizerOf(player);
  const key = personKey(player, app.players);
  if (!org?.uid || !key) return 0;
  const nextCredit = roundMoney(prev.credit - excess);
  const move = { personKey: key, organizerUid: org.uid, organizerName: org.name, name: player.name, delta: excess };
  await app.store.adjustCredit(move, app.who);
  try {
    await app.store.setPayment(player.id, {
      paid: true,
      split: true,
      freePlay: false,
      cash: prev.cash,
      transfer: prev.transfer,
      pendingTransfer: prev.pending,
      fromCredit: nextCredit,
      cashTo: prev.cash > 0 ? player.cashTo : null,
      transferTo: prev.transfer > 0 ? player.transferTo : null,
      pendingTo: prev.pending > 0 ? player.pendingTo : null,
      creditTo: nextCredit > 0 ? org.name : null,
      autoCredit: nextCredit > 0,
      transferParts: player.transferParts || null,
    }, app.who);
  } catch (error) {
    await app.store.adjustCredit({ ...move, delta: -excess }, app.who);
    throw error;
  }
  return excess;
}
/** Cubre con saldo hasta lo que debe, o hasta cap si se pasó. */
async function chargeAutoCredit(playerId, cap) {
  const player = app.players.find((item) => item.id === playerId);
  if (!player || player.waiting === true || isFreePlay(player)) return 0;
  const match = knownMatches().find((item) => item.id === player.matchId);
  if (!match || match.cancelled === true || matchAlreadyPlayed(match)) return 0;
  let owed = amountOwed(player, { players: app.players, matches: knownMatches(), prices: livePrices() });
  if (cap != null) owed = Math.min(owed, roundMoney(cap));
  const org = creditOrganizerOf(player);
  const key = personKey(player, app.players);
  if (!org?.uid || !key) return 0;
  const take = autoCreditTake(owed, creditBalance(app.credits, key, org.uid));
  if (!(take.pay > 0)) return 0;
  const prev = paymentParts(player);
  const move = { personKey: key, organizerUid: org.uid, organizerName: org.name, name: player.name, delta: -take.pay };
  await app.store.adjustCredit(move, app.who);
  try {
    await app.store.setPayment(player.id, {
      paid: true,
      split: true,
      freePlay: false,
      cash: prev.cash,
      transfer: prev.transfer,
      pendingTransfer: prev.pending,
      fromCredit: roundMoney(prev.credit + take.pay),
      cashTo: prev.cash > 0 ? player.cashTo : null,
      transferTo: prev.transfer > 0 ? player.transferTo : null,
      pendingTo: prev.pending > 0 ? player.pendingTo : null,
      creditTo: org.name,
      autoCredit: true,
      transferParts: player.transferParts || null,
    }, app.who);
  } catch (error) {
    await app.store.adjustCredit({ ...move, delta: take.pay }, app.who);
    throw error;
  }
  return take.pay;
}
/**
 * Si hay saldo con quien se anotó, cubre el precio de este partido.
 * Si ese día ya hay promo, primero baja los créditos automáticos al parte
 * de la promo (lo que sobra vuelve al saldo) y después paga del más temprano al más tarde.
 */
async function applyAutoCredit(playerId) {
  const player = app.players.find((item) => item.id === playerId);
  if (!player || player.waiting === true || isFreePlay(player)) return 0;
  const match = knownMatches().find((item) => item.id === player.matchId);
  if (!match || match.cancelled === true || matchAlreadyPlayed(match)) return 0;
  const rows = sameDayTitulars({ player, players: app.players, matches: knownMatches() });
  if (rows.length >= 2) {
    for (const row of rows) await releaseAutoCreditExcess(row.player.id);
  }
  const ids = rows.length >= 2 ? rows.map((row) => row.player.id) : [playerId];
  let total = 0;
  for (const id of ids) total += await chargeAutoCredit(id);
  return total;
}
/**
 * Al salir de la promo, el que queda vuelve al precio suelto (Ajustes si queda uno,
 * la promo nueva si quedan dos o más). La diferencia sale del saldo; si no alcanza, queda deuda.
 */
async function retargetPromoAfterExit(person) {
  if (!person?.matchDate) return;
  const key = personKey(person, app.players);
  if (!key) return;
  const mates = [];
  for (const item of app.players) {
    if (item.waiting === true || isFreePlay(item)) continue;
    if (personKey(item, app.players) !== key) continue;
    const match = knownMatches().find((row) => row.id === item.matchId);
    if (!match || match.cancelled === true || match.date !== person.matchDate || matchAlreadyPlayed(match)) continue;
    mates.push({ item, match });
  }
  mates.sort((a, b) => String(a.match.time || '').localeCompare(String(b.match.time || '')) || String(a.item.id).localeCompare(String(b.item.id)));
  if (mates.length >= 2) {
    await applyAutoCredit(mates[0].item.id);
    return;
  }
  if (mates.length !== 1) return;
  const target = normalizePrices(livePrices()).matchPrice;
  const gap = roundMoney(target - paymentParts(mates[0].item).received);
  if (gap > 0) await chargeAutoCredit(mates[0].item.id, gap);
}
/** Devuelve al saldo solo lo que se había descontado solo. */
async function refundAutoCredit(player) {
  if (!player || player.autoCredit !== true) return 0;
  const amount = paymentParts(player).credit;
  if (!(amount > 0)) return 0;
  const org = creditOrganizerOf(player);
  const key = personKey(player, app.players);
  if (!org?.uid || !key) return 0;
  const prev = paymentParts(player);
  const kept = roundMoney(prev.cash + prev.transfer + prev.pending);
  await app.store.adjustCredit({
    personKey: key, organizerUid: org.uid, organizerName: org.name, name: player.name, delta: amount,
  }, app.who);
  await app.store.setPayment(player.id, kept > 0 ? {
    paid: true,
    split: true,
    freePlay: false,
    cash: prev.cash,
    transfer: prev.transfer,
    pendingTransfer: prev.pending,
    fromCredit: 0,
    cashTo: prev.cash > 0 ? player.cashTo : null,
    transferTo: prev.transfer > 0 ? player.transferTo : null,
    pendingTo: prev.pending > 0 ? player.pendingTo : null,
    creditTo: null,
    autoCredit: false,
    transferParts: player.transferParts || null,
  } : { paid: false, split: true, autoCredit: false }, app.who);
  return amount;
}

const AUTO_CREDIT_PASS_WAIT = 500;
let autoCreditPassTimer = 0;
let autoCreditPassRunning = false;
let autoCreditPassAttempts = 0;

function autoCreditPassDone(uid) {
  const key = autoCreditPassKey(uid);
  if (!key) return true;
  try { return localStorage.getItem(key) === '1'; }
  catch { return true; }
}

function markAutoCreditPass(uid) {
  const key = autoCreditPassKey(uid);
  if (!key) return;
  try { localStorage.setItem(key, '1'); }
  catch { /* el próximo arranque lo reintenta */ }
}

/** Una vez que el saldo y los jugadores ya se leyeron, espera un instante y aplica. */
function scheduleRetroactiveAutoCredit() {
  // El pase de crédito al abrir recorría deudas viejas y escribía una por jugador.
  return;
  const uid = actor().uid;
  if (!uid || autoCreditPassTimer || autoCreditPassRunning || autoCreditPassDone(uid)) return;
  if (app.fromCache || app.creditsError || app.creditsReady !== true || app.playersReady !== true) return;
  autoCreditPassTimer = setTimeout(() => { runRetroactiveAutoCredit(); }, AUTO_CREDIT_PASS_WAIT);
}

async function runRetroactiveAutoCredit() {
  autoCreditPassTimer = 0;
  const uid = actor().uid;
  if (!uid || autoCreditPassRunning || autoCreditPassDone(uid)) return;
  if (app.fromCache || app.creditsError || app.creditsReady !== true || app.playersReady !== true) {
    scheduleRetroactiveAutoCredit();
    return;
  }
  autoCreditPassRunning = true;
  let failed = false;
  try {
    const ids = retroactiveCreditIds({
      players: app.players,
      matches: knownMatches(),
      prices: livePrices(),
      organizerUid: uid,
      organizerOf: (player) => creditOrganizerOf(player)?.uid || '',
    });
    for (const id of ids) {
      try { await applyAutoCredit(id); }
      catch (error) {
        failed = true;
        console.warn(error);
      }
    }
    if (!failed && actor().uid === uid && app.fromCache !== true && app.creditsReady === true) markAutoCreditPass(uid);
  } catch (error) {
    failed = true;
    console.warn(error);
  } finally {
    autoCreditPassRunning = false;
  }
  if (failed) {
    autoCreditPassAttempts += 1;
    if (autoCreditPassAttempts < 3 && !autoCreditPassDone(uid)) {
      autoCreditPassTimer = setTimeout(() => { runRetroactiveAutoCredit(); }, 1500);
    }
  }
}

function creditMoveFor(player, delta) {
  const me = actor();
  return {
    personKey: personKey(player, app.players),
    organizerUid: me.uid,
    organizerName: me.name,
    name: player.name || '',
    delta: roundMoney(delta),
  };
}

function creditDelta(people, entries) {
  const oldCredit = roundMoney((people || []).reduce((sum, person) => sum + paymentParts(person).credit, 0));
  const freshCredit = roundMoney((entries || []).reduce((sum, entry) => sum + (Number(entry.input?.fromCredit) || 0), 0));
  return roundMoney(oldCredit - freshCredit);
}

/* ───────── datos derivados ───────── */
const actor = () => ({ uid: app.session?.user?.uid || '', name: app.who || '' });
const shownName = (player) => displayName(player, app.roster);
function suspensionRosterId(source) {
  if (!source) return '';
  if (source.matchId || source.rosterId) return rosterIdForSuspension(app.roster, source);
  if (source.id && app.roster?.some((row) => row.id === source.id)) return source.id;
  return rosterIdForSuspension(app.roster, source);
}
function playerBlockedOn(match, source) {
  return blockingSuspensions(app.suspensions, match, suspensionRosterId(source)).length > 0;
}
function suspendedClass(source) {
  const rosterId = suspensionRosterId(source);
  if (!rosterId) return '';
  const uid = actor().uid;
  if (activeSuspensions(app.suspensions, rosterId).some((row) => row.ownerUid === uid)) return ' suspended';
  const match = source?.matchId ? (knownMatches().find((item) => item.id === source.matchId) || null) : null;
  return match && blockingSuspensions(app.suspensions, match, rosterId).length ? ' suspended' : '';
}
function suspendedName(source, name) {
  if (!suspendedClass(source)) return esc(name);
  return `${esc(name)} <span class="suspended-tag">(suspendido)</span>`;
}
function fichaSuspended(source) {
  const rosterId = suspensionRosterId(source);
  if (rosterId && activeSuspensions(app.suspensions, rosterId).length) return ' suspended';
  return '';
}
function fichaName(source, name) {
  if (!fichaSuspended(source)) return esc(name);
  return `${esc(name)} <span class="suspended-tag">(suspendido)</span>`;
}
function blockedByText(match, source) {
  const rows = blockingSuspensions(app.suspensions, match, suspensionRosterId(source));
  const names = [];
  for (const row of rows) {
    const label = row.ownerUid === actor().uid ? 'vos' : organizerLabel(row.ownerUid);
    if (!names.includes(label)) names.push(label);
  }
  if (!names.length) return '';
  if (names.length === 1 && names[0] === 'vos') return 'Suspendido por vos.';
  const who = names.map((name) => (name === 'vos' ? 'vos' : name)).join(' y por ');
  return `El jugador fue suspendido por ${who}.`;
}
function organizerLabel(uid) {
  const user = (app.users || []).find((item) => item.uid === uid);
  return user?.name || 'otro organizador';
}
function heldCard(source) {
  const mine = rosterForOrganizer(app.roster, actor());
  const listed = String(source?.rosterId || '').trim();
  if (listed) {
    const row = mine.find((item) => item.id === listed);
    if (row) return row;
  }
  const key = phoneIdentity(source);
  if (!key) return null;
  return mine.find((item) => phoneIdentity(item) === key) || null;
}
/** Nombre en la fila del partido: solo el apodo; sin apodo, el nombre completo. El nombre completo va en el menú. */
function nameRow(p) {
  return `<div class="name-row"><div class="name${suspendedClass(p)}">${suspendedName(p, shownName(p))}</div>${levelBadge(p)}</div>`;
}
/** actor() con el rol, para lo que el admin puede aunque no sea el creador. */
const actorWithRole = () => ({ ...actor(), role: app.role || '' });
/**
 * Guarda el apodo de un jugador del partido. Si su ficha de Jugadores la
 * puede tocar (la creó o es admin), va a la ficha y se copia a sus partidos.
 * Si no, queda en este jugador: ahí manda sobre el de la ficha.
 */
async function saveNick(p, nick, rosterId) {
  const person = rosterId ? app.roster.find((item) => item.id === rosterId) : null;
  if (person && canEditRosterNick(person, actorWithRole())) {
    if (nick !== cleanShortName(person.shortName)) await app.store.setRosterNick(person.id, nick);
    const fresh = app.players.find((item) => item.id === p.id) || p;
    if (cleanShortName(fresh.shortName) !== nick) await app.store.setPlayerShortName(p.id, nick);
    return;
  }
  await app.store.setPlayerShortName(p.id, nick);
}
function nickField(p) {
  const value = nickOf(p, app.roster);
  return `<label class="field"><span>Nombre corto (o apodo)</span><input id="player-nick" name="shortName" maxlength="40" autocomplete="off" placeholder="Ej: Vini" value="${esc(value)}">
        <div class="small muted" id="pf-nick">Es lo que se ve en la lista del partido y en Equipos.</div></label>`;
}
const addBlock = (m) => {
  const who = actor();
  if (!canAdd(m, who.uid)) return 'Este partido es de solo lectura.';
  const max = limitFor(m, who.uid);
  if (max == null) return '';
  const n = addedCount(app.players.filter((p) => p.matchId === m.id), who);
  return n >= max ? limitMessage(max) : '';
};
const isWaiting = (p) => p.waiting === true;
const isNoPlay = (p) => p?.noPlay === true;
const playersOf = (matchId) => {
  const all = app.players.filter((p) => p.matchId === matchId && !isNoPlay(p));
  return groupByInviter(rosterSplit(all).main, all);
};
const noPlayOf = (matchId) => app.players.filter((p) => p.matchId === matchId && isNoPlay(p)).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es') || String(a.id).localeCompare(String(b.id)));
const waitingOf = (matchId) => sortWaiting(app.players.filter((p) => p.matchId === matchId && isWaiting(p)));
const matchById = (id) => app.matches.find((m) => m.id === id);
const fmtWhen = (m) => `${capitalize(labelDate(m.date))} · ${m.time || '--:--'} hs`;
function payOrganizerNames(extra = []) {
  return organizerChoices(app.organizers, { unreadable: !!app.organizersError, extra });
}
function loggedInStaffName() {
  const user = app.session?.user;
  const staff = staffUsers(app.users);
  const byUid = user?.uid ? staff.find((item) => item.uid === user.uid) : null;
  if (byUid?.name) return String(byUid.name).trim();
  const email = String(user?.email || '').trim().toLowerCase();
  const byEmail = email ? staff.find((item) => String(item.email || '').trim().toLowerCase() === email) : null;
  if (byEmail?.name) return String(byEmail.name).trim();
  return String(user?.name || app.who || '').trim();
}
function payStaffNames(match, extra = []) {
  const staff = staffUsers(app.users);
  const names = payeeNames(match, staff, extra);
  if (names.length) return names;
  if (!staff.length && matchStaff(match, [{ uid: 'otro', name: 'Otro' }]).length) return payOrganizerNames(extra);
  const mine = loggedInStaffName();
  if (!mine) return [];
  const withMe = payeeNames(match, [{ uid: actor().uid, name: mine }], extra);
  return withMe.length ? withMe : [mine];
}
function livePrices() {
  return normalizePrices(app.prices);
}
function addedTag(player) {
  return `<span class="tag ${organizerTagClass(player.addedBy)}">Agregó: ${esc(player.addedBy || '?')}</span>`;
}
function signupStaffOptions(player, match) {
  const staff = staffUsers(app.users);
  const me = actor();
  const savedUid = String(player?.signedUpWith || '').trim();
  const savedName = String(player?.signedUpWithName || '').trim();
  const extra = savedUid ? { uid: savedUid, name: savedName || 'Organizador' } : null;
  let options = match
    ? signupOptions(match, staff, extra)
    : staff.map((user) => ({ uid: user.uid, name: user.name }));
  if (me?.uid && (!match || canAdd(match, me.uid)) && !options.some((item) => item.uid === me.uid)) {
    options.unshift({ uid: me.uid, name: me.name || 'Yo' });
  }
  if (extra?.uid && !options.some((item) => item.uid === extra.uid)) options.push(extra);
  if (!options.length && me?.uid) options = [{ uid: me.uid, name: me.name || 'Yo' }];
  const selected = (savedUid && options.some((item) => item.uid === savedUid))
    ? savedUid
    : (options.some((item) => item.uid === me?.uid) ? me.uid : (options[0]?.uid || ''));
  return { options, selected };
}
function signupFields(player, match) {
  const { options, selected } = signupStaffOptions(player, match);
  if (!options.length) return '';
  return `<label class="field"><span>Se anotó con:</span><select name="signedUpWith" id="signed-up-with">${options.map((item) => `<option value="${esc(item.uid)}"${item.uid === selected ? ' selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>`;
}
function readSignup(root) {
  const sel = root?.matches?.('[name=signedUpWith]') ? root : root?.querySelector?.('[name=signedUpWith]');
  if (!sel) return {};
  const uid = String(sel.value || '').trim().slice(0, 128);
  const name = String(sel.selectedOptions?.[0]?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!uid || !name) return {};
  return { signedUpWith: uid, signedUpWithName: name };
}
function signedUpTag(player) {
  const name = String(player?.signedUpWithName || '').trim();
  if (!name) return '';
  return `<span class="tag">Se anotó con: ${esc(name)}</span>`;
}
function playerIndex(matchId) {
  const mates = app.players.filter((item) => !matchId || item.matchId === matchId);
  return new Map(mates.map((item) => [item.id, item]));
}
function directHostName(player) {
  if (!isGuest(player)) return '';
  const host = app.players.find((item) => item.id === player.invitedBy);
  return host?.name || player.invitedByName || '';
}
function friendHostName(player) {
  if (!isGuest(player)) return '';
  const byId = playerIndex(player.matchId);
  const rootId = rootInviterId(player, byId);
  if (rootId) return byId.get(rootId)?.name || directHostName(player);
  return directHostName(player);
}
function friendTag(player) {
  if (!player?.invitedBy) return '';
  const name = friendHostName(player);
  return `<span class="tag friend-tag">${esc(name ? `invitado de ${name}` : 'invitado')}</span>`;
}
function friendSuffix(player) {
  const name = friendHostName(player);
  return name ? ` (invitado de ${name})` : '';
}
function levelBadge(player) {
  const id = String(player?.rosterId || '');
  if (!id) return '';
  const person = app.roster.find((item) => item.id === id);
  const level = storedLevel(person?.level);
  if (level == null) return '';
  return `<span class="level-badge">${esc(formatLevel(level))}</span>`;
}
function inviteClass(player) {
  if (!player?.id) return '';
  const mates = app.players.filter((item) => item.matchId === player.matchId);
  const byId = new Map(mates.map((item) => [item.id, item]));
  const root = rootInviterId(player, byId);
  const hostsSomeone = mates.some((item) => rootInviterId(item, byId) === player.id);
  const hostId = root || (hostsSomeone ? String(player.id) : (isGuest(player) ? String(player.invitedBy) : ''));
  if (!hostId) return '';
  let hash = 0;
  for (let i = 0; i < hostId.length; i++) hash = (hash * 33 + hostId.charCodeAt(i)) >>> 0;
  return ` invite-${hash % 6}${isGuest(player) ? ' guest-row' : ' host-row'}`;
}
function payMarkup(player, { hidePending = false } = {}) {
  const pending = hidePending ? '' : pendingStatusText(player);
  const waiting = awaitingText(player);
  const headline = paymentHeadline(player);
  const cls = player.paid === true ? 'ok' : 'no';
  const line = headline ? `<div class="pay-line ${cls}">${esc(headline)}</div>` : '';
  const badge = pending ? `<div class="pay-pending">${esc(pending)}</div>` : '';
  const hold = waiting ? `<div class="pay-pending" id="pay-awaiting">${esc(waiting)}</div>` : '';
  return line + badge + hold;
}
function promoOf(player) {
  if (!player || player.waiting === true) return null;
  return promoForPlayer({ player, players: app.players, matches: app.matches, prices: app.prices });
}
function myAwaiting() {
  const uid = actor().uid;
  if (!uid) return [];
  const rows = [];
  for (const player of app.players || []) {
    for (const item of awaitingItems(player)) {
      if (item.toUid !== uid) continue;
      const match = knownMatches().find((entry) => entry.id === player.matchId);
      rows.push({ ...item, player, match });
    }
  }
  return rows;
}
function confirmBanner() {
  const rows = myAwaiting();
  if (!rows.length) return '';
  const n = rows.length;
  return `<a class="remind-banner" id="confirm-banner" href="#/registro/pagos"><strong>Tenés ${n} ${n === 1 ? 'pago' : 'pagos'} para confirmar</strong></a>`;
}
function olderDebts(player, skipIds) {
  const key = personKey(player, app.players);
  const skip = new Set(skipIds || []);
  const rows = [];
  for (const other of app.players) {
    if (!other || skip.has(other.id) || personKey(other, app.players) !== key) continue;
    const owed = amountOwed(other, { players: app.players, matches: knownMatches(), prices: livePrices() });
    if (!(owed > 0)) continue;
    const match = knownMatches().find((item) => item.id === other.matchId);
    if (!match) continue;
    rows.push({
      id: other.id,
      owed,
      label: fmtWhen(match),
      organizerName: other.signedUpWithName || other.addedBy || '',
      date: match.date || '',
      time: match.time || '',
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || String(a.id).localeCompare(String(b.id)));
  return rows;
}
function receiptParts({ cash, cashTo, transfer, transferTo, credit, creditTo }) {
  const me = actor();
  const part = (kind, amount, name) => {
    const money = roundMoney(amount);
    if (!(money > 0)) return null;
    const who = collectorIdentity(name);
    const uid = who.uid;
    return { kind, amount: money, name: who.name || me.name, uid, confirmed: !uid || uid === me.uid };
  };
  return [part('cash', cash, cashTo), part('transfer', transfer, transferTo), part('credit', credit, creditTo)].filter(Boolean);
}
function overpayText(rows) {
  const settlements = [];
  const credits = [];
  const pending = [];
  for (const row of rows || []) {
    for (const item of row.projected?.settlements || []) settlements.push(item);
    for (const item of row.projected?.credits || []) credits.push(item);
    for (const item of row.pending || []) pending.push(item);
  }
  const extra = roundMoney(settlements.reduce((sum, item) => sum + item.amount, 0) + credits.reduce((sum, item) => sum + item.amount, 0));
  const bits = [];
  if (settlements.length) bits.push(settlements.map((item) => `${formatARS(item.amount)} cancelan ${item.label}`).join(', '));
  if (credits.length) {
    const by = new Map();
    for (const item of credits) by.set(item.name, roundMoney((by.get(item.name) || 0) + item.amount));
    bits.push([...by.entries()].map(([name, amount]) => `${formatARS(amount)} quedan como saldo a favor con ${name}`).join(', '));
  }
  let text = extra > 0 ? `Paga ${formatARS(extra)} de más: ${bits.join('. ')}.` : '';
  if (pending.length) {
    const names = [...new Set(pending.map((item) => item.name).filter(Boolean))];
    const money = formatARS(roundMoney(pending.reduce((sum, item) => sum + item.amount, 0)));
    text = `${text} ${names.join(' y ')} tiene que confirmar ${money}.`.trim();
  }
  const confirm = extra > 0 ? `Paga ${formatARS(extra)} de más. ¿Guardar y ${bits.join(' y ')}?` : '';
  return { extra, text, confirm };
}
function promoBadge(player) {
  const promo = promoOf(player);
  return promo ? `<div class="promo-badge">${esc(promo.label)}</div>` : '';
}
function sortedMatches() {
  return [...app.matches].sort((a, b) => (a.startsAt ?? toEpoch(a.date, a.time)) - (b.startsAt ?? toEpoch(b.date, b.time)));
}

/* ───────── router ───────── */
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, id, extra] = h.split('/');
  if (name === 'partido' && id && extra === 'equipos') return { name: 'teams', id: decodeURIComponent(id) };
  if (name === 'partido' && id) return { name: 'match', id: decodeURIComponent(id) };
  if (name === 'historial') return { name: 'history' };
  if (name === 'estadisticas') {
    const modes = ['jugador', 'dia', 'mes', 'anio'];
    const parts = h.split('/');
    const asked = parts[1] === 'partido' ? 'dia' : parts[1];
    const mode = modes.includes(asked) ? asked : 'jugador';
    const raw = modes.includes(asked) ? parts.slice(2).join('/') : '';
    let picked = '';
    try { picked = raw ? decodeURIComponent(raw) : ''; } catch { picked = raw; }
    return { name: 'stats', mode, id: picked };
  }
  if (name === 'registro') return { name: 'registro', section: id === 'pagos' ? 'pagos' : 'partidos' };
  if (name === 'jugadores' || name === 'pagos') return { name: 'roster' };
  if (name === 'usuarios') return { name: 'users' };
  if (name === 'jugador' && id) return { name: 'profile', id: decodeURIComponent(id) };
  return { name: 'home' };
}
let releaseAnonymousLock = null;
let redrawLogin = null;
function lockShell() {
  document.documentElement.classList.add('signed-out');
  const stack = document.getElementById('topstack');
  if (!stack) return;
  stack.inert = true;
  stack.setAttribute('aria-hidden', 'true');
}
function unlockShell() {
  document.documentElement.classList.remove('signed-out');
  const stack = document.getElementById('topstack');
  if (stack) {
    stack.inert = false;
    stack.removeAttribute('aria-hidden');
  }
  requestAnimationFrame(placeBars);
}
window.addEventListener('hashchange', () => {
  if (!app.session?.user) {
    lockShell();
    if (isPlayerDeepLink(location.hash)) {
      showAnonymousDenial();
      return;
    }
    if (releaseAnonymousLock) {
      const go = releaseAnonymousLock;
      releaseAnonymousLock = null;
      document.documentElement.classList.remove('anon-lock');
      go();
      return;
    }
    document.documentElement.classList.remove('anon-lock');
    if (redrawLogin) redrawLogin();
    return;
  }
  if (releaseAnonymousLock) {
    if (isPlayerDeepLink(location.hash)) {
      showAnonymousDenial();
      return;
    }
    const go = releaseAnonymousLock;
    releaseAnonymousLock = null;
    document.documentElement.classList.remove('anon-lock');
    requestAnimationFrame(placeBars);
    go();
    return;
  }
  const next = route();
  if (next.name === 'profile') {
    if (app.profileViaMatchId !== next.id) {
      app.profileMatchId = null;
      app.profileViaMatchId = null;
    }
  } else app.profileViaMatchId = null;
  render();
});

/* Al abrir la app (sesión nueva) siempre entra Próximos partidos, con “más adelante” cerrado.
   Recargar o volver atrás, en la misma sesión, deja la pestaña y el desplegable como estaban. */
function rememberLater(open) {
  app.showLater = !!open;
  try {
    if (app.showLater) sessionStorage.setItem('f7c-later', '1');
    else sessionStorage.removeItem('f7c-later');
  } catch { /* modo privado */ }
}
function openOnUpcoming() {
  try {
    if (sessionStorage.getItem('f7c-session')) {
      app.showLater = sessionStorage.getItem('f7c-later') === '1';
      return;
    }
    sessionStorage.setItem('f7c-session', '1');
    sessionStorage.removeItem('f7c-tab');
    sessionStorage.removeItem('f7c-later');
    const name = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean)[0] || '';
    const section = name === '' || name === 'jugadores' || name === 'pagos' || name === 'historial' || name === 'estadisticas' || name === 'registro';
    if (section && location.hash && location.hash !== '#/' && location.hash !== '#') {
      history.replaceState(null, '', `${location.pathname}${location.search}#/`);
    }
  } catch { /* modo privado */ }
}
openOnUpcoming();

/* ───────── render ───────── */
function savedTab() {
  try {
    const value = sessionStorage.getItem('f7c-tab');
    if (value === 'roster' || value === 'history' || value === 'home' || value === 'stats' || value === 'registro') return value;
  } catch {}
  return 'home';
}
function hashForTab(tab) {
  if (tab === 'history') return '#/historial';
  if (tab === 'roster') return '#/jugadores';
  if (tab === 'stats') return '#/estadisticas';
  if (tab === 'registro') return '#/registro';
  return '#/';
}
function tabFor(r) {
  if (r.name === 'history') return 'history';
  if (r.name === 'roster') return 'roster';
  if (r.name === 'stats') return 'stats';
  if (r.name === 'registro') return 'registro';
  if (r.name === 'home') return 'home';
  if (r.name === 'match' || r.name === 'teams') {
    const match = matchById(r.id);
    return match?.date && match.date < todayISO() ? 'history' : 'home';
  }
  if (r.name === 'profile') {
    if (app.profileMatchId) {
      const match = matchById(app.profileMatchId);
      return match?.date && match.date < todayISO() ? 'history' : 'home';
    }
    return 'roster';
  }
  return savedTab();
}
function paintTabs(r) {
  const tab = tabFor(r);
  if (r.name === 'home' || r.name === 'roster' || r.name === 'history' || r.name === 'stats' || r.name === 'registro') {
    try { sessionStorage.setItem('f7c-tab', tab); } catch {}
  }
  document.querySelectorAll('#tabbar a').forEach((link) => {
    const on = link.dataset.tab === tab;
    if (on) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelector('#tabbar a[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const root = r.name === 'home' || r.name === 'roster' || r.name === 'history' || r.name === 'registro' || (r.name === 'stats' && !r.id);
  $('#btn-back').hidden = root || !app.loaded;
  requestAnimationFrame(placeBars);
}
function placeBars() {
  const header = document.querySelector('.topbar');
  const bar = document.getElementById('tabbar');
  const slot = document.getElementById('tab-slot');
  const action = document.querySelector('#view .actionbar');
  if (header) document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
  if (bar) {
    document.documentElement.style.setProperty('--tabbar-h', `${bar.offsetHeight}px`);
    if (slot && bar.parentElement === document.getElementById('sheet')) slot.style.minHeight = `${bar.offsetHeight}px`;
  }
  document.documentElement.style.setProperty('--actionbar-h', `${action ? action.offsetHeight : 0}px`);
}
let renderKey = '';
let viewHtml = '';
// Misma pantalla y mismos datos: no se reemplaza el DOM, así no parpadea ni se pierde el scroll ni lo elegido.
function replaceView(html) {
  if (html === viewHtml) return false;
  viewHtml = html;
  $('#view').innerHTML = html;
  return true;
}
function playerLinkDenied(id) {
  if (app.profileViaMatchId === id) return false;
  const person = (app.roster || []).find((row) => row.id === id);
  return !person || !rosterHeldBy(person, actor());
}
function render() {
  if (!app.session?.user) { lockShell(); return; }
  if (document.documentElement.classList.contains('signed-out')) unlockShell();
  const r = route();
  if (document.documentElement.classList.contains('anon-lock')) {
    if (releaseAnonymousLock) return;
    if (r.name === 'profile' && playerLinkDenied(r.id)) {
      showAnonymousDenial();
      return;
    }
    document.documentElement.classList.remove('anon-lock');
    requestAnimationFrame(placeBars);
  }
  const hello = $('#hello-name');
  if (hello) hello.textContent = givenName({ name: actor().name }) || actor().name || '';
  const key = `${r.name}:${r.mode || ''}:${r.section || ''}:${r.id || ''}`;
  const same = key === renderKey;
  renderKey = key;
  const savedScroll = app.oweReturnScroll;
  const y = savedScroll != null ? savedScroll : (same ? (document.scrollingElement?.scrollTop || 0) : 0);
  paintTabs(r);
  if (r.name !== 'profile') app.signupDraft = null;
  if (!app.loaded) return;
  claimReveal();
  if (r.name === 'match') renderMatch(r.id);
  else if (r.name === 'teams') renderTeams(r.id);
  else if (r.name === 'history') renderHistory();
  else if (r.name === 'stats') renderStats(r);
  else if (r.name === 'registro') renderRegistro(r);
  else if (r.name === 'roster') renderRoster();
  else if (r.name === 'profile') renderProfile(r.id);
  else if (r.name === 'users') renderUsers();
  else renderHome();
  paintActivity();
  requestAnimationFrame(placeBars);
  if (app.revealPlayerId && !app.revealShown) settleRevealedPlayer();
  const revealingHere = !!(app.revealPlayerId && !app.revealShown && addedPlayerRow(app.revealPlayerId));
  if (same && y > 0 && !revealingHere) {
    const top = y;
    requestAnimationFrame(() => {
      if (app.revealUserMoved) return;
      if (app.revealPlayerId && !app.revealShown) return;
      if ((document.scrollingElement?.scrollTop || 0) !== top) document.scrollingElement.scrollTop = top;
    });
  }
}

function addedPlayerRow(id) {
  const safe = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(id || '')) : String(id || '');
  if (!safe) return null;
  return document.querySelector(`#view [data-player="${safe}"]`);
}

// En producción el alta escribe varios documentos. El snapshot pinta la fila
// antes de que addPlayer termine, a veces en el medio o en la espera, y un
// snapshot posterior reemplaza el DOM. Se marca el partido antes de escribir
// y se sigue la fila nueva en cada redibujado.
function startReveal(matchId) {
  clearTimeout(app.revealTimer);
  stopRevealFollow();
  app.revealUserMoved = false;
  app.revealShown = false;
  app.revealWatch = {
    matchId,
    before: new Set((app.players || []).filter((p) => p.matchId === matchId).map((p) => p.id)),
    until: Date.now() + 8000,
  };
  app.revealPlayerId = '';
}
function claimReveal() {
  const watch = app.revealWatch;
  if (!watch) return;
  if (Date.now() > watch.until) {
    app.revealWatch = null;
    app.revealPlayerId = '';
    return;
  }
  if (app.revealPlayerId && (app.players || []).some((p) => p.id === app.revealPlayerId)) return;
  const added = (app.players || []).filter((p) => p.matchId === watch.matchId && !watch.before.has(p.id));
  const host = added.find((p) => !p.invitedBy) || added[0];
  if (!host?.id) return;
  app.revealPlayerId = host.id;
  armRevealWatch(host.id);
}

/** Cuánto hay que mover el scroll para que la fila se vea entera, entre el encabezado y la barra de abajo. */
function revealScrollDelta(row) {
  const vv = window.visualViewport;
  const viewTop = vv ? vv.offsetTop : 0;
  const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const stackBottom = document.querySelector('.topstack')?.getBoundingClientRect().bottom ?? viewTop;
  const topLimit = Math.max(stackBottom, viewTop) + 8;
  const actionTop = document.querySelector('#view .actionbar')?.getBoundingClientRect().top;
  let bottomLimit = Math.min(actionTop > topLimit ? actionTop : viewBottom, viewBottom) - 8;
  const box = row.getBoundingClientRect();
  if (box.height <= 0) return 0;
  if (!(bottomLimit > topLimit)) bottomLimit = viewBottom - 8;
  if (box.height > bottomLimit - topLimit) return box.top - topLimit;
  if (box.bottom > bottomLimit) return box.bottom - bottomLimit;
  if (box.top < topLimit) return box.top - topLimit;
  return 0;
}

/** Baja una sola vez hasta el jugador recién anotado. */
function revealAddedPlayer() {
  const id = app.revealPlayerId;
  if (!id || app.revealShown) return false;
  const row = addedPlayerRow(id);
  if (!row) return false;
  if (!row.classList.contains('just-added')) row.classList.add('just-added');
  const scroller = document.scrollingElement || document.documentElement;
  const delta = revealScrollDelta(row);
  app.revealAdjusting = true;
  try {
    if (Math.abs(delta) > 1) scroller.scrollTop += delta;
  } finally {
    app.revealAdjusting = false;
  }
  return true;
}

function stopRevealFollow() {
  (app.revealKicks || []).forEach((timer) => clearTimeout(timer));
  app.revealKicks = [];
  app.revealShown = true;
  app.revealWatch = null;
}

function settleRevealedPlayer() {
  if (!app.revealPlayerId || app.revealShown) return;
  if (!revealAddedPlayer()) return;
  stopRevealFollow();
}

function armRevealWatch(id) {
  clearTimeout(app.revealTimer);
  (app.revealKicks || []).forEach((timer) => clearTimeout(timer));
  const poll = [0, 50, 150, 400];
  app.revealKicks = poll.map((ms) => setTimeout(() => {
    if (app.revealShown || app.revealPlayerId !== id) return;
    settleRevealedPlayer();
  }, ms));
  app.revealTimer = setTimeout(() => {
    if (app.revealPlayerId !== id) return;
    (app.revealKicks || []).forEach((timer) => clearTimeout(timer));
    app.revealKicks = [];
    app.revealShown = true;
    app.revealWatch = null;
    app.revealPlayerId = '';
  }, 2500);
}

function watchRevealViewport() {
  const cancel = () => {
    if (app.revealAdjusting) return;
    app.revealUserMoved = true;
    if (!app.revealPlayerId && !(app.revealKicks || []).length) return;
    stopRevealFollow();
  };
  window.addEventListener('scroll', cancel, { passive: true });
  document.addEventListener('scroll', cancel, { capture: true, passive: true });
  window.addEventListener('wheel', cancel, { passive: true });
  window.addEventListener('touchstart', cancel, { passive: true });
  window.addEventListener('pointerdown', cancel, { passive: true });
}

function placeOf(match) {
  return venueLabel(match, app.venues);
}
function capOf(match) {
  return matchCapacity(match);
}
function knownMatches() {
  const byId = new Map();
  for (const match of [...(app.matches || []), ...(app.history || [])]) {
    if (match?.id) byId.set(match.id, match);
  }
  return [...byId.values()];
}

function oweBox(m) {
  const debt = organizerMatchDebt({
    match: m,
    players: app.players,
    matches: knownMatches(),
    prices: livePrices(),
    organizer: { uid: actor().uid, name: actor().name },
  });
  if (!(debt.total > 0)) return '';
  const open = app.oweOpen?.has(m.id) === true;
  const rows = debt.rows.map((row) => {
    const player = app.players.find((item) => item.id === row.id);
    const name = player ? shownName(player) : row.name;
    return `<li><button type="button" class="owe-player${player ? suspendedClass(player) : ''}" data-owe-player="${esc(row.id)}"><span>${esc(name)}</span><b>${esc(formatARS(row.owed))}</b></button></li>`;
  }).join('');
  return `<div class="owe-box${open ? ' open' : ''}" data-owe="${esc(m.id)}">
    <button type="button" class="owe-toggle" data-owe-toggle="${esc(m.id)}" aria-expanded="${open ? 'true' : 'false'}" aria-label="${open ? 'Ocultar quién falta pagar' : 'Ver quién falta pagar'}">
      <span>Faltan pagar (que anoté yo): <b>${esc(formatARS(debt.total))}</b></span>
      <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <ul class="owe-list"${open ? '' : ' hidden'}>${rows}</ul>
  </div>`;
}

function matchCard(m, opts = {}) {
  const n = playersOf(m.id).length;
  const cap = capOf(m);
  const [, mo, d] = m.date.split('-').map(Number);
  const rel = relativeLabel(m.date);
  const hour = shortHour(m.time) || '--:--';
  const price = formatARS(priceOfMatch(m, livePrices()));
  const history = opts.fullDate === true;
  const court = history ? '' : courtMark(m);
  const when = court ? `${hour} ${court} (${price})` : `${hour} (${price})`;
  const note = history || !m.note ? '' : `<div class="match-note">${esc(m.note)}</div>`;
  const waiting = history || !waitingOf(m.id).length ? '' : `<div class="match-note">${waitingOf(m.id).length} en espera</div>`;
  const debt = history || rel === 'Hoy' ? oweBox(m) : '';
  const clock = clockTime(m.time) || hour.replace(/hs$/, '');
  const spots = Math.max(0, Math.min(Number(cap) || 0, 24));
  const filled = Math.max(0, Math.min(n, spots));
  const dots = spots ? `<span class="trial-only trial-dots" aria-hidden="true">${Array.from({ length: spots }, (_, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('')}</span>` : '';
  return `
  <li class="match-item"><a class="match-card" href="#/partido/${encodeURIComponent(m.id)}" data-id="${esc(m.id)}" data-date="${esc(m.date)}" data-note="${esc(m.note || '')}">
    <div class="datebox"><div class="dw">${DIAS_CORTOS[weekdayOf(m.date)]}</div><div class="dd">${d}</div><div class="dm">${MESES_CORTOS[mo - 1]}</div></div>
    <div class="match-info">
      ${history ? `<div class="match-day">${esc(numericDate(m.date))}</div>` : `<div class="match-weekday">${esc(weekdayDate(m.date))}</div>`}
      <div class="match-time">${rel ? `<span class="badge">${rel}</span>` : ''}${m.cancelled ? '<span class="badge bad">Cancelado</span>' : ''}<span class="match-when">${esc(when)}</span><span class="trial-only trial-break"></span><span class="trial-only trial-clock">${esc(clock)}</span>${court ? `<span class="trial-only trial-court">${esc(court)}</span>` : ''}<span class="trial-only trial-price">${esc(price)}</span></div>
      <div class="match-note" data-venue>${esc(placeOf(m))}</div>
      ${note}
      ${waiting}
      <span class="trial-only trial-enrolled">Jugadores anotados</span>
      ${dots}
    </div>
    <div class="count ${n >= cap ? 'full' : ''}" aria-label="${n} de ${cap} anotados">
      <div class="num">${n}<small>/${cap}</small></div>
      <div class="bar"><i style="width:${Math.min(100, (n / cap) * 100)}%"></i></div>
    </div>
  </a>${debt}</li>`;
}

function renderHome() {
  const upcoming = currentMatches(app.matches);
  const { next, later } = splitNear(upcoming);
  const open = app.showLater && later.length > 0;
  const emptyHint = later.length
    ? 'Los que vienen después están en el botón de abajo.'
    : 'Agregá uno a mano o pegá un mensaje del grupo de WhatsApp.';
  if (!replaceView(`
    ${confirmBanner()}${reminderBanners(next)}
    <h2 class="section">Próximos 7 días</h2>
    ${next.length ? `<ul class="match-list" id="list-next">${next.map(matchCard).join('')}</ul>` : `
      <div class="empty" id="home-empty"><div class="big">⚽</div><p><b>No hay partidos en los próximos 7 días.</b></p>
      <p class="small">${emptyHint}</p></div>`}
    ${later.length ? `<button type="button" class="later-toggle" id="btn-later" aria-expanded="${open ? 'true' : 'false'}">${open ? 'Ocultar más adelante' : `Ver más adelante (${later.length})`}</button>` : ''}
    ${open ? `<h2 class="section">Más adelante</h2><ul class="match-list" id="list-later">${later.map(matchCard).join('')}</ul>` : ''}
    <div class="actionbar"><div class="actionbar-inner">
      <button class="btn" id="btn-import">${ICON.paste}Importar texto</button>
      <button class="btn primary" id="btn-add-match">${ICON.plus}Agregar partido</button>
    </div></div>`)) return;
  $('#btn-add-match').onclick = () => openMatchForm();
  $('#btn-import').onclick = () => openImport();
  const laterBtn = $('#btn-later');
  if (laterBtn) laterBtn.onclick = () => { rememberLater(!app.showLater); renderHome(); };
  bindReminderBanners();
}

function renderTeams(id) {
  const m = matchById(id);
  if (!m) {
    if (!replaceView(`<div class="empty"><div class="big">🤷</div><p><b>No encontramos este partido.</b></p><p><a class="btn" href="#/">Volver al inicio</a></p></div>`)) return;
    return;
  }
  const main = playersOf(id);
  const ids = main.map((p) => p.id);
  const teams = orderTeamsByGoal(normalizeTeams(m.teams, ids), main);
  const balance = teamsBalance(teams);
  const taken = new Set([...teams.bib, ...teams.plain]);
  const free = main.filter((p) => !taken.has(p.id));
  const readOnly = !canAdd(m, actor().uid);
  const byId = new Map(main.map((p) => [p.id, p]));
  const slots = perTeamOf(m);
  const vestPath = 'M8.15 2.15H10.35C10.7 4 11.35 5.4 12 6.15C12.65 5.4 13.3 4 13.65 2.15H15.85C17.05 4.5 18.25 7.2 18.5 10.6C18.65 12.4 18.4 13.6 18.2 14.4V21.55H5.8V14.4C5.6 13.6 5.35 12.4 5.5 10.6C5.75 7.2 6.95 4.5 8.15 2.15Z';
  const vest = `<svg class="vest vest-bib" viewBox="0 0 24 24" aria-hidden="true"><path d="${vestPath}"/></svg>`;
  const shirt = `<svg class="vest vest-plain" viewBox="0 0 24 24" aria-hidden="true"><path d="${vestPath}"/></svg>`;
  const slotRows = (side, list) => {
    const count = Math.max(slots, list.length);
    const rows = [];
    for (let i = 0; i < count; i++) {
      const player = byId.get(list[i]);
      if (!player) {
        rows.push(`<li class="team-slot empty" data-slot-index="${i}">Libre</li>`);
        continue;
      }
      const other = side === 'bib' ? 'plain' : 'bib';
      const otherIcon = other === 'bib' ? vest : shirt;
      const otherLabel = other === 'bib' ? 'Pasar a con pechera' : 'Pasar a sin pechera';
      const goals = Number.isInteger(player.goals) && player.goals > 0 ? player.goals : 0;
      const goalBox = readOnly
        ? `<span class="goal-n" aria-label="Goles de ${esc(player.name)}">${goals}</span>`
        : `<span class="goal-box"><button type="button" data-goal="-1" aria-label="Restar un gol de ${esc(player.name)}">−</button><span class="goal-n" aria-label="Goles de ${esc(player.name)}">${goals}</span><button type="button" data-goal="1" aria-label="Sumar un gol de ${esc(player.name)}">+</button></span>`;
      const goalMark = player.inGoal === true
        ? '<span class="arco-tick" aria-hidden="true"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#0f7a3d"/><path d="M4.6 8.2 7 10.6 11.6 5.4" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'
        : '';
      const goalIco = `<svg class="goal-ico" viewBox="0 0 64 64" aria-hidden="true"><path d="M18 16h30L44 38H16Z" fill="#e7f3ff"/><path d="M8 22 18 16v22L8 52M56 20 48 16v22l8 14" fill="#f4f9fd" stroke="#c5d8ea" stroke-width="1"/><g fill="none" stroke="#7eb6e6" stroke-width="1.2"><path d="M18 20.5h28M17.2 26h26.2M16.4 31.5h24.4M15.8 37h22"/><path d="M24 16.4v21.2M31 16.2v21.6M38 16v21.2M45 15.8v19.6"/><path d="M8 30h10M8 40h8M56 28H48M56 38h-8"/></g><path d="M8 22h48v30" fill="none" stroke="#8ea3b8" stroke-width="6.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 22h48v30" fill="none" stroke="#f8fbff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const arco = readOnly
        ? (player.inGoal === true ? `<span class="arco-mark on" aria-label="Fue al arco">${goalIco}${goalMark}</span>` : '')
        : `<button type="button" class="arco-btn${player.inGoal === true ? ' on' : ''}" data-arco aria-pressed="${player.inGoal === true ? 'true' : 'false'}" aria-label="${player.inGoal === true ? 'Ya fue al arco' : 'Marcar que fue al arco'}">${goalIco}${goalMark}</button>`;
      const tools = `<span class="team-tools"><button type="button" class="team-ico" data-assign="${other}" aria-label="${otherLabel} a ${esc(shownName(player))}">${otherIcon}</button><button type="button" class="team-x" data-assign="none" aria-label="Sacar a ${esc(shownName(player))} de este equipo">✕</button></span>`;
      const controls = `<span class="team-side">${goalBox}${tools}${arco}</span>`;
      const name = `<button type="button" class="team-name${suspendedClass(player)}" data-team-name="${esc(player.id)}" draggable="false">${esc(shownName(player))}</button>`;
      rows.push(readOnly
        ? `<li class="team-row" data-team-player="${esc(player.id)}">${name}<span class="team-side">${goalBox}${arco}</span></li>`
        : `<li class="team-row" draggable="true" data-drag-player="${esc(player.id)}" data-team-player="${esc(player.id)}">${name}${controls}</li>`);
    }
    return rows.join('');
  };
  const freeRows = free.map((player) => {
    const name = `<button type="button" class="team-name${suspendedClass(player)}" data-team-name="${esc(player.id)}" draggable="false">${esc(shownName(player))}</button>`;
    return readOnly
      ? `<li class="team-row" data-team-player="${esc(player.id)}">${name}</li>`
      : `<li class="team-row" draggable="true" data-drag-player="${esc(player.id)}" data-team-player="${esc(player.id)}">${name}<span class="team-tools"><button type="button" class="team-ico" data-assign="bib" aria-label="Con pechera para ${esc(shownName(player))}">${vest}</button><button type="button" class="team-ico" data-assign="plain" aria-label="Sin pechera para ${esc(shownName(player))}">${shirt}</button></span></li>`;
  }).join('');
  const when = `${capitalize(labelDate(m.date))} · ${m.time || '--:--'} hs`;
  const score = normalizeScore(m.score);
  const share = teamsMessage({ when, venue: placeOf(m), players: main.map((player) => ({ ...player, name: shownName(player) })), teams, score: m.score ? score : null });
  const scoreSide = (side, label, value) => {
    const icon = side === 'bib' ? vest : shirt;
    const n = `<strong id="score-${side}">${value}</strong>`;
    const title = `<span class="score-label">${icon}<span>${esc(label)}</span></span>`;
    if (readOnly) return `<div class="score-side">${title}${n}</div>`;
    return `<div class="score-side">${title}<div class="score-controls"><button type="button" class="score-btn" data-score="${side}" data-delta="-1" aria-label="Restar uno al marcador de ${esc(label)}">−</button>${n}<button type="button" class="score-btn" data-score="${side}" data-delta="1" aria-label="Sumar uno al marcador de ${esc(label)}">+</button></div></div>`;
  };
  const teamHeading = (side, title, count) => `${title} (<span id="team-${side}-count">${count}</span> ${count === 1 ? 'jugador' : 'jugadores'})`;
  if (!replaceView(`
    <section class="detail-head">
      <h1>Equipos</h1>
      <div class="when">${esc(when)} · ${esc(placeOf(m))}</div>
      ${readOnly ? '<p class="hint" id="teams-readonly">Solo lectura. No podés cambiar los equipos.</p>' : ''}
    </section>
    <div class="team-board" id="team-board">
      <h2 class="tanteador" id="tanteador">TANTEADOR</h2>
      <div class="scoreboard" id="scoreboard" aria-label="Tanteador">
        ${scoreSide('bib', 'Con pechera', score.bib)}
        <span class="score-dash" aria-hidden="true">–</span>
        ${scoreSide('plain', 'Sin pechera', score.plain)}
      </div>
      ${balance.balanced ? '' : '<p class="team-warn" id="team-balance">Está desbalanceado</p>'}
      ${main.length ? '' : '<p class="empty-wait">No hay jugadores anotados.</p>'}
      <div class="team-columns">
        <section id="team-bib" data-drop-side="bib">
          <h2 class="section team-heading">${vest}${teamHeading('bib', 'CON PECHERA', balance.bib)}</h2>
          <p class="arco-left" id="arco-bib">Faltan ir al arco: ${goaliesLeft(teams.bib, teams.bib.filter((id) => byId.get(id)?.inGoal === true))}</p>
          <ul class="team-list">${slotRows('bib', teams.bib)}</ul>
        </section>
        <section id="team-plain" data-drop-side="plain">
          <h2 class="section team-heading">${shirt}${teamHeading('plain', 'SIN PECHERA', balance.plain)}</h2>
          <p class="arco-left" id="arco-plain">Faltan ir al arco: ${goaliesLeft(teams.plain, teams.plain.filter((id) => byId.get(id)?.inGoal === true))}</p>
          <ul class="team-list">${slotRows('plain', teams.plain)}</ul>
        </section>
      </div>
      <section id="team-unassigned" data-drop-side="none">
        <h2 class="section">Sin asignar</h2>
        ${free.length ? `<ul class="team-list">${freeRows}</ul>` : '<p class="empty-wait">Nadie</p>'}
      </section>
      <div class="team-actions">
        ${readOnly ? '' : '<button type="button" class="btn" id="btn-teams-shuffle">Armar equipos automáticamente</button><button type="button" class="btn" id="btn-teams-clear">Reset</button>'}
        <a class="btn nav-wide" id="btn-teams-wa" href="${esc(waHref('', share))}" target="_blank" rel="noopener">Compartir por WhatsApp</a>
      </div>
    </div>`)) return;
  const save = (next, msg) => run(app.store.setTeams(m.id, orderTeamsByGoal(normalizeTeams(next, ids), main), app.who), msg);
  if (!readOnly) {
    $('#scoreboard').onclick = (e) => {
      const btn = e.target.closest('[data-score]');
      if (!btn) return;
      run(app.store.adjustScore(m.id, btn.dataset.score, Number(btn.dataset.delta), app.who));
    };
  }
  const assign = (playerId, side) => {
    const moved = movePlayer(teams, playerId, side, ids, slots);
    if (!moved.ok && moved.reason === 'full') {
      toast(moved.side === 'plain' ? 'Sin pechera está completo' : 'Con pechera está completo');
      return;
    }
    if (moved.ok) save(moved.teams);
  };
  let nameDragged = false;
  const openNamedPlayer = (e) => {
    const name = e.target.closest('[data-team-name]');
    if (!name) return false;
    if (nameDragged) { nameDragged = false; return true; }
    const player = app.players.find((item) => item.id === name.dataset.teamName);
    if (player) openPlayerMenu(m, player);
    return true;
  };
  $('#team-board').onclick = (e) => {
    if (!readOnly) {
      const row = e.target.closest('[data-drag-player]');
      const goal = e.target.closest('[data-goal]');
      if (goal && row) {
        run(app.store.adjustGoals(row.dataset.dragPlayer, Number(goal.dataset.goal)));
        return;
      }
      const arco = e.target.closest('[data-arco]');
      if (arco && row) {
        run(app.store.setInGoal(row.dataset.dragPlayer, arco.getAttribute('aria-pressed') !== 'true'));
        return;
      }
      const btn = e.target.closest('[data-assign]');
      if (btn && row) {
        assign(row.dataset.dragPlayer, btn.dataset.assign);
        return;
      }
    }
    openNamedPlayer(e);
  };
  if (!readOnly) {
    let dragId = '';
    let pointer = null;
    const rated = () => main.map((player) => {
      const person = player.rosterId ? (app.roster || []).find((item) => item.id === player.rosterId) : null;
      return { id: player.id, level: person?.level ?? player.level, positions: Array.isArray(person?.positions) ? person.positions : [] };
    });
    const release = (playerId, hit) => {
      if (!playerId || !hit?.closest) return;
      const row = hit.closest('[data-drag-player]');
      const targetId = row?.dataset?.dragPlayer;
      const zone = hit.closest('[data-drop-side]');
      if (!(targetId && targetId !== playerId) && !zone) return;
      const dropped = targetId && targetId !== playerId
        ? dropPlayerOn(teams, playerId, { targetId, allowedIds: ids, cap: slots })
        : dropPlayerOn(teams, playerId, {
          side: zone.dataset.dropSide,
          index: hit.closest('[data-slot-index]') ? Number(hit.closest('[data-slot-index]').dataset.slotIndex) : null,
          allowedIds: ids,
          cap: slots,
        });
      if (!dropped) return;
      if (!dropped.ok && dropped.reason === 'full') {
        toast(dropped.side === 'plain' ? 'Sin pechera está completo' : 'Con pechera está completo');
        return;
      }
      if (dropped.ok) save(dropped.teams);
    };
    $('#team-board').addEventListener('dragstart', (e) => {
      const row = e.target.closest('[data-drag-player]');
      if (!row) return;
      dragId = row.dataset.dragPlayer;
      nameDragged = true;
      e.dataTransfer?.setData('text/plain', dragId);
    });
    $('#team-board').addEventListener('dragover', (e) => {
      if (e.target.closest('[data-drop-side]')) e.preventDefault();
    });
    $('#team-board').addEventListener('drop', (e) => {
      const zone = e.target.closest('[data-drop-side]');
      if (!zone) return;
      e.preventDefault();
      release(dragId || e.dataTransfer?.getData('text/plain'), e.target);
    });
    $('#team-board').addEventListener('pointerdown', (e) => {
      const onName = !!e.target.closest('[data-team-name]');
      if (!onName && e.target.closest('button, a, label, input')) return;
      const row = e.target.closest('[data-drag-player]');
      if (!row) return;
      nameDragged = false;
      pointer = { id: row.dataset.dragPlayer, x: e.clientX, y: e.clientY };
    });
    $('#team-board').addEventListener('pointerup', (e) => {
      if (!pointer) return;
      const moved = Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 12;
      const playerId = pointer.id;
      pointer = null;
      if (!moved) return;
      nameDragged = true;
      release(playerId, document.elementFromPoint(e.clientX, e.clientY));
    });
    $('#btn-teams-shuffle').onclick = async () => {
      if (!(await askConfirm('¿Seguro que querés rearmar los equipos automáticamente?'))) return;
      save(balanceTeams(rated(), { cap: slots }), 'Equipos armados');
    };
    $('#btn-teams-clear').onclick = async () => {
      if (!(await askConfirm('¿Seguro que querés resetear los equipos?', { danger: true }))) return;
      save(emptyTeams(), 'Equipos limpios');
    };
  }
}

function historyVenueState() {
  const options = historyVenueOptions(app.venues);
  const ids = options.map((item) => item.id);
  const picked = Array.isArray(app.historyVenues) ? app.historyVenues.filter((id) => ids.includes(id)) : null;
  const all = picked == null || (ids.length > 0 && ids.every((id) => picked.includes(id)));
  return { options, all, selected: all ? null : picked };
}

function dayMatches(date) {
  return knownMatches().filter((match) => match.date === date && match.cancelled !== true);
}
function dayBundle(date) {
  const matches = dayMatches(date);
  const players = (app.players || []).filter((player) => matches.some((match) => match.id === player.matchId));
  const staff = staffUsers(app.users);
  return { matches, players, staff, calc: dayCompensation(matches, players, staff) };
}
function savedCompensation(date) {
  return (app.compensations || []).find((row) => row.date === date || row.id === date) || null;
}
function showMatchCompensation(match) {
  if (!canAdd(match, actor().uid)) return false;
  const staff = staffUsers(app.users);
  if (!staff.length) return true;
  return matchStaff(match, staff).length > 1;
}
function canSeeDayCompensation(date) {
  const matches = dayMatches(date);
  if (!matches.some((match) => canAdd(match, actor().uid))) return false;
  const staff = staffUsers(app.users);
  if (!staff.length) return true;
  return compensationApplies(matches, staff);
}
function compensationDoc(date, body) {
  return {
    date,
    fingerprint: String(body?.fingerprint || ''),
    changed: body?.changed === true,
    computedAt: Number(body?.computedAt) || Date.now(),
    rows: (body?.rows || []).map((row) => ({
      uid: String(row.uid || ''),
      name: String(row.name || ''),
      collected: Number(row.collected) || 0,
      entitled: Number(row.entitled) || 0,
    })),
    transfers: (body?.transfers || []).map((transfer) => ({
      fromUid: String(transfer.fromUid || ''),
      fromName: String(transfer.fromName || ''),
      toUid: String(transfer.toUid || ''),
      toName: String(transfer.toName || ''),
      amount: Number(transfer.amount) || 0,
      doneAt: transfer.doneAt == null ? null : Number(transfer.doneAt),
      stale: transfer.stale === true,
      removed: transfer.removed === true,
    })),
  };
}
const compBusy = new Set();
function holdCompensation(doc) {
  app.compHeld = app.compHeld || {};
  const row = { id: doc.date, ...doc };
  app.compHeld[doc.date] = row;
  const rest = (app.compensations || []).filter((item) => item.date !== doc.date && item.id !== doc.date);
  app.compensations = [...rest, row];
}
function mergeHeldCompensations(list) {
  const held = app.compHeld || {};
  const out = [...(list || [])];
  for (const [date, doc] of Object.entries(held)) {
    const found = out.some((row) => row.date === date || row.id === date);
    if (found) delete held[date];
    else out.push(doc);
  }
  return out;
}
function compensationSaveError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (code === 'permission-denied' || code === 'permission_denied' || code.endsWith('/permission-denied') || /insufficient permissions/i.test(message)) {
    return 'No se pudo guardar el cálculo: faltan actualizar las reglas de Firebase.';
  }
  const detail = message.replace(/^FirebaseError:\s*/i, '').trim();
  return detail ? `No se pudo guardar el cálculo. ${detail}` : 'No se pudo guardar el cálculo.';
}
function refreshCompensation(date) {
  // Mostrar el cálculo guardado no escribe. Antes, cada render del historial
  // lo volvía a guardar si el fingerprint no coincidía.
  return savedCompensation(date);
}
function historyWithCompensation(matches) {
  const groups = [];
  for (const match of matches) {
    const last = groups[groups.length - 1];
    if (!last || last.date !== match.date) groups.push({ date: match.date, matches: [match] });
    else last.matches.push(match);
  }
  return groups.map((group) => `${compensationBlock(group.date)}${group.matches.map((item) => matchCard(item, { fullDate: true })).join('')}`).join('');
}
function compensationMakeLabel(date) {
  const when = compensationWhen(date);
  return when ? `Hacer cálculo de compensación del día ${when}` : 'Hacer cálculo de compensación del día';
}
function compensationHeadLabel(date, changed) {
  const when = compensationWhen(date);
  const base = when ? `Compensación del día ${when}` : 'Compensación del día';
  return changed ? `${base} · El cálculo cambió` : base;
}
function matchCompensationHtml(date) {
  if (!canSeeDayCompensation(date)) return '';
  const saved = refreshCompensation(date);
  const { calc } = dayBundle(date);
  if (!saved) return `<button type="button" class="btn block" id="btn-comp" data-comp-make="${esc(date)}"><span class="comp-label">${esc(compensationMakeLabel(date))}</span></button>`;
  return `<section id="comp-detail">${compensationDetail(saved, calc)}</section>`;
}
function compensationBlock(date) {
  if (!canSeeDayCompensation(date)) return '';
  const saved = refreshCompensation(date);
  if (!saved) return `<li class="comp-slot"><button type="button" class="btn block" data-comp-make="${esc(date)}"><span class="comp-label">${esc(compensationMakeLabel(date))}</span></button></li>`;
  const open = app.compOpen === date;
  const { calc } = dayBundle(date);
  const mark = open ? '▾' : '▸';
  return `<li class="comp-slot"><button type="button" class="btn block" data-comp-toggle="${esc(date)}" aria-expanded="${open ? 'true' : 'false'}"><span class="comp-label">${mark} ${esc(compensationHeadLabel(date, saved.changed))}</span></button>${open ? `<div id="comp-detail">${compensationDetail(saved, calc)}</div>` : ''}</li>`;
}
function compensationDetail(doc, calc) {
  const title = `<h3 class="comp-title" id="comp-title">${esc(compensationHeadLabel(doc.date, !!doc.changed))}</h3>`;
  const notice = doc.changed ? '<p class="hint" id="comp-changed">El cálculo cambió</p>' : '';
  if (calc?.missing?.length) {
    const lines = calc.missing.map((item) => {
      const match = knownMatches().find((row) => row.id === item.matchId);
      return `<li>${esc(item.name)} · ${esc(match ? fmtWhen(match) : '')}</li>`;
    }).join('');
    return `${title}${notice}<p class="hint">Falta indicar cómo pagan.</p><ul class="pay-split-preview" id="comp-missing">${lines}</ul>`;
  }
  const rows = (doc.rows || []).map((row) => `<li><b>${esc(row.name)}</b> cobró ${esc(formatARS(row.collected))} · le corresponden ${esc(formatARS(row.entitled))}</li>`).join('');
  const moves = (doc.transfers || []).map((transfer) => {
    const note = transfer.removed ? ' · ya no corresponde' : (transfer.stale ? ' · cambió' : '');
    const done = transfer.doneAt ? ` · Transferido ${esc(numericDate(todayISO(new Date(transfer.doneAt))))}` : '';
    const label = `${transfer.fromName} le pasa ${formatARS(transfer.amount)} a ${transfer.toName}`;
    const button = transfer.doneAt || transfer.removed ? '' : `<button type="button" class="btn" data-comp-done="${esc(transfer.fromUid)}|${esc(transfer.toUid)}" data-comp-date="${esc(doc.date)}">Transferido</button>`;
    return `<li class="comp-transfer"><span>${esc(label)}${done}${esc(note)}</span>${button}</li>`;
  }).join('');
  const empty = moves ? '' : '<p class="hint">Nadie le tiene que pasar plata a otro.</p>';
  return `${title}${notice}<ul class="pay-split-preview" id="comp-rows">${rows}</ul>${moves ? `<ul class="comp-moves" id="comp-transfers">${moves}</ul>` : empty}`;
}
async function runCompensation(date) {
  const { matches, players, staff, calc } = dayBundle(date);
  if (calc.missing.length) {
    const lines = calc.missing.map((item) => {
      const match = matches.find((row) => row.id === item.matchId);
      return `<li>${esc(item.name)} · ${esc(match ? fmtWhen(match) : item.matchId)}</li>`;
    }).join('');
    openSheet(`<h3>Falta indicar cómo pagan</h3><p class="hint">Antes del cálculo, cada jugador tiene que tener efectivo, transferencia, crédito, transfiere después o juega gratis.</p><ul class="pay-split-preview" id="comp-missing">${lines}</ul><div class="sheet-actions"><button type="button" class="btn" data-close>Cerrar</button></div>`);
    return;
  }
  const saved = savedCompensation(date);
  const fingerprint = compensationFingerprint(matches, players, staff);
  const doc = compensationDoc(date, {
    fingerprint,
    changed: !!(saved && saved.fingerprint && saved.fingerprint !== fingerprint),
    computedAt: Date.now(),
    rows: calc.rows,
    transfers: reconcileTransfers(saved?.transfers, calc.transfers),
  });
  holdCompensation(doc);
  app.compOpen = date;
  render();
  try {
    await app.store.saveCompensation(date, doc);
  } catch (error) {
    holdCompensation(doc);
    render();
    await askNotice(compensationSaveError(error));
  }
}
async function markCompensationPaid(date, key) {
  const saved = savedCompensation(date);
  if (!saved) return;
  const [fromUid, toUid] = String(key || '').split('|');
  const transfers = (saved.transfers || []).map((transfer) => transfer.fromUid === fromUid && transfer.toUid === toUid ? { ...transfer, doneAt: Date.now(), stale: false, removed: false } : transfer);
  const move = transfers.find((transfer) => transfer.fromUid === fromUid && transfer.toUid === toUid);
  await app.store.saveCompensation(date, compensationDoc(date, { ...saved, transfers }));
  const match = dayMatches(date)[0];
  if (move && match) {
    await app.store.logCompensation(match, {
      type: 'compensación',
      method: 'transferencia',
      amount: move.amount,
      paidTo: move.toName,
      detail: `${move.fromName} le pasó ${formatARS(move.amount)} a ${move.toName}`,
    });
  }
}
function bindCompensation(root) {
  if (!root) return;
  root.querySelectorAll('[data-comp-make]').forEach((btn) => { btn.onclick = () => runCompensation(btn.dataset.compMake); });
  root.querySelectorAll('[data-comp-toggle]').forEach((btn) => {
    btn.onclick = () => {
      app.compOpen = app.compOpen === btn.dataset.compToggle ? '' : btn.dataset.compToggle;
      render();
    };
  });
  root.querySelectorAll('[data-comp-done]').forEach((btn) => { btn.onclick = () => markCompensationPaid(btn.dataset.compDate, btn.dataset.compDone); });
}

function renderHistory() {
  const filter = app.historyFilter || {};
  const caption = app.historyMeta?.caption || 'Partidos pasados, los más recientes primero.';
  const active = !!(filter.day || filter.from || filter.to);
  const venues = historyVenueState();
  const debtOn = app.historyDebtors === true;
  let past = filterHistoryByVenues(app.history || [], venues.all ? null : venues.selected);
  if (debtOn) {
    const matches = knownMatches();
    const organizer = { uid: actor().uid, name: actor().name };
    const prices = livePrices();
    past = past.filter((match) => organizerMatchDebt({ match, players: app.players, matches, prices, organizer }).total > 0);
  }
  const venueNarrow = !venues.all;
  const filtering = active || venueNarrow || debtOn;
  const emptyLead = venueNarrow && !(venues.selected || []).length
    ? 'Elegí una sede o Todas.'
    : (filtering ? 'Nada en ese filtro.' : 'Todavía no hay partidos pasados.');
  const chips = `<div class="chips history-venues" id="hist-venues" role="group" aria-label="Filtros del historial">
      <button type="button" class="btn chip${venues.all ? ' on' : ''}" data-venue="all" aria-pressed="${venues.all ? 'true' : 'false'}">Todas</button>
      ${venues.options.map((venue) => {
        const on = !venues.all && (venues.selected || []).includes(venue.id);
        return `<button type="button" class="btn chip${on ? ' on' : ''}" data-venue="${esc(venue.id)}" aria-pressed="${on ? 'true' : 'false'}">${esc(venue.name)}</button>`;
      }).join('')}
      <button type="button" class="btn chip${debtOn ? ' on' : ''}" id="hist-debtors" aria-pressed="${debtOn ? 'true' : 'false'}">Partidos con deudores</button>
    </div>`;
  if (!replaceView(`
    <h2 class="section">Historial de partidos</h2>
    <form id="history-filter" class="history-filter">
      <p class="hint roster-lead">Por defecto muestra los últimos 30 partidos</p>
      <label class="field"><span>Una fecha</span><input type="date" id="hist-day" value="${esc(filter.day || '')}"></label>
      <div class="row">
        <label class="field"><span>Desde</span><input type="date" id="hist-from" value="${esc(filter.from || '')}"></label>
        <label class="field"><span>Hasta</span><input type="date" id="hist-to" value="${esc(filter.to || '')}"></label>
      </div>
      <div class="history-actions">
        <button type="submit" class="btn primary" id="hist-apply">Ver</button>
        <button type="button" class="btn" id="hist-clear"${active ? '' : ' hidden'}>Limpiar</button>
      </div>
    </form>
    ${chips}
    ${venueNarrow && !(venues.selected || []).length ? '<p class="hint" id="hist-venue-empty">Elegí una sede o Todas para ver los partidos.</p>' : ''}
    <p class="hint" id="hist-caption">${esc(caption)}</p>
    <button type="button" class="btn block" id="btn-hist-import">Importar partidos desde texto</button>
    ${app.historyError ? `<div class="banner error" id="hist-error">${esc(app.historyError)}</div>` : ''}
    ${past.length ? `<ul class="match-list" id="list-history">${historyWithCompensation(past)}</ul>` : `
      <div class="empty" id="list-history"><div class="big">📅</div><p><b>${esc(emptyLead)}</b></p>
      <p class="small">${active ? 'Limpiar vuelve a los últimos 30.' : 'Cuando pase el día, el partido sale de Próximos partidos y queda acá.'}</p></div>`}`)) return;
  $('#history-filter').onsubmit = (e) => {
    e.preventDefault();
    const day = $('#hist-day').value;
    const from = $('#hist-from').value;
    const to = $('#hist-to').value;
    const next = day ? { day } : ((from || to) ? { from, to } : null);
    app.historyFilter = next;
    app.store.setHistoryFilter(next);
  };
  const histImport = $('#btn-hist-import');
  if (histImport) histImport.onclick = () => openHistoryImport();
  bindCompensation($('#list-history'));
  const clear = $('#hist-clear');
  if (clear) clear.onclick = () => {
    app.historyFilter = null;
    app.store.setHistoryFilter(null);
  };
  const venueBox = $('#hist-venues');
  if (venueBox) venueBox.onclick = (e) => {
    if (e.target.closest('#hist-debtors')) {
      app.historyDebtors = !app.historyDebtors;
      renderHistory();
      return;
    }
    const btn = e.target.closest('[data-venue]');
    if (!btn) return;
    const id = btn.dataset.venue;
    const now = historyVenueState();
    if (id === 'all') app.historyVenues = null;
    else if (now.all) app.historyVenues = [id];
    else {
      const set = new Set(now.selected || []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      const ids = now.options.map((item) => item.id);
      if (!set.size) app.historyVenues = [];
      else if (ids.length && ids.every((item) => set.has(item))) app.historyVenues = null;
      else app.historyVenues = [...set];
    }
    renderHistory();
  };
}

function detailPlaceLine(m) {
  const court = courtLabel(m);
  const format = `F${perTeamOf(m)}`;
  const venue = placeOf(m);
  const bits = [];
  if (court) bits.push(`<span id="match-court">${esc(court)}</span>`);
  if (format) bits.push(esc(format));
  if (venue) bits.push(esc(venue));
  return bits.join(' - ');
}

function playerCountLabel(n) {
  return `${n} ${n === 1 ? 'jugador' : 'jugadores'}`;
}

function matchFactLines(players, mainPlayers, who) {
  const sum = confirmSummary(mainPlayers);
  const mine = organizerReceipts(players, who);
  return {
    confirm: `Confirmados: ${sum.si} - No juegan: ${sum.no} - Sin respuesta: ${sum.pending}`,
    added: `Anotados por mí: ${mine.added}`,
    cash: `Me dieron en efectivo: ${formatARS(mine.cash)} (${playerCountLabel(mine.cashPlayers)})`,
    transfer: `Me transfirieron: ${formatARS(mine.transfer)} (${playerCountLabel(mine.transferPlayers)})`,
  };
}

function usualPhone(player) {
  const view = withAgendaPhone(player);
  const raw = String(view?.phone || '').trim();
  if (!raw) return '';
  const parsed = normalizePhone(raw);
  return parsed.ok ? parsed.wa : '';
}

function usualSection(m) {
  const rows = usualPlayers({
    match: m,
    matches: knownMatches(),
    players: app.players,
    today: todayISO(),
    who: actor(),
  });
  if (!rows.length) return '';
  const items = rows.map((row) => {
    const phone = usualPhone(row.sample);
    const wa = phone
      ? `<a class="wa-btn" href="${esc(waSendUrl({ phone, text: '' }))}" target="_blank" rel="noopener" aria-label="WhatsApp a ${esc(row.name)}">${ICON.wa}</a>`
      : '';
    const times = `${row.count} ${row.count === 1 ? 'partido' : 'partidos'}`;
    return `<li class="slot usual-row" data-usual="${esc(row.key)}"><div class="who"><div class="name">${esc(row.name)}</div><div class="sub"><span>${esc(times)}</span></div></div>${wa}</li>`;
  }).join('');
  return `<h2 class="section" id="usual-title">Suelen anotarse para jugar este día y hora:</h2><ul class="slots" id="usual-list">${items}</ul>`;
}

/** Próximos, o los últimos 7 días del historial. El más reciente primero en el pasado. */
function detailSwitchRows(match) {
  const all = knownMatches();
  if (matchAlreadyPlayed(match)) {
    const from = addDays(todayISO(), -7);
    return pastMatches(all).filter((item) => item.date >= from);
  }
  return currentMatches(all);
}

/** Hay otro partido de esa lista, y este está en ella. */
function canSwitchMatch(match) {
  const rows = detailSwitchRows(match);
  if (!match?.id || !rows.some((item) => item.id === match.id)) return false;
  return rows.length > 1;
}

function matchSwitchOption(item) {
  const label = matchSwitchLabel(item.date, item.time, courtMark(item));
  const venue = String(placeOf(item) || '').trim();
  return venue ? `${label} · ${venue}` : label;
}

function openMatchSwitch(current) {
  const rows = detailSwitchRows(current);
  const items = rows.map((item) => {
    const on = item.id === current.id;
    return `<button type="button" class="btn${on ? ' primary' : ''}" data-match-switch="${esc(item.id)}"${on ? ' aria-current="true"' : ''}>${esc(matchSwitchOption(item))}</button>`;
  }).join('');
  openSheet(`<div class="menu" id="match-switch-list">${items}<button type="button" class="btn ghost" data-close>Cancelar</button></div>`);
  const list = $('#match-switch-list');
  if (!list) return;
  list.onclick = (event) => {
    const btn = event.target.closest('[data-match-switch]');
    if (!btn) return;
    const id = btn.dataset.matchSwitch;
    closeSheet();
    if (id && id !== current.id) location.hash = `#/partido/${encodeURIComponent(id)}`;
  };
}

function renderMatch(id) {
  const m = matchById(id);
  if (!m) {
    if (app.matchMiss[id] === 'denied') {
      replaceView(`<div class="empty" id="match-denied"><div class="big">🔒</div><p><b>No se pudo abrir este partido.</b></p><p class="small">${esc(RULES_MSG)}</p><p><a class="btn" href="#/historial">Volver al historial</a></p></div>`);
      return;
    }
    if (app.matchMiss[id] !== 'done') {
      if (app.matchMiss[id] !== 'loading') {
        app.matchMiss[id] = 'loading';
        Promise.resolve(app.store.ensureMatch?.(id)).then((result) => {
          app.matchMiss[id] = result === 'denied' ? 'denied' : 'done';
          if (result === 'denied') showError(RULES_MSG);
          const current = route();
          if (current.name === 'match' && current.id === id) render();
        });
      }
      replaceView(`<div class="empty" id="match-missing"><div class="big">⚽</div><p><b>Buscando el partido…</b></p></div>`);
      return;
    }
    replaceView(`<div class="empty"><div class="big">🤷</div><p><b>No encontramos este partido.</b></p><p class="small">Puede que lo hayan borrado.</p><p><a class="btn" href="#/">Volver al inicio</a></p></div>`);
    return;
  }
  const everyone = playersOf(id);
  const ps = everyone;
  const cap = capOf(m);
  const who = actor();
  const readOnly = !canAdd(m, who.uid);
  const block = addBlock(m);
  const slots = [];
  for (let i = 0; i < Math.max(cap, everyone.length); i++) {
    const p = ps[i];
    if (!p) {
      slots.push(readOnly || block
        ? `<li><div class="slot free"><span class="n">${i + 1}</span><span>Lugar libre</span></div></li>`
        : `<li><button type="button" class="slot free" data-free="${i}"><span class="n">${i + 1}</span><span>Lugar libre · tocá para anotar</span></button></li>`);
      continue;
    }
    const payText = paymentStatusText(p);
    slots.push(`
      <li class="slot ${i >= cap ? 'extra' : ''}${inviteClass(p)}${app.revealPlayerId === p.id ? ' just-added' : ''}" data-player="${esc(p.id)}">
        <span class="n">${i + 1}</span>
        <button type="button" class="who" data-profile="${esc(p.id)}">
          ${nameRow(p)}
          <div class="sub">${phoneSub(p)}
            ${friendTag(p)}${addedTag(p)}${signedUpTag(p)}${confirmTag(p)}${i >= cap ? '<span class="tag">Excede el cupo</span>' : ''}</div>
          ${payMarkup(p)}
          ${promoBadge(p)}
        </button>
        ${readOnly ? '' : confirmSpotButton(p)}
        ${slotSide(p, m, readOnly, payText)}
      </li>`);
  }
  const full = everyone.length >= cap;
  const facts = matchFactLines(app.players.filter((p) => p.matchId === id), everyone, who);
  const assigned = normalizeTeams(m.teams, everyone.map((p) => p.id));
  const teamCount = assigned.bib.length + assigned.plain.length;
  const signed = everyone.length + waitingOf(id).length + noPlayOf(id).length;
  const canEdit = canEditMatch(m, who.uid);
  const notesText = String(m.notes || '').trim();
  const hour = shortHour(m.time) || '--:--';
  const priceText = formatARS(priceOfMatch(m, livePrices()));
  const switchLabel = matchTitleLabel(m.date);
  const switchable = canSwitchMatch(m);
  const title = switchable
    ? `<button type="button" class="match-switch" id="match-date" aria-haspopup="dialog">${esc(switchLabel)}<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`
    : `<h1 id="match-date">${esc(switchLabel)}</h1>`;
  const rel = relativeLabel(m.date);
  const notesBtn = canEdit ? '<button type="button" class="btn" id="btn-notes">Notas</button>' : '';
  const notesBody = notesText ? `<p class="match-notes-text">${esc(m.notes)}</p>` : '';
  const notesBlock = (notesBtn || notesBody)
    ? `<div class="match-notes" id="match-notes">${notesBody}${notesBtn}</div>`
    : '';
  if (!replaceView(`
    <section class="detail-head">
      ${title}
      <div class="when" id="match-when">${rel ? `<span class="badge">${esc(rel)}</span>` : ''}${m.cancelled ? '<span class="badge bad">Cancelado</span>' : ''}<span class="match-hour">${esc(hour)} <span class="match-price-bit">(<span id="match-price">${esc(priceText)}</span>)</span></span></div>
      <p class="hint" id="match-place">${detailPlaceLine(m)}</p>
      ${m.note ? `<div class="note">📝 ${esc(m.note)}</div>` : ''}
      ${m.cancelled ? '<p class="match-cancelled" id="match-cancelled">Partido cancelado. No se mandan recordatorios ni se puede confirmar.</p>' : ''}
      ${notesBlock}
      <div class="meta"><strong id="slot-count">${everyone.length}/${cap}</strong><div class="bar"><i style="width:${Math.min(100, (everyone.length / cap) * 100)}%"></i></div><span class="muted small">${full ? '¡Completo!' : `Faltan ${cap - everyone.length}`}</span></div>
      <div class="confirm-sum" id="confirm-sum">${esc(facts.confirm)}</div>
      <div class="mine-line" id="mine-added">${esc(facts.added)}</div>
      <div class="mine-line" id="mine-cash">${esc(facts.cash)}</div>
      <div class="mine-line" id="mine-transfer">${esc(facts.transfer)}</div>
      <div class="detail-tools">
        <button class="btn" id="btn-copy">${ICON.copy}Copiar lista</button>
        ${canEdit ? `<button class="btn" id="btn-edit-match">${ICON.edit}Editar</button>` : ''}
        ${canDelete(m, who.uid) && signed === 0 ? `<button class="btn danger" id="btn-del-match">${ICON.trash}Borrar</button>` : ''}
      </div>
      ${canEdit && m.cancelled ? '<button type="button" class="btn block" id="btn-reactivate-match">Reactivar partido</button>' : ''}
      <button type="button" class="btn block" id="btn-teams">Equipos${teamCount ? ` · ${assigned.bib.length}-${assigned.plain.length}` : ''}</button>
    </section>
    ${readOnly ? '<p class="hint" id="match-readonly">Solo lectura. No podés anotar ni cambiar este partido.</p>' : ''}
    ${reminderBanners([m])}
    ${readOnly || m.cancelled ? '' : '<button type="button" class="btn block remind-open" id="btn-remind">Enviar recordatorios</button>'}
    <h2 class="section">Jugadores</h2>
    <ul class="slots" id="slots">${slots.join('')}</ul>
    ${waitingSection(m, everyone.length >= cap, readOnly)}
    ${usualSection(m)}
    ${noPlaySection(m, readOnly)}
    ${canEdit && signed > 0 && !m.cancelled && !matchAlreadyPlayed(m) ? '<button type="button" class="btn danger solid block" id="btn-cancel-match">Cancelar partido</button>' : ''}
    ${showMatchCompensation(m) ? matchCompensationHtml(m.date) : ''}
    <div class="actionbar"><div class="actionbar-inner match-actions">
      <button type="button" class="btn share-btn" id="btn-share" aria-label="Compartir lista">${ICON.share}</button>
      ${readOnly ? '' : `<button type="button" class="btn add-choice" id="btn-add-wait" ${block ? 'disabled' : ''}>${block ? esc(block) : 'Anotar en lista de espera'}</button>
      <button type="button" class="btn primary add-choice" id="btn-add-player" ${block ? 'disabled' : ''}>${block ? esc(block) : `${ICON.plus}Agregar jugador`}</button>`}
    </div></div>`)) return;

  if ($('#btn-remind')) $('#btn-remind').onclick = () => openReminders(m);
  bindReminderBanners();
  bindCompensation($('#view'));
  if ($('#btn-add-player')) $('#btn-add-player').onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!block) openAddPlayer(m);
  };
  if ($('#btn-add-wait')) $('#btn-add-wait').onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!block) openAddPlayer(m, { waiting: true });
  };
  const onRow = (e) => {
    const spot = e.target.closest('[data-confirm-spot]');
    if (spot) {
      const player = app.players.find((p) => p.id === spot.dataset.confirmSpot);
      if (player) clearReservedSpot(player);
      return;
    }
    const promote = e.target.closest('[data-promote]');
    if (promote) return promoteToMatch(m, app.players.find((p) => p.id === promote.dataset.promote), promote.disabled);
  };
  const noPlayList = $('#no-play-list');
  if (noPlayList) noPlayList.onclick = (e) => {
    if (claimActionBarTap(e, m)) return;
    const back = e.target.closest('[data-no-play-back]');
    if (back) return restoreNoPlay(m, app.players.find((p) => p.id === back.dataset.noPlayBack));
    const menu = e.target.closest('[data-menu]');
    if (menu) return openPlayerMenu(m, app.players.find((p) => p.id === menu.dataset.menu));
    const whoBtn = e.target.closest('[data-profile]');
    if (whoBtn) return openPlayerProfile(app.players.find((p) => p.id === whoBtn.dataset.profile), m.id);
  };
  $('#wait-list').onclick = (e) => {
    if (claimActionBarTap(e, m)) return;
    onRow(e);
    const up = e.target.closest('[data-wait-up]');
    if (up) return moveWait(m.id, up.dataset.waitUp, -1, up.disabled);
    const down = e.target.closest('[data-wait-down]');
    if (down) return moveWait(m.id, down.dataset.waitDown, 1, down.disabled);
    const menu = e.target.closest('[data-menu]');
    if (menu) return openPlayerMenu(m, app.players.find((p) => p.id === menu.dataset.menu));
    const who = e.target.closest('[data-profile]');
    if (who) return openPlayerProfile(app.players.find((p) => p.id === who.dataset.profile), m.id);
  };
  $('#slots').onclick = (e) => {
    if (claimActionBarTap(e, m)) return;
    onRow(e);
    const pay = e.target.closest('[data-pay]');
    if (pay) return openPaymentForm(m, app.players.find((p) => p.id === pay.dataset.pay));
    const free = e.target.closest('[data-free]');
    if (free) return openAddPlayer(m);
    const menu = e.target.closest('[data-menu]');
    if (menu) return openPlayerMenu(m, app.players.find((p) => p.id === menu.dataset.menu));
    const who = e.target.closest('[data-profile]');
    if (who) return openPlayerProfile(app.players.find((p) => p.id === who.dataset.profile), m.id);
  };
  $('#btn-copy').onclick = () => copyText(listText(m)).then((ok) => toast(ok ? 'Lista copiada' : 'No se pudo copiar'));
  $('#btn-share').onclick = () => shareText(listText(m));
  $('#btn-teams').onclick = () => { location.hash = `#/partido/${encodeURIComponent(m.id)}/equipos`; };
  if ($('#btn-edit-match')) $('#btn-edit-match').onclick = () => openMatchForm(m);
  if ($('#btn-notes')) $('#btn-notes').onclick = () => openNotes(m);
  const switchBtn = $('#match-date');
  if (switchBtn && switchBtn.tagName === 'BUTTON') switchBtn.onclick = () => openMatchSwitch(m);
  if ($('#btn-cancel-match')) $('#btn-cancel-match').onclick = async () => {
    if (!(await askConfirm('¿Seguro que querés cancelar el partido?', { danger: true }))) return;
    openCancel(m);
  };
  if ($('#btn-reactivate-match')) $('#btn-reactivate-match').onclick = () => reactivateMatch(m);
  if ($('#btn-del-match')) $('#btn-del-match').onclick = async () => {
    if (!(await askConfirm(`¿Borrar el partido del ${labelDate(m.date)} ${m.time} hs?`, { danger: true }))) return;
    run(app.store.deleteMatch(m.id), 'Partido borrado');
    location.hash = '#/';
  };
}

/* ───────── textos ───────── */
function confirmUrlFor(m, p) {
  if (isShortCode(p?.shortCode)) return shortConfirmUrl(p.shortCode);
  if (p?.confirmToken && p?.id) return confirmPageUrl({ matchId: m.id, playerId: p.id, token: p.confirmToken });
  return '';
}
function placeLine(m) {
  const court = courtLabel(m);
  return court ? `${placeOf(m)} (${court})` : placeOf(m);
}
function waMessage(m, p) {
  return attendanceMessage({
    player: p,
    roster: app.roster,
    when: attendanceWhen(m?.date),
    time: m?.time,
    confirmUrl: confirmUrlFor(m, p),
  });
}
function listText(m) {
  const ps = playersOf(m.id);
  const cap = capOf(m);
  const lines = [`⚽ ${footballLabel(m)} · ${placeOf(m)}`, `📅 ${capitalize(labelDate(m.date))} · ${m.time} hs`];
  if (courtLabel(m)) lines.push(courtLabel(m));
  if (Number.isInteger(m.price)) lines.push(`Valor: ${formatARS(m.price)}`);
  if (m.note) lines.push(`📝 ${m.note}`);
  if (m.cancelled) lines.push('Cancelado');
  if (String(m.notes || '').trim()) lines.push(String(m.notes).trim());
  lines.push('');
  for (let i = 0; i < Math.max(cap, ps.length); i++) {
    const p = ps[i];
    const pay = p ? paymentStatusText(p) : '';
    const hold = p?.tentative === true ? 'a confirmar' : '';
    const bits = [pay, hold].filter(Boolean).join(' · ');
    lines.push(`${i + 1}. ${p ? shownName(p) + friendSuffix(p) : ''}${bits ? ` — ${bits}` : ''}`);
  }
  lines.push('', ps.length >= cap ? '✅ ¡Completo!' : `Faltan ${cap - ps.length}`);
  const collected = collectedLine(ps);
  if (collected) lines.push(collected);
  const summary = confirmSummary(ps);
  if (ps.length) lines.push(summary.text);
  const wait = waitingOf(m.id);
  const aside = noPlayOf(m.id);
  if (aside.length) {
    lines.push('', 'No jugó pero pagó:');
    aside.forEach((p, i) => {
      const pay = paymentStatusText(p);
      lines.push(`${i + 1}. ${shownName(p)}${friendSuffix(p)}${pay ? ` — ${pay}` : ''}`);
    });
  }
  if (wait.length) {
    lines.push('', 'Lista de espera:');
    wait.forEach((p, i) => {
      const pay = paymentStatusText(p);
      lines.push(`${i + 1}. ${shownName(p)}${friendSuffix(p)}${pay ? ` — ${pay}` : ''}`);
    });
  }
  return lines.join('\n');
}

function waitingSection(m, full, readOnly) {
  const allWait = waitingOf(m.id);
  const wait = allWait;
  const rows = wait.map((p, i) => {
    const idx = allWait.findIndex((item) => item.id === p.id);
    const first = idx <= 0;
    const last = idx === allWait.length - 1;
    return `
      <li class="slot wait${inviteClass(p)}${app.revealPlayerId === p.id ? ' just-added' : ''}" data-player="${esc(p.id)}">
        <div class="arrows">
          <button type="button" class="arrow-btn" data-wait-up="${esc(p.id)}" ${first ? 'disabled' : ''} aria-label="Subir prioridad de ${esc(p.name)}">↑</button>
          <button type="button" class="arrow-btn" data-wait-down="${esc(p.id)}" ${last ? 'disabled' : ''} aria-label="Bajar prioridad de ${esc(p.name)}">↓</button>
        </div>
        <span class="n">${i + 1}</span>
        <button type="button" class="who" data-profile="${esc(p.id)}">
          ${nameRow(p)}
          <div class="sub">${phoneSub(p)}
            ${friendTag(p)}${addedTag(p)}${signedUpTag(p)}${confirmTag(p)}</div>
          ${payMarkup(p)}
        </button>
        ${readOnly ? '' : `<button type="button" class="btn promote-btn" data-promote="${esc(p.id)}" ${full ? 'disabled' : ''} aria-label="Subir a ${esc(p.name)} al partido">Subir al partido</button>`}
        ${waButton(p, waMessage(m, p))}
        <button type="button" class="more-btn" data-menu="${esc(p.id)}" aria-label="Opciones de ${esc(p.name)}">${ICON.more}</button>
      </li>`;
  }).join('');
  return `
    <h2 class="section">Lista de espera</h2>
    ${wait.length ? `<ul class="slots" id="wait-list">${rows}</ul>` : '<p class="empty-wait" id="wait-list">Nadie en espera. Los que se anotan acá quedan al final, en orden de llegada.</p>'}`;
}

function noPlaySection(m, readOnly) {
  const rows = noPlayOf(m.id);
  if (!rows.length) return '';
  const full = playersOf(m.id).length >= capOf(m);
  const items = rows.map((p, i) => `
      <li class="slot wait${inviteClass(p)}${app.revealPlayerId === p.id ? ' just-added' : ''}" data-player="${esc(p.id)}">
        <span class="n">${i + 1}</span>
        <button type="button" class="who" data-profile="${esc(p.id)}">
          ${nameRow(p)}
          <div class="sub">${phoneSub(p)}
            ${friendTag(p)}${addedTag(p)}${signedUpTag(p)}</div>
          ${payMarkup(p)}
        </button>
        ${readOnly ? '' : `<button type="button" class="btn promote-btn" data-no-play-back="${esc(p.id)}" ${full ? 'disabled' : ''}>Volver al partido</button>`}
        <button type="button" class="more-btn" data-menu="${esc(p.id)}" aria-label="Opciones de ${esc(p.name)}">${ICON.more}</button>
      </li>`).join('');
  return `
    <h2 class="section" id="no-play-title">No jugó pero pagó</h2>
    <ul class="slots" id="no-play-list">${items}</ul>`;
}

function confirmTag(p) {
  const s = confirmStatus(p);
  if (!s) return '';
  if (p?.tentative === true) {
    const note = s.note ? `<span class="reserved-free">${esc(s.note)}</span>` : '';
    return `<span class="reserved-badge${s.note ? ' declined' : ''}">${esc(s.text)}</span>${note}`;
  }
  return `<span class="confirm-tag ${s.cls}">${s.text}</span>`;
}
function confirmSpotButton(p) {
  if (p?.tentative !== true) return '';
  return `<button type="button" class="btn confirm-spot" data-confirm-spot="${esc(p.id)}">Confirmar lugar</button>`;
}
function clearReservedSpot(player) {
  if (!player || player.tentative !== true) return;
  run(app.store.clearTentative(player.id), 'Lugar confirmado');
}

const REMINDER_BANNER = 'Faltan 2 horas: mandá los recordatorios';

function myReminderPlayers(matchId) {
  return playersForOrganizer(playersOf(matchId), app.who);
}

function reminderBanners(matches) {
  const now = Date.now();
  const due = (matches || []).filter((m) => needsReminderBanner(m, myReminderPlayers(m.id), now));
  if (!due.length) return '';
  return `<div class="remind-banners">${due.map((m) => {
    const prog = reminderProgress(myReminderPlayers(m.id));
    return `<button type="button" class="remind-banner" data-remind-banner="${esc(m.id)}">
      <strong>${REMINDER_BANNER}</strong>
      <small>${esc(capitalize(labelDate(m.date)))} · ${esc(m.time || '--:--')} hs · ${prog.sent} de ${prog.total} enviados</small>
    </button>`;
  }).join('')}</div>`;
}

function bindReminderBanners() {
  $('#view').querySelectorAll('[data-remind-banner]').forEach((btn) => {
    btn.onclick = () => {
      const match = matchById(btn.dataset.remindBanner);
      if (match) openReminders(match);
    };
  });
}

async function openReminders(m) {
  if (m?.cancelled === true) { toast('El partido está cancelado. No se mandan recordatorios.'); return; }
  const everyone = playersOf(m.id);
  if (!everyone.length) { toast('No hay jugadores para avisar'); return; }
  let showAll = false;
  openSheet(`<h3>Enviar recordatorios</h3><p class="hint">Armando los links…</p>`);
  const tokens = new Map();
  const codes = new Map();
  try {
    for (const p of everyone) {
      if (!p.phone) continue;
      tokens.set(p.id, await app.store.ensureConfirmToken(p.id));
      const code = await app.store.ensureShortLink(p.id);
      if (code) codes.set(p.id, code);
    }
  } catch (e) {
    console.error(e);
    toast('No se pudieron armar los links');
    closeSheet();
    return;
  }
  const fresh = everyone.map((p) => ({
    ...p,
    confirmToken: tokens.get(p.id) || p.confirmToken,
    shortCode: codes.get(p.id) || p.shortCode,
  }));
  const linkById = new Map(reminderLinks({
    match: m, players: fresh, venue: placeOf(m), roster: app.roster,
  }).map((row) => [row.id, row]));
  const externalById = new Map();
  const hrefFor = (link) => {
    const external = link ? externalById.get(link.id) : '';
    if (!link || !external) return link?.waUrl || '';
    return waSendUrl({ phone: link.phone, text: link.text.split(link.confirmUrl).join(external) });
  };
  for (const p of fresh) {
    if (!isShortCode(p.shortCode)) continue;
    void resolveExternalShort(p.shortCode).then((url) => {
      if (!url) return;
      externalById.set(p.id, url);
      const link = linkById.get(p.id);
      const a = document.querySelector(`#remind-list a[data-send="${CSS.escape(p.id)}"]`);
      if (a && link) a.href = hrefFor(link);
    });
  }
  const paint = () => {
    const visible = showAll ? fresh : playersForOrganizer(fresh, app.who);
    const prog = reminderProgress(visible);
    const rows = visible.map((p) => {
      const link = linkById.get(p.id);
      if (phoneHidden(p)) {
        return `<li class="remind-row"><div class="who"><div class="name${suspendedClass(p)}">${esc(p.name)}</div><div class="sub private-wa">${esc(PRIVATE_WA_TEXT)}</div></div></li>`;
      }
      if (!link) {
        return `<li class="remind-row"><div class="who"><div class="name${suspendedClass(p)}">${esc(p.name)}</div><div class="sub">Sin número de WhatsApp</div></div><button type="button" class="btn" data-remind-phone="${esc(p.id)}">Cargar WhatsApp</button></li>`;
      }
      const sent = !!p.reminderSentAt;
      return `<li class="remind-row" data-remind="${esc(p.id)}">
        <div class="who"><div class="name${suspendedClass(p)}">${esc(p.name)}</div><div class="sub">${sent ? '<span class="sent">Enviado</span>' : 'Listo para enviar'}</div></div>
        <a class="btn primary" href="${esc(hrefFor(link))}" target="_blank" rel="noopener" data-send="${esc(p.id)}">${sent ? 'Enviar de nuevo' : 'Enviar'}</a>
      </li>`;
    }).join('');
    openSheet(`
      <h3>Enviar recordatorios</h3>
      <p class="hint">${esc(capitalize(labelDate(m.date)))} · ${esc(m.time)} hs. Cada Enviar abre WhatsApp con el mensaje y el link de esa persona. Hay que tocar enviar en el chat: no se manda solo.</p>
      <div class="chips" id="remind-scope">
        <button type="button" class="btn chip ${showAll ? '' : 'on'}" data-remind-scope="mine">Mis jugadores</button>
        <button type="button" class="btn chip ${showAll ? 'on' : ''}" data-remind-scope="all">Todos</button>
      </div>
      <p class="hint" id="remind-prog">${prog.sent} de ${prog.total} enviados${showAll ? ' · todos' : ' · los que anotaste'}</p>
      ${rows ? `<ul class="remind-list" id="remind-list">${rows}</ul>` : '<p class="empty-wait" id="remind-list">No anotaste a nadie en este partido.</p>'}
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cerrar</button></div>`);
    $('#remind-scope').onclick = (e) => {
      const btn = e.target.closest('[data-remind-scope]');
      if (!btn) return;
      const next = btn.dataset.remindScope === 'all';
      if (next === showAll) return;
      showAll = next;
      paint();
    };
    const list = $('#remind-list');
    if (!list) return;
    list.addEventListener('click', (e) => {
      const addPhone = e.target.closest('[data-remind-phone]');
      if (addPhone) {
        const person = fresh.find((p) => p.id === addPhone.dataset.remindPhone);
        if (!person) return;
        closeSheet();
        app.wantPhoneForm = true;
        openPlayerProfile(person, m.id);
        return;
      }
      const link = e.target.closest('[data-send]');
      if (!link) return;
      const id = link.dataset.send;
      const person = fresh.find((p) => p.id === id);
      if (person) person.reminderSentAt = Date.now();
      const row = link.closest('.remind-row');
      const sub = row?.querySelector('.sub');
      if (sub) sub.innerHTML = '<span class="sent">Enviado</span>';
      link.textContent = 'Enviar de nuevo';
      const line = $('#remind-prog');
      if (line) {
        const nowProg = reminderProgress(showAll ? fresh : playersForOrganizer(fresh, app.who));
        line.textContent = `${nowProg.sent} de ${nowProg.total} enviados${showAll ? ' · todos' : ' · los que anotaste'}`;
      }
      run(app.store.markReminderSent(id));
    });
  };
  paint();
}

function moveWait(matchId, id, dir, disabled) {
  if (disabled) return;
  const updates = moveWaiting(waitingOf(matchId), id, dir);
  if (!updates.length) return;
  run(app.store.setWaitOrders(updates));
}

function promoteToMatch(m, player, disabled) {
  if (disabled || !player || addBlock(m)) return;
  const cap = capOf(m);
  if (playersOf(m.id).length >= cap) return;
  const job = (async () => {
    await app.store.promoteFromWaiting(player.id);
    const taken = await applyAutoCredit(player.id);
    toast(taken > 0 ? `${player.name} pasó al partido. Se usó ${formatARS(taken)} del saldo.` : `${player.name} pasó al partido`);
    await offerPromotionWhatsApp(player, m);
  })();
  run(job);
}

function openNotes(m) {
  openSheet(`
    <form id="notes-form" novalidate>
      <h3>Notas</h3>
      <p class="hint">Motivo de una cancelación, o algo que pasó en el partido. Lo ven quienes pueden ver este partido.</p>
      <label class="field"><span>Notas</span><textarea name="notes" maxlength="2000" autofocus>${esc(m.notes || '')}</textarea></label>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  $('#notes-form').onsubmit = (e) => {
    e.preventDefault();
    const notes = String(new FormData(e.target).get('notes') || '').slice(0, 2000);
    closeSheet();
    run(app.store.updateMatch(m.id, { notes }, app.who), 'Notas guardadas');
  };
}

function openCancel(m) {
  if (!m || matchAlreadyPlayed(m)) return;
  const signed = playersOf(m.id).length + waitingOf(m.id).length + noPlayOf(m.id).length;
  openSheet(`
    <form id="cancel-form" novalidate>
      <h3>Cancelar partido</h3>
      <p class="hint">Queda cancelado, con sus ${signed} jugadores. No se borra. No se mandan recordatorios y el link de confirmación deja de pedir sí o no.</p>
      <p class="hint">Si querés, escribí el motivo en las notas.</p>
      <label class="field"><span>Notas</span><textarea id="cancel-notes" name="notes" maxlength="2000">${esc(m.notes || '')}</textarea></label>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Volver</button><button class="btn danger" type="submit">Cancelar partido</button></div>
    </form>`);
  $('#cancel-form').onsubmit = (e) => {
    e.preventDefault();
    const notes = String(new FormData(e.target).get('notes') || '').slice(0, 2000);
    closeSheet();
    const next = { ...m, notes, cancelled: true };
    const job = (async () => {
      await settlePromoForMatch(m.id, { leaving: true });
      await app.store.updateMatch(m.id, {
        cancelled: true,
        cancelledAt: Date.now(),
        cancelledBy: actor().uid,
        notes,
      }, app.who);
      await offerCancelWhatsApp(next);
    })();
    run(job, 'Partido cancelado');
  };
}

async function reactivateMatch(m) {
  if (!(await askConfirm('¿Volver a activar este partido?'))) return;
  run((async () => {
    await app.store.updateMatch(m.id, { cancelled: false }, app.who);
    await settlePromoForMatch(m.id, { joining: true });
  })(), 'Partido reactivado');
}

async function offerCancelWhatsApp(match) {
  const people = [...playersOf(match.id), ...waitingOf(match.id)];
  const links = cancelLinks({ match, players: people, venue: placeOf(match) });
  if (!links.length) {
    toast(people.some(phoneHidden) ? PRIVATE_WA_TEXT : 'Nadie tiene WhatsApp para avisar la cancelación.');
    return;
  }
  if (!(await askConfirm('¿Avisar por WhatsApp a los jugadores que se canceló?'))) return;
  const rows = links.map((link) => `
    <li class="remind-row">
      <div class="who"><div class="name">${esc(link.name)}</div></div>
      <a class="btn primary" href="${esc(link.waUrl)}" target="_blank" rel="noopener">Avisar</a>
    </li>`).join('');
  openSheet(`
    <h3>Avisar la cancelación</h3>
    <p class="hint">Cada Avisar abre WhatsApp con el mensaje. No se manda solo y no incluye el link para confirmar.</p>
    <ul class="remind-list" id="cancel-links">${rows}</ul>
    <div class="sheet-actions"><button type="button" class="btn" data-close>Cerrar</button></div>`);
}

async function offerPromotionWhatsApp(player, match) {
  if (phoneHidden(player)) { toast(PRIVATE_WA_TEXT); return; }
  const phone = String(player?.phone || '').trim();
  if (!phone) {
    toast(`${player.name} no tiene WhatsApp para avisarle. Lo podés cargar en el perfil.`);
    return;
  }
  const token = await app.store.ensureConfirmToken(player.id);
  if (!(await askYesNo(`¿Avisarle por WhatsApp a ${player.name} que subió al partido?`))) return;
  const pending = window.open('about:blank', '_blank');
  const code = await app.store.ensureShortLink(player.id);
  const external = isShortCode(code) ? await resolveExternalShort(code) : '';
  const confirmUrl = external || (isShortCode(code)
    ? shortConfirmUrl(code)
    : confirmPageUrl({ matchId: match.id, playerId: player.id, token }));
  const text = promotionMessage({ player, match, venue: placeOf(match), confirmUrl });
  placeWa(pending, waSendUrl({ phone, text }));
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok;
  }
}
function shareRosterId(player) {
  const listed = String(player?.rosterId || '').trim();
  if (listed) return listed;
  const mine = rosterForOrganizer(app.roster, actor());
  const phone = canonicalPhone(player?.phone || '');
  if (phone) {
    const found = rosterByPhone(mine, phone);
    if (found?.id) return found.id;
  }
  const key = String(player?.phoneKey || '').trim();
  if (key) {
    const found = rosterByIdentity(mine, key);
    if (found?.id) return found.id;
  }
  return '';
}
function playerShareButton(id) {
  return `<button type="button" class="icon-btn player-share" id="${id}" aria-label="Copiar enlace">${ICON.shareNodes}</button>`;
}
const playerShortJobs = new Map();
function resolvePlayerShort(longUrl) {
  const pending = playerShortJobs.get(longUrl);
  if (pending) return pending;
  const job = (async () => {
    const got = await shortenExternal(longUrl);
    return got?.shortUrl || '';
  })();
  playerShortJobs.set(longUrl, job);
  job.then((url) => { if (!url) playerShortJobs.delete(longUrl); }, () => playerShortJobs.delete(longUrl));
  return job;
}
async function copyPlayerLink(rosterId) {
  const url = playerLink(rosterId);
  if (!url) {
    openSheet(`<h3>Enlace</h3><p>Este jugador todavía no está en Jugadores.</p><div class="sheet-actions"><button type="button" class="btn" data-close>Cerrar</button></div>`);
    return;
  }
  const short = await resolvePlayerShort(url);
  const shareUrl = short || url;
  if (await copyText(shareUrl)) { toast('Enlace copiado'); return; }
  openSheet(`<h3>Enlace</h3><p class="hint">No se pudo copiar. Seleccioná el enlace.</p><label class="field"><input id="player-link" readonly value="${esc(shareUrl)}"></label><div class="sheet-actions"><button type="button" class="btn" data-close>Cerrar</button></div>`);
  const input = $('#player-link');
  if (input) input.focus();
}
async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const ok = await copyText(text);
  toast(ok ? 'Lista copiada. Pegala en el grupo.' : 'No se pudo compartir');
  openWa({ text });
}
async function shareApp() {
  const text = appShareMessage();
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Mis Partidos', text, url: appInstallUrl() });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  const ok = await copyText(text);
  toast(ok ? 'Link copiado' : 'No se pudo copiar');
  openWa({ text });
}

/* ───────── sheet (dialog) ───────── */
const sheet = $('#sheet');
const tabbar = $('#tabbar');
const tabSlot = $('#tab-slot');
let sheetLocked = false;
function restoreTabs() {
  if (!tabbar || !tabSlot || tabbar.parentElement === tabSlot) return;
  tabSlot.append(tabbar);
  tabSlot.style.minHeight = '';
}
/* Mientras hay una hoja abierta, las pestañas viven dentro del diálogo
   para seguir tocables. La hoja queda debajo y no las tapa. */
function liftTabs() {
  if (!tabbar || !sheet.open) return;
  placeBars();
  if (tabbar.parentElement === sheet) return;
  if (tabSlot) tabSlot.style.minHeight = `${tabbar.offsetHeight}px`;
  sheet.prepend(tabbar);
  placeBars();
}
function openSheet(html, { locked = false } = {}) {
  sheetLocked = locked;
  restoreTabs();
  sheet.innerHTML = `<div class="sheet-body">${html}</div>`;
  if (!sheet.open) sheet.showModal();
  liftTabs();
  const first = sheet.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 50);
  return sheet;
}
/** Buscar guardados con el teclado abierto: esconder el pie para dejar ver los resultados. */
function rosterSearchKeyboard(form, inset, viewHeight) {
  if (!form || form.id !== 'player-form') return false;
  if (document.activeElement?.id !== 'roster-find') return false;
  if (inset > 60) return true;
  if (!window.visualViewport) return true;
  const base = Number(form.dataset.fullHeight || 0);
  return base > 0 && viewHeight < base - 80;
}
/** Sube la hoja de pago cuando el teclado achica la zona visible. */
function syncPayDock(metrics) {
  const form = document.querySelector('#pay-form') || document.querySelector('#player-form');
  const body = form?.closest('.sheet-body');
  if (!body) return null;
  const vv = window.visualViewport;
  const innerHeight = metrics?.innerHeight ?? window.innerHeight;
  const viewHeight = metrics?.viewHeight ?? vv?.height ?? innerHeight;
  const offsetTop = metrics?.offsetTop ?? vv?.offsetTop ?? 0;
  if (form?.id === 'player-form' && !form.dataset.fullHeight) {
    form.dataset.fullHeight = String(Math.round(vv?.height || window.innerHeight));
  }
  const root = getComputedStyle(document.documentElement);
  const header = parseFloat(root.getPropertyValue('--header-h')) || document.querySelector('.topbar')?.offsetHeight || 64;
  const tabs = parseFloat(root.getPropertyValue('--tabbar-h')) || tabbar?.offsetHeight || 56;
  const inset = Math.max(0, Math.round(innerHeight - (offsetTop + viewHeight)));
  const search = rosterSearchKeyboard(form, inset, viewHeight);
  form.classList.toggle('search-keyboard', search);
  const maxHeight = Math.max(220, Math.round(viewHeight - header - tabs - (search ? 0 : 12)));
  if (inset > 0) {
    body.style.marginBottom = `${inset}px`;
    body.style.maxHeight = `${maxHeight}px`;
  } else {
    body.style.marginBottom = '';
    body.style.maxHeight = '';
  }
  const scroller = form.querySelector('#pay-scroll, #player-scroll');
  const hits = form.querySelector('#roster-hits');
  const active = document.activeElement;
  if (search && scroller) {
    const label = form.querySelector('#roster-find')?.closest('label');
    if (label) scroller.scrollTop += label.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 2;
    if (hits) {
      const fieldBottom = label ? label.getBoundingClientRect().bottom : body.getBoundingClientRect().top;
      const room = Math.floor(body.getBoundingClientRect().bottom - fieldBottom - 8);
      hits.style.maxHeight = `${Math.max(96, room)}px`;
    }
  } else if (hits) {
    hits.style.maxHeight = '';
  }
  if (!search && scroller && active && scroller.contains(active) && active !== scroller) {
    const box = active.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    if (box.bottom > view.bottom - 8) scroller.scrollTop += box.bottom - view.bottom + 16;
    else if (box.top < view.top + 8) scroller.scrollTop -= view.top - box.top + 16;
  }
  return { inset, maxHeight, search };
}
function bindPayDock() {
  app.syncPayDock = syncPayDock;
  syncPayDock();
  const scroller = document.querySelector('#pay-scroll, #player-scroll');
  if (scroller && !scroller.dataset.dock) {
    scroller.dataset.dock = '1';
    scroller.addEventListener('focusin', () => syncPayDock());
    scroller.addEventListener('focusout', () => setTimeout(() => syncPayDock(), 0));
  }
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => syncPayDock());
  window.visualViewport.addEventListener('scroll', () => syncPayDock());
}
function closeSheet() { sheetLocked = false; if (sheet.open) sheet.close(); }
sheet.addEventListener('close', () => {
  const body = sheet.querySelector('.sheet-body');
  if (!body) return;
  body.style.marginBottom = '';
  body.style.maxHeight = '';
});
if (tabbar) tabbar.addEventListener('click', (e) => {
  if (!app.session?.user) { e.preventDefault(); return; }
  const link = e.target.closest('a[href]');
  if (!link || !sheet.open) return;
  e.preventDefault();
  const href = link.getAttribute('href');
  closeSheet();
  if (href && location.hash !== href) location.hash = href;
});
sheet.addEventListener('cancel', (e) => { if (sheetLocked) e.preventDefault(); });
sheet.addEventListener('click', (e) => {
  if (e.target === sheet && !sheetLocked) closeSheet();
  if (e.target.closest('[data-close]')) closeSheet();
});

function openWa({ phone = '', text = '' } = {}) {
  window.open(waSendUrl({ phone, text }), '_blank', 'noopener');
}

const externalShortJobs = new Map();
function resolveExternalShort(code) {
  if (!isShortCode(code)) return Promise.resolve('');
  const pending = externalShortJobs.get(code);
  if (pending) return pending;
  const job = (async () => {
    const cached = await app.store.readExternalShort(code);
    if (cached?.shortUrl) return cached.shortUrl;
    const got = await shortenExternal(shortConfirmUrl(code));
    if (!got?.shortUrl) return '';
    await app.store.saveExternalShort(code, got);
    return got.shortUrl;
  })();
  externalShortJobs.set(code, job);
  job.then((url) => { if (!url) externalShortJobs.delete(code); }, () => externalShortJobs.delete(code));
  return job;
}

function placeWa(win, url) {
  if (win && !win.closed) {
    win.location.replace(url);
    return;
  }
  window.location.href = url;
}

function bindExternalShortClicks() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a.wa-btn[data-short-code]');
    if (!a) return;
    const code = a.dataset.shortCode || '';
    if (!isShortCode(code)) return;
    e.preventDefault();
    const pending = window.open('about:blank', '_blank');
    const phone = a.dataset.waPhone || '';
    const text = a.dataset.waText || '';
    const house = shortConfirmUrl(code);
    void resolveExternalShort(code).then((external) => {
      const next = external ? text.split(house).join(external) : text;
      placeWa(pending, waSendUrl({ phone, text: next }));
    });
  });
}

/* Ajustes */
function usageMeterHtml(doc) {
  const totals = usageTotals(doc);
  const rows = [
    ['Lecturas', totals.reads, 50000],
    ['Escrituras', totals.writes, 20000],
    ['Borrados', totals.deletes, 20000],
  ];
  const bars = rows.map(([label, used, limit]) => {
    const level = usageLevel(used, limit);
    const width = Math.max(0, Math.min(100, limit ? Math.round((used / limit) * 100) : 0));
    return `<div class="usage-row ${level}"><span>${esc(label)}</span><div class="usage-bar"><i style="width:${width}%"></i></div></div>`;
  }).join('');
  return `<section id="usage-meter"><p class="hint">Estimación. Cada teléfono suma lo que contó hoy; puede ir unos minutos atrás.</p><p id="usage-line">${esc(usageSummary(doc))}</p>${bars}</section>`;
}
function openSettings() {
  if (!app.session?.user) return;
  const demo = app.session?.mode !== 'firebase';
  openSheet(`
    <h3>Ajustes</h3>
    ${demo ? '<p class="hint">Modo demo: los datos se guardan solo en este dispositivo.</p>' : ''}
    <p class="hint" id="set-who">Entraste como ${esc(app.who || '—')} · ${app.role === 'admin' ? 'administrador' : 'organizador'}.</p>
    ${app.role === 'admin' ? usageMeterHtml(app.usage) : ''}
    <form id="price-form" novalidate>
      <p class="hint">Precios. Los ven todos al toque.</p>
      ${app.pricesError ? `<p class="hint">${esc(app.pricesError)}</p>` : ''}
      <label class="field"><span>Un partido</span><input name="matchPrice" inputmode="numeric" autocomplete="off" value="${livePrices().matchPrice}"></label>
      <label class="field"><span>Promo 2 partidos</span><input name="promo2Price" inputmode="numeric" autocomplete="off" value="${livePrices().promo2Price}"></label>
      <label class="field"><span>Promo 3 partidos</span><input name="promo3Price" inputmode="numeric" autocomplete="off" value="${livePrices().promo3Price}"></label>
      <div class="err" id="price-err"></div>
      <button class="btn" type="submit">Guardar precios</button>
    </form>
    <label class="field" id="text-size-field"><span>Tamaño del texto</span>
      <select id="set-text-size" aria-label="Tamaño del texto">
        ${TEXT_SIZES.map((step, i) => `<option value="${i}"${i === readTextSize() ? ' selected' : ''}>${esc(step.label)}</option>`).join('')}
      </select>
    </label>
    <label class="field" id="theme-field"><span>Tema</span>
      <select id="set-theme" aria-label="Tema">
        <option value="light"${readTheme() === 'light' ? ' selected' : ''}>Claro</option>
        <option value="dark"${readTheme() === 'dark' ? ' selected' : ''}>Oscuro</option>
        <option value="auto"${readTheme() === 'auto' ? ' selected' : ''}>Automático según el sistema</option>
      </select>
    </label>
    <div class="menu" id="set-sections">
      <button type="button" class="btn" id="set-share-app">Compartir app</button>
      <button type="button" class="btn" id="set-venues">Sedes</button>
      ${app.role === 'admin' ? '<a class="btn" id="set-organizers" href="#/usuarios">Organizadores</a>' : ''}
    </div>
    ${app.role === 'admin' ? `<div class="menu" id="set-db">
      <p class="hint">Base de datos</p>
      <button type="button" class="btn" id="set-backup">Hacer backup</button>
      <button type="button" class="btn" id="set-restore">Cargar base de datos desde un backup</button>
      <button type="button" class="btn danger" id="set-reset-db">Resetear base de datos</button>
    </div>` : ''}
    <label class="checkline" id="set-activity"><input type="checkbox" id="set-activity-on"${notifyEnabled() ? ' checked' : ''}><span>Notificaciones</span></label>
    <p class="hint">Cuando otro organizador anota, da de baja o crea un partido que podés ver.</p>
    <div class="menu">
      <button class="btn" id="set-notify">Aviso 2 horas antes</button>
      ${demo ? '<button class="btn danger" id="set-clear">Borrar datos de demo</button>' : ''}
      ${ACCESS_CODE ? '<button class="btn" id="set-forget">Olvidar código de acceso</button>' : ''}
      <button class="btn" id="set-logout">Cerrar sesión</button>
      <button class="btn ghost" data-close>Cerrar</button>
    </div>
    ${isTrialPage() ? '<p class="hint" id="trial-settings">Versión de prueba. El backup se carga en esta copia, no en producción.</p>' : ''}
    <p class="footer-note" id="app-version">Versión ${APP_VERSION}</p>`);
  $('#price-form').onsubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    const rec = priceRecord({ matchPrice: form.matchPrice.value, promo2Price: form.promo2Price.value, promo3Price: form.promo3Price.value });
    if (!rec.ok) { $('#price-err').textContent = rec.error; return; }
    $('#price-err').textContent = '';
    Promise.resolve(app.store.setPrices(rec.patch)).then(() => toast('Precios guardados')).catch((error) => {
      if (isPermissionDenied(error)) toast(PRICES_DENIED_WRITE);
      else $('#price-err').textContent = error?.message || 'No se pudieron guardar los precios.';
    });
  };
  const sizePick = $('#set-text-size');
  if (sizePick) sizePick.onchange = () => { saveTextSize(Number(sizePick.value)); syncTextSize(); };
  const themePick = $('#set-theme');
  if (themePick) themePick.onchange = () => { saveTheme(themePick.value); requestAnimationFrame(placeBars); };
  const venuesBtn = $('#set-venues');
  if (venuesBtn) venuesBtn.onclick = () => openVenues();
  const shareAppBtn = $('#set-share-app');
  if (shareAppBtn) shareAppBtn.onclick = () => { void shareApp(); };
  const backupBtn = $('#set-backup');
  if (backupBtn) backupBtn.onclick = () => openBackup();
  const restoreBtn = $('#set-restore');
  if (restoreBtn) restoreBtn.onclick = () => openRestore();
  const resetDbBtn = $('#set-reset-db');
  if (resetDbBtn) resetDbBtn.onclick = () => openResetDb();
  const users = $('#set-organizers');
  if (users) users.onclick = () => closeSheet();
  const activityToggle = $('#set-activity-on');
  if (activityToggle) activityToggle.onchange = () => {
    const uid = actor().uid;
    if (!uid) return;
    const on = activityToggle.checked === true;
    localStorage.setItem(notifyOnKey(uid), on ? '1' : '0');
    if (on) localStorage.setItem(notifySeenKey(uid), String(Date.now()));
    paintActivity();
  };
  $('#set-notify').onclick = async () => {
    if (typeof Notification === 'undefined') { toast('Este navegador no muestra avisos'); return; }
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    toast(perm === 'granted'
      ? 'Listo. Si la app está abierta cuando falten 2 horas, te avisa.'
      : 'Sin permiso no hay aviso. El cartel en la app sigue igual.');
  };
  const clr = $('#set-clear');
  if (clr) clr.onclick = async () => { if (await askConfirm('¿Borrar todos los partidos y jugadores de demo?', { danger: true })) { app.store.clearAll(); closeSheet(); toast('Datos de demo borrados'); } };
  const forget = $('#set-forget');
  if (forget) forget.onclick = () => { localStorage.removeItem(CODE_KEY); location.reload(); };
  $('#set-logout').onclick = () => {
    closeSheet();
    if (isPlayerDeepLink(location.hash)) history.replaceState(null, '', `${location.pathname}${location.search}`);
    app.session.logout();
  };
}

function saveBackupFile(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function shareBackupFile(filename, text) {
  // Chrome solo comparte ciertos tipos y .json no está: va como .txt (adentro, el mismo JSON).
  const file = new File([text], shareableBackupName(filename), { type: 'text/plain' });
  const payload = { files: [file], title: 'Backup de Mis Partidos' };
  const can = typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare(payload));
  if (can) {
    try {
      await navigator.share(payload);
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  saveBackupFile(filename, text);
  return 'downloaded';
}

function failBackup(error) {
  console.error(error);
  toast(backupSurfaceMessage(error, 'No se pudo hacer el backup.'), 7000);
}

async function currentBackupFile() {
  const when = new Date();
  const backup = await app.store.exportDatabase({ when });
  return { filename: backupFilename(when), text: JSON.stringify(backup, null, 2) };
}

function openResetDb() {
  if (app.role !== 'admin') return;
  openSheet(`
    <h3>Resetear base de datos</h3>
    <p class="backup-warn">Se borra todo lo cargado: partidos, jugadores, plantel, pagos, sedes, precios, teléfonos, links, compensaciones y el registro. Las cuentas para entrar quedan. Conviene hacer un backup antes.</p>
    <p class="hint">Si después no hay sedes, al abrir de nuevo vuelve Polideportivo Colegiales.</p>
    <div class="menu">
      <button type="button" class="btn" id="reset-go-backup">Hacer backup</button>
    </div>
    <label class="field"><span>Escribí BORRAR para confirmar</span><input id="reset-word" autocomplete="off" autocapitalize="characters"></label>
    <p class="err" id="reset-err"></p>
    <div class="menu">
      <button type="button" class="btn danger" id="reset-apply" disabled>Borrar todo</button>
      <button type="button" class="btn ghost" data-close>Cerrar</button>
    </div>`);
  const word = $('#reset-word');
  const apply = $('#reset-apply');
  word.oninput = () => { apply.disabled = word.value.trim() !== 'BORRAR'; };
  $('#reset-go-backup').onclick = () => openBackup();
  apply.onclick = () => {
    if (word.value.trim() !== 'BORRAR') return;
    apply.disabled = true;
    app.store.resetDatabase().then(() => {
      closeSheet();
      toast('Base de datos vacía');
    }).catch((error) => {
      apply.disabled = false;
      const msg = backupSurfaceMessage(error, 'No se pudo borrar.');
      $('#reset-err').textContent = msg;
      toast(msg, 7000);
    });
  };
}

function backupSummaryHtml(summary) {
  const rows = BACKUP_COLLECTIONS.map((name) => `<li><span>${esc(COLLECTION_LABELS[name])}</span><b>${summary.counts[name]}</b></li>`).join('');
  const sub = summary.subcollections ? `<li><span>Subcolecciones</span><b>${summary.subcollections}</b></li>` : '';
  return `<p class="hint">Fecha del backup: ${esc(summary.exportedAt)}</p><ul class="backup-summary">${rows}${sub}</ul>`;
}

function openRestore() {
  if (app.role !== 'admin') return;
  let parsed = null;
  openSheet(`
    <h3>Cargar base de datos desde un backup</h3>
    <p class="backup-warn">Los datos de ahora se reemplazan por los del archivo. No se puede deshacer.</p>
    <label class="field"><span>Archivo de backup (.json o .txt)</span><input id="backup-file" type="file" accept="application/json,.json,text/plain,.txt"></label>
    <div id="backup-summary"></div>
    <p class="backup-status" id="backup-status" aria-live="polite"></p>
    <p class="err" id="backup-err"></p>
    <div class="menu">
      <button type="button" class="btn danger" id="backup-apply" disabled>Reemplazar los datos actuales</button>
      <button type="button" class="btn" id="backup-continue" hidden>Continuar la carga</button>
      <button type="button" class="btn ghost" data-close>Cerrar</button>
    </div>`);
  const fileInput = $('#backup-file');
  const apply = $('#backup-apply');
  const resumeBtn = $('#backup-continue');
  let resumeId = '';
  let resumeDone = null;
  let waking = false;
  let wakeLock = null;
  const holdScreen = async () => {
    try {
      if (navigator.wakeLock?.request) wakeLock = await navigator.wakeLock.request('screen');
    } catch { /* el navegador no deja mantener la pantalla */ }
  };
  const onVisible = () => { if (waking && document.visibilityState === 'visible') holdScreen(); };
  const startLoad = (continuing) => {
    if (!parsed?.ok) return;
    apply.disabled = true;
    if (resumeBtn) resumeBtn.disabled = true;
    fileInput.disabled = true;
    const status = $('#backup-status');
    status.className = 'backup-status';
    status.textContent = backupProgressText(0, 0);
    $('#backup-err').textContent = '';
    const payload = parsed.backup;
    const trial = isTrialPage();
    if (!continuing) clearTrialResume();
    const doneKeys = continuing && resumeDone ? new Set(resumeDone) : new Set();
    let shown = doneKeys.size;
    if (trial) {
      waking = true;
      holdScreen();
      document.addEventListener('visibilitychange', onVisible);
    }
    const finishWake = () => {
      waking = false;
      document.removeEventListener('visibilitychange', onVisible);
      try { wakeLock?.release(); } catch { /* ya se soltó */ }
      wakeLock = null;
    };
    app.store.importDatabase(payload, ({ done, total }) => {
      if (!status.isConnected || status.classList.contains('backup-ok')) return;
      shown = Math.max(shown, done);
      status.textContent = backupProgressText(shown, total);
    }, trial ? {
      skipKeys: doneKeys,
      onDone: (key) => {
        doneKeys.add(key);
        if (doneKeys.size % 25 === 0) writeTrialResume(resumeId, doneKeys);
      },
    } : undefined).then((summary) => {
      finishWake();
      const partial = trialBackupResultText(summary?.failures);
      if (partial) {
        if (trial) writeTrialResume(resumeId, doneKeys);
        status.className = 'backup-status';
        status.textContent = '';
        const err = $('#backup-err');
        err.style.whiteSpace = 'pre-line';
        err.textContent = partial;
        apply.disabled = false;
        fileInput.disabled = false;
        if (resumeBtn) resumeBtn.disabled = false;
        toast(partial, 7000);
        return;
      }
      if (trial) clearTrialResume();
      status.className = 'backup-status backup-ok';
      status.textContent = BACKUP_LOADED_OK;
      apply.hidden = true;
      if (resumeBtn) resumeBtn.hidden = true;
      toast(BACKUP_LOADED_OK, 0);
    }).catch((error) => {
      finishWake();
      if (trial) writeTrialResume(resumeId, doneKeys);
      apply.disabled = false;
      if (resumeBtn) resumeBtn.disabled = false;
      fileInput.disabled = false;
      status.textContent = '';
      status.className = 'backup-status';
      const msg = backupSurfaceMessage(error, 'No se pudo cargar el backup.');
      $('#backup-err').textContent = msg;
      toast(msg, 7000);
    });
  };
  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    parsed = null;
    apply.disabled = true;
    $('#backup-summary').innerHTML = '';
    $('#backup-err').textContent = '';
    const status = $('#backup-status');
    status.textContent = '';
    status.className = 'backup-status';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseBackup(String(reader.result || ''));
      if (!result.ok) { $('#backup-err').textContent = result.error; return; }
      parsed = result;
      parsed.rawText = String(reader.result || '');
      $('#backup-summary').innerHTML = backupSummaryHtml(result.summary);
      apply.disabled = false;
      resumeId = isTrialPage() ? trialResumeId(parsed.rawText) : '';
      resumeDone = resumeId ? readTrialResume(resumeId) : null;
      if (resumeBtn) {
        resumeBtn.hidden = !(resumeDone && resumeDone.size);
        resumeBtn.textContent = resumeDone?.size ? `Continuar la carga (${resumeDone.size} ya hechos)` : 'Continuar la carga';
      }
    };
    reader.onerror = () => { $('#backup-err').textContent = 'No se pudo leer el archivo.'; };
    reader.readAsText(file);
  };
  apply.onclick = () => startLoad(false);
  if (resumeBtn) resumeBtn.onclick = () => startLoad(true);
}

function openBackup() {
  if (app.role !== 'admin') return;
  const driveId = driveClientId(appConfig);
  openSheet(`
    <h3>Hacer backup</h3>
    <p class="hint">Un archivo JSON con partidos, jugadores, plantel, notas de jugadores, pagos, sedes, precios, confirmaciones, teléfonos, saldos, compensaciones, el registro, acceso al WhatsApp y fichas unidas.</p>
    <div class="menu">
      <button type="button" class="btn primary" id="backup-download">Guardar en el celular</button>
      <button type="button" class="btn" id="backup-drive">Guardar en Google Drive</button>
      <button type="button" class="btn ghost" data-close>Cerrar</button>
    </div>
    <p class="hint" id="backup-drive-hint">${driveId
      ? `Drive: se sube a tu Google Drive, carpeta «${esc(DRIVE_FOLDER)}». La primera vez Google pide permiso.`
      : 'Drive: se abre el menú del teléfono; elegí «Drive». Si no hay menú, se descarga el archivo.'}</p>`);
  // El archivo se arma al abrir: compartir y el permiso de Google tienen que salir del toque, sin esperas largas.
  let ready = null;
  const prepare = () => { ready = currentBackupFile(); ready.catch(() => { ready = null; }); return ready; };
  prepare();
  if (driveId) loadGis().catch(() => {});
  $('#backup-download').onclick = () => {
    (ready || prepare()).then(({ filename, text }) => {
      saveBackupFile(filename, text);
      toast('Backup guardado en el celular');
    }).catch(failBackup);
  };
  $('#backup-drive').onclick = () => {
    const pending = ready || prepare();
    if (driveId) {
      // Pedir el permiso ya, dentro del toque (si no, el navegador bloquea la ventana de Google).
      const token = loadGis().then(() => requestDriveToken(driveId, { hint: app.session?.user?.email || '' }));
      Promise.all([pending, token]).then(async ([{ filename, text }, access]) => {
        toast('Subiendo a Google Drive…', 0);
        await uploadBackupToDrive({ token: access, filename, text });
        toast(`Backup guardado en Google Drive («${DRIVE_FOLDER}»)`, 4500);
        prepare();
      }).catch(async (error) => {
        if (error?.code === 'drive/cancelled') { toast('No se guardó en Drive'); return; }
        console.error(error);
        try {
          const { filename, text } = await pending;
          const how = await shareBackupFile(filename, text);
          const why = error?.code === 'drive/403' ? 'Drive no dejó subir (¿API de Drive sin habilitar?)' : error?.code === 'drive/denied' ? 'Google no dio permiso' : 'No se pudo subir a Drive';
          if (how === 'shared') toast(`${why}: elegí Drive en el menú`, 5000);
          else if (how === 'downloaded') toast(`${why}: se descargó el archivo`, 5000);
        } catch (fail) { failBackup(fail); }
      });
      return;
    }
    pending.then(async ({ filename, text }) => {
      const how = await shareBackupFile(filename, text);
      if (how === 'shared') toast('Elegí Drive en el menú para guardarlo');
      else if (how === 'downloaded') toast('Este teléfono no abre el menú. Se descargó el archivo: subilo a Drive');
    }).catch(failBackup);
  };
}

function accessEditor(m) {
  const me = actor();
  if (m && !canEditAccess(m, me.uid)) return '';
  const staff = staffUsers(app.users);
  const people = staff.some((user) => user.uid === me.uid) ? staff : [...staff, { uid: me.uid, name: me.name, role: app.role, active: true }];
  const viewers = new Set(Array.isArray(m?.viewers) && m.viewers.length && !m.viewers.includes('*') ? m.viewers : people.map((user) => user.uid));
  const adders = new Set(Array.isArray(m?.adders) && m.adders.length && !m.adders.includes('*') ? m.adders : people.map((user) => user.uid));
  const limits = new Map((m?.limits || []).map((row) => [row.uid, row.max]));
  const solo = m?.solo === true;
  const rows = people.map((user) => {
    const mine = user.uid === me.uid;
    return `<div class="access-person" data-person="${esc(user.uid)}">
      <span class="who">${esc(user.name)}${user.role === 'admin' ? ' · admin' : ''}</span>
      <label><input type="checkbox" data-view="${esc(user.uid)}" ${viewers.has(user.uid) || mine ? 'checked' : ''} ${mine ? 'disabled' : ''}> Ve</label>
      <label><input type="checkbox" data-add="${esc(user.uid)}" ${adders.has(user.uid) || mine ? 'checked' : ''} ${mine ? 'disabled' : ''}> Anota</label>
      <label class="limit">Límite <input data-limit="${esc(user.uid)}" inputmode="numeric" value="${limits.has(user.uid) ? esc(String(limits.get(user.uid))) : ''}" placeholder="—"></label>
    </div>`;
  }).join('');
  return `<fieldset class="access-box" id="match-access">
    <legend>Quién entra</legend>
    <label class="checkline"><input type="checkbox" id="match-solo" ${solo ? 'checked' : ''}> Solo yo: nadie más lo ve, tampoco el admin</label>
    <div id="match-access-fields" ${solo ? 'hidden' : ''}>
      <p class="hint">Quién puede ver este partido y quién puede anotar. El límite cuenta titulares y lista de espera. Vacío = sin límite.</p>
      ${rows || '<p class="hint">Todavía no hay otras cuentas.</p>'}
    </div>
  </fieldset>`;
}

function readAccessForm() {
  const solo = !!$('#match-solo')?.checked;
  const viewerIds = [...document.querySelectorAll('[data-view]')].filter((el) => el.checked).map((el) => el.dataset.view);
  const adderIds = [...document.querySelectorAll('[data-add]')].filter((el) => el.checked).map((el) => el.dataset.add);
  const limits = [...document.querySelectorAll('[data-limit]')].map((el) => ({ uid: el.dataset.limit, max: el.value.trim() === '' ? null : Number(el.value) }));
  return buildAccess({ solo, viewerIds, adderIds, limits, staff: staffUsers(app.users), creator: actor() });
}

function bindAccessForm() {
  const solo = $('#match-solo');
  const fields = $('#match-access-fields');
  if (!solo || !fields) return;
  const sync = () => {
    fields.hidden = solo.checked;
    fields.querySelectorAll('input').forEach((el) => { el.disabled = solo.checked || el.dataset.view === actor().uid || el.dataset.add === actor().uid; });
    fields.querySelectorAll('[data-view]').forEach((view) => {
      const add = fields.querySelector(`[data-add="${view.dataset.view}"]`);
      const limit = fields.querySelector(`[data-limit="${view.dataset.view}"]`);
      if (!view.checked && add && add.dataset.add !== actor().uid) { add.checked = false; add.disabled = true; }
      if (view.checked && add && !solo.checked && add.dataset.add !== actor().uid) add.disabled = false;
      if (limit) limit.disabled = solo.checked || !(add && add.checked);
    });
  };
  solo.addEventListener('change', sync);
  fields.addEventListener('change', sync);
  sync();
}

function venueOptions(match) {
  const choices = venueChoices(app.venues, { unreadable: !!app.venuesError, currentId: match?.venueId || '' });
  const selected = match?.venueId && choices.some((item) => item.id === match.venueId)
    ? match.venueId
    : defaultVenueId(app.venues, { unreadable: !!app.venuesError });
  return { choices, selected };
}

function openVenues() {
  const rows = [...(app.venues || [])].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name).localeCompare(String(b.name), 'es'));
  const list = rows.length ? rows : venueChoices([], { unreadable: true });
  openSheet(`
    <h3>Sedes</h3>
    <p class="hint">Aparecen al armar un partido. Desactivar la saca de los partidos nuevos. Los que ya la usan siguen mostrándola. No se borra.</p>
    ${app.venuesError ? `<p class="hint" id="venues-error">${esc(app.venuesError)}</p>` : ''}
    <ul class="slots" id="venue-list">${list.map((venue) => `
      <li class="slot" data-venue="${esc(venue.id)}">
        <div class="who">
          <div class="name">${esc(venue.name)}</div>
          <div class="sub">${venue.active === false ? 'Inactiva' : 'Activa'}</div>
        </div>
        <button type="button" class="btn" data-venue-edit="${esc(venue.id)}">Editar</button>
        <button type="button" class="btn" data-venue-active="${esc(venue.id)}">${venue.active === false ? 'Activar' : 'Desactivar'}</button>
      </li>`).join('')}</ul>
    <form id="venue-form" novalidate>
      <label class="field"><span>Nueva sede</span><input name="name" maxlength="80" autocomplete="off" placeholder="Ej: Club Norte"></label>
      <div class="err" id="venue-err"></div>
      <div class="sheet-actions"><button type="button" class="btn" id="venues-back">Volver</button><button class="btn primary" type="submit">Agregar sede</button></div>
    </form>`);
  $('#venues-back').onclick = () => openSettings();
  $('#venue-form').onsubmit = (e) => {
    e.preventDefault();
    const name = e.target.name.value;
    Promise.resolve(app.store.addVenue(name)).then(() => { toast('Sede agregada'); openVenues(); }).catch((error) => {
      $('#venue-err').textContent = isVenueDenied(error) ? VENUES_DENIED_WRITE : (error?.message || 'No se pudo guardar');
    });
  };
  $('#venue-list').onclick = async (e) => {
    const edit = e.target.closest('[data-venue-edit]');
    if (edit) {
      const venue = (app.venues || []).find((item) => item.id === edit.dataset.venueEdit) || list.find((item) => item.id === edit.dataset.venueEdit);
      if (venue) openVenueEdit(venue);
      return;
    }
    const toggle = e.target.closest('[data-venue-active]');
    if (!toggle) return;
    const venue = (app.venues || []).find((item) => item.id === toggle.dataset.venueActive);
    if (!venue) return;
    const next = venue.active === false;
    if (!next && !(await askConfirm(`¿Desactivar ${venue.name}? Los partidos que ya la usan la siguen mostrando.`, { danger: true }))) return;
    Promise.resolve(app.store.updateVenue(venue.id, { active: next })).then(() => openVenues()).catch((error) => {
      toast(isVenueDenied(error) ? VENUES_DENIED_WRITE : (error?.message || 'No se pudo cambiar'));
    });
  };
}

function openVenueEdit(venue) {
  openSheet(`
    <form id="venue-edit" novalidate>
      <h3>Editar sede</h3>
      <label class="field"><span>Nombre</span><input name="name" maxlength="80" required autocomplete="off" value="${esc(venue.name)}"></label>
      <div class="err" id="venue-err"></div>
      <div class="sheet-actions"><button type="button" class="btn" id="venue-edit-back">Volver</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  $('#venue-edit-back').onclick = () => openVenues();
  $('#venue-edit').onsubmit = (e) => {
    e.preventDefault();
    Promise.resolve(app.store.updateVenue(venue.id, { name: e.target.name.value })).then(() => { toast('Sede actualizada'); openVenues(); }).catch((error) => {
      $('#venue-err').textContent = isVenueDenied(error) ? VENUES_DENIED_WRITE : (error?.message || 'No se pudo guardar');
    });
  };
}

/* Agregar / editar partido */
function openMatchForm(m) {
  const today = todayISO();
  const editingAccess = !m || canEditAccess(m, actor().uid);
  const venues = venueOptions(m);
  const perTeam = perTeamOf(m);
  openSheet(`
    <form id="match-form" novalidate>
      <h3>${m ? 'Editar partido' : 'Agregar partido'}</h3>
      <p class="hint" id="match-size-hint">Fútbol ${perTeam} contra ${perTeam} (${capacityFor(perTeam)} jugadores)</p>
      <label class="field"><span>Sede</span><select name="venue" id="match-venue" required>${venues.choices.map((item) => `<option value="${esc(item.id)}"${item.id === venues.selected ? ' selected' : ''}>${esc(item.name)}${item.active === false ? ' (inactiva)' : ''}</option>`).join('')}</select></label>
      <label class="field"><span>Jugadores por equipo</span><select name="perTeam" id="match-per-team">${perTeamOptions().map((n) => `<option value="${n}"${n === perTeam ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <div class="row">
        <label class="field"><span>Fecha</span><input type="date" name="date" required min="${m ? '' : today}" value="${esc(m ? m.date : today)}"></label>
        <label class="field"><span>Hora</span><input type="time" name="time" required value="${esc(m ? m.time : '21:00')}"></label>
      </div>
      <label class="field"><span>N° de cancha (opcional)</span><input name="court" id="match-court-input" maxlength="20" placeholder="Ej: 3" autocomplete="off" value="${esc(m?.court || '')}"></label>
      <label class="field"><span>Valor del partido</span><input name="price" id="match-price-input" inputmode="numeric" autocomplete="off" value="${priceOfMatch(m, livePrices())}"></label>
      <p class="hint">Por jugador. Arranca con el valor de Ajustes y se puede cambiar en este partido.</p>
      <fieldset class="comp-choice" id="match-split">
        <legend>¿Cómo reparten ganancias?</legend>
        <label class="checkline"><input type="radio" name="splitMode" id="match-split-equal" value="equal"${splitModeOf(m) === 'equal' ? ' checked' : ''}><span>El total del partido en partes iguales</span></label>
        <label class="checkline"><input type="radio" name="splitMode" id="match-split-signed" value="signed"${splitModeOf(m) === 'signed' ? ' checked' : ''}><span>Cada uno la cantidad que anotó</span></label>
      </fieldset>
      <label class="field"><span>Nota (opcional)</span><input type="text" name="note" maxlength="300" placeholder="Ej: cancha 2, traer pechera" value="${esc(m?.note || '')}"></label>
      ${editingAccess ? accessEditor(m) : ''}
      <div class="field"><div class="err" id="mf-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">${m ? 'Guardar' : 'Crear'}</button></div>
    </form>`);
  bindAccessForm();
  const perSelect = $('#match-per-team');
  const paintSize = () => {
    const n = Number(perSelect.value);
    $('#match-size-hint').textContent = `Fútbol ${n} contra ${n} (${capacityFor(n)} jugadores)`;
  };
  perSelect.addEventListener('change', paintSize);
  $('#match-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = { date: f.get('date'), time: f.get('time'), note: String(f.get('note') || '').trim() };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !/^\d{2}:\d{2}$/.test(data.time)) { $('#mf-err').textContent = 'Completá fecha y hora.'; return; }
    const picked = venueOptions(m).choices.find((item) => item.id === String(f.get('venue') || ''));
    if (!picked) { $('#mf-err').textContent = 'Elegí una sede.'; return; }
    const team = Number(f.get('perTeam'));
    if (!perTeamOptions().includes(team)) { $('#mf-err').textContent = 'Elegí cuántos jugadores por equipo.'; return; }
    data.venueId = picked.id;
    data.venueName = picked.name;
    data.perTeam = team;
    data.capacity = capacityFor(team);
    data.court = cleanCourt(f.get('court'));
    const price = parsePriceInput(f.get('price'));
    if (!price.ok) { $('#mf-err').textContent = price.error; return; }
    data.price = price.amount;
    data.splitMode = f.get('splitMode') === 'signed' ? 'signed' : 'equal';
    const dup = app.matches.find((x) => x.date === data.date && x.time === data.time && x.id !== m?.id);
    if (dup && !(await askConfirm('Ya hay un partido ese día a esa hora. ¿Agregarlo igual?'))) return;
    if (editingAccess) data.access = readAccessForm();
    closeSheet();
    if (splitNear([{ date: data.date }]).later.length) rememberLater(true);
    if (m) run(app.store.updateMatch(m.id, data, app.who), 'Partido actualizado');
    else run(app.store.addMatch({ ...data, source: 'manual' }, app.who), 'Partido agregado');
  };
}

/* Importar desde texto */
function openImport(prevText = '') {
  openSheet(`
    <h3>Importar desde texto</h3>
    <p class="hint">Pegá uno o varios mensajes del grupo de WhatsApp. Detectamos expresiones como “jueves 22/10 21hs”, “miércoles 20:00” o “mañana 19 hs”, y te mostramos una vista previa antes de guardar.</p>
    <label class="field"><span>Mensaje</span><textarea id="imp-text" autofocus placeholder="Ej: Muchachos, se arma el jueves 22/10 21hs ⚽">${esc(prevText)}</textarea></label>
    <label class="field"><span>Fecha del mensaje <small class="muted">(para “hoy”, “mañana”, “jueves”…)</small></span><input type="date" id="imp-ref" value="${todayISO()}"></label>
    <div class="sheet-actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="imp-parse">Analizar</button></div>`);
  $('#imp-parse').onclick = () => {
    const text = $('#imp-text').value;
    const found = parseMatchesFromText(text, { refDate: $('#imp-ref').value || todayISO() });
    openImportPreview(text, found);
  };
}
function openImportPreview(text, found) {
  const today = todayISO();
  const items = found.map((f) => {
    const exists = app.matches.some((m) => m.date === f.date && m.time === f.time);
    const past = f.date < today;
    return { ...f, exists, past, on: !exists && !past && !!f.time };
  });
  openSheet(`
    <h3>Vista previa</h3>
    ${items.length ? `<p class="hint">Encontramos ${items.length} partido${items.length > 1 ? 's' : ''}. Revisá fecha y hora, y destildá los que no quieras importar.</p>
    <label class="checkline" id="imp-solo-line"><input type="checkbox" id="imp-solo" checked> Solo yo: nadie más lo ve, tampoco el admin</label>` :
      '<p class="hint">No encontramos fechas ni horarios en el texto. Probá con algo como “jueves 22/10 21hs”.</p>'}
    <ul class="preview" id="imp-list">${items.map((it, i) => `
      <li class="${it.on ? '' : 'off'}" data-i="${i}">
        <div class="top"><input type="checkbox" ${it.on ? 'checked' : ''} aria-label="Importar"><b class="lbl">${esc(capitalize(labelDate(it.date)))} · ${esc(it.time || '--:--')} hs</b></div>
        <div class="row"><input type="date" value="${it.date}" aria-label="Fecha"><input type="time" value="${it.time}" aria-label="Hora"></div>
        ${it.warning ? `<div class="warn">⚠️ ${esc(it.warning)}</div>` : ''}
        ${it.exists ? '<div class="warn">Ya existe un partido en ese horario</div>' : ''}
        ${it.past ? '<div class="warn">La fecha ya pasó</div>' : ''}
        <div class="src">“${esc(it.source)}”</div>
      </li>`).join('')}</ul>
    <div class="sheet-actions"><button class="btn" id="imp-back">Volver</button>${items.length ? '<button class="btn primary" id="imp-save">Importar</button>' : ''}</div>`);
  $('#imp-back').onclick = () => openImport(text);
  const list = $('#imp-list');
  const sync = (li) => {
    const it = items[li.dataset.i];
    const [cb, d, t] = li.querySelectorAll('input');
    it.on = cb.checked; it.date = d.value; it.time = t.value;
    li.classList.toggle('off', !it.on);
    if (it.date) li.querySelector('.lbl').textContent = `${capitalize(labelDate(it.date))} · ${it.time || '--:--'} hs`;
    updateSave();
  };
  const updateSave = () => {
    const btn = $('#imp-save'); if (!btn) return;
    const n = items.filter((i) => i.on && i.date && i.time).length;
    btn.disabled = n === 0; btn.textContent = n ? `Importar ${n}` : 'Importar';
  };
  list.addEventListener('input', (e) => sync(e.target.closest('li')));
  list.addEventListener('change', (e) => sync(e.target.closest('li')));
  updateSave();
  const save = $('#imp-save');
  if (save) save.onclick = () => {
    const sel = items.filter((i) => i.on && i.date && i.time);
    if (!sel.length) return;
    if (sel.some((item) => splitNear([{ date: item.date }]).later.length)) rememberLater(true);
    const access = importAccess(actor(), $('#imp-solo')?.checked !== false);
    closeSheet();
    run(app.store.addMatches(sel.map((s) => ({ date: s.date, time: s.time, note: '', source: 'texto', sourceText: s.source, perTeam: 7, venueId: defaultVenueId(app.venues, { unreadable: !!app.venuesError }), venueName: venueLabel({ venueId: defaultVenueId(app.venues, { unreadable: !!app.venuesError }) }, app.venues), access })), app.who),
      `${sel.length} partido${sel.length > 1 ? 's' : ''} importado${sel.length > 1 ? 's' : ''}`);
  };
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read'));
    reader.readAsText(file);
  });
}

function playedDuplicate(item) {
  const seen = new Set();
  for (const match of [...(app.matches || []), ...(app.history || [])]) {
    if (!match?.id || seen.has(match.id)) continue;
    seen.add(match.id);
    if (match.date === item.date && (match.time || '') === item.time && matchVenueId(match) === DEFAULT_VENUE_ID) return match;
  }
  return null;
}

function importedPlayerFields(raw) {
  const phone = raw.phone ? canonicalPhone(raw.phone) : '';
  const byPhone = phone ? rosterByPhone(app.roster, phone) : null;
  const folded = foldText(raw.name);
  const byName = !byPhone && folded
    ? app.roster.find((person) => foldText(person.name) === folded || (person.shortName && foldText(person.shortName) === folded))
    : null;
  const person = byPhone || byName;
  if (!person) return { name: raw.name, phone };
  return {
    name: person.name,
    shortName: person.shortName || '',
    phone: person.phone || '',
    rosterId: person.id,
    phoneKey: person.phoneKey || '',
    hasPhone: person.hasPhone === true,
    phoneShared: person.phoneShared === true,
  };
}

function openHistoryImport(prevText = '') {
  openSheet(`
    <h3>Importar partidos desde texto</h3>
    <p class="hint">Pegá una lista con la fecha y la hora en el encabezado y los jugadores numerados. Si hay varios, separalos con otro encabezado. Quedan como partidos ya jugados.</p>
    <label class="field"><span>Texto</span><textarea id="hist-imp-text" placeholder="Ej: Jueves 16/10 21hs&#10;1. Juan Pérez&#10;2. Ana Gómez">${esc(prevText)}</textarea></label>
    <label class="field"><span>O un archivo .txt</span><input type="file" id="hist-imp-file" accept=".txt,text/plain"></label>
    <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button type="button" class="btn primary" id="hist-imp-next">Ver</button></div>`);
  $('#hist-imp-file').onchange = () => {
    const file = $('#hist-imp-file').files?.[0];
    if (!file) return;
    readTextFile(file).then((text) => { $('#hist-imp-text').value = text; }).catch(() => toast('No se pudo leer el archivo'));
  };
  $('#hist-imp-next').onclick = () => {
    const text = $('#hist-imp-text').value;
    openHistoryImportPreview(text, parsePlayedMatchesFromText(text, { now: new Date() }));
  };
}

function openHistoryImportPreview(text, found) {
  const items = (found || []).map((item) => ({ ...item, duplicate: !!playedDuplicate(item), on: !playedDuplicate(item) }));
  const cards = items.map((item, i) => {
    const names = item.players.length ? item.players.map((player) => player.name).join(', ') : 'Sin jugadores';
    return `<li data-i="${i}">
      <div class="top"><input type="checkbox" ${item.on ? 'checked' : ''} ${item.duplicate ? 'disabled' : ''} aria-label="Importar partido"><b class="lbl">${esc(numericDate(item.date))} · ${esc(shortHour(item.time) || item.time)}</b></div>
      <div class="sub">Polideportivo Colegiales</div>
      <div class="sub">${esc(names)}</div>
      ${item.duplicate ? '<div class="err">Ya hay un partido a esa hora en Polideportivo Colegiales.</div>' : ''}
    </li>`;
  }).join('');
  openSheet(`
    <h3>Vista previa</h3>
    ${items.length ? `<ul class="import-preview" id="hist-imp-list">${cards}</ul>` : '<p class="hint">No encontré partidos con fecha, hora y una lista de jugadores.</p>'}
    <div class="sheet-actions"><button type="button" class="btn" id="hist-imp-back">Volver</button>${items.some((item) => item.on) ? '<button type="button" class="btn primary" id="hist-imp-save">Importar</button>' : ''}</div>`);
  const back = $('#hist-imp-back');
  if (back) back.onclick = () => openHistoryImport(text);
  const list = $('#hist-imp-list');
  if (list) list.addEventListener('change', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    items[Number(li.dataset.i)].on = e.target.checked && !items[Number(li.dataset.i)].duplicate;
  });
  const save = $('#hist-imp-save');
  if (save) save.onclick = () => {
    const chosen = items.filter((item) => item.on && !item.duplicate);
    if (!chosen.length) return;
    closeSheet();
    run((async () => {
      let n = 0;
      for (const item of chosen) {
        if (playedDuplicate(item)) continue;
        const id = await app.store.addMatch({
          date: item.date,
          time: item.time,
          note: '',
          source: 'texto',
          sourceText: item.source || text.slice(0, 140),
          perTeam: 7,
          venueId: DEFAULT_VENUE_ID,
          venueName: DEFAULT_VENUE_NAME,
          access: publicAccess(actor()),
        }, app.who);
        const match = matchById(id) || { id, date: item.date, time: item.time, capacity: 14, venueId: DEFAULT_VENUE_ID };
        for (const raw of item.players) {
          const pid = await app.store.addPlayer(match, importedPlayerFields(raw), app.who, { forceMain: true });
          await applyAutoCredit(pid);
        }
        n += 1;
      }
      toast(n ? `${n} partido${n === 1 ? '' : 's'} en el historial` : 'Esos partidos ya estaban');
    })());
  };
}

/* ───────── plantel (Jugadores) ───────── */
function renderRoster() {
  const prevSearch = $('#roster-q');
  const q = prevSearch?.value || '';
  const searchFocused = !!(prevSearch && document.activeElement === prevSearch);
  const selStart = searchFocused ? prevSearch.selectionStart : 0;
  const selEnd = searchFocused ? prevSearch.selectionEnd : 0;
  const people = searchRoster(rosterForOrganizer(app.roster, actor()), q);
  const rows = people.map((person) => {
    const locked = !canEditRoster(person, actor());
    return `
    <li class="slot" data-roster="${esc(person.id)}">
      <button type="button" class="who" data-roster-open="${esc(person.id)}">
        <div class="name${fichaSuspended(person)}">${fichaName(person, person.name)}</div>
        <div class="sub">${cleanShortName(person.shortName) ? `<span class="nick">“${esc(cleanShortName(person.shortName))}”</span>` : ''}${person.phone ? esc(displayFromWa(person.phone)) : phoneHidden(person) ? `<span class="private-wa">${esc(PRIVATE_WA_TEXT)}</span>` : 'Sin número'}${locked ? `<span class="edit-lock">${esc(EDIT_LOCK_TEXT)}</span>` : ''}</div>
      </button>
      ${waButton(person)}
      <button type="button" class="more-btn" data-roster-edit="${esc(person.id)}" aria-label="Editar ${esc(person.name)}"${locked && !canEditRosterNick(person, actorWithRole()) ? ' disabled' : ''}>${ICON.edit}</button>
      <button type="button" class="more-btn" data-roster-del="${esc(person.id)}" aria-label="Borrar ${esc(person.name)}">${ICON.trash}</button>
    </li>`;
  }).join('');
  if (!replaceView(`
    <h2 class="section">Jugadores</h2>
    ${app.rosterError ? `<div class="banner error roster-error" id="roster-error">${esc(app.rosterError)}</div>` : ''}
    <label class="field roster-search"><span>Buscar</span><input id="roster-q" autocomplete="off" placeholder="Nombre o teléfono" value="${esc(q)}"></label>
    ${people.length ? `<ul class="slots" id="roster-list">${rows}</ul>` : `<p class="empty-wait" id="roster-list">${q ? 'Nadie coincide con esa búsqueda.' : 'Todavía no hay jugadores guardados. Cuando anotás a alguien en un partido, se guarda acá. El WhatsApp es opcional.'}</p>`}
    <div class="actionbar"><div class="actionbar-inner">
      <button class="btn primary" id="btn-add-roster">${ICON.plus}Agregar jugador</button>
    </div></div>`)) return;
  const input = $('#roster-q');
  input.addEventListener('input', () => renderRoster());
  if (searchFocused) {
    input.focus({ preventScroll: true });
    try { input.setSelectionRange(selStart, selEnd); } catch { /* el navegador puede rechazar el rango */ }
  }
  $('#btn-add-roster').onclick = () => openRosterForm();
  const list = $('#roster-list');
  if (list) list.onclick = (e) => {
    const edit = e.target.closest('[data-roster-edit]');
    if (edit) {
      const person = app.roster.find((r) => r.id === edit.dataset.rosterEdit);
      if (!person || !canEditRosterNick(person, actorWithRole())) return;
      return openRosterForm(person);
    }
    const del = e.target.closest('[data-roster-del]');
    if (del) return deleteRosterPlayer(app.roster.find((r) => r.id === del.dataset.rosterDel));
    const open = e.target.closest('[data-roster-open]');
    if (open) {
      app.profileMatchId = null;
      app.profileViaMatchId = null;
      location.hash = `#/jugador/${encodeURIComponent(open.dataset.rosterOpen)}`;
    }
  };
}

function rosterFormError(error, formId) {
  const el = document.getElementById(formId);
  if (error?.code === 'already-in-match') {
    if (el) el.textContent = error.message || ALREADY_IN_MATCH;
    return;
  }
  if (isRosterDenied(error)) {
    const msg = ROSTER_DENIED_WRITE;
    if (el) el.textContent = msg;
    showError(msg);
    return;
  }
  if (error?.code === 'roster-duplicate') {
    if (el) {
      el.textContent = '';
      el.append(document.createTextNode(`${error.message} `));
      if (error.rosterId) {
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'btn';
        open.id = 'roster-dup-open';
        open.textContent = 'Abrir';
        open.onclick = () => {
          closeSheet();
          location.hash = `#/jugador/${encodeURIComponent(error.rosterId)}`;
        };
        el.append(open);
      }
    }
    return;
  }
  toast('No se pudo guardar: ' + (error?.code || error?.message || error));
}

function openRosterForm(person) {
  const lockPhone = phoneHidden(person);
  const locked = person && !canEditRoster(person, actor());
  openSheet(`
    <form id="roster-form" novalidate>
      <h3>${person ? 'Editar jugador' : 'Agregar a Jugadores'}</h3>
      ${locked ? `<p class="hint edit-lock" id="edit-lock">${esc(EDIT_LOCK_TEXT)}</p>` : ''}
      <p class="hint">Nombre completo. El WhatsApp es opcional. Si otro organizador ya tiene ese número, es el mismo jugador. Si lo tenés vos, no se duplica.</p>
      <label class="field"><span>Nombre</span><input name="name" required autofocus autocomplete="off" maxlength="60" placeholder="Ej: Ernesto Pereira" value="${esc(person?.name || '')}"></label>
      <label class="field"><span>Nombre corto (o apodo)</span><input name="shortName" maxlength="40" autocomplete="off" placeholder="Ej: Tito" value="${esc(person?.shortName || '')}"></label>
      ${lockPhone ? `<p class="hint private-wa">${esc(PRIVATE_WA_TEXT)}</p>` : `<label class="field"><span>WhatsApp</span>${person ? `<input name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="Ej: 11 1234-5678" value="${esc(displayFromWa(person.phone))}">` : `<div class="phone-row"><input name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="Ej: 11 1234-5678" value="">${waShareControl('wa-share', { named: true })}</div>`}
        <div class="small muted" id="rf-phone">Característica + número. Sin 0 ni 15 también sirve.</div></label>`}
      <div class="field"><div class="err" id="rf-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit"${locked ? ' disabled' : ''}>${person ? 'Guardar' : 'Agregar'}</button></div>
    </form>`);
  const form = $('#roster-form');
  if (locked) {
    // El admin puede cambiar el apodo aunque la ficha sea de otro organizador.
    const nickOk = canEditRosterNick(person, actorWithRole());
    form.querySelectorAll('input, textarea, select').forEach((el) => { el.disabled = !(nickOk && el.name === 'shortName'); });
    const save = form.querySelector('button[type=submit]');
    if (save && nickOk) save.disabled = false;
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!nickOk) return;
      const nick = cleanShortName(form.shortName.value);
      if (nick === cleanShortName(person.shortName)) { closeSheet(); return; }
      Promise.resolve(app.store.setRosterNick(person.id, nick)).then(() => { closeSheet(); toast('Apodo actualizado'); }).catch((err) => rosterFormError(err, 'rf-err'));
    };
    return;
  }
  const hint = $('#rf-phone');
  if (form.phone) form.phone.addEventListener('input', () => {
    const v = form.phone.value.trim();
    if (!v) { hint.className = 'small muted'; hint.textContent = 'Característica + número. Sin 0 ni 15 también sirve.'; return; }
    const r = normalizePhone(v);
    hint.className = r.ok ? 'ok' : 'err';
    hint.textContent = r.ok ? `✓ ${r.display}` : r.error;
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const shortName = form.shortName.value;
    const phoneRaw = form.phone ? form.phone.value.trim() : null;
    if (!name) { $('#rf-err').textContent = 'Poné el nombre.'; return; }
    let phone = '';
    if (phoneRaw) {
      const r = normalizePhone(phoneRaw);
      if (!r.ok) { $('#rf-err').textContent = r.error; return; }
      phone = r.wa;
    }
    const job = person
      ? app.store.updateRoster(person.id, phoneRaw === null ? { name, shortName } : { name, phone, shortName })
      : app.store.addRoster({ name, phone, shortName, phoneShared: $('#wa-share')?.checked === true }, app.who);
    Promise.resolve(job).then(() => { closeSheet(); toast(person ? 'Jugador actualizado' : 'Guardado en Jugadores'); }).catch((err) => rosterFormError(err, 'rf-err'));
  };
}

async function deleteRosterPlayer(person) {
  if (!person) return;
  const reasons = rosterDeleteReasons({
    person,
    players: app.players,
    matches: knownMatches(),
    credits: app.credits,
    prices: livePrices(),
    organizer: staffActor(),
  });
  if (reasons.length) {
    await askNotice(`No se puede borrar a ${person.name}.\n${reasons.join('\n')}`);
    return;
  }
  if (!(await askConfirm(`¿Borrar a ${person.name} de Jugadores? No lo quita de los partidos.`, { danger: true }))) return;
  Promise.resolve(app.store.deleteRoster(person.id)).then(() => toast(`${person.name} borrado`)).catch((err) => {
    if (err?.code === 'roster-delete-blocked') askNotice(`No se puede borrar a ${person.name}.\n${(err.reasons || []).join('\n')}`);
    else if (isRosterDenied(err)) showError(ROSTER_DENIED_WRITE);
    else toast('No se pudo borrar: ' + (err?.code || err?.message || err));
  });
}

const noteId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
app.profileMatchId = null;
app.wantPhoneForm = false;

async function ensureRoster({ name, phone, rosterId, phoneKey: key, phoneShared, strictName = false }) {
  const cleanName = String(name || '').trim();
  const sameName = (person) => foldText(person?.name) === foldText(cleanName);
  if (rosterId && app.roster.some((person) => person.id === rosterId)) return rosterId;
  const wa = canonicalPhone(phone);
  const ident = key || (wa ? phoneIdentity({ phone: wa }) : '');
  if (wa) {
    const found = app.roster.find((person) => rosterByPhone([person], wa));
    if (found && (!strictName || sameName(found))) return found.id;
    if (found && strictName) return app.store.addRoster({ name: cleanName }, app.who);
  }
  if (ident) {
    const found = app.roster.find((person) => phoneIdentity(person) === ident && (!strictName || sameName(person)));
    if (found) return found.id;
    if (!wa) return rosterId || '';
  } else if (cleanName && !isAutoGuestName(cleanName)) {
    const found = app.roster.find((person) => !phoneIdentity(person) && foldText(person.name) === foldText(cleanName));
    if (found) return found.id;
  }
  if (!cleanName) return '';
  return app.store.addRoster({ name: cleanName, phone: wa, phoneShared: phoneShared === true }, app.who);
}

async function openPlayerProfile(player, matchId) {
  if (!player) return;
  app.profileMatchId = matchId || null;
  try {
    let id = player.rosterId && app.roster.some((person) => person.id === player.rosterId) ? player.rosterId : '';
    if (!id) id = await ensureRoster({ name: player.name, phone: player.phone, rosterId: player.rosterId, phoneKey: player.phoneKey });
    if (!id) { toast('No se pudo abrir el perfil'); return; }
    if (player.id && player.rosterId !== id) await app.store.updatePlayer(player.id, { rosterId: id });
    app.profileViaMatchId = id;
    location.hash = `#/jugador/${encodeURIComponent(id)}`;
  } catch (error) {
    if (error?.code === 'roster-duplicate') {
      const person = rosterByPhone(app.roster, player.phone) || rosterByIdentity(app.roster, player.phoneKey);
      if (person) {
        app.profileViaMatchId = person.id;
        location.hash = `#/jugador/${encodeURIComponent(person.id)}`;
        return;
      }
    }
    if (isRosterDenied(error)) { showError(`${ROSTER_DENIED_WRITE} El perfil no se pudo abrir.`); return; }
    toast('No se pudo abrir el perfil');
  }
}

function saveProfile(id, patch, done) {
  Promise.resolve(app.store.patchRoster(id, patch)).then(() => { if (done) done(); }).catch((error) => {
    if (error?.code === 'already-in-match') toast(error.message || ALREADY_IN_MATCH);
    else if (isRosterDenied(error)) showError(`${ROSTER_DENIED_WRITE} El perfil no se guardó.`);
    else toast('No se pudo guardar: ' + (error?.code || error?.message || error));
  });
}

function profileMoney(person) {
  const panel = playerPanelPieces(null, person, PROFILE_PANEL, '');
  return { panel, html: `
    <section class="profile-block" id="debt">
      ${panel.balance}
      ${panel.err}
    </section>
    ${panel.notesHtml}
    ${panel.statsButton}` };
}

const STATS_MODES = [
  { id: 'jugador', label: 'Jugador', title: 'Estadísticas por jugador' },
  { id: 'dia', label: 'Día', title: 'Estadísticas por día' },
  { id: 'mes', label: 'Mes', title: 'Estadísticas por mes' },
  { id: 'anio', label: 'Año', title: 'Estadísticas por año' },
];

function statsHash(mode, id) {
  const base = `#/estadisticas/${mode}`;
  return id ? `${base}/${encodeURIComponent(id)}` : base;
}

function moneyList(rows, empty) {
  if (!rows?.length) return `<p class="hint">${esc(empty)}</p>`;
  return `<ul class="ledger-list">${rows.map((row) => `<li>${esc(row.label || row.name)}: ${esc(formatARS(row.amount))}</li>`).join('')}</ul>`;
}

function takeSummary(take) {
  const goals = take.goalsTracked ? `Goles: ${take.goals}` : 'Sin goles cargados';
  const pending = take.pending > 0 ? `<p class="pay-pending">Transfiere después ${esc(formatARS(take.pending))}</p>` : '';
  return `
    <p class="hint" id="stats-attendance">En la lista: ${take.main} · En espera: ${take.waiting} · No juega: ${take.noShows}</p>
    <p class="hint" id="stats-goals">${esc(goals)}</p>
    <p class="stat-summary" id="stats-collected">Cobrado ${esc(formatARS(take.collected))} de ${esc(formatARS(take.expected))}</p>
    ${pending}
    <h2>Por medio</h2>
    ${moneyList(take.byMethod, 'Sin cobros.')}`;
}

function renderStats(r) {
  const mode = STATS_MODES.some((item) => item.id === r.mode) ? r.mode : 'jugador';
  const prev = $('#stats-q');
  const searchFocused = !!(prev && document.activeElement === prev);
  const selStart = searchFocused ? prev.selectionStart : 0;
  const selEnd = searchFocused ? prev.selectionEnd : 0;
  const current = STATS_MODES.find((item) => item.id === mode) || STATS_MODES[0];
  const seg = `<div class="seg stats-seg" id="stats-mode">${STATS_MODES.map((item) => `<a class="btn ${item.id === mode ? 'primary' : ''}" href="${statsHash(item.id)}"${item.id === mode ? ' aria-current="page"' : ''}>${item.label}</a>`).join('')}</div>`;
  let body = '';
  if (mode === 'jugador') body = statsPlayerBody(r.id);
  else if (mode === 'dia') body = statsDayBody(r.id);
  else body = statsPeriodBody(mode === 'anio' ? 'year' : 'month', r.id);
  if (!replaceView(`<div id="stats-view"><h2 class="section" id="stats-title">${esc(current.title)}</h2>${seg}${body}</div>`)) return;
  const input = $('#stats-q');
  if (input) {
    input.addEventListener('focus', () => {
      if (app.statsBrowse) return;
      app.statsBrowse = true;
      render();
    });
    input.addEventListener('input', () => {
      app.statsBrowse = true;
      render();
    });
    if (searchFocused) {
      input.focus({ preventScroll: true });
      try { input.setSelectionRange(selStart, selEnd); } catch { /* el navegador puede rechazar el rango */ }
    }
  }
  const list = $('#stats-players');
  if (list) list.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    app.statsBrowse = false;
    if (link.getAttribute('href') === location.hash) render();
  });
}

function statsRosterPerson(id) {
  const person = (app.roster || []).find((row) => row.id === id);
  if (!person) return null;
  if (rosterHeldBy(person, staffActor())) return person;
  const visible = new Set(knownMatches().map((match) => match.id));
  const seen = (app.players || []).some((player) => playerMatchesPerson(player, person) && visible.has(player.matchId));
  return seen ? person : null;
}

function statsPlayerBody(id) {
  const q = $('#stats-q')?.value || '';
  const browsing = app.statsBrowse === true;
  const mine = rosterForOrganizer(app.roster, staffActor());
  const requested = id ? statsRosterPerson(id) : null;
  const person = requested && !browsing ? requested : null;
  const missing = id && !requested
    ? `<div class="empty" id="stats-missing"><div class="big">👤</div><p><b>No encontramos este jugador.</b></p></div>`
    : '';
  let months = '';
  if (person) {
    const me = actor();
    const built = playerOrganizerMonths({
      person,
      players: app.players,
      matches: knownMatches(),
      who: { uid: me.uid, name: me.name },
    });
    const monthRows = built.map((row) => {
      const count = `${row.matches} ${row.matches === 1 ? 'partido' : 'partidos'}`;
      return `<li class="slot" data-month="${esc(row.key)}"><div class="who"><div class="name">${esc(row.label)}</div><div class="sub"><span>${count}</span><span>${esc(formatARS(row.paid))}</span></div></div></li>`;
    }).join('');
    months = `
      <h2 class="section${suspendedClass(person)}" id="stats-player">${esc(person.name)}</h2>
      <ul class="slots" id="stats-months">${monthRows || '<li class="empty-wait">No jugó ni pagó con vos.</li>'}</ul>`;
  }
  let list = '';
  if (!person) {
    if (!browsing && !q) {
      list = '<p class="empty-wait" id="stats-hint">Buscá por nombre o teléfono.</p>';
    } else {
      const people = searchRoster(mine, q);
      const rows = people.map((item) => `<li class="slot"><a class="who" href="${statsHash('jugador', item.id)}"><div class="name${suspendedClass(item)}">${esc(item.name)}</div></a></li>`).join('');
      list = people.length
        ? `<ul class="slots" id="stats-players">${rows}</ul>`
        : `<p class="empty-wait" id="stats-players">${q ? 'Nadie coincide con esa búsqueda.' : 'No hay jugadores en tu agenda.'}</p>`;
    }
  }
  return `
    <label class="field roster-search stats-search"><span>Buscar</span><input id="stats-q" autocomplete="off" placeholder="Nombre o teléfono" value="${esc(q)}"></label>
    ${missing}
    ${months}
    ${list}`;
}

function dayShare(date, dayMatches) {
  const me = actor();
  return organizerDayShare({
    matches: dayMatches,
    players: app.players,
    staff: staffUsers(app.users),
    uid: me.uid,
    name: me.name,
  });
}
function statsDayBody(id) {
  const matches = knownMatches().filter((match) => match?.date);
  const byDay = new Map();
  for (const match of matches) {
    if (!byDay.has(match.date)) byDay.set(match.date, []);
    byDay.get(match.date).push(match);
  }
  for (const rows of byDay.values()) {
    rows.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')) || String(a.id).localeCompare(String(b.id)));
  }
  const me = actor();
  const dates = diaDatesForOrganizer({
    today: todayISO(),
    done: compensationDoneDates(app.compensations),
    matches,
    staff: staffUsers(app.users),
    who: { uid: me.uid, name: me.name },
  });
  const staff = staffUsers(app.users);
  const mineOf = (rows) => (rows || []).filter((match) => matchOrganizedBy(match, staff, me));
  if (!id) {
    const rows = dates.map((date) => {
      const dayMatches = byDay.get(date) || [];
      const mine = mineOf(dayMatches);
      const times = mine.map((match) => match.time || '--:--').join(' · ');
      const count = mine.length;
      const cancelled = mine.filter((match) => match.cancelled === true).length;
      const tag = cancelled ? `<span class="tag">${cancelled === count ? 'Cancelado' : `${cancelled} cancelado${cancelled === 1 ? '' : 's'}`}</span>` : '';
      return `<li class="slot" data-date="${esc(date)}"><a class="who" href="${statsHash('dia', date)}"><div class="name">${esc(capitalize(labelDate(date)))}</div><div class="sub"><span>${count} ${count === 1 ? 'partido' : 'partidos'} · ${esc(times)}</span>${tag}</div><span class="stats-entitled">${esc(entitledLabel(dayShare(date, dayMatches)))}</span></a></li>`;
    }).join('');
    return `<ul class="slots" id="stats-days">${rows || '<li class="empty-wait">No hay partidos.</li>'}</ul>`;
  }
  const wanted = /^\d{4}-\d{2}-\d{2}$/.test(id) ? id : (matches.find((item) => item.id === id)?.date || '');
  const allDay = byDay.get(wanted) || [];
  const dayMatches = mineOf(allDay);
  if (!dayMatches.length) return `<div class="empty"><p><b>No hay partidos ese día.</b></p><p><a class="btn" href="${statsHash('dia')}">Volver a la lista</a></p></div>`;
  const blocks = dayMatches.map((match) => {
    const take = organizerViewTake({
      match,
      players: app.players,
      matches,
      prices: livePrices(),
      who: { uid: me.uid, name: me.name },
    });
    const when = `${match.time || '--:--'} hs`;
    return `<section class="profile-block stats-day-match"><h2>${esc(when)}</h2>${match.cancelled === true ? '<p class="hint">Cancelado: no suma plata.</p>' : ''}${takeSummary(take)}</section>`;
  }).join('');
  return `
    <p class="hint"><a href="${statsHash('dia')}">Todos los días</a></p>
    <h2 class="section" id="stats-day">${esc(capitalize(labelDate(wanted)))}</h2>
    <p class="stats-entitled" id="stats-entitled">${esc(entitledLabel(dayShare(wanted, allDay)))}</p>
    ${blocks}`;
}

function entitledLabel(amount) {
  return `Te correspondió: ${formatARS(amount || 0)}`;
}
function periodShares(grain) {
  const me = actor();
  return organizerShareByPeriod({
    matches: knownMatches(),
    players: app.players,
    staff: staffUsers(app.users),
    uid: me.uid,
    name: me.name,
    grain,
  });
}
function statsPeriodBody(grain, id) {
  const mode = grain === 'year' ? 'anio' : 'mes';
  const me = actor();
  const buckets = periodBuckets({
    matches: knownMatches(),
    players: app.players,
    prices: livePrices(),
    grain,
    who: { uid: me.uid, name: me.name },
    staff: staffUsers(app.users),
  });
  const shares = periodShares(grain);
  if (!id) {
    const rows = buckets.map((bucket) => {
      const mine = `<span class="stats-entitled">${esc(entitledLabel(shares.get(bucket.key) || 0))}</span>`;
      return `<li class="slot" data-period="${esc(bucket.key)}"><a class="who" href="${statsHash(mode, bucket.key)}"><div class="name">${esc(bucket.label)}</div><div class="sub"><span>${bucket.matches} ${bucket.matches === 1 ? 'partido' : 'partidos'} · ${bucket.players} ${bucket.players === 1 ? 'jugador' : 'jugadores'}</span><span>${esc(formatARS(bucket.collected))}</span></div>${mine}</a></li>`;
    }).join('');
    return `<ul class="slots" id="stats-periods">${rows || '<li class="empty-wait">No hay partidos.</li>'}</ul>`;
  }
  const bucket = buckets.find((item) => item.key === id);
  if (!bucket) return `<div class="empty"><p><b>No hay datos de ese período.</b></p><p><a class="btn" href="${statsHash(mode)}">Volver a la lista</a></p></div>`;
  const cancelled = bucket.cancelled > 0 ? `<p class="hint">${bucket.cancelled} ${bucket.cancelled === 1 ? 'cancelado, no suma' : 'cancelados, no suman'}.</p>` : '';
  const mine = `<p class="stats-entitled" id="stats-entitled">${esc(entitledLabel(shares.get(bucket.key) || 0))}</p>`;
  return `
    <p class="hint"><a href="${statsHash(mode)}">Todos</a></p>
    <h2 class="section" id="stats-period">${esc(bucket.label)}</h2>
    <p class="stat-summary" id="stats-period-count">${bucket.matches} ${bucket.matches === 1 ? 'partido' : 'partidos'} · ${bucket.players} ${bucket.players === 1 ? 'jugador' : 'jugadores'}</p>
    ${mine}
    ${cancelled}
    <section class="profile-block">
      <p class="stat-summary" id="stats-collected">Cobrado ${esc(formatARS(bucket.collected))} de ${esc(formatARS(bucket.expected))}</p>
      ${bucket.pending > 0 ? `<p class="pay-pending">Transfiere después ${esc(formatARS(bucket.pending))}</p>` : ''}
      <h2>Por medio</h2>
      ${moneyList(bucket.byMethod, 'Sin cobros.')}
    </section>`;
}

async function resolveAwaiting(playerId, ids, accept) {
  const player = app.players.find((item) => item.id === playerId);
  if (!player) return;
  const wanted = new Set(ids);
  const mine = awaitingItems(player).filter((item) => wanted.has(item.id) && item.toUid === actor().uid);
  const rest = awaitingItems(player).filter((item) => !mine.some((row) => row.id === item.id));
  if (!mine.length) return;
  if (!accept) {
    await app.store.updatePlayer(playerId, { awaiting: rest.length ? rest : null });
    for (const item of mine) {
      await app.store.logPlayerPago(playerId, {
        type: 'pago rechazado',
        method: item.kind === 'transfer' ? 'transferencia' : item.kind === 'credit' ? 'credito' : 'efectivo',
        amount: item.amount,
        paidTo: item.to,
        detail: 'No lo recibí',
      });
    }
    return;
  }
  const [plan] = planRows({
    rows: [{
      due: amountOwed(player, { players: app.players, matches: knownMatches(), prices: livePrices() }),
      signupName: player.signedUpWithName || player.addedBy || '',
      parts: mine.map((item) => ({ kind: item.kind, amount: item.amount, name: item.to, uid: item.toUid, confirmed: true })),
    }],
    debts: olderDebts(player, [player.id]),
  });
  const prev = paymentParts(player);
  let cash = prev.cash;
  let transfer = prev.transfer;
  let credit = prev.credit;
  let cashTo = player.cashTo || '';
  let transferTo = player.transferTo || '';
  let creditTo = player.creditTo || '';
  const transferBits = Array.isArray(player.transferParts) ? player.transferParts.map((part) => ({ ...part })) : [];
  for (const slice of plan.applied.used) {
    if (slice.kind === 'cash') { cash = roundMoney(cash + slice.amount); cashTo = slice.name; }
    else if (slice.kind === 'transfer') {
      transfer = roundMoney(transfer + slice.amount);
      transferBits.push({ to: slice.name, amount: slice.amount });
      transferTo = slice.name;
    } else { credit = roundMoney(credit + slice.amount); creditTo = slice.name; }
  }
  await app.store.setPayment(playerId, {
    paid: true, split: true, freePlay: false,
    cash, transfer, pendingTransfer: prev.pending, fromCredit: credit,
    cashTo: cash > 0 ? cashTo : null,
    transferTo: transferBits.length <= 1 && transfer > 0 ? transferTo : null,
    transferParts: transferBits.length > 1 ? transferBits : null,
    pendingTo: prev.pending > 0 ? player.pendingTo : null,
    creditTo: credit > 0 ? creditTo : null,
    awaiting: rest.length ? rest : null,
  }, app.who);
  for (const item of plan.applied.credits || []) {
    const organizerUid = item.uid || actor().uid;
    await app.store.adjustCredit({ personKey: personKey(player, app.players), organizerUid, organizerName: item.name, name: player.name, delta: item.amount }, app.who);
    await app.store.recordCreditLoad({ match: null, player: { ...player, creditTo: item.name }, amount: item.amount, solo: true });
  }
  for (const item of plan.applied.settlements || []) {
    const who = app.players.find((row) => row.id === item.id);
    if (!who) continue;
    const old = paymentParts(who);
    await app.store.setPayment(who.id, {
      paid: true, split: true, freePlay: false,
      cash: item.kind === 'cash' ? roundMoney(old.cash + item.amount) : old.cash,
      transfer: item.kind === 'transfer' ? roundMoney(old.transfer + item.amount) : old.transfer,
      pendingTransfer: old.pending,
      fromCredit: item.kind === 'credit' ? roundMoney(old.credit + item.amount) : old.credit,
      cashTo: item.kind === 'cash' ? item.name : who.cashTo,
      transferTo: item.kind === 'transfer' ? item.name : who.transferTo,
      pendingTo: who.pendingTo,
      creditTo: item.kind === 'credit' ? item.name : who.creditTo,
    }, app.who);
  }
}

function confirmQueueHtml() {
  const rows = myAwaiting();
  if (!rows.length) return '';
  const n = rows.length;
  const kind = (item) => item.kind === 'transfer' ? 'Transferencia' : item.kind === 'credit' ? 'Crédito' : 'Efectivo';
  return `<section id="confirm-queue">
    <h2 class="section">Para confirmar</h2>
    <p class="hint" id="confirm-count">Tenés ${n} ${n === 1 ? 'pago' : 'pagos'} para confirmar.</p>
    <ul class="slots" id="confirm-list">${rows.map((row) => `<li class="slot confirm-row">
      <label class="checkline"><input type="checkbox" data-confirm-pick="${esc(row.id)}" data-player="${esc(row.player.id)}"><span>${esc(row.player.name)} · ${esc(row.match ? fmtWhen(row.match) : '')} · ${kind(row)} ${esc(formatARS(row.amount))}</span></label>
      <div class="slot-actions"><button type="button" class="btn" data-confirm-ok="${esc(row.id)}" data-player="${esc(row.player.id)}">Confirmar</button><button type="button" class="btn" data-confirm-no="${esc(row.id)}" data-player="${esc(row.player.id)}">Rechazar</button></div>
    </li>`).join('')}</ul>
    <button type="button" class="btn primary" id="confirm-many">Confirmar seleccionados</button>
  </section>`;
}

function renderRegistro(r) {
  const section = r.section === 'pagos' ? 'pagos' : 'partidos';
  if (!app.logRange) app.logRange = weekRange();
  const range = app.logRange;
  const rows = (app.log || []).filter((entry) => entry.section === section);
  const list = rows.length
    ? `<ul class="slots" id="log-list">${rows.map((entry) => `
      <li class="slot log-row">
        <div class="who">
          <div class="name">${esc(entry.type)}</div>
          <div class="sub"><span>${esc(logWhen(entry))}</span>${section === 'pagos' && entry.actorName ? `<span>Registró: ${esc(entry.actorName)}</span>` : `<span>${esc(entry.actorName || '')}</span>`}${section === 'pagos' && entry.paidTo ? `<span>Cobró: ${esc(entry.paidTo)}</span>` : ''}</div>
          <div class="sub">${esc(logText(entry))}</div>
        </div>
      </li>`).join('')}</ul>`
    : `<p class="empty-wait" id="log-empty">${app.logError ? esc(app.logError) : 'No hay registros en estas fechas.'}</p>`;
  if (!replaceView(`
    <div id="log-view">
      <h2 class="section" id="log-title">Registro de movimientos</h2>
      <div class="seg stats-seg" id="log-mode">
        <a class="btn ${section === 'partidos' ? 'primary' : ''}" href="#/registro/partidos"${section === 'partidos' ? ' aria-current="page"' : ''}>Partidos</a>
        <a class="btn ${section === 'pagos' ? 'primary' : ''}" href="#/registro/pagos"${section === 'pagos' ? ' aria-current="page"' : ''}>Pagos</a>
      </div>
      <form id="log-range" class="log-range">
        <label class="field"><span>Desde</span><input type="date" id="log-from" value="${esc(range.from)}" aria-label="Desde"></label>
        <label class="field"><span>Hasta</span><input type="date" id="log-to" value="${esc(range.to)}" aria-label="Hasta"></label>
        <button type="submit" class="btn" id="log-apply">Ver</button>
      </form>
      <p class="hint" id="log-hint">Últimos 20 días, hasta hoy. Tocá Ver para usar otras fechas.</p>
      ${confirmQueueHtml()}
      ${list}
    </div>`)) return;
  const form = $('#log-range');
  const apply = () => {
    const from = $('#log-from').value;
    const to = $('#log-to').value;
    if (!from || !to || from > to) return;
    app.logRange = { from, to };
    app.store?.setLogRange?.(app.logRange);
    render();
  };
  form.onsubmit = (e) => { e.preventDefault(); apply(); };
  const queue = $('#confirm-queue');
  if (queue) queue.onclick = async (event) => {
    const ok = event.target.closest('[data-confirm-ok]');
    const no = event.target.closest('[data-confirm-no]');
    const many = event.target.closest('#confirm-many');
    const runOne = async (playerId, id, accept) => {
      await resolveAwaiting(playerId, [id], accept);
      render();
    };
    if (ok) return runOne(ok.dataset.player, ok.dataset.confirmOk, true);
    if (no) return runOne(no.dataset.player, no.dataset.confirmNo, false);
    if (!many) return;
    const picks = [...queue.querySelectorAll('[data-confirm-pick]:checked')];
    for (const pick of picks) await resolveAwaiting(pick.dataset.player, [pick.dataset.confirmPick], true);
    render();
  };
}

function renderUsers() {
  if (app.role !== 'admin') {
    replaceView(`<div class="empty"><div class="big">🔒</div><p><b>Solo el administrador puede crear o desactivar organizadores.</b></p><p class="small">Los partidos, los jugadores, los pagos y el plantel los pueden editar los dos.</p></div>`);
    return;
  }
  const rows = (app.users || []).map((user) => `
    <li class="slot" data-user="${esc(user.uid)}">
      <div class="who">
        <div class="name">${esc(user.name)}</div>
        <div class="sub">${esc(user.email)} · ${user.role === 'admin' ? 'Administrador' : 'Organizador'}${user.active ? '' : ' · desactivado'}</div>
      </div>
      ${user.role === 'organizer' ? `<button type="button" class="btn" data-user-active="${esc(user.uid)}">${user.active ? 'Desactivar' : 'Activar'}</button>` : ''}
      ${user.role === 'organizer' ? `<button type="button" class="btn danger" data-user-del="${esc(user.uid)}">Borrar</button>` : ''}
    </li>`).join('');
  if (!replaceView(`
    <h2 class="section">Organizadores</h2>
    <p class="hint roster-lead">Esta es la única diferencia con los organizadores: crear, desactivar o borrar sus cuentas. El rol no se cambia. En los partidos pueden lo mismo.</p>
    <ul class="slots" id="user-list">${rows || '<li class="empty-wait">No hay usuarios.</li>'}</ul>
    <form id="user-form" class="user-form" novalidate>
      <h2 class="section">Nuevo organizador</h2>
      <label class="field"><span>Nombre</span><input name="name" maxlength="40" autocomplete="off" placeholder="Ej: Lucía"></label>
      <label class="field"><span>Mail</span><input name="email" type="email" autocomplete="off" placeholder="lucia@correo.com"></label>
      <label class="field"><span>Contraseña</span><input name="password" type="password" autocomplete="new-password" placeholder="Al menos 6 caracteres"></label>
      <div class="field"><div class="err" id="user-err"></div></div>
      <button class="btn primary" type="submit">Crear organizador</button>
    </form>`)) return;
  $('#user-form').onsubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    Promise.resolve(app.session.createOrganizer({ name: form.name.value, email: form.email.value, password: form.password.value }))
      .then(() => { form.reset(); toast('Organizador creado'); renderUsers(); })
      .catch((error) => { $('#user-err').textContent = error?.message || 'No se pudo crear'; });
  };
  $('#user-list').onclick = async (e) => {
    const toggle = e.target.closest('[data-user-active]');
    if (toggle) {
      const user = app.users.find((item) => item.uid === toggle.dataset.userActive);
      if (!user) return;
      Promise.resolve(app.session.setOrganizerActive(user.uid, !user.active)).then(() => renderUsers()).catch((error) => toast(error?.message || 'No se pudo cambiar'));
      return;
    }
    const del = e.target.closest('[data-user-del]');
    if (!del) return;
    const user = app.users.find((item) => item.uid === del.dataset.userDel);
    if (!user || !(await askConfirm(`¿Borrar a ${user.name}? La cuenta de acceso queda en Firebase hasta que la borres en la consola.`, { danger: true }))) return;
    Promise.resolve(app.session.deleteOrganizer(user.uid)).then(() => renderUsers()).catch((error) => toast(error?.message || 'No se pudo borrar'));
  };
}

let levelCaretIntent = null;

function renderProfile(id) {
  const person = app.roster.find((r) => r.id === id);
  const fromMatch = app.profileViaMatchId === id;
  if (!fromMatch && (!person || !rosterHeldBy(person, actor()))) {
    app.signupDraft = null;
    showAnonymousDenial();
    return;
  }
  if (!person) {
    app.signupDraft = null;
    replaceView(`<div class="empty"><div class="big">👤</div><p><b>No encontramos este jugador.</b></p><p class="small">${app.rosterError ? esc(app.rosterError) : 'Puede que lo hayan borrado de Jugadores.'}</p><p><a class="btn" href="#/jugadores">Volver a Jugadores</a></p></div>`);
    return;
  }
  const who = rosterIdentity(person);
  const stats = playerStats({ ...who, players: app.players, matches: app.matches });
  const record = playerRecord({ ...who, players: app.players, matches: app.matches, organizer: staffActor() });
  const positions = new Set(person.positions || []);
  const level = storedLevel(person.level);
  const own = canEditRoster(person, actor());
  const lockNote = own ? '' : `<p class="hint edit-lock" id="edit-lock">${esc(EDIT_LOCK_TEXT)}</p>`;
  const money = profileMoney(person);
  const painted = replaceView(`
    <article id="profile">
      ${suspensionControls(person).html}
      <div class="name-share">
        <h2 class="section${fichaSuspended(person)}">${fichaName(person, person.name)}</h2>
        ${playerShareButton('profile-share')}
      </div>
      ${money.panel.nickHtml}
      ${own ? `<label class="field profile-name"><span>Nombre</span><input id="profile-name" maxlength="60" autocomplete="name" value="${esc(person.name)}"></label>` : ''}
      <div class="phone-row">
        <p class="profile-phone" id="profile-phone">${person.phone ? esc(displayFromWa(person.phone)) : phoneHidden(person) ? esc(PRIVATE_WA_TEXT) : 'Sin número'}</p>
        ${person.phone && person.hasPhone && person.phoneOwnerUid === actor().uid ? waShareControl('phone-share', { checked: person.phoneShared === true }) : ''}
      </div>
      ${lockNote}
      ${person.phone
        ? `<a class="btn profile-wa" id="profile-wa" href="${esc(waHref(person.phone))}" target="_blank" rel="noopener">${ICON.wa}WhatsApp</a>`
        : phoneHidden(person)
          ? `<button type="button" class="btn profile-wa" id="profile-wa" disabled>${ICON.wa}${esc(PRIVATE_WA_TEXT)}</button>`
          : `<button type="button" class="btn profile-add-phone" id="profile-add-phone"${own ? '' : ' disabled'}>Cargar WhatsApp</button>`}
      ${partidosSection(person)}
      <section class="profile-block">
        <h2>Nivel de juego</h2>
        <div class="stepper">
          <button type="button" class="btn" id="level-down" aria-label="Bajar nivel" ${!own || stepLevel(level, -1) == null ? 'disabled' : ''}>−</button>
          <input id="level-val" inputmode="decimal" autocomplete="off" maxlength="4" pattern="\\d{1,2}([.,]\\d)?" placeholder="Ej: 6,8" aria-label="Nivel de juego" value="${esc(level == null ? '' : formatLevel(level))}"${own ? '' : ' disabled'}>
          <button type="button" class="btn" id="level-up" aria-label="Subir nivel" ${!own || stepLevel(level, 1) == null ? 'disabled' : ''}>+</button>
        </div>
      </section>
      <section class="profile-block">
        <h2>Posiciones</h2>
        <div class="chips" id="positions">${POSITIONS.map((pos) => `<button type="button" class="btn chip ${positions.has(pos) ? 'on' : ''}" data-pos="${esc(pos)}"${own ? '' : ' disabled'}>${esc(pos)}</button>`).join('')}</div>
      </section>
      <section class="profile-block" id="stats">
        <h2>Partidos jugados</h2>
        <p class="stat-summary" id="stat-times">${stats.played ? `Jugó ${stats.played} ${stats.played === 1 ? 'vez' : 'veces'}` : 'Todavía no jugó'}</p>
        ${stats.summary ? `<p class="stat-summary" id="stat-summary">${esc(stats.summary)}</p>` : ''}
        ${stats.dates.length ? `<ul class="stat-dates">${stats.dates.map((d) => `<li>${esc(d.label)}</li>`).join('')}</ul>` : '<p class="hint">Cuenta solo partidos que ya pasaron, en la lista principal.</p>'}
        <p class="hint" id="stat-pay">${esc(record.paidText)}</p>
        ${record.confirmText ? `<p class="hint" id="stat-confirm">${esc(record.confirmText)}</p>` : ''}
      </section>
      ${money.html}
    </article>`);
  if (app.wantPhoneForm) {
    app.wantPhoneForm = false;
    if (!person.phone && !phoneHidden(person)) openPhoneForm(person);
  }
  if (!painted) return;
  bindPlayerPanel($('#profile'), null, person, PROFILE_PANEL, money.panel);
  const profileSuspend = suspensionControls(person);
  bindSuspensionControls($('#profile'), profileSuspend.rosterId, profileSuspend.card);
  const profileShare = $('#profile-share');
  if (profileShare) profileShare.onclick = () => copyPlayerLink(person.id);
  const addPhone = $('#profile-add-phone');
  if (addPhone && own) addPhone.onclick = () => openPhoneForm(person);
  const profileName = $('#profile-name');
  if (profileName && own) profileName.addEventListener('change', () => {
    const name = profileName.value.trim().replace(/\s+/g, ' ');
    if (!name) { profileName.value = person.name; return; }
    if (name === person.name) return;
    Promise.resolve(app.store.updateRoster(person.id, { name })).catch((error) => {
      profileName.value = person.name;
      if (error?.code === 'already-in-match') toast(error.message || ALREADY_IN_MATCH);
      else if (isRosterDenied(error)) showError(`${ROSTER_DENIED_WRITE} El perfil no se guardó.`);
      else toast('No se pudo guardar: ' + (error?.code || error?.message || error));
    });
  });
  const share = $('#phone-share');
  if (share) share.onchange = () => run(app.store.setPhoneShared({ rosterId: person.id }, share.checked));
  const levelInput = $('#level-val');
  const levelBase = () => {
    const parsed = parseLevel(levelInput?.value ?? '');
    return parsed.ok ? parsed.level : level;
  };
  const rememberLevelCaret = () => {
    if (!levelInput || document.activeElement !== levelInput) return;
    const caret = levelInput.selectionStart ?? 0;
    levelCaretIntent = { id: person.id, caret, side: levelStepSide(levelInput.value, caret) };
    syncLevelButtons();
  };
  const levelCaret = () => {
    if (levelInput && document.activeElement === levelInput) return levelInput.selectionStart ?? 0;
    if (levelCaretIntent?.id === person.id && Number.isFinite(levelCaretIntent.caret)) return levelCaretIntent.caret;
    return 0;
  };
  function syncLevelButtons() {
    const base = levelBase();
    const side = levelStepSide(levelInput?.value ?? '', levelCaret());
    const down = $('#level-down');
    const up = $('#level-up');
    if (down) down.disabled = !own || stepLevel(base, -1, side) == null;
    if (up) up.disabled = !own || stepLevel(base, 1, side) == null;
  }
  const nudgeLevel = (dir) => {
    if (!own || !levelInput) return;
    const caret = levelCaret();
    const side = levelStepSide(levelInput.value, caret);
    const next = stepLevel(levelBase(), dir, side);
    if (next == null) return;
    const formatted = formatLevel(next);
    const kept = levelCaretAfterStep(levelInput.value, caret, formatted);
    levelCaretIntent = { id: person.id, caret: kept, side: levelStepSide(formatted, kept) };
    saveProfile(person.id, { level: next });
    const again = $('#level-val');
    if (again) {
      try { again.setSelectionRange(kept, kept); } catch { /* sin foco el navegador puede ignorarlo */ }
    }
  };
  if (levelInput && own) {
    levelInput.addEventListener('input', () => {
      const next = filterLevelTyping(levelInput.value);
      if (next !== levelInput.value) {
        const pos = levelInput.selectionStart;
        levelInput.value = next;
        try { levelInput.setSelectionRange(pos, pos); } catch { /* el navegador puede rechazar el rango */ }
      }
      rememberLevelCaret();
      syncLevelButtons();
    });
    levelInput.addEventListener('keyup', rememberLevelCaret);
    levelInput.addEventListener('click', rememberLevelCaret);
    levelInput.addEventListener('pointerup', rememberLevelCaret);
    levelInput.addEventListener('blur', () => {
      const caret = levelInput.selectionStart ?? 0;
      levelCaretIntent = { id: person.id, caret, side: levelStepSide(levelInput.value, caret) };
      syncLevelButtons();
    });
    if (app.levelSelection) document.removeEventListener('selectionchange', app.levelSelection);
    app.levelSelection = () => rememberLevelCaret();
    document.addEventListener('selectionchange', app.levelSelection);
    levelInput.addEventListener('change', () => {
      const parsed = parseLevel(levelInput.value);
      if (!parsed.ok || parsed.level == null) {
        levelInput.value = level == null ? '' : formatLevel(level);
        if (!parsed.ok) toast(parsed.error);
        syncLevelButtons();
        return;
      }
      const formatted = formatLevel(parsed.level);
      const caret = levelCaret();
      const kept = levelCaretAfterStep(levelInput.value, caret, formatted);
      levelInput.value = formatted;
      levelCaretIntent = { id: person.id, caret: kept, side: levelStepSide(formatted, kept) };
      try { levelInput.setSelectionRange(kept, kept); } catch { /* sigue el lado elegido */ }
      syncLevelButtons();
      if (storedLevel(level) === parsed.level) return;
      saveProfile(person.id, { level: parsed.level });
    });
    for (const id of ['level-down', 'level-up']) {
      const btn = $('#' + id);
      if (!btn) continue;
      btn.addEventListener('pointerdown', rememberLevelCaret);
      btn.addEventListener('keydown', rememberLevelCaret);
    }
  }
  syncLevelButtons();
  $('#level-down').onclick = () => nudgeLevel(-1);
  $('#level-up').onclick = () => nudgeLevel(1);
  $('#positions').onclick = (e) => {
    if (!own) return;
    const btn = e.target.closest('[data-pos]');
    if (!btn) return;
    const pos = btn.dataset.pos;
    const next = new Set(person.positions || []);
    if (next.has(pos)) next.delete(pos); else next.add(pos);
    saveProfile(person.id, { positions: POSITIONS.filter((item) => next.has(item)) });
  };
  bindPartidos(person);
}

function signupDraft(person) {
  if (!app.signupDraft || app.signupDraft.rosterId !== person.id) {
    app.signupDraft = { rosterId: person.id, ids: new Set(), tentative: false };
  }
  return app.signupDraft;
}

function signupRows(person) {
  const draft = signupDraft(person);
  const uid = actor().uid;
  const upcoming = upcomingMatches(app.matches).filter((match) => {
    const state = matchSignupState({ ...rosterIdentity(person), match, players: app.players });
    return state.existing || canAdd(match, uid);
  });
  const rows = upcoming.map((match) => {
    const state = matchSignupState({ ...rosterIdentity(person), match, players: app.players });
    return { id: match.id, match, state, existing: state.existing };
  });
  const keep = new Set(keptSignupIds(draft.ids, rows));
  for (const id of [...draft.ids]) if (!keep.has(id)) draft.ids.delete(id);
  return rows;
}

function partidosSection(person) {
  const draft = signupDraft(person);
  const rows = signupRows(person).map(({ match, state }) => {
    const when = `${capitalize(labelDate(match.date))} · ${match.time || '--:--'} hs`;
    const blocked = playerBlockedOn(match, person);
    const why = blocked ? blockedByText(match, person) : '';
    if (blocked && !state.existing) draft.ids.delete(match.id);
    const picked = !state.existing && !blocked && draft.ids.has(match.id);
    const locked = state.existing ? 'checked disabled' : (blocked ? 'disabled' : (picked ? 'checked' : ''));
    const cover = why ? `<button type="button" class="signup-block" data-blocked="${esc(why)}" aria-label="${esc(why)}"></button>` : '';
    const remove = state.existing && state.playerId
      ? `<button type="button" class="btn" data-signup-remove="${esc(state.playerId)}">Quitar</button>`
      : '';
    return `<li class="slot signup-row" data-match="${esc(match.id)}">
      <label class="signup-check"><input type="checkbox" data-signup="${esc(match.id)}" ${locked} aria-label="${esc(when)}">${cover}</label>
      <button type="button" class="who" data-open-match="${esc(match.id)}">
        <div class="name">${esc(capitalize(labelDate(match.date)))}</div>
        <div class="sub"><span>${esc(match.time || '--:--')} hs</span><span class="tag">${esc(state.label)}</span></div>
      </button>
      ${remove}
    </li>`;
  });
  const empty = rows.length ? '' : '<p class="empty-wait" id="signup-empty">No hay partidos próximos.</p>';
  return `<section class="profile-block" id="partidos">
    <h2>Partidos</h2>
    <p class="hint">Elegí los próximos y anotalo de una. Si el partido está completo, va a la lista de espera.</p>
    ${activeSuspensions(app.suspensions, person.id).some((row) => row.ownerUid === actor().uid) ? `<p class="hint" id="signup-suspended">${esc(SUSPENDED_TEXT)}</p>` : ''}
    <ul class="slots" id="signup-list">${rows.join('')}</ul>
    ${empty}
    <label class="checkline"><input type="checkbox" id="signup-tentative" ${draft.tentative ? 'checked' : ''}> Anotar como pendiente de confirmación</label>
    <button type="button" class="btn primary block" id="btn-signup"${draft.ids.size ? '' : ' disabled'}>${esc(signupButtonLabel(draft.ids.size))}</button>
  </section>`;
}

function signupButtonLabel(count) {
  if (count === 1) return 'Anotar en 1 partido';
  return `Anotar en ${count} partidos`;
}

function bindPartidos(person) {
  const list = $('#signup-list');
  const button = $('#btn-signup');
  const draft = signupDraft(person);
  if (!list || !button) return;
  const paint = () => {
    const n = draft.ids.size;
    button.disabled = n === 0;
    button.textContent = signupButtonLabel(n);
  };
  list.addEventListener('change', (event) => {
    const input = event.target.closest('input[data-signup]');
    if (!input || input.disabled) return;
    if (input.checked) draft.ids.add(input.dataset.signup);
    else draft.ids.delete(input.dataset.signup);
    paint();
  });
  const tent = $('#signup-tentative');
  if (tent) tent.addEventListener('change', () => { draft.tentative = tent.checked; });
  list.addEventListener('click', async (event) => {
    const blockedBtn = event.target.closest('[data-blocked]');
    if (blockedBtn) {
      askNotice(blockedBtn.dataset.blocked);
      return;
    }
    const open = event.target.closest('[data-open-match]');
    if (open) {
      location.hash = `#/partido/${encodeURIComponent(open.dataset.openMatch)}`;
      return;
    }
    const remove = event.target.closest('[data-signup-remove]');
    if (!remove) return;
    const player = app.players.find((item) => item.id === remove.dataset.signupRemove);
    const match = player ? matchById(player.matchId) : null;
    if (!player || !match) return;
    if (!canAdd(match, actor().uid)) { toast('Este partido es de solo lectura.'); return; }
    if (!(await askConfirm(`¿Quitar a ${person.name} de ${labelDate(match.date)} ${match.time || ''} hs?`, { danger: true }))) return;
    removeMatchPlayer(match, player, { asked: true });
  });
  button.onclick = async () => {
    const chosen = [];
    for (const id of [...draft.ids]) {
      const match = matchById(id);
      const stillUp = match && upcomingMatches(app.matches).some((item) => item.id === id);
      const state = match ? matchSignupState({ ...rosterIdentity(person), match, players: app.players }) : null;
      if (!match || !stillUp || !state || state.existing || playerBlockedOn(match, person)) {
        draft.ids.delete(id);
        continue;
      }
      chosen.push({ match, state });
    }
    paint();
    if (!chosen.length) return;
    const waits = chosen.filter((row) => row.state.willWait);
    if (waits.length) {
      const which = waits.map((row) => `${labelDate(row.match.date)} ${row.match.time || ''} hs`).join(', ');
      if (!(await askConfirm(`En ${which} no hay lugar: va a quedar en la lista de espera. ¿Seguís?`))) return;
    }
    button.disabled = true;
    const tentative = draft.tentative;
    draft.tentative = false;
    const msg = waits.length === chosen.length
      ? (chosen.length === 1 ? `${person.name} quedó en la lista de espera` : `${person.name} quedó en la espera de ${chosen.length} partidos`)
      : waits.length
        ? `${person.name} anotado · ${waits.length} en espera`
        : (chosen.length === 1 ? `${person.name} anotado` : `${person.name} anotado en ${chosen.length} partidos`);
    run((async () => {
      for (const row of chosen) {
        const again = matchSignupState({ ...rosterIdentity(person), match: row.match, players: app.players });
        if (again.existing) { toast(ALREADY_IN_MATCH); continue; }
        if (playerBlockedOn(row.match, person)) { askNotice(blockedByText(row.match, person) || SUSPENDED_TEXT); continue; }
        const blocked = addBlock(row.match);
        if (blocked) { toast(blocked); continue; }
        try {
          const pid = await app.store.addPlayer(row.match, { name: person.name, shortName: person.shortName || '', phone: person.phone || '', rosterId: person.id, phoneKey: person.phoneKey || '', hasPhone: person.hasPhone === true, phoneShared: person.phoneShared === true }, app.who, {
            waiting: again.willWait,
            tentative: tentative && !again.willWait,
          });
          if (!again.willWait) await applyAutoCredit(pid);
        } catch (error) {
          if (error?.code === 'already-in-match') { toast(ALREADY_IN_MATCH); continue; }
          throw error;
        }
      }
    })(), msg);
  };
  paint();
}

function openNoteForm(person, note, player) {
  const matches = [...app.matches].sort((a, b) => (b.startsAt ?? 0) - (a.startsAt ?? 0));
  const selected = note?.matchId || app.profileMatchId || matches[0]?.id || '';
  openSheet(`
    <form id="note-form" novalidate>
      <h3>${note ? 'Editar nota' : 'Nota de partido'}</h3>
      <label class="field"><span>Partido</span>
        <select name="match" required>${matches.map((m) => `<option value="${esc(m.id)}" ${m.id === selected ? 'selected' : ''}>${esc(capitalize(labelDate(m.date)))} · ${esc(m.time || '--:--')} hs</option>`).join('')}</select>
      </label>
      <label class="field"><span>Qué pasó</span><textarea name="text" maxlength="${MAX_NOTE_TEXT}" required placeholder="Ej: hizo un gol, llegó tarde">${esc(note?.text || '')}</textarea></label>
      <div class="field"><div class="err" id="note-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  const form = $('#note-form');
  if (!matches.length) { $('#note-err').textContent = 'No hay partidos para asociar la nota.'; form.querySelector('[type=submit]').disabled = true; return; }
  form.onsubmit = (e) => {
    e.preventDefault();
    const match = matchById(form.match.value);
    const text = form.text.value.trim();
    if (!match) { $('#note-err').textContent = 'Elegí un partido.'; return; }
    if (!text) { $('#note-err').textContent = 'Escribí la nota.'; return; }
    const notes = [...((app.rosterNotes && app.rosterNotes[person.id]) || [])];
    if (note) {
      const i = notes.findIndex((n) => n.id === note.id);
      if (i >= 0) notes[i] = { ...notes[i], matchId: match.id, matchDate: match.date, matchTime: match.time || '', text, updatedAt: Date.now() };
    } else {
      if (notes.length >= MAX_NOTES) { $('#note-err').textContent = `Máximo ${MAX_NOTES} notas.`; return; }
      notes.push({ id: noteId(), matchId: match.id, matchDate: match.date, matchTime: match.time || '', text, createdAt: Date.now(), updatedAt: Date.now() });
    }
    closeSheet();
    saveProfile(person.id, { notes }, () => reopenPlayerMenu(player));
  };
}

async function linkedRosterId({ name, phone, rosterId, phoneKey: key, phoneShared, strictName = false }) {
  try { return await ensureRoster({ name, phone, rosterId, phoneKey: key || (phone ? phoneIdentity({ phone }) : ''), phoneShared, strictName }); }
  catch (error) {
    if (error?.code === 'roster-duplicate') return rosterByPhone(app.roster, phone)?.id || rosterByIdentity(app.roster, phoneIdentity({ phone }))?.id || rosterId || '';
    if (isRosterDenied(error)) showError(`${ROSTER_DENIED_WRITE} El partido igual quedó anotado.`);
    else console.error(error);
    return rosterId || '';
  }
}

function matesOf(matchId) {
  return app.players.filter((player) => player.matchId === matchId);
}

function guestsOf(matchId, hostId) {
  const mates = matesOf(matchId);
  const byId = new Map(mates.map((player) => [player.id, player]));
  return mates.filter((player) => rootInviterId(player, byId) === hostId);
}

function guestQtyHtml(value) {
  return `<div class="friend-qty">
    <span>Cuántos invitados</span>
    <div class="qty">
      <button type="button" class="btn" id="friend-minus" aria-label="Menos invitados">−</button>
      <input id="friend-count" inputmode="numeric" value="${value}" aria-label="Cantidad de invitados">
      <button type="button" class="btn" id="friend-plus" aria-label="Más invitados">+</button>
    </div>
  </div>`;
}

function bindGuestQty({ min = 0, value = 0, taken = [] } = {}) {
  const input = $('#friend-count');
  const rows = $('#friend-rows');
  if (!input || !rows) return;
  const clamp = (n) => Math.min(20, Math.max(min, Number.isFinite(n) ? n : min));
  const paint = (n, focus) => {
    const count = clamp(Math.floor(Number(n) || 0));
    const kept = [...rows.querySelectorAll('input')].map((el) => el.value);
    input.value = String(count);
    rows.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const row = document.createElement('div');
      row.className = 'friend-row';
      row.innerHTML = `<input type="text" maxlength="60" autocomplete="off" placeholder="Nombre, si lo sabés" aria-label="Nombre del invitado ${i + 1}">`;
      rows.appendChild(row);
      row.querySelector('input').value = kept[i] || '';
    }
    const names = resolveFriendNames(Array.from({ length: count }, () => ''), taken);
    const hint = $('#friend-hint');
    if (hint) {
      hint.textContent = names.length
        ? `Si dejás el nombre vacío: ${names.map((item) => item.name).join(', ')}.`
        : 'Sin invitados entra solo él.';
    }
    if (focus) rows.querySelector('input')?.focus();
  };
  paint(value, false);
  $('#friend-plus').onclick = () => paint(Number(input.value) + 1, true);
  $('#friend-minus').onclick = () => paint(Number(input.value) - 1, false);
  input.addEventListener('change', () => paint(parseInt(input.value, 10), false));
}

function friendNamesOf(matchId, hostId) {
  return guestsOf(matchId, hostId).map((player) => player.name);
}

function signupError(matchId, people) {
  return firstDuplicate(matesOf(matchId), people) ? ALREADY_IN_MATCH : '';
}

function focusField(el) {
  if (!el || el.disabled) return false;
  el.focus();
  return true;
}

/** El grupo entra junto: quien invita primero, después los amigos, en ese orden. */
async function addSignedPlayer(m, host, asWait, tentative, friendRows = [], opts = {}) {
  const { resolved = null, also = [] } = opts;
  if (!host?.id && playerBlockedOn(m, host)) return SUSPENDED_TEXT;
  const blocked = addBlock(m);
  if (blocked) { toast(blocked); return false; }
  const guestBlock = host?.id ? inviteBlock(matesOf(m.id), host.id) : '';
  if (guestBlock) { toast(guestBlock); return false; }
  const taken = host?.id ? friendNamesOf(m.id, host.id) : [];
  const friends = (resolved || resolveFriendNames(friendRows, taken)).map((friend) => ({
    name: friend.name,
    guestAuto: friend.guestAuto,
    invitedBy: host?.id || (friend.guestAuto ? 'nuevo' : ''),
    invitedByName: host?.name || '',
  }));
  const people = host?.id
    ? friends
    : [{ name: host.name, phone: host.phone || '', phoneKey: host.phoneKey || '', rosterId: host.rosterId || '', hasPhone: host.hasPhone === true, phoneShared: host.phoneShared === true }, ...friends];
  if (!people.length) return false;
  const dup = signupError(m.id, people);
  if (dup) return dup;
  const max = limitFor(m, actor().uid);
  if (max != null && addedCount(matesOf(m.id), actor()) + people.length > max) {
    toast(limitMessage(max));
    return false;
  }
  const onWait = asWait === true || host?.waiting === true;
  const place = placeGroup({ mainCount: playersOf(m.id).length, capacity: capOf(m), count: people.length, forceWait: onWait });
  if (tentative && place.main < 1) {
    toast('No hay lugar libre para reservar.');
    return false;
  }
  const warning = friends.length && !onWait ? waitWarning(place.spots, place.wait) : '';
  if (warning && !(await askConfirm(warning))) return false;
  const signup = readSignup(document.querySelector('#player-form, #friend-form'));
  const known = host?.rosterId ? app.roster.find((person) => person.id === host.rosterId) : null;
  const share = host?.phoneShared === true || known?.phoneShared === true;
  const lead = host?.name || friends[0]?.name || '';
  const msg = host?.id
    ? (place.wait && place.main ? `Invitados de ${lead} anotados · ${place.wait} en espera` : place.main ? `Invitados de ${lead} anotados` : `Invitados de ${lead} en la lista de espera`)
    : (place.wait && place.main ? `${lead} anotado · ${place.wait} en espera` : place.main ? `${lead} anotado` : `${lead} quedó en la lista de espera`);
  closeSheet();
  run((async () => {
    if (opts.reveal === true) startReveal(m.id);
    let hostId = host?.id || '';
    let hostName = host?.name || '';
    let offset = 0;
    if (!host?.id) {
      const id = await linkedRosterId({ name: host.name, phone: host.phone, rosterId: host.rosterId, phoneKey: host.phoneKey, phoneShared: share && !known, strictName: !host.rosterId });
      let saved = id ? app.roster.find((person) => person.id === id) : null;
      if (saved && foldText(saved.name) !== foldText(host.name)) saved = null;
      if (share && saved && saved.phoneShared !== true && saved.phoneOwnerUid === actor().uid) {
        try { await app.store.setPhoneShared({ rosterId: id }, true); } catch { /* el dueño lo cambia desde el perfil */ }
        saved = app.roster.find((person) => person.id === id) || saved;
      }
      const visible = share || saved?.phoneShared === true;
      const waiting = offset >= place.main;
      hostId = await app.store.addPlayer(m, {
        name: host.name,
        shortName: saved?.shortName || '',
        phone: host.phone || '',
        rosterId: id,
        phoneKey: host.phoneKey || saved?.phoneKey || '',
        hasPhone: host.hasPhone === true || saved?.hasPhone === true,
        phoneShared: visible,
        ...signup,
      }, app.who, { waiting, tentative: tentative === true && !waiting });
      if (!waiting) await applyAutoCredit(hostId);
      hostName = host.name;
      offset = 1;
      if (opts.reveal === true) app.revealPlayerId = hostId;
    }
    for (const friend of friends) {
      const waiting = offset >= place.main;
      const friendId = await app.store.addPlayer(m, {
        name: friend.name,
        phone: '',
        invitedBy: hostId,
        invitedByName: hostName,
        guestAuto: friend.guestAuto === true,
        ...signup,
      }, app.who, { waiting });
      if (!waiting) await applyAutoCredit(friendId);
      offset += 1;
    }
    if (also.length) {
      const notes = await addGuestsToSameDay(also, friends, signup, m);
      if (notes.length) toast(notes.join(' · '), 4500);
    }
    if (opts.reveal === true && app.revealPlayerId) {
      const shown = app.revealPlayerId;
      settleRevealedPlayer();
      armRevealWatch(shown);
    }
  })(), msg);
  return true;
}

/**
 * Los otros partidos del mismo día en los que está anotado quien invita
 * (misma persona: personKey). Para sumarle los mismos invitados ahí también.
 */
function sameDayHostMatches(m, host) {
  if (!host?.id || host.invitedBy) return [];
  const key = personKey(host, app.players);
  if (!key) return [];
  const out = [];
  for (const match of app.matches || []) {
    if (match.id === m.id || match.date !== m.date || match.cancelled === true) continue;
    const there = matesOf(match.id).find((player) => !player.invitedBy && personKey(player, app.players) === key);
    if (!there) continue;
    const blocked = addBlock(match) || inviteBlock(matesOf(match.id), there.id);
    out.push({ match, host: there, blocked });
  }
  return out.sort((a, b) => String(a.match.time || '').localeCompare(String(b.match.time || '')) || String(a.match.id).localeCompare(String(b.match.id)));
}

function sameDayLine({ match, host }, from) {
  const free = Math.max(0, capOf(match) - playersOf(match.id).length);
  const room = host.waiting === true ? 'él está en espera' : free === 0 ? 'completo: van a la espera' : free === 1 ? 'queda 1 lugar' : `quedan ${free} lugares`;
  const place = placeOf(match);
  return [`${match.time || '--:--'} hs`, place === placeOf(from) ? '' : place, room].filter(Boolean).join(' · ');
}

/**
 * Suma los mismos invitados (mismo nombre, invitados por la misma persona)
 * en cada partido elegido. De a un jugador, en orden. Lo que ya está no se
 * repite; lo que no entra va a la espera, como en el partido de origen.
 */
async function addGuestsToSameDay(targets, friends, signup, source) {
  const notes = [];
  for (const { match, host } of targets) {
    const label = `${match.time || '--:--'} hs`;
    const blocked = addBlock(match) || inviteBlock(matesOf(match.id), host.id);
    if (blocked) { notes.push(`${label}: ${blocked}`); continue; }
    const there = new Set(friendNamesOf(match.id, host.id).map((name) => normName(name)));
    const fresh = friends.filter((friend) => !there.has(normName(friend.name)));
    const todo = fresh.filter((friend) => !firstDuplicate(matesOf(match.id), [{ name: friend.name, phone: '', guestAuto: friend.guestAuto === true }]));
    const clash = fresh.filter((friend) => !todo.includes(friend)).map((friend) => friend.name);
    if (clash.length) notes.push(`${label}: ${clash.join(', ')} ya figura${clash.length > 1 ? 'n' : ''} en ese partido`);
    if (!todo.length) { if (!clash.length) notes.push(`${label}: ya estaban`); continue; }
    const max = limitFor(match, actor().uid);
    if (max != null && addedCount(matesOf(match.id), actor()) + todo.length > max) { notes.push(`${label}: ${limitMessage(max)}`); continue; }
    const place = placeGroup({ mainCount: playersOf(match.id).length, capacity: capOf(match), count: todo.length, forceWait: host.waiting === true });
    let offset = 0;
    for (const friend of todo) {
      const thereSignup = match.id === source?.id ? signup : signupForMatch(match, signup, actor());
      const friendId = await app.store.addPlayer(match, {
        name: friend.name,
        phone: '',
        invitedBy: host.id,
        invitedByName: host.name,
        guestAuto: friend.guestAuto === true,
        ...thereSignup,
      }, app.who, { waiting: offset >= place.main });
      if (offset < place.main) await applyAutoCredit(friendId);
      offset += 1;
    }
    notes.push(place.wait ? `${label}: también anotados · ${place.wait} en espera` : `${label}: también anotados`);
  }
  return notes;
}

function openPhoneForm(person) {
  if (!canEditRoster(person, actor())) { toast(EDIT_LOCK_TEXT); return; }
  if (phoneHidden(person)) { toast(PRIVATE_WA_TEXT); return; }
  openSheet(`
    <form id="phone-form" novalidate>
      <h3>WhatsApp de ${esc(person.name)}</h3>
      <p class="hint">Es opcional. Con el número se puede escribir y mandar el link de confirmación.</p>
      <label class="field"><span>Nombre</span><input id="phone-name" name="name" maxlength="60" autocomplete="name" value="${esc(person.name)}"></label>
      <label class="field"><span>WhatsApp</span><input name="phone" type="tel" inputmode="tel" autofocus autocomplete="off" placeholder="Ej: 11 1234-5678" value="${esc(person.phone ? displayFromWa(person.phone) : '')}">
        <div class="small muted" id="phone-hint">Característica + número. Sin 0 ni 15 también sirve.</div></label>
      <div class="field"><div class="err" id="phone-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  const form = $('#phone-form');
  const hint = $('#phone-hint');
  form.phone.addEventListener('input', () => {
    const v = form.phone.value.trim();
    if (!v) { hint.className = 'small muted'; hint.textContent = 'Característica + número. Sin 0 ni 15 también sirve.'; return; }
    const parsed = normalizePhone(v);
    hint.className = parsed.ok ? 'ok' : 'err';
    hint.textContent = parsed.ok ? `✓ ${parsed.display}` : parsed.error;
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    const name = form.name.value.trim().replace(/\s+/g, ' ');
    const raw = form.phone.value.trim();
    if (!name) { $('#phone-err').textContent = 'Poné el nombre.'; return; }
    if (!raw) { $('#phone-err').textContent = 'Poné el WhatsApp, o cancelá.'; return; }
    const parsed = normalizePhone(raw);
    if (!parsed.ok) { $('#phone-err').textContent = parsed.error; return; }
    const linked = app.players.filter((player) => playerMatchesPerson(player, person));
    closeSheet();
    run((async () => {
      const kept = await app.store.updateRoster(person.id, { name, phone: parsed.wa }) || person.id;
      for (const player of linked) {
        if (!canEditPlayer(player, actor())) continue;
        if (phoneIdentity(player) === phoneIdentity({ phone: parsed.wa }) && player.rosterId === kept) continue;
        await app.store.updatePlayer(player.id, { phone: parsed.wa, rosterId: kept });
      }
      if (kept !== person.id && location.hash.includes(encodeURIComponent(person.id))) {
        location.hash = `#/jugador/${encodeURIComponent(kept)}`;
      }
    })(), 'WhatsApp guardado');
  };
}

/* Agregar / editar jugador */
function sameGuestLabel(player, name) {
  const wasAuto = player?.guestAuto === true || (player?.guestAuto !== false && !!player?.invitedBy && isAutoGuestName(player?.name));
  return wasAuto && isAutoGuestName(name) && normName(player.name) === normName(name);
}

function rosterAlreadySaved(name, phone) {
  const wa = canonicalPhone(phone);
  if (wa) return rosterByPhone(app.roster, wa) || rosterByIdentity(app.roster, phoneIdentity({ phone: wa }));
  const clean = foldText(name);
  if (!clean) return null;
  return app.roster.find((person) => !phoneIdentity(person) && foldText(person.name) === clean) || null;
}

function tapLandsOnActionBar(event) {
  const bar = document.querySelector('#view .actionbar');
  if (!bar || !event) return false;
  const target = event.target;
  if (target && target.nodeType === 1 && bar.contains(target)) return true;
  const x = Number(event.clientX);
  const y = Number(event.clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) return false;
  const rect = bar.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** El toque cayó en la barra fija. No abre al jugador que quedó debajo. */
function claimActionBarTap(event, match) {
  if (!tapLandsOnActionBar(event)) return false;
  const x = Number(event.clientX);
  const y = Number(event.clientY);
  const stack = Number.isFinite(x) && Number.isFinite(y) && document.elementsFromPoint
    ? document.elementsFromPoint(x, y)
    : [];
  if (!addBlock(match)) {
    if (stack.some((el) => el.id === 'btn-add-player')) openAddPlayer(match);
    else if (stack.some((el) => el.id === 'btn-add-wait')) openAddPlayer(match, { waiting: true });
  }
  return true;
}

function openAddPlayer(match, { waiting = false } = {}) {
  openPlayerForm(match, null, { add: true, waiting: waiting === true });
}

function openPlayerForm(m, p, opts = {}) {
  if (opts.add === true) p = null;
  if (!p) {
    const blocked = addBlock(m);
    if (blocked) { toast(blocked); return; }
  }
  const asWait = !p && opts.waiting === true;
  const editingFriend = !!p?.invitedBy;
  const offerRoster = editingFriend && !p.rosterId;
  const lockPhone = phoneHidden(p);
  const locked = p && !canEditPlayer(p, actor());
  const emptyPhoneHint = editingFriend
    ? 'Opcional. Con el número se puede escribir. Si no lo marcás, el WhatsApp queda privado.'
    : 'Opcional. Con el número se puede escribir y mandar el link. Igual se guarda en Jugadores.';
  const hostName = editingFriend ? friendHostName(p) : '';
  // El apodo se puede cambiar en cualquier jugador ya anotado (ver saveNick).
  const nickEditable = !!p && canWritePlayer(p, actorWithRole());
  const nickBefore = p ? nickOf(p, app.roster) : '';
  openSheet(`
    <form id="player-form" novalidate data-mode="${p ? 'edit' : 'add'}"${p?.id ? ` data-edit-id="${esc(p.id)}"` : ''}>
      <h3>${editingFriend ? 'Editar invitado' : p ? 'Editar jugador' : asWait ? 'Anotar en lista de espera' : 'Agregar jugador'}</h3>
      <div id="player-scroll">
      ${locked ? `<p class="hint edit-lock" id="edit-lock">${esc(EDIT_LOCK_TEXT)}</p>` : ''}
      <p class="hint">${esc(fmtWhen(m))}${p ? '' : asWait ? ' · Queda al final de la lista de espera' : ` · Lo anota ${esc(app.who)}`}</p>
      ${signupFields(p, m)}
      ${editingFriend ? `<p class="hint" id="friend-stays">Sigue siendo invitado de ${esc(hostName || 'quien lo invitó')}.</p>` : ''}
      ${p ? '' : `<label class="field"><span>Buscar guardados</span><div class="find-row"><input id="roster-find" name="find" autocomplete="off" placeholder="ERN, Pereira o parte del teléfono"><button type="button" class="btn find-add" id="roster-add-new" hidden aria-label="Agregar como nuevo">+</button></div></label>
      <ul class="roster-hits" id="roster-hits" hidden></ul>`}
      <label class="field"><span>Nombre</span><input id="player-name" name="name" ${p ? 'autofocus' : ''} autocomplete="off" maxlength="60" placeholder="Ej: Juan Pérez" value="${esc(p?.name || '')}"></label>
      ${p ? nickField(p) : ''}
      ${lockPhone ? `<p class="hint private-wa">${esc(PRIVATE_WA_TEXT)}</p>` : `<label class="field"><span>WhatsApp</span>${(!p || editingFriend) ? `<div class="phone-row"><input name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="Ej: 11 1234-5678" value="${esc(p ? displayFromWa(p.phone) : '')}">${waShareControl('wa-share', { named: true, checked: p?.phoneShared === true })}</div>` : `<input name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="Ej: 11 1234-5678" value="${esc(p ? displayFromWa(p.phone) : '')}">`}
        <div class="small muted" id="pf-phone">${esc(emptyPhoneHint)}</div></label>`}
      ${offerRoster ? '<label class="checkline" id="save-roster-line"><input type="checkbox" id="save-roster" name="saveRoster"><span>Guardar en Jugadores</span></label>' : ''}
      ${!p && !asWait ? '<label class="checkline"><input type="checkbox" id="player-tentative" name="tentative"> Anotar como pendiente de confirmación</label>' : ''}
      ${p ? '' : `<div class="friend-box" id="friend-box">
        ${guestQtyHtml(0)}
        <div id="friend-rows"></div>
        <p class="hint" id="friend-hint">Si dejás el nombre vacío, queda como Invitado 1, Invitado 2…</p>
      </div>`}
      <div class="field"><div class="err" id="pf-err"></div></div>
      </div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit"${locked ? ' disabled' : ''}>${p ? 'Guardar' : 'Agregar'}</button></div>
    </form>`);
  sheet.querySelector('.sheet-body')?.classList.add('player-sheet');
  bindPayDock();
  const form = $('#player-form');
  if (locked) {
    const canChangeSignup = canAdd(m, actor().uid);
    form.querySelectorAll('input, textarea, select').forEach((el) => {
      if (canChangeSignup && el.name === 'signedUpWith') return;
      if (nickEditable && el.name === 'shortName') return;
      el.disabled = true;
    });
    const save = form.querySelector('button[type=submit]');
    if (save && (canChangeSignup || nickEditable)) save.disabled = false;
    form.onsubmit = (e) => {
      e.preventDefault();
      if (form.dataset.mode !== 'edit' || !p || form.dataset.editId !== p.id) return;
      const signup = canChangeSignup ? readSignup(form) : {};
      const nick = nickEditable && form.shortName ? cleanShortName(form.shortName.value) : nickBefore;
      const nickChanged = nick !== nickBefore;
      const signupChanged = !!signup.signedUpWith && signup.signedUpWith !== (p.signedUpWith || '');
      if (!nickChanged && !signup.signedUpWith) return;
      closeSheet();
      run((async () => {
        if (signup.signedUpWith && (signupChanged || !nickChanged)) await app.store.updatePlayer(p.id, signup);
        if (nickChanged) await saveNick(p, nick, p.rosterId || '');
      })(), nickChanged ? 'Apodo actualizado' : 'Se anotó con actualizado');
    };
    return;
  }
  const hint = $('#pf-phone');
  if (form.phone) form.phone.addEventListener('input', () => {
    const v = form.phone.value.trim();
    if (!v) { hint.className = 'small muted'; hint.textContent = emptyPhoneHint; return; }
    const r = normalizePhone(v);
    hint.className = r.ok ? 'ok' : 'err';
    hint.textContent = r.ok ? `✓ ${r.display}` : r.error;
  });
  const find = $('#roster-find');
  let pickedId = '';
  let collapseHits = false;
  let queryAtPick = '';
  if (find) {
    const paint = () => {
      const hits = $('#roster-hits');
      const addNew = $('#roster-add-new');
      const q = find.value.trim();
      const matches = q ? searchRoster(rosterForOrganizer(app.roster, actor()), q).slice(0, 8) : [];
      const found = visibleRosterHits(matches, pickedId, collapseHits);
      if (addNew) addNew.hidden = !q || found.length > 0;
      hits.hidden = !found.length;
      hits.innerHTML = found.map((person) => {
        const taken = signupError(m.id, [{ name: person.name, phone: person.phone || '', rosterId: person.id, phoneKey: person.phoneKey, hasPhone: person.hasPhone === true }]);
        const detail = person.phone ? esc(displayFromWa(person.phone)) : phoneHidden(person) ? esc(PRIVATE_WA_TEXT) : 'Sin número';
        const on = person.id === pickedId;
        return `<li><button type="button" class="roster-hit${taken ? ' taken' : ''}${on ? ' on' : ''}${suspendedClass(person)}" data-pick="${esc(person.id)}"${on ? ' aria-pressed="true"' : ''}${taken ? ' disabled' : ''}><b>${esc(person.name)}</b><small>${detail}</small>${taken ? '<small class="taken">Ya anotado</small>' : ''}</button></li>`;
      }).join('');
    };
    let pickedPhone = '';
    const selectPerson = (person) => {
      if (!person) return;
      pickedId = person.id;
      collapseHits = true;
      queryAtPick = find.value.trim();
      form.dataset.rosterPick = person.id;
      form.name.value = person.name;
      pickedPhone = '';
      if (form.phone && person.phone && !phoneHidden(person)) {
        pickedPhone = displayFromWa(person.phone);
        form.phone.value = pickedPhone;
        form.phone.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const share = $('#wa-share');
      if (share && person.phoneShared === true) share.checked = true;
      paint();
    };
    const chooseHit = (e) => {
      const btn = e.target.closest('[data-pick]');
      if (!btn || btn.disabled) return;
      const person = app.roster.find((r) => r.id === btn.dataset.pick);
      if (!person) return;
      selectPerson(person);
    };
    find.addEventListener('input', () => {
      if (find.value.trim() !== queryAtPick) collapseHits = false;
      paint();
    });
    form.name.addEventListener('input', () => {
      const person = pickedId ? app.roster.find((r) => r.id === pickedId) : null;
      if (person && foldText(person.name) !== foldText(form.name.value)) {
        if (form.phone && pickedPhone && form.phone.value.trim() === pickedPhone) {
          form.phone.value = '';
          form.phone.dispatchEvent(new Event('input', { bubbles: true }));
        }
        pickedId = '';
        pickedPhone = '';
        collapseHits = false;
        delete form.dataset.rosterPick;
        paint();
      }
    });
    $('#roster-add-new').onclick = () => {
      const text = find.value.trim();
      if (!text) return;
      pickedId = '';
      collapseHits = false;
      delete form.dataset.rosterPick;
      form.name.value = text;
      paint();
      if (!focusField(form.name)) {
        const next = [...form.querySelectorAll('input, textarea, select')].find((el) => el !== find && !el.disabled && !String(el.value || '').trim() && el.type !== 'checkbox');
        focusField(next);
      }
    };
    // El dedo sobre un resultado no elige al apoyar: si se mueve o la lista
    // scrollea, es un desliz. El tap (soltar sin moverse) sí elige, también
    // cuando el click se pierde porque el teclado se cierra.
    const hitsEl = $('#roster-hits');
    const playerScroll = $('#player-scroll');
    let gesture = null;
    let ignoreClick = false;
    const stopWatch = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    const onMove = (event) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (Math.hypot(dx, dy) > 10) gesture.moved = true;
    };
    const onCancel = (event) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      gesture = null;
      ignoreClick = true;
      stopWatch();
    };
    const onUp = (event) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      const hitsScrolled = Math.abs(hitsEl.scrollTop - gesture.hitsTop) > 1 || gesture.hitsMoved === true;
      const pageScrolled = playerScroll && Math.abs(playerScroll.scrollTop - gesture.pageTop) > 1;
      const current = gesture;
      gesture = null;
      stopWatch();
      const dragged = !tapChose({
        dx,
        dy,
        scrolled: hitsScrolled || (Math.hypot(dx, dy) > 10 && pageScrolled),
      });
      if (dragged) { ignoreClick = true; return; }
      // El click que sigue al tap no puede elegir otra fila si la lista se movió.
      ignoreClick = true;
      const person = app.roster.find((row) => row.id === current.id);
      if (person) selectPerson(person);
    };
    hitsEl.addEventListener('pointerdown', (event) => {
      const btn = event.target.closest('[data-pick]');
      if (!btn || btn.disabled) return;
      if (event.isPrimary === false) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      stopWatch();
      gesture = {
        x: event.clientX,
        y: event.clientY,
        hitsTop: hitsEl.scrollTop,
        pageTop: playerScroll ? playerScroll.scrollTop : 0,
        pointerId: event.pointerId,
        id: btn.dataset.pick,
        moved: false,
        hitsMoved: false,
      };
      ignoreClick = false;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    });
    hitsEl.addEventListener('scroll', () => { if (gesture) gesture.hitsMoved = true; }, { passive: true });
    hitsEl.addEventListener('click', (event) => {
      if (ignoreClick) { ignoreClick = false; return; }
      if (gesture) return;
      chooseHit(event);
    });
    setTimeout(() => {
      if (!form.isConnected) return;
      const active = document.activeElement;
      if (active && active !== document.body && form.contains(active) && active !== find) return;
      find.focus();
    }, 50);
  }
  if ($('#friend-count')) bindGuestQty({ min: 0, value: 0, taken: [] });
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (form.dataset.mode !== 'edit' || !p || form.dataset.editId !== p.id) p = null;
    const name = form.name.value.trim();
    const phoneRaw = form.phone ? form.phone.value.trim() : null;
    if (!name) { $('#pf-err').textContent = 'Poné el nombre.'; return; }
    let phone = '';
    if (phoneRaw) {
      const r = normalizePhone(phoneRaw);
      if (!r.ok) { $('#pf-err').textContent = r.error; return; }
      phone = r.wa;
    }
    if (p) {
      const share = $('#wa-share')?.checked === true;
      const saveRoster = !editingFriend || !!p.rosterId || $('#save-roster')?.checked === true;
      const stillAuto = sameGuestLabel(p, name);
      const phoneForCheck = phoneRaw === null ? (p.phone || '') : phone;
      const candidate = {
        name,
        phone: phoneForCheck,
        phoneKey: phoneRaw === null ? (p.phoneKey || '') : '',
        hasPhone: phoneRaw === null ? p.hasPhone === true : !!phone,
        rosterId: p.rosterId || '',
        invitedBy: p.invitedBy || '',
        guestAuto: stillAuto,
      };
      if (alreadyInMatch(matesOf(m.id), candidate, { exceptId: p.id, roster: false })) {
        $('#pf-err').textContent = ALREADY_IN_MATCH;
        return;
      }
      const savingNewRoster = offerRoster && $('#save-roster')?.checked === true;
      const signup = readSignup(form);
      const nick = nickEditable && form.shortName ? cleanShortName(form.shortName.value) : nickBefore;
      const nickChanged = nick !== nickBefore;
      if (savingNewRoster) {
        const known = rosterAlreadySaved(name, phoneForCheck);
        if (known && alreadyInMatch(matesOf(m.id), { name: known.name, phone: known.phone || phoneForCheck, phoneKey: known.phoneKey, hasPhone: known.hasPhone === true, rosterId: known.id }, { exceptId: p.id })) {
          $('#pf-err').textContent = ALREADY_IN_MATCH;
          return;
        }
      }
      const staysNamedGuest = editingFriend && !phoneForCheck && !candidate.rosterId && !savingNewRoster;
      const promoRenames = staysNamedGuest
        ? sameDayPromoGuestRenames({ player: p, newName: name, players: app.players, matches: knownMatches() })
        : [];
      for (const other of promoRenames) {
        const mates = app.players.filter((item) => item.matchId === other.matchId);
        if (alreadyInMatch(mates, { ...candidate, invitedBy: other.invitedBy }, { exceptId: other.id, roster: false })) {
          $('#pf-err').textContent = `${name} ya está en otro partido de ese día.`;
          return;
        }
      }
      closeSheet();
      run((async () => {
        const id = saveRoster
          ? await linkedRosterId({ name, phone: phoneRaw === null ? '' : phone, rosterId: p.rosterId, phoneKey: p.phoneKey, phoneShared: share })
          : (p.rosterId || '');
        if (savingNewRoster && id && alreadyInMatch(matesOf(m.id), { ...candidate, rosterId: id }, { exceptId: p.id })) {
          toast(ALREADY_IN_MATCH);
          return;
        }
        const patch = { name, ...(id ? { rosterId: id } : {}) };
        if (phoneRaw !== null) {
          patch.phone = phone;
          if ($('#wa-share')) patch.phoneShared = share;
        }
        if (editingFriend) {
          patch.invitedBy = p.invitedBy;
          const freshHost = directHostName(p);
          if (freshHost) patch.invitedByName = freshHost;
          patch.guestAuto = stillAuto;
        }
        Object.assign(patch, signup);
        const oldKey = staysNamedGuest ? personKey(p, app.players) : '';
        await app.store.updatePlayer(p.id, patch);
        for (const other of promoRenames) {
          await app.store.updatePlayer(other.id, {
            name,
            invitedBy: other.invitedBy,
            ...(other.invitedByName ? { invitedByName: other.invitedByName } : {}),
            guestAuto: stillAuto,
          });
        }
        if (oldKey) {
          const renamedIds = new Set([p.id, ...promoRenames.map((row) => row.id)]);
          const preview = app.players.map((item) => (renamedIds.has(item.id) ? { ...item, name } : item));
          const newKey = personKey({ ...p, name }, preview);
          if (newKey && newKey !== oldKey) await app.store.moveCredit(oldKey, newKey, name);
        }
        if (nickChanged) await saveNick(p, nick, id || '');
      })(), promoRenames.length ? 'Nombre actualizado en los partidos del día' : (editingFriend ? 'Invitado actualizado' : 'Jugador actualizado'));
      return;
    }
    const person = pickedId ? app.roster.find((r) => r.id === pickedId) : null;
    const usePick = person && foldText(person.name) === foldText(name);
    const host = usePick
      ? {
          name: person.name,
          phone: phone || person.phone || '',
          rosterId: person.id,
          phoneKey: person.phoneKey || '',
          hasPhone: person.hasPhone === true || !!phone,
          phoneShared: $('#wa-share')?.checked === true,
        }
      : { name, phone, phoneShared: $('#wa-share')?.checked === true };
    const result = await addSignedPlayer(m, host, asWait, !!$('#player-tentative')?.checked, friendRowValues(), { reveal: true });
    if (result === ALREADY_IN_MATCH || result === SUSPENDED_TEXT) $('#pf-err').textContent = result;
  };
}

function friendRowValues() {
  return [...document.querySelectorAll('#friend-rows input')].map((input) => input.value);
}
/* Pago del jugador */
function moneyText(amount) {
  if (!amount) return '';
  return String(amount).replace('.', ',');
}
function readMoney(raw) {
  if (String(raw ?? '').trim() === '') return { ok: true, amount: 0 };
  return parseAmount(raw);
}
const PAYMENT_KIND = { cash: 'Efectivo', transfer: 'Transferencia', credit: 'Crédito', pending: 'Transfiere después', received: 'Pago' };

function paymentShareLabel(share) {
  const kind = PAYMENT_KIND[share?.kind] || 'Pago';
  const who = String(share?.name || '').trim();
  if (!who) return `${kind} ${formatARS(share?.amount || 0)}`;
  // La fila pendiente se lee igual que la etiqueta: «Transfiere después $… · a Gustavo».
  return `${kind} ${formatARS(share?.amount || 0)}${share?.kind === 'pending' ? ` · a ${who}` : ` · ${who}`}`;
}

function canAnnulPayment(player, share) {
  const me = actor();
  const name = String(share?.name || '').trim();
  // «Gus» y «Gustavo» son el mismo organizador. Un pendiente viejo sin nombre también se puede sacar.
  if (share?.kind === 'pending') {
    if (!name) return true;
    return sameOrganizerIdentity(name, me) || sameOrganizerIdentity(player?.paidUpdatedBy, me) || sameOrganizerIdentity(player?.pendingTo, me);
  }
  if (name) return sameOrganizerIdentity(name, me);
  return sameOrganizerIdentity(player?.paidUpdatedBy, me);
}

const PAY_X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function recordedPaymentList(player, listId) {
  const rows = paymentShares(player);
  if (!rows.length) return '';
  return `<ul class="pay-recorded" id="${listId}">${rows.map((share, index) => {
    const label = paymentShareLabel(share);
    const x = canAnnulPayment(player, share)
      ? `<button type="button" class="pay-x" data-annul="${index}" aria-label="Anular ${esc(label)}">${PAY_X_SVG}</button>`
      : '';
    const pendingClass = share.kind === 'pending' ? ' class="pay-pending-row"' : '';
    return `<li${pendingClass}><span>${esc(label)}</span>${x}</li>`;
  }).join('')}</ul>`;
}

function bindAnnulList(root, player) {
  if (!root) return;
  root.querySelectorAll('[data-annul]').forEach((btn) => {
    btn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const share = paymentShares(player)[Number(btn.dataset.annul)];
      if (share) annulRecordedPayment(player, share);
    };
  });
}

function annulLogLines(before, after) {
  const rows = [];
  const bits = [
    ['cash', 'efectivo', after?.cashTo || before?.cashTo || ''],
    ['transfer', 'transferencia', after?.transferTo || before?.transferTo || ''],
    ['credit', 'credito', after?.creditTo || before?.creditTo || ''],
    ['pending', 'transferencia', after?.pendingTo || before?.pendingTo || ''],
  ];
  for (const [key, method, paidTo] of bits) {
    const diff = roundMoney((after?.[key] || 0) - (before?.[key] || 0));
    if (!diff) continue;
    rows.push({
      type: 'Anulado',
      method,
      amount: Math.abs(diff),
      detail: key === 'pending' ? 'Transfiere después' : '',
      paidTo,
    });
  }
  return rows;
}

function payBatchForShare(player) {
  const batches = (app.payBatches || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
  return batches.find((batch) => {
    const row = (batch.payments || []).find((item) => item.playerId === player.id);
    return row && samePaySnapshot(payBatchSnapshot(player), row.after);
  }) || null;
}

function annulConfirmText(batch) {
  const ids = (batch?.payments || []).map((row) => row.playerId);
  const matches = new Set(ids.map((id) => app.players.find((player) => player.id === id)?.matchId).filter(Boolean));
  if (matches.size > 1) return '¿Anular este pago? También anula lo cargado en otros partidos.';
  if (ids.length > 1) return '¿Anular este pago? También anula lo cargado para los otros.';
  return '¿Anular este pago?';
}

async function finishAnnul(moves, writes, logs, batchId) {
  for (const move of moves) {
    if (move.delta < 0 && roundMoney(-move.delta) > creditBalance(app.credits, move.personKey, move.organizerUid)) {
      askNotice('No alcanza el saldo a favor para anular este pago.');
      return false;
    }
  }
  const done = [];
  try {
    for (const move of moves) {
      await app.store.adjustCredit(move, app.who);
      done.push(move);
    }
    for (const write of writes) await app.store.setPayment(write.id, write.input, app.who, { log: false });
    for (const line of logs) await app.store.logPlayerPago(line.playerId, line.entry);
    if (batchId && app.store.deletePayBatch) await app.store.deletePayBatch(batchId);
  } catch (error) {
    for (const move of done) await app.store.adjustCredit({ ...move, delta: roundMoney(-move.delta) }, app.who);
    askNotice(error?.message || 'No se pudo anular el pago.');
    return false;
  }
  return true;
}

function playerWithPayment(player, input) {
  if (!input) return player;
  const rec = paymentRecord(input, app.who);
  if (!rec.ok) return player;
  return { ...player, ...rec.patch, id: player.id };
}
function reopenAfterAnnul(player, input) {
  const base = app.players.find((item) => item.id === player.id) || player;
  const updated = playerWithPayment(base, input);
  const matchNow = knownMatches().find((item) => item.id === updated.matchId);
  if ($('#pay-form') && matchNow) openPaymentForm(matchNow, updated);
  else if (matchNow) openPlayerMenu(matchNow, updated);
  // La hoja sigue abierta, así que el redibujado habitual queda en espera.
  // La tarjeta tiene que perder «Transfiere después» enseguida.
  pendingRender = false;
  render();
}

async function annulRecordedPayment(player, share) {
  const fresh = app.players.find((item) => item.id === player.id) || player;
  if (!canAnnulPayment(fresh, share)) return;
  const batch = payBatchForShare(fresh);
  if (batch) {
    const names = payBatchCollectorNames(batch);
    if (names.some((name) => !sameOrganizerIdentity(name, actor()))) {
      askNotice('Este pago se cargó junto con un cobro de otro organizador.');
      return;
    }
    const plan = revertPayBatch(app.players, batch);
    if (!plan.ok) {
      askNotice('Este pago ya se modificó. No se puede anular.');
      return;
    }
    if (!(await askConfirm(annulConfirmText(batch), { danger: true, okText: 'Anular' }))) return;
    const again = revertPayBatch(app.players, payBatchForShare(app.players.find((item) => item.id === fresh.id) || fresh) || batch);
    if (!again.ok) {
      askNotice('Este pago ya se modificó. No se puede anular.');
      return;
    }
    const logs = again.payments.flatMap((row) => annulLogLines(row.before, row.after).map((entry) => ({ playerId: row.id, entry })));
    const ok = await finishAnnul(again.credits, again.payments, logs, batch.id);
    if (ok) reopenAfterAnnul(fresh, again.payments.find((row) => row.id === fresh.id)?.input);
    return;
  }
  if (!(await askConfirm('¿Anular este pago?', { danger: true, okText: 'Anular' }))) return;
  const current = app.players.find((item) => item.id === fresh.id) || fresh;
  const before = payBatchSnapshot(current);
  const input = paymentWithoutShare(current, share);
  const match = knownMatches().find((item) => item.id === current.matchId);
  const promo = promoForPlayer({ player: current, players: app.players, matches: knownMatches(), prices: livePrices() });
  const due = !match || match.cancelled === true || current.waiting === true || isFreePlay(current)
    ? 0
    : (promo ? Number(promo.share) : priceOfMatch(match, livePrices()));
  const key = personKey(current, app.players);
  const moves = [];
  for (const item of annulCreditDeltas(current, share, due)) {
    const who = collectorIdentity(item.name || actor().name);
    if (!who.uid || !key) {
      askNotice('No se puede anular este pago sin identificar al jugador y a quien cobró.');
      return;
    }
    moves.push({ personKey: key, organizerUid: who.uid, organizerName: who.name, name: current.name, delta: item.delta });
  }
  const after = snapshotAfterFallback(current, input);
  const logs = annulLogLines(before, after).map((entry) => ({ playerId: current.id, entry }));
  if (!logs.length && share?.amount > 0) {
    logs.push({
      playerId: current.id,
      entry: {
        type: 'Anulado',
        method: share.kind === 'cash' ? 'efectivo' : share.kind === 'credit' ? 'credito' : 'transferencia',
        amount: share.amount,
        detail: share.kind === 'pending' ? 'Transfiere después' : '',
        paidTo: share.name || '',
      },
    });
  }
  const ok = await finishAnnul(moves, [{ id: current.id, input }], logs, '');
  if (ok) reopenAfterAnnul(current, input);
}

function snapshotAfterFallback(player, input) {
  const rec = paymentRecord(input, app.who);
  if (!rec.ok) return payBatchSnapshot(player);
  return payBatchSnapshot({ ...player, ...rec.patch, id: player.id });
}

function pendingTransferReminderRow(m, p, pending) {
  const view = withAgendaPhone(p);
  const phone = String(view?.phone || '').trim();
  const hidden = phoneHidden(view);
  const why = hidden ? PRIVATE_WA_TEXT : 'Sin número';
  const text = transferReminderText(givenName(p, app.roster), transferReminderWhen(m?.date));
  const remind = phone && !hidden
    ? `<a class="btn pay-remind" id="btn-pending-remind" href="${esc(waHref(phone, text))}" target="_blank" rel="noopener">${ICON.wa}<span>Enviar recordatorio</span></a>`
    : `<button type="button" class="btn pay-remind" id="btn-pending-remind" disabled>${ICON.wa}<span>Enviar recordatorio</span></button>`;
  const shownInRow = paymentShares(p).some((share) => share.kind === 'pending' && share.amount > 0);
  const label = pendingStatusText(p) || `Transfiere después ${formatARS(pending)}`;
  const share = { kind: 'pending', name: String(p?.pendingTo || p?.paidUpdatedBy || '').trim(), amount: pending };
  const x = !shownInRow && canAnnulPayment(p, share)
    ? `<button type="button" class="pay-x" data-annul-pending="1" aria-label="Anular ${esc(label)}">${PAY_X_SVG}</button>`
    : '';
  const pill = shownInRow
    ? ''
    : `<ul class="pay-recorded" id="pay-pending-now"><li class="pay-pending-row"><span>${esc(label)}</span>${x}</li></ul>`;
  return `${pill}
      <div class="pay-receive-row" id="pay-receive-row">
        <button type="button" class="btn" id="btn-receive-pending">Marcar transferencia como cobrada</button>
        ${remind}
      </div>
      ${phone && !hidden ? '' : `<p class="hint" id="pay-remind-why">${esc(why)}</p>`}`;
}

function openPaymentForm(m, p, opts = {}) {
  if (!p || !canAdd(m, actor().uid)) return;
  const back = typeof opts.returnTo === 'function' ? opts.returnTo : null;
  const leave = (job) => {
    if (!back) {
      closeSheet();
      return job;
    }
    return Promise.resolve(job).then(() => back());
  };
  const parts = paymentParts(p);
  const known = p.paid === true || p.paid === false || parts.pending > 0 || parts.split;
  const promo = promoOf(p);
  const directed = hasPaymentDirection(p);
  const staffDefault = loggedInStaffName();
  const initialTo = (kind) => {
    if (kind === 'cash') {
      const saved = directed ? p.cashTo : (p.paid === true ? p.receivedBy : '');
      return String(saved || '').trim() || staffDefault;
    }
    if (kind === 'transfer') {
      if (Array.isArray(p.transferParts) && p.transferParts.length > 1) return String(p.transferParts[0].to || '').trim() || staffDefault;
      const saved = directed ? p.transferTo : (p.paid === true ? p.receivedBy : '');
      return String(saved || '').trim() || staffDefault;
    }
    const saved = directed ? p.pendingTo : (parts.pending > 0 ? p.paidUpdatedBy : '');
    return String(saved || '').trim() || staffDefault;
  };
  const cashStart = known ? moneyText(parts.cash) : '';
  const transferStart = known ? moneyText(parts.transfer) : '';
  const pendingStart = known ? moneyText(parts.pending) : '';
  const creditStart = known ? moneyText(parts.credit) : '';
  const creditNow = creditBalance(app.credits, personKey(p, app.players), actor().uid);
  const partsHint = Array.isArray(p.transferParts) && p.transferParts.length > 1
    ? `<p class="hint" id="pay-parts">Transferencia repartida: ${p.transferParts.map((part) => `${esc(part.to)} ${esc(formatARS(part.amount))}`).join(' · ')}. Si cambiás el monto, queda en un solo organizador.</p>`
    : '';
  const receivedNote = p.transferReceivedAt
    ? `<p class="hint">La transferencia se marcó como cobrada${p.transferReceivedBy ? ` · ${esc(p.transferReceivedBy)}` : ''}.</p>`
    : '';
  openSheet(`
    <form id="pay-form" novalidate>
      <div id="pay-scroll">
      <h3>Pago</h3>
      <div class="pay-who" id="pay-who">
        <p class="pay-when" id="pay-when">${esc(fmtWhen(m))}</p>
        <p class="pay-name" id="pay-name">${esc(p.name)}</p>
      </div>
      <div id="pay-status"></div>
      <div id="pay-promo">${promo ? `<div class="promo-badge">${esc(promo.label)}</div>` : ''}</div>
      ${receivedNote}
      <label class="checkline" id="free-play-line"><input type="checkbox" id="pay-free" name="freePlay"${isFreePlay(p) ? ' checked' : ''}><span>Juega gratis</span></label>
      <div id="pay-details">
        <label class="pay-apply" id="pay-oldest-line" hidden><input type="checkbox" id="pay-oldest"><span>Cancelar primero las deudas más viejas</span></label>
        <div id="pay-oldest-preview" hidden></div>
        <label class="pay-apply" id="pay-split-guests-line" hidden><input type="checkbox" id="pay-split-guests"><span>Dividir el pago entre él y sus invitados</span></label>
        <div id="pay-split-preview" hidden></div>
        <div class="field"><span>Efectivo</span>
          <div class="pay-money">
            <input name="cash" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(cashStart)}" aria-label="Efectivo">
            <select name="cashTo" aria-label="Quién cobró el efectivo"></select>
          </div>
        </div>
        <div class="field"><span>Transferencia</span>
          <div class="pay-money">
            <input name="transfer" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(transferStart)}" aria-label="Transferencia">
            <select name="transferTo" aria-label="Quién cobró la transferencia"></select>
          </div>
        </div>
        ${partsHint}
        <div class="field" id="pay-credit-field"><span>Descontar del crédito</span>
          <div class="pay-money">
            <input name="fromCredit" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(creditStart)}" aria-label="Descontar del crédito">
          </div>
          <div class="small muted" id="pay-credit-hint">Sale del saldo a favor con ${esc(loggedInStaffName())}. Tiene ${esc(formatARS(creditNow))}.</div>
        </div>
        <div class="field"><span>Transfiere después</span>
          <div class="pay-money">
            <input name="pending" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(pendingStart)}" aria-label="Transfiere después">
            <select name="pendingTo" aria-label="A quién le va a transferir"></select>
          </div>
        </div>
        <div id="pay-promo-split" hidden></div>
        <p class="hint pay-over" id="pay-over" hidden></p>
      </div>
      <div class="field"><div class="err" id="pay-err"></div></div>
      </div>
      <div class="sheet-actions"><button type="button" class="btn" ${back ? 'id="pay-back"' : 'data-close'}>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  sheet.querySelector('.sheet-body')?.classList.add('pay-sheet');
  bindPayDock();
  const paintStatus = (player) => {
    const slot = $('#pay-status');
    if (!slot || !player) return;
    const stored = app.players.find((item) => item.id === player.id);
    const fresh = stored && (Number(stored.paidUpdatedAt) || 0) > (Number(player.paidUpdatedAt) || 0) ? stored : player;
    const pending = paymentParts(fresh).pending;
    slot.innerHTML = `${recordedPaymentList(fresh, 'pay-recorded')}${pending > 0 ? pendingTransferReminderRow(m, fresh, pending) : ''}`;
    bindAnnulList($('#pay-recorded'), fresh);
    slot.querySelectorAll('[data-annul-pending]').forEach((btn) => {
      btn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const amount = paymentParts(fresh).pending;
        annulRecordedPayment(fresh, {
          kind: 'pending',
          name: String(fresh.pendingTo || fresh.paidUpdatedBy || '').trim(),
          amount,
        });
      };
    });
    const receive = $('#btn-receive-pending');
    if (receive) receive.onclick = () => {
      const job = Promise.resolve(app.store.markTransferReceived(fresh.id, app.who)).catch((error) => {
        const fail = error instanceof Error ? error : new Error(String(error?.message || error));
        fail.playerId = fresh.id;
        fail.paymentWrite = true;
        if (error?.code) fail.code = error.code;
        throw fail;
      });
      leave(run(job, 'Transferencia marcada como cobrada'));
    };
  };
  paintStatus(p);
  const form = $('#pay-form');
  const payBack = $('#pay-back');
  if (payBack && back) payBack.onclick = () => back();
  const paintSelect = (select, selected) => {
    const names = payStaffNames(m, [selected, ...paymentShares(p).map((share) => share.name)]);
    const current = names.find((name) => sameOrganizerIdentity(name, selected)) || names[0] || '';
    select.innerHTML = names.map((name) => `<option value="${esc(name)}"${sameOrganizerIdentity(name, current) ? ' selected' : ''}>${esc(name)}</option>`).join('');
    if (current) select.value = names.find((name) => sameOrganizerIdentity(name, current)) || names[0];
  };
  const paintPrices = () => {
    const fresh = promoOf(p);
    const badge = $('#pay-promo');
    if (badge) badge.innerHTML = fresh ? `<div class="promo-badge">${esc(fresh.label)}</div>` : '';
  };
  paintSelect(form.cashTo, initialTo('cash'));
  paintSelect(form.transferTo, initialTo('transfer'));
  paintSelect(form.pendingTo, initialTo('pending'));
  paintPrices();
  app.refreshPaySheet = () => {
    if (!$('#pay-form')) return;
    paintStatus(p);
    paintSelect(form.cashTo, form.cashTo.value);
    paintSelect(form.transferTo, form.transferTo.value);
    paintSelect(form.pendingTo, form.pendingTo.value);
    paintPrices();
  };
  const caretAtEnd = (input) => {
    const end = String(input.value || '').length;
    try { input.setSelectionRange(end, end); } catch { /* type=number no deja elegir rango; estos campos son type=text */ }
  };
  // El precio entra solo con un tap: apoyar y soltar sin arrastrar.
  // En el celular el foco llega al apoyar el dedo, y si ahí se escribía el
  // monto, deslizar la hoja desde el campo lo completaba. Se anota el punto
  // en pointerdown y se descarta si el dedo se movió más de 10px o si la hoja
  // scrolleó antes de soltar. El cursor se manda al final después del foco,
  // porque el toque lo deja al principio. No se marca el texto.
  const bindAmountField = (input, { fillPrice = false, amountFor = null, onFilled = null } = {}) => {
    if (!input) return;
    let gesture = null;
    let acceptFocus = false;
    let armClick = false;
    let pending = [];
    const drop = () => { for (const timer of pending) clearTimeout(timer); pending = []; };
    const place = () => { if (document.activeElement === input) caretAtEnd(input); };
    const arm = () => {
      drop();
      armClick = true;
      place();
      pending.push(setTimeout(place, 0));
      requestAnimationFrame(() => { if (pending.length) place(); });
      pending.push(setTimeout(place, 40));
    };
    const maybeFill = () => {
      if (fillPrice) {
        const current = readMoney(input.value);
        if (current.ok && current.amount === 0) {
          const price = typeof amountFor === 'function' ? amountFor() : priceOfMatch(m, livePrices());
          input.value = moneyText(price) || '0';
          arm();
          if (typeof onFilled === 'function') onFilled();
          return;
        }
      }
      if (String(input.value || '').length) arm();
    };
    const scroller = () => document.querySelector('#pay-scroll');
    const drifted = (event) => {
      if (!gesture) return true;
      const box = scroller();
      const scrolled = box && Math.abs(box.scrollTop - gesture.scrollTop) > 1;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      return gesture.moved || scrolled || Math.hypot(dx, dy) > 10;
    };
    const stopWatch = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    const onMove = (event) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      if (drifted(event)) gesture.moved = true;
    };
    const onCancel = (event) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      gesture = null;
      acceptFocus = false;
      stopWatch();
    };
    const onUp = (event) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const moved = drifted(event);
      gesture = null;
      stopWatch();
      if (moved) { acceptFocus = false; return; }
      acceptFocus = true;
      if (document.activeElement === input) {
        acceptFocus = false;
        maybeFill();
      }
    };
    input.addEventListener('pointerdown', (event) => {
      if (event.isPrimary === false) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (document.activeElement === input) return;
      stopWatch();
      const box = scroller();
      gesture = {
        x: event.clientX,
        y: event.clientY,
        scrollTop: box ? box.scrollTop : 0,
        pointerId: event.pointerId,
        moved: false,
      };
      acceptFocus = false;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    });
    scroller()?.addEventListener('scroll', () => { if (gesture) gesture.moved = true; }, { passive: true });
    input.addEventListener('focus', () => {
      if (gesture && !gesture.moved) return;
      if (!acceptFocus) return;
      acceptFocus = false;
      maybeFill();
    });
    input.addEventListener('click', () => {
      if (!armClick) return;
      armClick = false;
      place();
    });
    input.addEventListener('keydown', drop);
    input.addEventListener('input', drop);
  };
  const suggestedAmount = () => {
    const promo = promoOf(p);
    if (promo?.total > 0) return promo.total;
    return priceOfMatch(m, livePrices());
  };
  const paintPromoSplit = () => {
    const box = $('#pay-promo-split');
    if (!box) return;
    const promo = promoOf(p);
    const blocked = splitBox?.checked || oldestBox?.checked;
    if (!promo || promo.rows.length < 2 || blocked) { box.hidden = true; box.innerHTML = ''; return; }
    const cashNow = readMoney(form.cash.value);
    const transferNow = readMoney(form.transfer.value);
    const pendingNow = readMoney(form.pending.value);
    const creditNow = readMoney(form.fromCredit.value);
    if (!cashNow.ok || !transferNow.ok || !pendingNow.ok || !creditNow.ok) { box.hidden = true; box.innerHTML = ''; return; }
    const shares = splitPaymentAcross({
      cash: cashNow.amount,
      transfer: transferNow.amount,
      pending: pendingNow.amount,
      credit: creditNow.amount,
    }, promo.rows.length);
    const planned = paymentPlan();
    const totals = planned
      ? planned.map((row) => roundMoney((row.applied?.used || []).reduce((sum, slice) => sum + slice.amount, 0) + (row.pendingTransfer || 0) + (row.fromCredit || 0)))
      : shares.map((share) => roundMoney(share.cash + share.transfer + share.pending + share.credit));
    const uneven = totals.some((total, i) => i > 0 && total !== totals[0]);
    const lines = promo.rows.map((row, i) => `<li><span>${esc(fmtWhen(row.match))}</span><b>${esc(formatARS(totals[i] || 0))}</b></li>`).join('');
    const odd = uneven ? '<p class="hint">El peso que sobra queda en el primer partido.</p>' : '';
    box.hidden = false;
    box.innerHTML = `<p class="hint">Se reparte en partes iguales entre estos partidos.</p><ul class="pay-split-preview">${lines}</ul>${odd}`;
  };
  const paymentPlan = () => {
    const cashNow = readMoney(form.cash.value);
    const transferNow = readMoney(form.transfer.value);
    const creditNow = readMoney(form.fromCredit.value);
    const pendingNow = readMoney(form.pending.value);
    if (!cashNow.ok || !transferNow.ok || !creditNow.ok || !pendingNow.ok) return null;
    const promo = (!oldestBox?.checked && !splitBox?.checked) ? promoOf(p) : null;
    const group = promo && promo.rows.length >= 2 ? promo.rows : [{ player: p, match: m }];
    const shares = splitPaymentAcross({
      cash: cashNow.amount, transfer: transferNow.amount, pending: pendingNow.amount, credit: creditNow.amount,
    }, group.length);
    const debts = olderDebts(p, group.map((row) => row.player.id));
    const planned = planRows({
      rows: group.map((row, i) => ({
        due: group.length > 1 ? (promo.shares[i] || 0) : priceOfMatch(row.match || m, livePrices()),
        signupName: row.player.signedUpWithName || row.player.addedBy || '',
        parts: receiptParts({
          cash: shares[i].cash, cashTo: form.cashTo.value,
          transfer: shares[i].transfer, transferTo: form.transferTo.value,
          credit: 0, creditTo: '',
        }),
      })),
      debts,
    });
    return planned.map((item, i) => ({ ...item, player: group[i].player, match: group[i].match || m, pendingTransfer: shares[i].pending, fromCredit: shares[i].credit }));
  };
  const paintOverpay = () => {
    const box = $('#pay-over');
    if (!box) return;
    if (splitBox?.checked && guestsOf(m.id, p.id).length) {
      const plan = guestSplit();
      const notes = plan ? splitLeftoverCredit({
        playerName: shownName(p),
        cashLeft: plan.cashLeft,
        cashTo: form.cashTo.value,
        transferLeft: plan.transferLeft,
        transferTo: form.transferTo.value,
      }) : [];
      const extra = roundMoney(notes.reduce((sum, item) => sum + item.amount, 0));
      box.hidden = !(extra > 0);
      box.textContent = extra > 0
        ? `Paga ${formatARS(extra)} de más: ${notes.map((item) => `${formatARS(item.amount)} quedan como saldo a favor con ${item.name}`).join(', ')}.`
        : '';
      return;
    }
    const note = overpayText(paymentPlan() || []);
    box.hidden = !note.text;
    box.textContent = note.text;
  };
  const refreshPayHints = () => { paintPromoSplit(); paintOverpay(); };
  for (const input of [form.cash, form.transfer, form.pending]) bindAmountField(input, { fillPrice: true, amountFor: suggestedAmount, onFilled: refreshPayHints });
  bindAmountField(form.fromCredit);
  const splitBox = $('#pay-split-guests');
  const splitLine = $('#pay-split-guests-line');
  const oldestBox = $('#pay-oldest');
  const oldestLine = $('#pay-oldest-line');
  const debtsOf = () => {
    const key = personKey(p, app.players);
    const me = actor();
    const rows = [];
    for (const other of app.players) {
      if (!key || personKey(other, app.players) !== key || !owesOrganizer(other, me)) continue;
      const owed = amountOwed(other, { players: app.players, matches: knownMatches(), prices: livePrices() });
      if (!(owed > 0)) continue;
      const match = knownMatches().find((item) => item.id === other.matchId);
      if (!match || match.cancelled === true) continue;
      rows.push({
        id: other.id,
        player: other,
        date: match.date || '',
        time: match.time || '',
        owed,
        label: [numericDate(match.date), shortHour(match.time)].filter(Boolean).join(' '),
      });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || String(a.id).localeCompare(String(b.id)));
    return rows;
  };
  const oldestPlan = () => {
    const cash = readMoney(form.cash.value);
    const transfer = readMoney(form.transfer.value);
    const pending = readMoney(form.pending.value);
    const credit = readMoney(form.fromCredit.value);
    if (!cash.ok || !transfer.ok || !pending.ok || !credit.ok) return null;
    return settleOldestDebts({
      cash: cash.amount,
      transfer: transfer.amount,
      pending: pending.amount,
      credit: credit.amount,
      debts: debtsOf(),
    });
  };
  const paintOldest = () => {
    const debts = debtsOf();
    if (oldestLine) oldestLine.hidden = debts.length < 2;
    const preview = $('#pay-oldest-preview');
    if (!preview) return;
    if (!oldestBox?.checked || debts.length < 2) { preview.hidden = true; preview.innerHTML = ''; return; }
    const plan = oldestPlan();
    if (!plan) { preview.hidden = true; return; }
    const lines = plan.rows.map((row) => `<li><span>${esc(row.label)}</span><b>${esc(formatARS(row.applied))}</b></li>`).join('');
    const extra = plan.left > 0 ? `<p class="hint">Sobra ${esc(formatARS(plan.left))}: no entra en estas deudas.</p>` : '';
    const empty = plan.rows.length ? '' : '<p class="hint">Con ese monto no se cubre ninguna deuda.</p>';
    preview.hidden = false;
    preview.innerHTML = `<p class="hint">Primero los partidos más viejos.</p><ul class="pay-split-preview">${lines}</ul>${empty}${extra}`;
  };
  const guestPayees = () => [p, ...guestsOf(m.id, p.id).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)))];
  const guestSplit = () => {
    const cash = readMoney(form.cash.value);
    const transfer = readMoney(form.transfer.value);
    const pending = readMoney(form.pending.value);
    const credit = readMoney(form.fromCredit.value);
    if (!cash.ok || !transfer.ok || !pending.ok || !credit.ok) return null;
    return allocateGuestPromo({
      people: guestPayees(),
      players: app.players,
      matches: knownMatches(),
      prices: livePrices(),
      cash: cash.amount,
      transfer: transfer.amount,
      pending: pending.amount,
      credit: credit.amount,
    });
  };
  const paintGuestSplit = () => {
    const guests = guestsOf(m.id, p.id);
    if (splitLine) splitLine.hidden = guests.length === 0;
    const preview = $('#pay-split-preview');
    if (!preview) return;
    if (!splitBox?.checked || !guests.length) { preview.hidden = true; preview.innerHTML = ''; return; }
    const plan = guestSplit();
    if (!plan) { preview.hidden = true; return; }
    const lines = plan.rows.map((row) => {
      const bits = [];
      if (row.cash > 0) bits.push(`Efectivo ${formatARS(row.cash)}`);
      if (row.transfer > 0) bits.push(`Transferencia ${formatARS(row.transfer)}`);
      if (row.pending > 0) bits.push(`Transfiere después ${formatARS(row.pending)}`);
      if (row.credit > 0) bits.push(`Crédito ${formatARS(row.credit)}`);
      const money = bits.length ? bits.join(' · ') : 'sin pago';
      return `<li><span class="${suspendedClass(row.person).trim()}">${esc(shownName(row.person))}</span><b>${esc(money)}</b></li>`;
    }).join('');
    const notes = splitLeftoverCredit({
      playerName: shownName(p),
      cashLeft: plan.cashLeft,
      cashTo: form.cashTo.value,
      transferLeft: plan.transferLeft,
      transferTo: form.transferTo.value,
    });
    const extra = notes.map((item, i) => `<p class="hint"${i === 0 ? ' id="pay-leftover"' : ''}>${esc(item.text)}</p>`).join('');
    const pendingNote = plan.pendingLeft > 0 ? `<p class="hint">Sobra ${esc(formatARS(plan.pendingLeft))} de transfiere después: no queda como saldo porque todavía no se cobró.</p>` : '';
    const unusedCredit = plan.creditLeft > 0 ? `<p class="hint">Sobra ${esc(formatARS(plan.creditLeft))} de crédito: no se descuenta.</p>` : '';
    preview.hidden = false;
    preview.innerHTML = `<ul class="pay-split-preview">${lines}</ul>${extra}${pendingNote}${unusedCredit}`;
  };
  if (splitBox) {
    splitBox.onchange = () => {
      if (splitBox.checked && oldestBox) oldestBox.checked = false;
      paintGuestSplit();
      paintOldest();
      paintPromoSplit();
    };
    for (const input of [form.cash, form.transfer, form.pending, form.fromCredit]) {
      input.addEventListener('input', () => { paintGuestSplit(); paintOldest(); paintPromoSplit(); paintOverpay(); });
    }
    paintGuestSplit();
  }
  if (oldestBox) {
    oldestBox.onchange = () => {
      if (oldestBox.checked && splitBox) splitBox.checked = false;
      paintGuestSplit();
      paintOldest();
      paintPromoSplit();
      paintOverpay();
    };
    paintOldest();
  }
  paintPromoSplit();
  paintOverpay();
  const freeBox = $('#pay-free');
  const paintFree = () => {
    const on = freeBox?.checked === true;
    for (const input of [form.cash, form.transfer, form.pending, form.fromCredit, form.cashTo, form.transferTo, form.pendingTo]) {
      if (!input) continue;
      input.disabled = on;
      if (on && input.tagName === 'INPUT') input.value = '';
    }
    if (on) $('#pay-err').textContent = '';
  };
  if (freeBox) freeBox.onchange = paintFree;
  if (freeBox?.checked) paintFree();
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (freeBox?.checked) {
      const entries = [{ id: p.id, input: { freePlay: true, paid: true, split: true } }];
      const refund = promoRefundAfterFree({ player: p, players: app.players, matches: app.matches, prices: livePrices() });
      if (refund) {
        for (const row of refund.payments) {
          const wasAuto = app.players.find((item) => item.id === row.playerId)?.autoCredit === true;
          entries.push({
            id: row.playerId,
            input: {
              paid: true,
              split: true,
              freePlay: false,
              cash: row.cash,
              transfer: row.transfer,
              pendingTransfer: row.pending,
              fromCredit: row.fromCredit,
              cashTo: row.cash > 0 ? row.cashTo : null,
              transferTo: row.transfer > 0 ? row.transferTo : null,
              transferParts: row.transferParts,
              pendingTo: row.pending > 0 ? row.pendingTo : null,
              creditTo: row.fromCredit > 0 ? row.creditTo : null,
              autoCredit: wasAuto && row.fromCredit > 0,
            },
          });
        }
        for (const id of refund.clearIds || []) {
          if (id === p.id || refund.payments.some((row) => row.playerId === id)) continue;
          const pending = paymentParts(app.players.find((item) => item.id === id)).pending;
          entries.push({
            id,
            input: pending > 0
              ? { paid: true, split: true, freePlay: false, cash: 0, transfer: 0, pendingTransfer: pending, fromCredit: 0, pendingTo: app.players.find((item) => item.id === id)?.pendingTo || null }
              : { paid: false, split: true },
          });
        }
        const beneficiary = promoPayer(p);
        const key = personKey(beneficiary, app.players);
        if (refund.credits.length && !key) { $('#pay-err').textContent = 'No se puede guardar el saldo sin identificar a quien pagó.'; return; }
        const grants = [];
        for (const credit of refund.credits) {
          const found = collectorIdentity(credit.name || actor().name);
          if (!found.uid) { $('#pay-err').textContent = 'No encuentro al organizador que cobró lo que sobra.'; return; }
          grants.push({
            personKey: key,
            organizerUid: found.uid,
            organizerName: found.name,
            name: beneficiary.name,
            delta: credit.amount,
          });
        }
        const job = (async () => {
          const done = [];
          try {
            for (const move of grants) {
              await app.store.adjustCredit(move, app.who);
              done.push(move);
            }
            await writePaymentsInOrder(entries, (entry) => app.store.setPayment(entry.id, entry.input, app.who));
            for (const credit of grants) {
              await app.store.recordCreditLoad({
                match: null,
                player: { ...beneficiary, creditTo: credit.organizerName },
                amount: credit.delta,
                solo: true,
              });
            }
          } catch (error) {
            for (const move of done) await app.store.adjustCredit({ ...move, delta: roundMoney(-move.delta) }, app.who);
            throw error;
          }
        })();
        leave(run(job, grants.length ? 'Juega gratis. Lo que sobra quedó como saldo a favor.' : 'Juega gratis'));
        return;
      }
      const delta = creditDelta([p], entries);
      const job = delta
        ? savePaymentsSpendingCredit(entries, 'Juega gratis', creditMoveFor(p, delta))
        : savePayments(entries, 'Juega gratis');
      leave(job);
      return;
    }
    const cash = readMoney(form.cash.value);
    if (!cash.ok) { $('#pay-err').textContent = cash.error; return; }
    const transfer = readMoney(form.transfer.value);
    if (!transfer.ok) { $('#pay-err').textContent = transfer.error; return; }
    const pending = readMoney(form.pending.value);
    if (!pending.ok) { $('#pay-err').textContent = pending.error; return; }
    const fromCredit = readMoney(form.fromCredit.value);
    if (!fromCredit.ok) { $('#pay-err').textContent = fromCredit.error; return; }
    if (cash.amount + transfer.amount + pending.amount + fromCredit.amount <= 0) { $('#pay-err').textContent = 'Poné un monto.'; return; }
    const keepTransferParts = roundMoney(transfer.amount) === parts.transfer && Array.isArray(p.transferParts) && p.transferParts.length > 1 && p.transferParts.every((part) => String(part?.to || '').trim());
    if (cash.amount > 0 && !String(form.cashTo.value || '').trim()) { $('#pay-err').textContent = 'Elegí quién cobró el efectivo.'; return; }
    if (transfer.amount > 0 && !keepTransferParts && !String(form.transferTo.value || '').trim()) { $('#pay-err').textContent = 'Elegí quién cobró la transferencia.'; return; }
    const creditTo = loggedInStaffName();
    const named = (raw) => {
      const text = String(raw || '').trim();
      if (!text) return '';
      return collectorIdentity(text).name || text;
    };
    const payInput = (part) => ({
      paid: true,
      split: true,
      freePlay: false,
      cash: part.cash,
      transfer: part.transfer,
      pendingTransfer: part.pending,
      fromCredit: part.credit,
      cashTo: part.cash > 0 ? named(form.cashTo.value) : null,
      transferTo: part.transfer > 0 ? named(form.transferTo.value) : null,
      pendingTo: part.pending > 0 ? named(form.pendingTo.value) : null,
      creditTo: part.credit > 0 ? creditTo : null,
    });
    const finishPay = (entries, people, okMsg) => {
      const delta = creditDelta(people, entries);
      if (delta < 0 && roundMoney(-delta) > creditBalance(app.credits, personKey(p, app.players), actor().uid)) {
        $('#pay-err').textContent = 'No alcanza el saldo a favor.';
        return;
      }
      if (delta && !personKey(p, app.players)) {
        $('#pay-err').textContent = 'No se puede descontar el crédito sin identificar al jugador.';
        return;
      }
      const job = delta
        ? savePaymentsSpendingCredit(entries, okMsg, creditMoveFor(p, delta))
        : savePayments(entries, okMsg);
      leave(job);
    };
    if (oldestBox?.checked && debtsOf().length >= 2) {
      const plan = oldestPlan();
      const rows = plan?.rows || [];
      if (!rows.length) { $('#pay-err').textContent = 'Con ese monto no se cubre ninguna deuda.'; return; }
      const entries = rows.map((row) => {
        const prev = paymentParts(row.player);
        const cash = roundMoney(prev.cash + row.cash);
        const transfer = roundMoney(prev.transfer + row.transfer);
        const pendingAmt = roundMoney(prev.pending + row.pending);
        const creditAmt = roundMoney(prev.credit + row.credit);
        const keepParts = row.transfer === 0 && Array.isArray(row.player.transferParts) && row.player.transferParts.length > 1;
        return {
          id: row.player.id,
          input: {
            ...payInput({ cash, transfer, pending: pendingAmt, credit: creditAmt }),
            cashTo: cash > 0 ? named(row.cash > 0 ? form.cashTo.value : (row.player.cashTo || form.cashTo.value)) : null,
            transferTo: transfer > 0 ? named(row.transfer > 0 ? form.transferTo.value : (row.player.transferTo || form.transferTo.value)) : null,
            pendingTo: pendingAmt > 0 ? named(row.pending > 0 ? form.pendingTo.value : (row.player.pendingTo || form.pendingTo.value)) : null,
            creditTo: creditAmt > 0 ? creditTo : null,
            transferParts: keepParts ? row.player.transferParts : null,
          },
        };
      });
      const summary = settlementSummary(rows);
      const leftover = plan.left > 0 ? ` Sobra ${formatARS(plan.left)} sin aplicar.` : '';
      finishPay(entries, rows.map((row) => row.player), `${summary}.${leftover}`.trim());
      return;
    }
    if (splitBox?.checked && guestsOf(m.id, p.id).length) {
      const plan = guestSplit();
      const rows = (plan?.rows || []).filter((row) => row.cash + row.transfer + row.pending + row.credit > 0);
      if (!rows.length) { $('#pay-err').textContent = 'Con ese monto no le toca a nadie.'; return; }
      const entries = [];
      for (const row of rows) {
        const targets = row.matches?.length ? row.matches : [{ player: row.person, cash: row.cash, transfer: row.transfer, pending: row.pending, credit: row.credit }];
        for (const share of targets) {
          if (!(share.cash + share.transfer + share.pending + share.credit > 0)) continue;
          entries.push({ id: share.player.id, input: payInput(share) });
        }
      }
      if (!entries.length) { $('#pay-err').textContent = 'Con ese monto no le toca a nadie.'; return; }
      const notes = splitLeftoverCredit({
        playerName: shownName(p),
        cashLeft: plan.cashLeft,
        cashTo: form.cashTo.value,
        transferLeft: plan.transferLeft,
        transferTo: form.transferTo.value,
      });
      const grants = [];
      for (const item of notes) {
        const found = collectorIdentity(item.name);
        if (!found.uid) { $('#pay-err').textContent = 'No encuentro al organizador que cobró lo que sobra.'; return; }
        grants.push({
          personKey: personKey(p, app.players),
          organizerUid: found.uid,
          organizerName: found.name,
          name: p.name,
          delta: item.amount,
        });
      }
      const touched = entries.map((entry) => app.players.find((item) => item.id === entry.id)).filter(Boolean);
      const moves = mergeCreditMoves([creditMoveFor(p, creditDelta(touched, entries)), ...grants]);
      const mine = moves.find((move) => move.organizerUid === actor().uid);
      if (mine && mine.delta < 0 && roundMoney(-mine.delta) > creditBalance(app.credits, personKey(p, app.players), actor().uid)) {
        $('#pay-err').textContent = 'No alcanza el saldo a favor.';
        return;
      }
      if (moves.some((move) => !move.personKey)) {
        $('#pay-err').textContent = 'No se puede guardar el saldo sin identificar al jugador.';
        return;
      }
      const msg = ['Pago dividido', ...notes.map((item) => item.text)].filter(Boolean).join(' ');
      const job = moves.length ? savePaymentsSpendingCredit(entries, msg, moves) : savePayments(entries, msg);
      leave(job);
      return;
    }
    const planned = paymentPlan();
    if (!planned) { $('#pay-err').textContent = 'Revisá los montos.'; return; }
    const note = overpayText(planned);
    if (note.extra > 0) {
      const ask = document.createElement('div');
      ask.id = 'pay-over-ask';
      ask.innerHTML = `<p class="hint">${esc(note.confirm)}</p><div class="sheet-actions"><button type="button" class="btn" id="pay-over-no">Cancelar</button><button type="button" class="btn primary" id="pay-over-yes">Sí</button></div>`;
      const dock = form.querySelector(':scope > .sheet-actions');
      if (dock) form.insertBefore(ask, dock);
      else form.appendChild(ask);
      const yes = await new Promise((resolve) => {
        $('#pay-over-yes').onclick = () => { ask.remove(); resolve(true); };
        $('#pay-over-no').onclick = () => { ask.remove(); resolve(false); };
      });
      if (!yes) return;
    }
    const entries = [];
    const grants = [];
    const debtAdds = [];
    for (const row of planned) {
      const used = row.applied?.used || [];
      let cashSum = 0; let cashTo = '';
      let transferSum = 0; const transferBits = [];
      let creditSum = 0; let creditTo = '';
      for (const slice of used) {
        if (slice.kind === 'cash') { cashSum = roundMoney(cashSum + slice.amount); cashTo = cashTo || slice.name; }
        else if (slice.kind === 'transfer') { transferSum = roundMoney(transferSum + slice.amount); transferBits.push({ to: slice.name, amount: slice.amount }); }
        else { creditSum = roundMoney(creditSum + slice.amount); creditTo = creditTo || slice.name; }
      }
      creditSum = roundMoney(creditSum + (row.fromCredit || 0));
      if (creditSum > 0 && !creditTo) creditTo = loggedInStaffName();
      const awaiting = (row.pending || []).map((item) => ({
        id: Math.random().toString(36).slice(2, 10),
        kind: item.kind, amount: item.amount, to: item.name, toUid: item.uid, at: Date.now(),
      }));
      const money = cashSum + transferSum + creditSum + (row.pendingTransfer || 0);
      if (money > 0) {
        entries.push({
          id: row.player.id,
          input: {
            ...payInput({ cash: cashSum, transfer: transferSum, pending: row.pendingTransfer || 0, credit: creditSum }),
            cashTo: cashSum > 0 ? named(cashTo) : null,
            transferTo: transferBits.length === 1 ? named(transferBits[0].to) : null,
            transferParts: transferBits.length > 1 ? transferBits.map((part) => ({ ...part, to: named(part.to) || part.to })) : null,
            creditTo: creditSum > 0 ? named(creditTo) : null,
            pendingTo: row.pendingTransfer > 0 ? named(form.pendingTo.value) : null,
            ...(awaiting.length ? { awaiting } : {}),
          },
        });
      } else if (awaiting.length) {
        entries.push({ id: row.player.id, awaitingOnly: awaiting });
      }
      for (const item of row.applied?.settlements || []) debtAdds.push(item);
      for (const item of row.applied?.credits || []) {
        const found = item.uid ? { uid: item.uid, name: collectorIdentity(item.name).name || item.name } : collectorIdentity(item.name);
        if (!found.uid) { $('#pay-err').textContent = 'No encuentro al organizador que cobró lo que sobra.'; return; }
        grants.push({ personKey: personKey(p, app.players), organizerUid: found.uid, organizerName: found.name, name: p.name, delta: item.amount });
      }
    }
    if (!entries.length && !grants.length) { $('#pay-err').textContent = 'Poné un monto.'; return; }
    const people = planned.map((row) => row.player);
    const delta = creditDelta(people, entries);
    if (delta < 0 && roundMoney(-delta) > creditBalance(app.credits, personKey(p, app.players), actor().uid)) {
      $('#pay-err').textContent = 'No alcanza el saldo a favor.';
      return;
    }
    const job = (async () => {
      const debtEntries = [];
      for (const item of debtAdds) {
        const who = app.players.find((player) => player.id === item.id);
        if (!who) continue;
        const prev = paymentParts(who);
        const cash = item.kind === 'cash' ? roundMoney(prev.cash + item.amount) : prev.cash;
        const transfer = item.kind === 'transfer' ? roundMoney(prev.transfer + item.amount) : prev.transfer;
        const credit = item.kind === 'credit' ? roundMoney(prev.credit + item.amount) : prev.credit;
        debtEntries.push({
          id: who.id,
          input: {
            paid: true, split: true, freePlay: false,
            cash, transfer, pendingTransfer: prev.pending, fromCredit: credit,
            cashTo: cash > 0 ? (item.kind === 'cash' ? item.name : who.cashTo) : null,
            transferTo: transfer > 0 ? (item.kind === 'transfer' ? item.name : who.transferTo) : null,
            pendingTo: prev.pending > 0 ? who.pendingTo : null,
            creditTo: credit > 0 ? (item.kind === 'credit' ? item.name : who.creditTo) : null,
          },
        });
      }
      const moves = mergeCreditMoves([...(delta ? [creditMoveFor(p, delta)] : []), ...grants]);
      await applyPaySave([...entries, ...debtEntries], moves);
      for (const grant of grants) {
        await app.store.recordCreditLoad({ match: null, player: { ...p, creditTo: grant.organizerName }, amount: grant.delta, solo: true });
      }
      for (const row of planned) {
        for (const item of row.pending || []) {
          await app.store.logPlayerPago(row.player.id, { type: 'pago pendiente', method: item.kind === 'transfer' ? 'transferencia' : item.kind === 'credit' ? 'credito' : 'efectivo', amount: item.amount, paidTo: item.name, detail: 'Pendiente de confirmar' });
        }
      }
    })();
    leave(run(job, note.extra > 0 ? 'Pago guardado. Lo que sobra quedó anotado.' : (planned.length > 1 ? 'Promo aplicada' : 'Pago guardado')));
  };
}
function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function debtSubject(player) {
  if (!player) return null;
  if (player.rosterId) {
    const found = (app.roster || []).find((item) => item.id === player.rosterId);
    if (found) return found;
    return { id: player.rosterId, name: player.name || '', phone: player.phone || '' };
  }
  const phone = canonicalPhone(player.phone || '');
  if (phone) {
    const found = rosterByPhone(app.roster || [], phone);
    if (found) return found;
    return { id: '', name: player.name || '', phone };
  }
  return { id: '', name: player.name || '' };
}

const NICK_HINT = 'Es lo que se ve en la lista del partido y en Equipos.';
const MENU_PANEL = { nick: 'menu-nick', credit: 'menu-credit', debt: 'menu-debt', balance: 'menu-balance', button: 'pm-credit', returnButton: 'pm-credit-return', available: 'pm-credit-available', err: 'menu-credit-err', stats: 'pm-stats' };
const PROFILE_PANEL = { nick: 'profile-nick', credit: 'profile-credit', debt: 'debt-total', balance: 'profile-balance', button: 'profile-credit-btn', returnButton: 'profile-credit-return', available: 'profile-credit-available', err: 'profile-credit-err', stats: 'profile-stats' };

function staffActor() {
  return { ...actor(), role: app.role || app.session?.user?.role || '' };
}

/** Claves de saldo: la del jugador del partido, o las de la ficha y sus partidos. */
function creditKeysOf(player, person) {
  const keys = [];
  const add = (key) => {
    const clean = String(key || '').trim();
    if (clean && !keys.includes(clean)) keys.push(clean);
  };
  if (player) add(personKey(player, app.players));
  if (person) {
    for (const row of app.players) {
      if (playerMatchesPerson(row, person)) add(personKey(row, app.players));
    }
    const phone = phoneIdentity(person);
    if (phone) add(`p:${phone}`);
    else if (person.id) add(`r:${person.id}`);
    else {
      const name = foldText(person.name);
      if (name) add(`n:${name}`);
    }
  }
  return keys;
}

function creditWriteKey(keys, uid) {
  for (const key of keys) {
    if (creditBalance(app.credits, key, uid) > 0) return key;
  }
  return keys[0] || '';
}

function panelNickState(player, person) {
  if (player) return { value: nickOf(player, app.roster), editable: canWritePlayer(player, staffActor()) };
  let value = cleanShortName(person?.shortName);
  if (!value && person) {
    const linked = app.players.find((item) => playerMatchesPerson(item, person));
    if (linked) value = nickOf(linked, app.roster);
  }
  return { value, editable: !!(person && canEditRosterNick(person, staffActor())) };
}

function panelRosterPerson(player, person) {
  if (person?.id) {
    const found = (app.roster || []).find((row) => row.id === person.id);
    if (found) return found;
  }
  if (!player) return null;
  const subject = debtSubject(player);
  if (!subject?.id) return null;
  return (app.roster || []).find((row) => row.id === subject.id) || null;
}

function notesMarkup(person) {
  if (!person) {
    return `<section class="profile-block panel-notes"><h2>Notas de partido</h2><p class="empty-wait">Sin ficha en Jugadores.</p></section>`;
  }
  const own = canEditRoster(person, actor());
  const notes = sortedNotes((app.rosterNotes && app.rosterNotes[person.id]) || []);
  const list = notes.length ? notes.map((note) => `
    <article class="pnote" data-note="${esc(note.id)}">
      <div class="when">${esc(noteWhen(note, knownMatches()) || 'Partido')}</div>
      <p>${esc(note.text)}</p>
      <div class="row">
        <button type="button" class="btn" data-note-edit="${esc(note.id)}"${own ? '' : ' disabled'}>Editar</button>
        <button type="button" class="btn danger" data-note-del="${esc(note.id)}"${own ? '' : ' disabled'}>Borrar</button>
      </div>
    </article>`).join('') : '<p class="empty-wait">Sin notas.</p>';
  return `<section class="profile-block panel-notes"><h2>Notas de partido</h2><div id="notes">${list}</div><button type="button" class="btn block" id="btn-add-note"${own ? '' : ' disabled'}>Agregar nota</button></section>`;
}

function reopenPlayerMenu(player) {
  if (!player) return;
  const fresh = app.players.find((row) => row.id === player.id) || player;
  const match = knownMatches().find((item) => item.id === fresh.matchId) || null;
  openPlayerMenu(match, fresh);
}

function statsPlayerHash(id) {
  return id ? `#/estadisticas/jugador/${encodeURIComponent(id)}` : '#/estadisticas/jugador';
}

/**
 * Apodo, saldo a favor, deuda, crédito disponible, notas y Ver estadísticas.
 * El mismo bloque en el menú del partido y en el perfil.
 */
function playerPanelPieces(player, person, ids, debtKey) {
  const keys = creditKeysOf(player, person);
  const me = staffActor();
  let credits = [];
  if (!app.creditsError) {
    try {
      credits = creditPanelRows(app.credits, keys, me).filter((row) => !me.uid || row.organizerUid === me.uid);
    } catch (error) { console.error(error); }
  }
  let debt = { total: 0, rows: [], text: '' };
  try {
    debt = playerDebt({
      person: player ? debtSubject(player) : person,
      players: app.players,
      matches: knownMatches(),
      prices: livePrices(),
      key: debtKey || '',
      organizer: me.uid ? me : null,
    });
  } catch (error) { console.error(error); }
  const nick = panelNickState(player, person);
  const nickHtml = `<label class="field nick-field"><span>Nombre corto (o apodo)</span><input id="${ids.nick}" maxlength="40" autocomplete="off" placeholder="Ej: Vini" value="${esc(nick.value)}"${nick.editable ? '' : ' disabled'}><div class="small muted">${NICK_HINT}</div></label>`;
  const debtHtml = debt.total > 0 ? `<p class="debt-total" id="${ids.debt}">${esc(debt.text)}</p>` : '';
  const err = app.creditsError ? `<p class="hint" id="${ids.err}">${esc(app.creditsError)}</p>` : '';
  const mine = credits.find((row) => row.organizerUid === me.uid);
  const shownAmount = mine ? mine.amount : 0;
  const organizerName = mine?.organizerName || me.name || '';
  const line = app.creditsError ? '' : `<span class="credit-total credit-available" id="${ids.credit}">${esc(creditAvailableLine({ organizerName, amount: shownAmount }))}</span>`;
  const buttons = canOfferCredit(me) ? `<button type="button" class="btn primary" id="${ids.button}">Cargar</button><button type="button" class="btn" id="${ids.returnButton}"${shownAmount > 0 ? '' : ' disabled'}>Devolver</button>` : '';
  const button = (line || buttons) ? `<div class="credit-actions">${line}${buttons}</div>` : '';
  const rows = debt.rows.length
    ? `<ul class="ledger-list" id="debt-list">${debt.rows.map((row) => {
      const match = knownMatches().find((item) => item.id === row.matchId);
      const who = app.players.find((item) => item.id === row.playerId);
      const open = !!(match && who && canAdd(match, actor().uid));
      if (!open) return `<li>${esc(row.text)}</li>`;
      return `<li><button type="button" class="debt-jump" data-debt-player="${esc(row.playerId)}" data-debt-match="${esc(row.matchId)}">${esc(row.text)}</button></li>`;
    }).join('')}</ul>`
    : '';
  const creditStack = button ? `<div class="credit-stack">${button}</div>` : '';
  const debtStack = (debtHtml || rows) ? `<div class="debt-stack">${debtHtml}${rows}</div>` : '';
  const balance = `<div class="player-balance" id="${ids.balance}">${creditStack}${debtStack}</div>`;
  const rosterPerson = panelRosterPerson(player, person);
  const notesHtml = notesMarkup(rosterPerson);
  const statsButton = `<button type="button" class="btn block" id="${ids.stats}">Ver estadísticas</button>`;
  return { keys, writeKey: creditWriteKey(keys, me.uid), nick, nickHtml, balance, err, button, rows, notesHtml, statsButton, person: rosterPerson, shownAmount, organizerName };
}

function bindPlayerPanel(scope, player, person, ids, panel) {
  const input = scope?.querySelector(`#${ids.nick}`);
  if (input && !input.disabled) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
    });
    input.addEventListener('change', () => {
      const nick = cleanShortName(input.value);
      const before = player ? nickOf(player, app.roster) : cleanShortName(person?.shortName);
      if (nick === before) return;
      const job = player
        ? saveNick(player, nick, player.rosterId || '')
        : app.store.setRosterNick(person.id, nick);
      Promise.resolve(job).then(() => toast('Apodo actualizado')).catch((error) => {
        input.value = before;
        if (isRosterDenied(error)) showError(ROSTER_DENIED_WRITE);
        else toast('No se pudo guardar: ' + (error?.code || error?.message || error));
      });
    });
  }
  const debtList = scope?.querySelector('#debt-list');
  if (debtList) debtList.onclick = (event) => {
    const jump = event.target.closest('[data-debt-player]');
    if (!jump) return;
    const match = knownMatches().find((item) => item.id === jump.dataset.debtMatch);
    const who = app.players.find((item) => item.id === jump.dataset.debtPlayer);
    if (!match || !who || !canAdd(match, actor().uid)) return;
    const fromMenu = !!player;
    openPaymentForm(match, who, {
      returnTo: fromMenu
        ? () => {
          const fresh = app.players.find((item) => item.id === player.id) || player;
          const home = knownMatches().find((item) => item.id === fresh.matchId) || null;
          openPlayerMenu(home, fresh);
        }
        : () => closeSheet(),
    });
  };
  const btn = scope?.querySelector(`#${ids.button}`);
  if (btn) btn.onclick = () => openCreditForm({ player, person, panel });
  const back = scope?.querySelector(`#${ids.returnButton}`);
  if (back && !back.disabled) back.onclick = () => openCreditReturnForm({ player, person, panel });
  const statsBtn = scope?.querySelector(`#${ids.stats}`);
  if (statsBtn) statsBtn.onclick = () => {
    closeSheet();
    location.hash = statsPlayerHash(panel.person?.id || '');
  };
  bindPlayerNotes(scope, player, panel.person);
}

function bindPlayerNotes(scope, player, person) {
  if (!person || !canEditRoster(person, actor())) return;
  const add = scope?.querySelector('#btn-add-note');
  if (add && !add.disabled) add.onclick = () => openNoteForm(person, null, player);
  const notes = scope?.querySelector('#notes');
  if (!notes) return;
  notes.onclick = async (e) => {
    const edit = e.target.closest('[data-note-edit]');
    const mine = (app.rosterNotes && app.rosterNotes[person.id]) || [];
    if (edit) return openNoteForm(person, mine.find((n) => n.id === edit.dataset.noteEdit), player);
    const del = e.target.closest('[data-note-del]');
    if (!del) return;
    const note = mine.find((n) => n.id === del.dataset.noteDel);
    if (!note || !(await askConfirm('¿Borrar esta nota?', { danger: true }))) return;
    saveProfile(person.id, { notes: mine.filter((n) => n.id !== note.id) }, () => {
      if (player && sheet.open) reopenPlayerMenu(player);
    });
  };
}

/** Deudas de esta persona con el organizador logueado, de la más vieja a la más nueva. */
function creditDebtsFor(player, person) {
  const me = staffActor();
  const keys = new Set(creditKeysOf(player, person));
  const rows = [];
  for (const other of app.players) {
    const key = personKey(other, app.players);
    if (!key || !keys.has(key) || !owesOrganizer(other, me)) continue;
    const owed = amountOwed(other, { players: app.players, matches: knownMatches(), prices: livePrices() });
    if (!(owed > 0)) continue;
    const match = knownMatches().find((item) => item.id === other.matchId);
    if (!match || match.cancelled === true) continue;
    rows.push({
      id: other.id,
      player: other,
      date: match.date || '',
      time: match.time || '',
      owed,
      label: [numericDate(match.date), shortHour(match.time)].filter(Boolean).join(' '),
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || String(a.id).localeCompare(String(b.id)));
  return rows;
}

/** El crédito se suma a lo ya cobrado. El cobrador del crédito es quien está logueado. */
function creditPaymentInput(player, addCredit, creditTo) {
  const prev = paymentParts(player);
  const cash = prev.cash;
  const transfer = prev.transfer;
  const pending = prev.pending;
  const credit = roundMoney(prev.credit + addCredit);
  const keepParts = Array.isArray(player.transferParts) && player.transferParts.length > 1;
  return {
    paid: true,
    split: true,
    freePlay: false,
    cash,
    transfer,
    pendingTransfer: pending,
    fromCredit: credit,
    cashTo: cash > 0 ? (player.cashTo || player.receivedBy || null) : null,
    transferTo: transfer > 0 && !keepParts ? (player.transferTo || player.receivedBy || null) : null,
    pendingTo: pending > 0 ? (player.pendingTo || player.paidUpdatedBy || null) : null,
    creditTo: credit > 0 ? creditTo : null,
    ...(keepParts ? { transferParts: player.transferParts } : {}),
  };
}

function creditPreviewHtml(plan, who) {
  if (!plan?.ok) return '';
  const name = String(who || '').trim();
  const leftLine = (amount) => name
    ? `Queda como crédito con ${name}: ${formatARS(amount)}.`
    : `Queda como crédito: ${formatARS(amount)}.`;
  const noneLine = name ? `No queda crédito con ${name}.` : 'No queda crédito.';
  if (!plan.rows.length) {
    return `<p class="hint" id="credit-preview">No tiene deudas con vos. ${esc(leftLine(plan.leftover))}</p>`;
  }
  const lines = plan.rows.map((row) => `<li><span>${esc(row.label)}</span><b>${esc(formatARS(row.credit))}</b></li>`).join('');
  const left = plan.leftover > 0
    ? `<p class="hint" id="credit-leftover">${esc(leftLine(plan.leftover))}</p>`
    : `<p class="hint" id="credit-leftover">${esc(noneLine)}</p>`;
  return `<div id="credit-preview"><p class="hint">Primero las deudas más viejas con vos.</p><ul class="pay-split-preview">${lines}</ul>${left}</div>`;
}

function openCreditForm({ player, person, panel }) {
  const me = actor();
  const key = panel?.writeKey || creditWriteKey(creditKeysOf(player, person), me.uid);
  if (!key) { toast('No se puede cargar crédito sin identificar al jugador.'); return; }
  if (!me.uid) { toast('No se pudo identificar la sesión.'); return; }
  const label = player ? shownName(player) : (cleanShortName(person?.shortName) || person?.name || '');
  const fullName = player?.name || person?.name || '';
  const current = panel?.shownAmount ?? creditBalance(app.credits, key, me.uid);
  const who = me.name || 'vos';
  openSheet(`
    <form id="credit-form" novalidate>
      <h3>Cargar crédito</h3>
      <p class="hint">${esc(label)} · con ${esc(who)}</p>
      <p class="credit-total" id="credit-now">${esc(creditAvailableLine({ organizerName: who, amount: current }))}</p>
      <label class="field"><span>Monto</span><input name="amount" inputmode="decimal" autocomplete="off" placeholder="0" autofocus aria-label="Monto del crédito"></label>
      <div id="credit-plan"></div>
      <p class="hint">Primero cancela las deudas más viejas con ${esc(who)}. Lo que sobra queda como crédito con ${esc(who)}.</p>
      <div class="field"><div class="err" id="credit-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  const form = $('#credit-form');
  const paintPlan = () => {
    const box = $('#credit-plan');
    if (!box) return;
    const money = readMoney(form.amount.value);
    if (!money.ok || !(money.amount > 0)) { box.innerHTML = ''; return; }
    const plan = creditAgainstDebts(money.amount, creditDebtsFor(player, person));
    box.innerHTML = plan.ok ? creditPreviewHtml(plan, who) : '';
  };
  form.amount.addEventListener('input', paintPlan);
  form.onsubmit = (e) => {
    e.preventDefault();
    if (app.creditsError) { $('#credit-err').textContent = app.creditsError; return; }
    const money = readMoney(form.amount.value);
    if (!money.ok || !(money.amount > 0)) { $('#credit-err').textContent = money.ok ? 'Poné el monto.' : money.error; return; }
    const plan = creditAgainstDebts(money.amount, creditDebtsFor(player, person));
    if (!plan.ok) { $('#credit-err').textContent = plan.error; return; }
    const creditTo = loggedInStaffName();
    const entries = plan.rows.map((row) => ({
      id: row.id,
      input: creditPaymentInput(row.player, row.credit, creditTo),
    }));
    const summary = creditLoadSummary(plan, who);
    closeSheet();
    const job = (async () => {
      if (entries.length) await writePaymentsInOrder(entries, (entry) => app.store.setPayment(entry.id, entry.input, app.who));
      if (plan.leftover > 0) {
        await app.store.adjustCredit({
          personKey: key,
          organizerUid: me.uid,
          organizerName: me.name,
          name: fullName,
          delta: plan.leftover,
        }, app.who);
      }
      const pureLoad = plan.rows.length === 0;
      const creditMatch = !pureLoad && player?.matchId ? matchById(player.matchId) : null;
      await app.store.recordCreditLoad({
        match: creditMatch,
        player: { ...(player || {}), name: player?.name || fullName, creditTo },
        amount: money.amount,
        solo: pureLoad,
      });
    })();
    run(job, summary);
  };
}

function openCreditReturnForm({ player, person, panel }) {
  const me = actor();
  const keys = panel?.keys?.length ? panel.keys : creditKeysOf(player, person);
  const key = panel?.writeKey || creditWriteKey(keys, me.uid);
  if (!key) { toast('No se puede devolver crédito sin identificar al jugador.'); return; }
  if (!me.uid) { toast('No se pudo identificar la sesión.'); return; }
  const label = player ? shownName(player) : (cleanShortName(person?.shortName) || person?.name || '');
  const fullName = player?.name || person?.name || '';
  const current = panel?.shownAmount ?? creditBalance(app.credits, key, me.uid);
  const who = panel?.organizerName || me.name || 'vos';
  openSheet(`
    <form id="return-form" novalidate>
      <h3>Devolver crédito</h3>
      <p class="hint">${esc(label)} · con ${esc(who)}</p>
      <p class="credit-total" id="return-now">${esc(creditAvailableLine({ organizerName: who, amount: current }))}</p>
      <label class="field"><span>Monto a devolver</span><input name="amount" inputmode="decimal" autocomplete="off" placeholder="0" autofocus aria-label="Monto a devolver"></label>
      <div class="field"><div class="err" id="return-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit" id="return-ok">Confirmar</button></div>
    </form>`);
  const form = $('#return-form');
  const paint = () => {
    const err = $('#return-err');
    const submit = $('#return-ok');
    if (!err || !submit) return;
    if (app.creditsError) { err.textContent = app.creditsError; submit.disabled = true; return; }
    const money = readMoney(form.amount.value);
    if (!money.ok) { err.textContent = money.error; submit.disabled = true; return; }
    const plan = creditReturnPlan(money.amount, current);
    if (!plan.ok) { err.textContent = plan.error; submit.disabled = true; return; }
    err.textContent = '';
    submit.disabled = false;
  };
  form.amount.addEventListener('input', paint);
  paint();
  form.onsubmit = (e) => {
    e.preventDefault();
    paint();
    if ($('#return-ok')?.disabled) return;
    const money = readMoney(form.amount.value);
    const plan = money.ok ? creditReturnPlan(money.amount, current) : money;
    if (!plan.ok) { $('#return-err').textContent = plan.error; return; }
    closeSheet();
    const moves = keys
      .map((personKey) => ({ personKey, have: creditBalance(app.credits, personKey, me.uid) }))
      .filter((row) => row.have > 0);
    const job = (async () => {
      let left = plan.amount;
      for (const row of moves) {
        if (!(left > 0)) break;
        const take = Math.min(row.have, left);
        await app.store.adjustCredit({
          personKey: row.personKey,
          organizerUid: me.uid,
          organizerName: me.name,
          name: fullName,
          delta: -take,
        }, app.who);
        left = roundMoney(left - take);
      }
      if (left > 0) throw Object.assign(new Error('No alcanza el saldo a favor.'), { code: 'invalid-credit' });
      await app.store.recordCreditReturn({
        player: { ...(player || {}), name: fullName, creditTo: me.name },
        amount: plan.amount,
      });
    })();
    run(job, `Se devolvió ${formatARS(plan.amount)}.`);
  };
}

function suspensionCard(source) {
  if (source && !source.matchId && rosterHeldBy(source, actor())) return source;
  return heldCard(source);
}

function suspensionControls(source) {
  const card = suspensionCard(source);
  const rosterId = suspensionRosterId(card || source);
  const mine = (app.suspensions || []).find((row) => row.rosterId === rosterId && row.ownerUid === actor().uid) || null;
  const others = activeSuspensions(app.suspensions, rosterId).filter((row) => row.ownerUid !== actor().uid);
  const past = card && mine?.suspended !== true && suspensionHistoryOf(mine, app.suspensionHistory).length;
  const ownBox = card
    ? `<div class="checkline" id="pm-suspended"><input type="checkbox" id="suspend-flag"${mine?.suspended === true ? ' checked' : ''} aria-label="Suspender"><button type="button" class="suspend-label" id="suspend-note">Suspender</button></div>${past ? '<button type="button" class="suspend-label" id="suspend-history">Suspensiones anteriores</button>' : ''}`
    : '';
  const otherBoxes = others.map((row) => `<div class="checkline"><input type="checkbox" checked disabled aria-label="Suspendido por ${esc(organizerLabel(row.ownerUid))}"><button type="button" class="suspend-label" data-suspend-view="${esc(row.ownerUid)}">Suspendido por ${esc(organizerLabel(row.ownerUid))}</button></div>`).join('');
  return { html: `${ownBox}${otherBoxes}`, card, rosterId };
}

function bindSuspensionControls(root, rosterId, card) {
  if (!root || !rosterId) return;
  const suspendFlag = root.querySelector('#suspend-flag');
  const suspendNote = root.querySelector('#suspend-note');
  if (suspendNote) suspendNote.onclick = () => {
    const row = (app.suspensions || []).find((item) => item.rosterId === rosterId && item.ownerUid === actor().uid);
    openSuspensionView(row);
  };
  const suspendHistory = root.querySelector('#suspend-history');
  if (suspendHistory) suspendHistory.onclick = () => {
    const row = (app.suspensions || []).find((item) => item.rosterId === rosterId && item.ownerUid === actor().uid);
    openSuspensionView(row);
  };
  root.querySelectorAll('[data-suspend-view]').forEach((btn) => {
    btn.onclick = () => {
      const row = (app.suspensions || []).find((item) => item.rosterId === rosterId && item.ownerUid === btn.dataset.suspendView);
      openSuspensionView(row);
    };
  });
  if (suspendFlag && card) {
    let ignoreSuspend = false;
    suspendFlag.onchange = async () => {
      if (ignoreSuspend) return;
      if (suspendFlag.checked === true) {
        ignoreSuspend = true;
        suspendFlag.checked = false;
        ignoreSuspend = false;
        openSuspensionNote(card);
        return;
      }
      ignoreSuspend = true;
      suspendFlag.checked = true;
      ignoreSuspend = false;
      openLiftSuspension(card);
    };
  }
}

function openSuspensionNote(card) {
  openSheet(`
    <form id="suspend-note-form" novalidate>
      <h3>Suspendido</h3>
      <p class="hint" id="suspend-summary"></p>
      <label class="field"><span>Fecha</span><input type="date" id="suspend-date" value="${esc(todayISO())}"></label>
      <label class="field"><span>Motivo</span><textarea id="suspend-reason" maxlength="300"></textarea></label>
      <div class="field"><div class="err" id="suspend-reason-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  const form = $('#suspend-note-form');
  if (!form) return;
  const paint = () => {
    const summary = $('#suspend-summary');
    if (!summary) return;
    const date = numericDate($('#suspend-date')?.value || '');
    const reason = String($('#suspend-reason')?.value || '').replace(/\r\n/g, '\n').trim();
    summary.textContent = [date, reason].filter(Boolean).join(' · ');
  };
  form.addEventListener('input', paint);
  paint();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = String($('#suspend-reason')?.value || '').replace(/\r\n/g, '\n').trim();
    const date = String($('#suspend-date')?.value || '').trim();
    const err = $('#suspend-reason-err');
    if (!text) { if (err) err.textContent = 'Poné el motivo.'; return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { if (err) err.textContent = 'Poné la fecha.'; return; }
    try {
      await app.store.setSuspension(card.id, { note: text, date, suspended: true });
      closeSheet();
    } catch (error) {
      if (err) err.textContent = error?.code === 'edit-locked' ? EDIT_LOCK_TEXT : (error?.message || 'No se pudo guardar.');
    }
  };
}

function suspensionHistoryLine(item) {
  const base = `${numericDate(item.date)} · ${item.note} · levantada el ${numericDate(item.lifted)}`;
  return item.liftNote ? `${base} · ${item.liftNote}` : base;
}

function openLiftSuspension(card) {
  openSheet(`
    <form id="lift-form" novalidate>
      <h3>Levantar suspensión</h3>
      <p class="hint">Contá cómo se resolvió. La fecha es hoy.</p>
      <label class="field"><span>Motivo</span><textarea id="lift-reason" maxlength="300"></textarea></label>
      <div class="field"><div class="err" id="lift-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  const form = $('#lift-form');
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = String($('#lift-reason')?.value || '').replace(/\r\n/g, '\n').trim();
    const err = $('#lift-err');
    if (!text) { if (err) err.textContent = 'Poné el motivo.'; return; }
    try {
      await app.store.setSuspended(card.id, false, text);
      closeSheet();
    } catch (error) {
      if (err) err.textContent = error?.code === 'edit-locked' ? EDIT_LOCK_TEXT : (error?.message || 'No se pudo guardar.');
    }
  };
}

function suspensionViewLines(record) {
  const lines = [];
  if (record?.suspended === true) {
    const date = numericDate(record.suspensionDate || '');
    const reason = String(record.suspensionNote || '').trim();
    if (date || reason) lines.push([date, reason].filter(Boolean).join(' · '));
  }
  for (const item of suspensionHistoryOf(record, app.suspensionHistory)) {
    lines.push(suspensionHistoryLine(item));
  }
  return lines;
}

function openSuspensionView(record) {
  const lines = suspensionViewLines(record);
  if (!lines.length) return;
  openSheet(`
    <div id="suspend-view">
      <h3>Suspendido</h3>
      <div id="suspend-history">${lines.map((line, index) => `<p${index === 0 ? ' id="suspend-summary"' : ' class="hint"'}>${esc(line)}</p>`).join('')}</div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cerrar</button></div>
    </div>`);
}

function openPlayerMenu(m, p) {
  if (!p) return;
  const match = m || knownMatches().find((item) => item.id === p.matchId) || null;
  const own = canEditPlayer(p, actor());
  const phoneView = withAgendaPhone(p);
  const panel = playerPanelPieces(p, null, MENU_PANEL, personKey(p, app.players));
  const payList = recordedPaymentList(p, 'menu-payments');
  const pendingInList = paymentShares(p).some((share) => share.kind === 'pending' && share.amount > 0);
  const payStatus = payMarkup(p, { hidePending: pendingInList });
  const payLine = `${payStatus || (payList ? '' : '<p class="hint" id="menu-unpaid">Sin pago cargado</p>')}${payList}`;
  const paidAlready = p.paid === true || paymentParts(p).received > 0;
  const canAnnotate = !!(match && canAdd(match, actor().uid));
  const suspend = suspensionControls(p);
  openSheet(`
    ${suspend.html}
    <div class="name-share">
      <h3 class="${suspendedClass(p).trim()}">${suspendedName(p, shownName(p))}</h3>
      ${playerShareButton('pm-share')}
    </div>
    <div class="player-panel" id="menu-panel">${panel.nickHtml}${panel.balance}${panel.err}${panel.notesHtml}${panel.statsButton}</div>
    <p class="hint">${fullNameBehind(p, app.roster) ? `<span id="menu-full-name" class="${suspendedClass(p).trim()}">${esc(p.name)}</span> · ` : ''}${phoneView.phone ? esc(displayFromWa(phoneView.phone)) + ' · ' : phoneHidden(phoneView) ? esc(PRIVATE_WA_TEXT) + ' · ' : ''}Agregó: ${esc(p.addedBy || '?')}</p>
    <div class="menu-pay" id="menu-pay">${payLine}</div>
    ${canAnnotate ? signupFields(p, match) : (p.signedUpWithName ? `<p class="hint" id="signed-up-line">Se anotó con: ${esc(p.signedUpWithName)}</p>` : '')}
    <div class="menu">
      ${canAnnotate ? `<button class="btn" id="pm-pay">${paidAlready ? 'Editar pago' : 'Cargar pago'}</button>` : ''}
      ${phoneView.phone && match ? `<a class="btn" id="pm-wa" href="${esc(waHref(phoneView.phone, waMessage(match, p)))}" target="_blank" rel="noopener">${ICON.wa}Mandar WhatsApp</a>` : phoneHidden(phoneView) ? `<button class="btn" type="button" disabled>${esc(PRIVATE_WA_TEXT)}</button>` : `<button class="btn" id="pm-phone"${own ? '' : ' disabled'}>Cargar WhatsApp</button>`}
      <button class="btn" id="pm-profile">Ver perfil</button>
      ${p.tentative === true ? '<button class="btn" id="pm-confirm-spot">Confirmar lugar</button>' : ''}
      ${p.tentative === true && p.confirmed === 'no' ? '<p class="hint">No juega · se puede liberar el lugar</p>' : ''}
      <button class="btn" id="pm-edit"${own || canAnnotate || canWritePlayer(p, actorWithRole()) ? '' : ' disabled'}>${ICON.edit}Editar</button>
      ${own ? '' : `<p class="hint edit-lock" id="edit-lock">${esc(EDIT_LOCK_TEXT)}</p>`}
      ${isGuest(p) ? '' : '<button class="btn" id="pm-friend">Agregar invitado</button>'}
      ${!isWaiting(p) && !isNoPlay(p) && canAnnotate ? '<button class="btn" id="pm-wait">Bajar a lista de espera</button>' : ''}
      ${!isWaiting(p) && !isNoPlay(p) && canAnnotate ? '<button class="btn" id="pm-no-play">No jugó pero pagó</button>' : ''}
      ${isNoPlay(p) && canAnnotate ? '<button class="btn" id="pm-back">Volver al partido</button>' : ''}
      <button class="btn danger" id="pm-del">${ICON.trash}${isWaiting(p) ? 'Quitar de la espera' : 'Quitar del partido'}</button>
      <button class="btn ghost" data-close>Cancelar</button>
    </div>`);
  bindPlayerPanel(sheet, p, null, MENU_PANEL, panel);
  bindAnnulList($('#menu-payments'), p);
  bindSuspensionControls(sheet, suspend.rosterId, suspend.card);
  const menuShare = $('#pm-share');
  if (menuShare) menuShare.onclick = () => copyPlayerLink(shareRosterId(p));
  $('#pm-profile').onclick = () => { closeSheet(); openPlayerProfile(p, match?.id); };
  const payBtn = $('#pm-pay');
  if (payBtn) payBtn.onclick = () => openPaymentForm(match, p);
  const signupBox = $('#signed-up-with');
  if (signupBox) signupBox.onchange = () => {
    const signup = readSignup(signupBox);
    if (!signup.signedUpWith) return;
    run(app.store.updatePlayer(p.id, signup), 'Se anotó con actualizado');
  };
  const loadPhone = $('#pm-phone');
  if (loadPhone && own) loadPhone.onclick = () => { closeSheet(); app.wantPhoneForm = true; openPlayerProfile(p, match?.id); };
  const spot = $('#pm-confirm-spot');
  if (spot) spot.onclick = () => { closeSheet(); clearReservedSpot(p); };
  if (match && !$('#pm-edit').disabled) $('#pm-edit').onclick = () => openPlayerForm(match, p);
  const addGuest = $('#pm-friend');
  if (addGuest && match) addGuest.onclick = () => openFriendForm(match, p);
  const demote = $('#pm-wait');
  if (demote && match) demote.onclick = () => demoteToWait(match, p);
  const noPlayBtn = $('#pm-no-play');
  if (noPlayBtn && match) noPlayBtn.onclick = () => markPaidNoPlay(match, p);
  const backBtn = $('#pm-back');
  if (backBtn && match) backBtn.onclick = () => restoreNoPlay(match, p);
  if (match) $('#pm-del').onclick = () => (isNoPlay(p) ? removeNoPlayPlayer(match, p) : removeMatchPlayer(match, p));
}

const ask = $('#ask');
function askNotice(message) {
  return askConfirm(message, { notice: true });
}
function askConfirm(message, { danger = false, notice = false, okText = 'Aceptar' } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let pushed = false;
    const finish = (ok, fromPop = false) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('popstate', onPop);
      ask.removeEventListener('cancel', onCancel);
      ask.removeEventListener('close', onClose);
      ask.onclick = null;
      if (ask.open) ask.close();
      if (pushed && !fromPop) {
        const done = () => {
          window.removeEventListener('popstate', done);
          resolve(!!ok);
        };
        window.addEventListener('popstate', done);
        history.back();
        return;
      }
      resolve(!!ok);
    };
    const onPop = () => finish(false, true);
    const onCancel = (event) => { event.preventDefault(); finish(false); };
    const onClose = () => finish(false);
    const cancel = notice ? '' : '<button type="button" class="btn" id="ask-cancel">Cancelar</button>';
    ask.innerHTML = `<div class="ask-card" id="app-ask"><p id="app-ask-text"></p><div class="sheet-actions">${cancel}<button type="button" class="btn ${danger ? 'danger solid' : 'primary'}" id="ask-ok">${esc(okText)}</button></div></div>`;
    ask.querySelector('#app-ask-text').textContent = String(message || '');
    const cancelBtn = ask.querySelector('#ask-cancel');
    if (cancelBtn) cancelBtn.onclick = () => finish(false);
    ask.querySelector('#ask-ok').onclick = () => finish(!notice);
    ask.onclick = (event) => { if (event.target === ask) finish(false); };
    ask.addEventListener('cancel', onCancel);
    ask.addEventListener('close', onClose);
    if (!ask.open) ask.showModal();
    ask.querySelector('#ask-ok').focus();
    history.pushState({ ask: 1 }, '');
    pushed = true;
    window.addEventListener('popstate', onPop);
  });
}

function askYesNo(title) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (yes) => {
      if (settled) return;
      settled = true;
      resolve(!!yes);
      closeSheet();
    };
    openSheet(`
      <h3>${esc(title)}</h3>
      <div class="choice">
        <button type="button" class="btn primary" id="ask-yes">Sí</button>
        <button type="button" class="btn" id="ask-no">No</button>
      </div>`);
    $('#ask-yes').onclick = () => finish(true);
    $('#ask-no').onclick = () => finish(false);
    // Si venimos de otra pregunta, su 'close' llega tarde con la hoja ya abierta: no cuenta como No.
    const onClose = () => {
      if (sheet.open) return;
      sheet.removeEventListener('close', onClose);
      finish(false);
    };
    sheet.addEventListener('close', onClose);
  });
}

async function clearSettledPayment(playerId) {
  const player = app.players.find((item) => item.id === playerId);
  if (!player) return;
  const pending = paymentParts(player).pending;
  if (pending > 0) {
    await app.store.setPayment(playerId, {
      paid: true,
      split: true,
      freePlay: false,
      cash: 0,
      transfer: 0,
      pendingTransfer: pending,
      fromCredit: 0,
      pendingTo: player.pendingTo || null,
    }, app.who);
    return;
  }
  await app.store.setPayment(playerId, { paid: false, split: true }, app.who);
}

async function applyPromoSettlement(person, plan) {
  if (!plan) return false;
  const beneficiary = promoPayer(person);
  const key = personKey(beneficiary, app.players);
  const net = new Map();
  for (const credit of plan.credits || []) {
    const name = collectorIdentity(credit.name || actor().name).name || actor().name;
    net.set(name, roundMoney((net.get(name) || 0) + credit.amount));
  }
  for (const spend of plan.spends || []) {
    const name = collectorIdentity(spend.name || '').name;
    if (!name) continue;
    net.set(name, roundMoney((net.get(name) || 0) - spend.amount));
  }
  const moves = [];
  for (const [organizerName, delta] of net) {
    if (!delta) continue;
    const found = collectorIdentity(organizerName);
    if (!found.uid || !key) throw Object.assign(new Error('No se puede guardar el saldo sin identificar a quien pagó.'), { code: 'invalid-credit' });
    moves.push({
      personKey: key,
      organizerUid: found.uid,
      organizerName: found.name,
      name: beneficiary.name || '',
      delta,
    });
  }
  const done = [];
  try {
    for (const move of moves) {
      await app.store.adjustCredit(move, app.who);
      done.push(move);
    }
    for (const row of plan.payments || []) {
      const wasAuto = app.players.find((item) => item.id === row.playerId)?.autoCredit === true;
      await app.store.setPayment(row.playerId, {
        paid: true,
        split: true,
        freePlay: false,
        cash: row.cash,
        transfer: row.transfer,
        pendingTransfer: row.pending,
        fromCredit: row.fromCredit,
        cashTo: row.cash > 0 ? row.cashTo : null,
        transferTo: row.transfer > 0 ? row.transferTo : null,
        transferParts: row.transferParts,
        pendingTo: row.pending > 0 ? row.pendingTo : null,
        creditTo: row.fromCredit > 0 ? row.creditTo : null,
        autoCredit: row.fromCredit > 0 && (wasAuto || (plan.spends || []).length > 0),
      }, app.who);
    }
    for (const id of plan.clearIds || []) {
      if ((plan.payments || []).some((row) => row.playerId === id)) continue;
      await clearSettledPayment(id);
    }
    for (const move of moves) {
      if (!(move.delta > 0)) continue;
      await app.store.recordCreditLoad({
        match: null,
        player: { ...beneficiary, creditTo: move.organizerName },
        amount: move.delta,
        solo: true,
      });
    }
  } catch (error) {
    for (const move of done) await app.store.adjustCredit({ ...move, delta: roundMoney(-move.delta) }, app.who);
    throw error;
  }
  return true;
}

async function settlePromoForMatch(matchId, { leaving = false, joining = false } = {}) {
  const people = app.players.filter((item) => item.matchId === matchId && item.waiting !== true && !isFreePlay(item) && !isNoPlay(item));
  const seen = new Set();
  for (const person of people) {
    const key = personKey(person, app.players);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const prices = livePrices();
    const matches = knownMatches();
    const plan = leaving
      ? promoSettleLeaving({ player: person, players: app.players, matches, prices, matchId })
      : promoSettleJoining({
        player: person,
        players: app.players,
        matches,
        prices,
        matchId,
        balances: creditBalances(app.credits, personKey(promoPayer(person), app.players)),
      });
    if (plan) await applyPromoSettlement(person, plan);
    else if (leaving) await refundAutoCredit(person);
  }
  if (!leaving) return;
  for (const person of app.players.filter((item) => item.matchId === matchId && (item.waiting === true || isFreePlay(item) || isNoPlay(item)))) {
    await refundAutoCredit(person);
  }
}

/** Al quedar un solo partido de la promo, cobra el precio de Ajustes y el sobrante es saldo de quien pagó. */
async function unwindPromoPayment(player) {
  if (!player || player.waiting === true || isFreePlay(player)) return false;
  const refund = promoRefundAfterFree({ player, players: app.players, matches: knownMatches(), prices: livePrices() });
  if (!refund || (!(refund.payments || []).length && !(refund.credits || []).length)) return false;
  const beneficiary = promoPayer(player);
  const key = personKey(beneficiary, app.players);
  if (refund.credits.length && !key) throw Object.assign(new Error('No se puede guardar el saldo sin identificar a quien pagó.'), { code: 'invalid-credit' });
  const grants = [];
  for (const credit of refund.credits || []) {
    const found = collectorIdentity(credit.name || actor().name);
    if (!found.uid) throw Object.assign(new Error('No encuentro al organizador que cobró lo que sobra.'), { code: 'invalid-credit' });
    grants.push({
      personKey: key,
      organizerUid: found.uid,
      organizerName: found.name,
      name: beneficiary.name || '',
      delta: credit.amount,
    });
  }
  for (const row of refund.payments || []) {
    const wasAuto = app.players.find((item) => item.id === row.playerId)?.autoCredit === true;
    await app.store.setPayment(row.playerId, {
      paid: true,
      split: true,
      freePlay: false,
      cash: row.cash,
      transfer: row.transfer,
      pendingTransfer: row.pending,
      fromCredit: row.fromCredit,
      cashTo: row.cash > 0 ? row.cashTo : null,
      transferTo: row.transfer > 0 ? row.transferTo : null,
      transferParts: row.transferParts,
      pendingTo: row.pending > 0 ? row.pendingTo : null,
      creditTo: row.fromCredit > 0 ? row.creditTo : null,
      autoCredit: wasAuto && row.fromCredit > 0,
    }, app.who);
  }
  for (const id of refund.clearIds || []) {
    if (id === player.id || (refund.payments || []).some((row) => row.playerId === id)) continue;
    await clearSettledPayment(id);
  }
  for (const move of grants) await app.store.adjustCredit(move, app.who);
  for (const credit of grants) {
    await app.store.recordCreditLoad({
      match: null,
      player: { ...beneficiary, creditTo: credit.organizerName },
      amount: credit.delta,
      solo: true,
    });
  }
  return true;
}

async function markPaidNoPlay(m, p) {
  if (!m || !p || isNoPlay(p) || isWaiting(p) || !canAdd(m, actor().uid)) return;
  const top = waitingOf(m.id)[0];
  const mainLeft = playersOf(m.id).filter((item) => item.id !== p.id).length;
  const needsPromote = !!top && mainLeft < capOf(m);
  const go = (promote) => {
    closeSheet();
    const job = (async () => {
      await app.store.setNoPlay(p.id, true);
      if (!promote) return;
      await app.store.promoteFromWaiting(top.id);
      await applyAutoCredit(top.id);
      await offerPromotionWhatsApp(top, m);
    })();
    run(job, promote ? `${top.name} pasó al partido` : `${shownName(p)} quedó en No jugó pero pagó`);
  };
  if (!needsPromote) {
    closeSheet();
    go(false);
    return;
  }
  askYesNo(`¿Subir a ${top.name}, el primero de la lista de espera?`).then(go);
}

async function restoreNoPlay(m, p) {
  if (!m || !p || !isNoPlay(p) || !canAdd(m, actor().uid)) return;
  if (playersOf(m.id).length >= capOf(m)) {
    toast('No hay lugar en el partido.');
    return;
  }
  closeSheet();
  run((async () => {
    await app.store.setNoPlay(p.id, false);
    await applyAutoCredit(p.id);
  })(), `${shownName(p)} volvió al partido`);
}

async function removeNoPlayPlayer(m, p) {
  if (!m || !p || !isNoPlay(p)) return;
  if (!(await askConfirm(`¿Quitar a ${p.name} del partido? El pago no vuelve al saldo.`, { danger: true }))) return;
  closeSheet();
  run(app.store.deletePlayer(p.id), `${p.name} quitado`);
}

async function removeMatchPlayer(m, p, { asked = false } = {}) {
  const fromMain = !isWaiting(p);
  const friends = guestsOf(m.id, p.id);
  if (!asked && !(await askConfirm(`¿Quitar a ${p.name}${fromMain ? ' del partido' : ' de la lista de espera'}?`, { danger: true }))) return;
  const dropFriends = friends.length > 0 && await askYesNo(`¿Quitar también a sus invitados (${friends.map((item) => item.name).join(', ')})?`);
  const dropping = new Set([p.id, ...(dropFriends ? friends.map((item) => item.id) : [])]);
  const top = waitingOf(m.id).find((item) => !dropping.has(item.id));
  const mainLeft = playersOf(m.id).filter((item) => !dropping.has(item.id)).length;
  const needsPromote = fromMain && !!top && mainLeft < capOf(m);
  const go = (promote) => {
    const job = (async () => {
      const exited = [];
      for (const id of dropping) {
        const person = app.players.find((item) => item.id === id);
        if (person && person.waiting !== true) exited.push(person);
        if (person) {
          await refundAutoCredit(person);
          await unwindPromoPayment(app.players.find((item) => item.id === id) || person);
        }
      }
      for (const id of dropping) await app.store.deletePlayer(id);
      for (const person of exited) await retargetPromoAfterExit(person);
      if (!promote) return;
      await app.store.promoteFromWaiting(top.id);
      await applyAutoCredit(top.id);
      await offerPromotionWhatsApp(top, m);
    })();
    run(job, promote ? `${top.name} pasó al partido` : `${p.name} quitado`);
  };
  if (!needsPromote) {
    closeSheet();
    go(false);
    return;
  }
  askYesNo(`¿Subir a ${top.name}, el primero de la lista de espera?`).then(go);
}

async function demoteToWait(m, p) {
  if (!p || isWaiting(p) || !canAdd(m, actor().uid)) return;
  const guests = guestsOf(m.id, p.id).filter((item) => !isWaiting(item));
  const also = guests.length > 0 && await askYesNo(`¿Bajar también a sus invitados (${guests.map((item) => item.name).join(', ')})?`);
  const moving = [p, ...(also ? guests : [])];
  closeSheet();
  let order = nextWaitOrder(waitingOf(m.id));
  const msg = also && guests.length ? `${p.name} y sus invitados pasaron a la lista de espera` : `${p.name} pasó a la lista de espera`;
  run((async () => {
    for (const item of moving) {
      const unwound = await unwindPromoPayment(item);
      if (unwound) {
        const pending = paymentParts(item).pending;
        if (pending > 0) {
          await app.store.setPayment(item.id, {
            paid: true, split: true, freePlay: false,
            cash: 0, transfer: 0, pendingTransfer: pending, fromCredit: 0,
            pendingTo: item.pendingTo || null,
          }, app.who);
        } else {
          await app.store.setPayment(item.id, { paid: false, split: true }, app.who);
        }
      }
      await app.store.updatePlayer(item.id, { waiting: true, waitOrder: order, rosterAt: null });
      order += 1;
      await retargetPromoAfterExit(item);
    }
  })(), msg);
}

function openFriendForm(m, host) {
  if (!host) return;
  const guestBlock = inviteBlock(matesOf(m.id), host.id);
  if (guestBlock) { toast(guestBlock); return; }
  const blocked = addBlock(m);
  if (blocked) { toast(blocked); return; }
  const next = resolveFriendNames([''], friendNamesOf(m.id, host.id))[0]?.name || 'Invitado 1';
  const sameDay = sameDayHostMatches(m, host);
  openSheet(`
    <form id="friend-form" novalidate>
      <h3>Invitados de ${esc(host.name)}</h3>
      <p class="hint">Si dejás el nombre vacío, sigue ${esc(next)}. Cuentan para el cupo como cualquier jugador.</p>
      ${signupFields(null, m)}
      <div class="friend-box">
        ${guestQtyHtml(1)}
        <div id="friend-rows"></div>
        <p class="hint" id="friend-hint"></p>
      </div>
      ${sameDay.length ? `<fieldset class="access-box also-box" id="friend-also">
        <legend>También en sus partidos del día</legend>
        ${sameDay.map((row) => `<label class="checkline"><input type="checkbox" name="also" value="${esc(row.match.id)}"${row.blocked ? ' disabled' : ' checked'}><span>${esc(sameDayLine(row, m))}${row.blocked ? ` · ${esc(row.blocked)}` : ''}</span></label>`).join('')}
        <p class="hint">Los mismos invitados quedan anotados ahí también, así les toca la promo del día.</p>
      </fieldset>` : ''}
      <div class="field"><div class="err" id="friend-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Agregar</button></div>
    </form>`);
  const form = $('#friend-form');
  bindGuestQty({ min: 1, value: 1, taken: friendNamesOf(m.id, host.id) });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const rows = friendRowValues();
    if (!rows.length) { $('#friend-err').textContent = 'Agregá al menos un invitado.'; return; }
    const picked = new Set([...form.querySelectorAll('input[name=also]:checked')].map((input) => input.value));
    const also = sameDay.filter((row) => !row.blocked && picked.has(row.match.id));
    // Los nombres salen de este partido; en los otros van los mismos (mismo anfitrión + nombre = misma persona).
    const resolved = resolveFriendNames(rows, friendNamesOf(m.id, host.id));
    const result = await addSignedPlayer(m, host, host.waiting === true, false, rows, { resolved, also, reveal: true });
    if (result === ALREADY_IN_MATCH || result === SUSPENDED_TEXT) $('#friend-err').textContent = result;
  };
}

/* ───────── código de acceso (opcional) ───────── */
function promptLogin(session) {
  return new Promise((resolve) => {
    const done = () => { redrawLogin = null; resolve(); };
    if (session.user) return done();
    const draw = (message = session.error || '') => {
      if (!replaceView(`
        <form class="gate" id="login-form">
          <img class="logo-mark" src="icons/icon-192.png?v=f7c-v162" alt="" width="96" height="96">
          <h2>Entrar</h2>
          <p class="muted">Solo entran el administrador y los organizadores que él crea.</p>
          <label class="field"><span>Mail</span><input id="login-email" name="email" type="email" autocomplete="username" required></label>
          <label class="field"><span>Contraseña</span><input id="login-password" name="password" type="password" autocomplete="current-password" required></label>
          <div class="err" id="login-err">${esc(message)}</div>
          <button class="btn primary block" type="submit">Entrar</button>
          <button class="btn block" type="button" id="login-forgot">Olvidé mi contraseña</button>
          ${session.mode === 'firebase' ? '' : '<p class="footer-note">Demo: gustavo@demo.local · martin@demo.local</p>'}
        </form>`)) return;
      $('#login-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
          await session.login($('#login-email').value, $('#login-password').value);
          if (session.user) done();
          else draw(session.error || 'No tenés acceso.');
        } catch (error) { draw(error.message || 'No se pudo entrar.'); }
      };
      $('#login-forgot').onclick = async () => {
        const email = $('#login-email').value.trim();
        if (!email) { $('#login-err').textContent = 'Poné el mail.'; return; }
        try {
          await session.forgot(email);
          draw('Te mandamos un mail para elegir una contraseña nueva.');
        } catch (error) { draw(error.message || 'No se pudo enviar el mail.'); }
      };
    };
    redrawLogin = () => { if (!session.user) draw(session.error || ''); };
    draw();
  });
}

function gate() {
  return new Promise((resolve) => {
    if (!ACCESS_CODE || localStorage.getItem(CODE_KEY) === ACCESS_CODE) return resolve();
    if (!replaceView(`
      <form class="gate" id="gate">
        <img class="logo-mark" src="icons/icon-192.png?v=f7c-v162" alt="" width="96" height="96"><h2>Código de acceso</h2>
        <p class="muted">Pedile el código a Gustavo o Martín.</p>
        <label class="field"><input name="code" type="password" autocomplete="off" placeholder="Código" autofocus></label>
        <div class="err small" id="gate-err" style="color:var(--danger)"></div>
        <button class="btn primary block">Entrar</button>
      </form>`)) return;
    $('#gate').onsubmit = (e) => {
      e.preventDefault();
      if (e.target.code.value.trim() === ACCESS_CODE) { localStorage.setItem(CODE_KEY, ACCESS_CODE); resolve(); }
      else $('#gate-err').textContent = 'Código incorrecto';
    };
  });
}

/* ───────── arranque ───────── */
function syncTextSize() {
  const i = applyTextSize(readTextSize());
  const minus = $('#btn-text-smaller');
  const plus = $('#btn-text-bigger');
  if (minus) minus.disabled = i === 0;
  if (plus) plus.disabled = i === TEXT_SIZES.length - 1;
  const pick = $('#set-text-size');
  if (pick && pick.value !== String(i)) pick.value = String(i);
  requestAnimationFrame(placeBars);
}

function showAnonymousDenial() {
  document.documentElement.classList.add('anon-lock');
  try { if (sheet?.open) sheet.close(); } catch { /* sigue cerrado */ }
  const ask = document.getElementById('ask');
  try { if (ask?.open) ask.close(); } catch { /* sigue cerrado */ }
  replaceView(`<div class="anon-lock" id="player-locked"><p class="anon-warn" aria-hidden="true">⚠️</p><p><b>NO TENÉS ACCESO</b></p></div>`);
}

async function boot() {
  watchRevealViewport();
  applyTheme();
  watchTheme();
  clearWaChoice();
  clearMineFilter();
  const hello = $('#hello-name');
  if (hello) hello.textContent = '';
  $('#btn-back').onclick = () => {
    const r = route();
    if (r.name === 'teams') { location.hash = `#/partido/${encodeURIComponent(r.id)}`; return; }
    if (r.name === 'match') {
      const m = matchById(r.id);
      location.hash = m?.date && m.date < todayISO() ? '#/historial' : '#/';
      return;
    }
    if (r.name === 'profile') {
      if (app.profileMatchId) { location.hash = `#/partido/${encodeURIComponent(app.profileMatchId)}`; return; }
      location.hash = '#/jugadores';
      return;
    }
    if (r.name === 'stats') {
      location.hash = r.id ? `#/estadisticas/${r.mode}` : '#/';
      return;
    }
    if (r.name === 'users') { location.hash = hashForTab(savedTab()); return; }
    location.hash = '#/';
  };
  window.addEventListener('resize', placeBars);
  document.addEventListener('click', (e) => {
    const owePlayer = e.target.closest('[data-owe-player]');
    if (owePlayer) {
      e.preventDefault();
      e.stopPropagation();
      const player = app.players.find((item) => item.id === owePlayer.dataset.owePlayer);
      if (!player) return;
      const match = knownMatches().find((item) => item.id === player.matchId) || null;
      if (match && canAdd(match, actor().uid)) {
        openOwePayment(match, player);
        return;
      }
      openPlayerMenu(match, player);
      return;
    }
    const btn = e.target.closest('[data-owe-toggle]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const id = btn.dataset.oweToggle;
    if (!app.oweOpen) app.oweOpen = new Set();
    if (app.oweOpen.has(id)) app.oweOpen.delete(id);
    else app.oweOpen.add(id);
    render();
  });
  $('#btn-text-smaller').onclick = () => { stepTextSize(-1); syncTextSize(); };
  $('#btn-text-bigger').onclick = () => { stepTextSize(1); syncTextSize(); };
  syncTextSize();
  $('#btn-settings').onclick = () => { if (app.session?.user) openSettings(); };
  bindExternalShortClicks();
  $('#brand').onclick = () => { if (!app.session?.user) return; location.hash = '#/'; };

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      const refresh = () => { reg.update().catch(() => {}); };
      refresh();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refresh();
      });
    }).catch((e) => console.warn('SW', e));
  }

  if (isPlayerDeepLink(location.hash)) {
    app.session = openSession();
    await app.session.init();
    if (!app.session.user) {
      showAnonymousDenial();
      await new Promise((resolve) => { releaseAnonymousLock = resolve; });
    }
    document.documentElement.classList.remove('anon-lock');
    if (app.session.user) unlockShell();
  }

  await gate();
  if (!app.session) {
    app.session = openSession();
    await app.session.init();
  }
  app.users = app.session.users || [];
  app.session.subscribe(() => {
    const users = app.session.users || [];
    const user = app.session.user;
    const stamp = JSON.stringify([user?.uid || '', user?.name || '', user?.role || '', users.map((item) => [item.uid, item.name, item.role, item.active])]);
    const sameSession = stamp === app.sessionStamp;
    app.sessionStamp = stamp;
    app.users = users;
    if (user) {
      app.who = user.name;
      app.role = user.role;
      app.uid = user.uid;
    }
    if (app.store) app.store.setActor(user);
    if (sheet.open && app.refreshPaySheet) app.refreshPaySheet();
    if (!sameSession && app.loaded && (!sheet.open || !sheet.querySelector('input, textarea')) && location.hash !== '#/usuarios') render();
  });
  if (!app.session.user) {
    lockShell();
    await promptLogin(app.session);
  }
  unlockShell();
  app.who = app.session.user.name;
  app.role = app.session.user.role;
  app.uid = app.session.user.uid;
  app.users = app.session.users || [];
  app.store = await createStore((e) => {
    showError(isPermissionDenied(e)
      ? RULES_MSG
      : e?.code === 'no-server'
        ? 'No hay conexión con la base de datos de Firebase: los cambios quedan solo en este teléfono. ¿Está creada la base Firestore del proyecto? (ver README)'
        : 'Problema de conexión con Firebase: ' + (e?.message || e));
  });
  $('#demo-banner').hidden = app.store.mode === 'firebase';
  app.store.setActor(app.session.user);
  app.store.subscribe((view) => {
    const { matches, players, roster, rosterError, organizers, organizersError, venues, venuesError, prices, pricesError, credits, creditsError, history, historyMeta, historyError } = view;
    app.matches = matches || []; app.players = releaseAnsweredReservations(players || []);
    app.pendingWrites = view.pending === true;
    app.fromCache = view.fromCache === true;
    app.history = history || [];
    app.historyMeta = historyMeta || null;
    app.historyError = historyError || '';
    app.roster = roster || [];
    app.rosterNotes = view.rosterNotes || {};
    app.suspensions = view.suspensions || [];
    app.suspensionHistory = view.suspensionHistory || [];
    app.payBatches = view.payBatches || [];
    app.organizers = organizers || [];
    app.venues = venues || [];
    app.prices = prices || null;
    app.credits = credits || [];
    app.creditsError = creditsError || null;
    app.creditsReady = view.creditsReady === true;
    app.playersReady = view.playersReady === true;
    app.compensations = mergeHeldCompensations(view.compensations || []);
    app.usage = view.usage || null;
    if (app.role === 'admin' && $('#usage-meter')) {
      const next = usageMeterHtml(app.usage);
      $('#usage-meter').outerHTML = next;
    }
    app.log = view.log || [];
    app.logError = view.logError || '';
    if (rosterError && rosterError !== app.rosterError) showError(rosterError);
    app.rosterError = rosterError || null;
    if (organizersError && organizersError !== app.organizersError) showError(organizersError);
    app.organizersError = organizersError || null;
    if (venuesError && venuesError !== app.venuesError) showError(venuesError);
    app.venuesError = venuesError || null;
    if (pricesError && pricesError !== app.pricesError) showError(pricesError);
    app.pricesError = pricesError || null;
    app.loaded = true;
    const stamp = JSON.stringify([app.matches, app.players, app.history, app.historyMeta, app.historyError, app.roster, app.suspensions, app.suspensionHistory, app.payBatches, app.organizers, app.venues, app.prices, app.credits, app.compensations, app.log, app.logError, app.rosterError, app.organizersError, app.venuesError, app.pricesError, app.creditsError]);
    const changed = stamp !== app.viewStamp;
    app.viewStamp = stamp;
    scheduleRetroactiveAutoCredit();
    if (!changed) return;
    if (sheet.open && app.refreshPaySheet) app.refreshPaySheet();
    // no redibujar debajo de un formulario abierto para no perder lo que se escribe
    if (!sheet.open || !sheet.querySelector('input, textarea, select')) render(); else pendingRender = true;
    fixOverflow();
    armReminderTimer();
  });
  render();
  armReminderTimer();
  // Al cambiar el día, Hoy/Mañana y el historial se actualizan. El mismo día no redibuja.
  setInterval(() => { app.store?.syncDay?.(); }, 60_000);
}

// El aviso del navegador solo sale si la página está abierta cuando se cumplen
// las 2 horas y el permiso ya estaba concedido. No hay envío en segundo plano.
let reminderSeenAt = Date.now();
let reminderTimer = 0;
let reminderTimerAt = Infinity;
const clearingReservation = new Set();

function releaseAnsweredReservations(players) {
  return players.map((p) => {
    if (!reservationClearedByAnswer(p)) {
      clearingReservation.delete(p.id);
      return p;
    }
    if (!clearingReservation.has(p.id)) {
      clearingReservation.add(p.id);
      Promise.resolve(app.store.clearTentative(p.id)).catch((e) => {
        console.error(e);
      });
    }
    return { ...p, tentative: null, tentativeAt: null };
  });
}

function armReminderTimer() {
  const now = Date.now();
  let next = now + 60_000;
  for (const m of app.matches) {
    const due = reminderDueAt(m);
    if (due != null && due > now) next = Math.min(next, due + 250);
  }
  if (reminderTimer && next >= reminderTimerAt - 50) return;
  clearTimeout(reminderTimer);
  reminderTimerAt = next;
  reminderTimer = setTimeout(checkReminderWindow, Math.max(250, next - now));
}

function checkReminderWindow() {
  reminderTimer = 0;
  reminderTimerAt = Infinity;
  const now = Date.now();
  const prev = reminderSeenAt;
  reminderSeenAt = now;
  const crossed = matchesCrossingReminderWindow(app.matches, prev, now);
  for (const m of crossed) {
    if (needsReminderBanner(m, myReminderPlayers(m.id), now)) fireReminderNotification(m);
  }
  if (crossed.length && (!sheet.open || !sheet.querySelector('input, textarea'))) render();
  armReminderTimer();
}

const notifyOnKey = (uid) => `f7c-notify-on:${uid}`;
const notifySeenKey = (uid) => `f7c-notify-seen:${uid}`;
let activityOpenedAt = 0;
const activityPinged = new Set();

function notifyEnabled() {
  const uid = actor().uid;
  return !!uid && localStorage.getItem(notifyOnKey(uid)) === '1';
}
function notifySeen() {
  return Number(localStorage.getItem(notifySeenKey(actor().uid)) || 0) || 0;
}
function currentActivity() {
  if (!notifyEnabled()) return [];
  const matches = [...(app.matches || []), ...(app.history || [])];
  return activityNotices(app.log, { uid: actor().uid, since: notifySeen(), matches });
}
function markActivitySeen(items) {
  const uid = actor().uid;
  if (!uid) return;
  const max = (items || []).reduce((top, item) => Math.max(top, Number(item.at) || 0), notifySeen());
  localStorage.setItem(notifySeenKey(uid), String(max || Date.now()));
}
function openActivity(items) {
  markActivitySeen(items);
  paintActivity();
  const shown = items.slice(0, 12);
  const more = items.length - shown.length;
  openSheet(`
    <h3>Notificaciones</h3>
    <ul class="activity-list" id="activity-list">${shown.map((item) => `<li>${esc(activityNoticeText(item))}</li>`).join('')}</ul>
    ${more > 0 ? `<p class="hint">Y ${more} más en Registro.</p>` : ''}
    <div class="sheet-actions"><button type="button" class="btn" data-close>Listo</button></div>`);
}
function pingActivity(items) {
  if (!notifyEnabled() || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const fresh = items.filter((item) => Number(item.at) > activityOpenedAt && !activityPinged.has(item.id));
  fresh.slice(0, 3).forEach((item) => {
    activityPinged.add(item.id);
    const body = activityNoticeText(item);
    const title = 'Mis Partidos';
    const tag = `f7c-act-${item.id || item.at}`;
    const fallback = () => { try { new Notification(title, { body, tag }); } catch { /* el navegador no muestra avisos */ } };
    const ready = navigator.serviceWorker?.ready;
    if (ready && typeof ready.then === 'function') ready.then((reg) => reg.showNotification(title, { body, tag })).catch(fallback);
    else fallback();
  });
}
function paintActivity() {
  if (!activityOpenedAt) activityOpenedAt = Date.now();
  const banner = $('#activity-banner');
  if (!banner) return;
  const items = currentActivity();
  pingActivity(items);
  if (!items.length) {
    banner.hidden = true;
    banner.onclick = null;
    banner.textContent = '';
    return;
  }
  banner.hidden = false;
  banner.textContent = items.length === 1 ? activityNoticeText(items[0]) : `${items.length} novedades de otros organizadores`;
  banner.onclick = () => openActivity(items);
}

function fireReminderNotification(m) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(REMINDER_BANNER, {
      body: `${capitalize(labelDate(m.date))} · ${m.time || '--:--'} hs. Este aviso solo aparece si la app está abierta.`,
      tag: `f7c-remind-${m.id}`,
    });
    n.onclick = () => {
      window.focus();
      location.hash = `#/partido/${encodeURIComponent(m.id)}`;
      const fresh = matchById(m.id);
      if (fresh) openReminders(fresh);
    };
  } catch (e) { console.warn(e); }
}
let pendingRender = false;
let fixingOverflow = false;
const overflowTried = new Set();
async function fixOverflow() {
  if (fixingOverflow || !app.store) return;
  if (app.pendingWrites || app.fromCache) return;
  const patches = [];
  for (const m of app.matches) {
    const all = app.players.filter((p) => p.matchId === m.id);
    const expected = Number.isInteger(m.playerCount) ? m.playerCount : all.length;
    patches.push(...overflowPatches(all, capOf(m), { expectedCount: expected }));
  }
  const fresh = patches.filter((patch) => !overflowTried.has(patch.id));
  if (!fresh.length) return;
  for (const patch of fresh) overflowTried.add(patch.id);
  fixingOverflow = true;
  try {
    for (const patch of fresh) await app.store.updatePlayer(patch.id, { waiting: true, waitOrder: patch.waitOrder, rosterAt: null });
  } catch (e) { console.error(e); }
  finally { fixingOverflow = false; }
}

function consumeOweScroll() {
  const top = app.oweReturnScroll;
  if (top == null) return;
  app.oweReturnScroll = null;
  const apply = () => {
    const scroller = document.scrollingElement;
    if (scroller && scroller.scrollTop !== top) scroller.scrollTop = top;
  };
  apply();
  requestAnimationFrame(() => { apply(); requestAnimationFrame(apply); });
}
function openOwePayment(match, player) {
  if (!app.oweOpen) app.oweOpen = new Set();
  app.oweOpen.add(match.id);
  const hash = location.hash;
  app.oweReturnScroll = document.scrollingElement?.scrollTop || 0;
  openPaymentForm(match, player, {
    returnTo: () => {
      if (!app.oweOpen) app.oweOpen = new Set();
      app.oweOpen.add(match.id);
      if (location.hash !== hash) location.hash = hash;
      if (sheet.open) closeSheet();
      else consumeOweScroll();
    },
  });
}
sheet.addEventListener('close', () => {
  restoreTabs();
  placeBars();
  app.refreshPaySheet = null;
  pendingRender = false;
  render();
  consumeOweScroll();
  // El formulario cerrado no puede dejar ids repetidos (notas del menú y de la ficha).
  // Se vacía después: si en este mismo turno se abre otra hoja, no hay que pisarla.
  queueMicrotask(() => {
    if (sheet.open) return;
    restoreTabs();
    const body = sheet.querySelector('.sheet-body');
    if (body) body.remove();
  });
});

const MAIN_TABS = ['home', 'roster', 'history', 'stats', 'registro'];
function swipeTab() {
  const r = route();
  if (r.name === 'home' || r.name === 'roster' || r.name === 'history' || r.name === 'registro') return r.name;
  if (r.name === 'stats' && !r.id) return 'stats';
  return '';
}
function horizontalScroller(node) {
  const view = $('#view');
  let el = node instanceof Element ? node : null;
  while (el && el !== view) {
    const style = getComputedStyle(el);
    const ox = style.overflowX;
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 2) return true;
    el = el.parentElement;
  }
  return false;
}
function swipeBlocked(target, x) {
  if (document.getElementById('sheet')?.open || document.getElementById('ask')?.open) return true;
  if (!swipeTab()) return true;
  if (x <= 20 || x >= window.innerWidth - 20) return true;
  const el = target instanceof Element ? target : null;
  if (!el || el.closest('.topstack, #tabbar, #tab-slot')) return true;
  if (el.closest('input, textarea, select, [role="slider"]')) return true;
  if (horizontalScroller(el)) return true;
  return false;
}
function goSwipeTab(delta) {
  const current = swipeTab();
  const index = MAIN_TABS.indexOf(current);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= MAIN_TABS.length) return;
  const view = $('#view');
  if (view) {
    view.classList.remove('swipe-next', 'swipe-prev');
    void view.offsetWidth;
    view.classList.add(delta > 0 ? 'swipe-next' : 'swipe-prev');
  }
  location.hash = hashForTab(MAIN_TABS[next]);
}
function bindTabSwipe() {
  if (document.body.dataset.swipe) return;
  document.body.dataset.swipe = '1';
  let gesture = null;
  document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) { gesture = null; return; }
    const touch = event.touches[0];
    if (swipeBlocked(event.target, touch.clientX)) { gesture = null; return; }
    gesture = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  document.addEventListener('touchmove', (event) => {
    if (!gesture || event.touches.length !== 1) return;
    const dx = event.touches[0].clientX - gesture.x;
    const dy = event.touches[0].clientY - gesture.y;
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5 && event.cancelable) event.preventDefault();
  }, { passive: false });
  document.addEventListener('touchend', (event) => {
    if (!gesture) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    gesture = null;
    if (Math.abs(dx) <= 60 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    if (event.cancelable) event.preventDefault();
    goSwipeTab(dx < 0 ? 1 : -1);
  }, { passive: false });
  document.addEventListener('touchcancel', () => { gesture = null; });
}
bindTabSwipe();

boot().catch((e) => { console.error(e); showError('Error al iniciar la app: ' + e.message); });
