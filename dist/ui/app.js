import { fetchedActionSource, fetchedCompletedSource, fetchedCaseSource, } from "../actions/source.js?v=310f48d";
import { storageDecisionStore } from "../actions/decisions.js?v=310f48d";
import { validateActionsPayload } from "../actions/validate.js?v=310f48d";
import { chipRow, cardGrid, modal, issueScreen, completedGrid, caseBoard, viewSwitch, ownerRow, rehearsalSwitch, rehearsalBanner, designSystemSwitch, } from "./components.js?v=310f48d";
import { showToast } from "./toast.js?v=310f48d";
import { initTheme, initDesignSystem, setDesignSystem, currentDesignSystem, } from "./theme.js?v=310f48d";
import { initMasonry, relayoutGrid } from "./masonry.js?v=310f48d";
import { initialUiState, deriveView, setFilter, toggleRedAlerts, applyDecision, closeCard, openCard, toggleMenu, closeMenu, reconcile, byMostRecent, restoreDecisions, deriveCases, setOwner, ownersOf, toggleRehearsal, rehearsedCount, } from "./state.js?v=310f48d";
// Relative, not root-absolute: the same tree is served both at a host
// root (the dev server, the gated deploy) and under a path prefix
// (GitHub Pages serves a project repo at /<repo>/). A leading slash
// resolves to the host root in the second case and 404s.
const PAYLOAD_URL = "./src/data/highland-mitch-actions.json?v=310f48d";
let state = initialUiState();
let actions = [];
/**
 * Module-scoped so refresh() can reach it. The swap point is still one
 * binding — main() assigns it — but reads now happen from two places: once
 * at startup and again whenever the reader comes back from another system.
 */
let source = null;
let completedSource = null;
/**
 * The write seam. Separate from the read sources on purpose — see
 * DecisionStore. localStorage is read through a try/catch inside the store,
 * but constructing it is guarded here too: some embedded webviews throw on
 * the property access itself, before any method is called.
 */
let decisions = null;
let caseSource = null;
let cases = [];
let completed = [];
/**
 * After a decision, move the reader to the next live item on the same case
 * rather than back to the grid.
 *
 * An exception rarely arrives alone, and the siblings are usually one
 * conversation with one person — SP 41102's entity mismatch and its
 * unevidenced signatory are the same phone call. Returning to the grid makes
 * the reader find the related item themselves, or meet the property again
 * next week. Siblings are read BEFORE the decision is applied, since applying
 * it is what removes this card from their counts.
 */
function followOn(id) {
    const view = deriveView(actions, state);
    // openCard is checked as well as cards: a decision can be taken from an
    // open modal whose card the current filter excludes.
    const card = view.cards.find((c) => c.id === id)
        ?? (view.openCard?.id === id ? view.openCard : undefined);
    return card?.siblings[0];
}
/**
 * Writes a decision through the store, if there is one.
 *
 * Deliberately fire-and-forget: persistence is a convenience, and a reader
 * who has just decided something must not be made to wait on storage, nor
 * shown an error because a browser refused to keep it. The decision is
 * already in UI state either way.
 */
async function remember(id, status, note, entry) {
    // A rehearsed decision is never written. It is the whole point.
    if (state.rehearsal)
        return;
    await decisions?.save({
        id, status, note, entry,
        baseStatus: upstreamStatus(id),
        at: new Date().toISOString(),
    }).catch(() => { });
}
/** The upstream status of an item, i.e. before any local decision. */
function upstreamStatus(id) {
    return actions.find((a) => a.id === id)?.status ?? "needs_you";
}
/**
 * Re-reads the source and folds it against local decisions.
 *
 * The trigger is the reader coming back to this tab. Someone who fixes a fee
 * in PropertyMe and switches back should not have to tell Mitch what they
 * just did — the systems of record are the truth, and reconcile() drops any
 * local decision the source has overtaken.
 *
 * Failures are swallowed on purpose. This runs on every tab focus, and a
 * refetch that 404s or returns something malformed must leave the screen
 * exactly as it was rather than replacing a working queue with an error.
 */
let refreshing = false;
async function refresh() {
    if (refreshing || source === null || document.hidden)
        return;
    refreshing = true;
    try {
        const fresh = await source();
        if (validateActionsPayload({ actions: fresh }).length > 0)
            return;
        if (completedSource)
            completed = await completedSource().catch(() => completed);
        // Onboarding state moves for the same reasons the queue does — a stage
        // advancing is exactly what a reader came back to see.
        if (caseSource)
            cases = await caseSource().catch(() => cases);
        const changed = fresh.length !== actions.length ||
            fresh.some((a, i) => a.id !== actions[i]?.id || a.status !== actions[i]?.status);
        const before = state;
        actions = fresh;
        const kept = reconcile(fresh, state);
        const dropped = Object.keys(state.overrides).filter((id) => !(id in kept.overrides));
        state = kept;
        // Storage follows memory: an override reconcile() discarded must not come
        // back on the next reload.
        if (dropped.length)
            void decisions?.forget(dropped).catch(() => { });
        if (changed || state !== before) {
            render();
            showToast("Updated from the source systems.");
        }
    }
    catch {
        // Keep what is on screen.
    }
    finally {
        refreshing = false;
    }
}
function render() {
    const view = deriveView(actions, state);
    const root = document.getElementById("app");
    if (!root)
        return;
    root.innerHTML = `
    <header class="app-header">
      <div class="app-title">
        Mitch Actions
        ${designSystemSwitch(currentDesignSystem())}
        ${rehearsalSwitch(state.rehearsal, rehearsedCount(state))}
        ${cases.length
        ? viewSwitch(state.filter === "cases", { cases: cases.length, open: view.counts.needs_you })
        : ""}
      </div>
      <div class="chip-row">${state.filter === "cases"
        ? ownerRow(ownersOf(cases), state.owner)
        : chipRow(view.counts, state.filter, state.redAlertsOnly, completed.length)}</div>
    </header>
    ${rehearsalBanner(state.rehearsal, rehearsedCount(state))}
    <main class="queue">
      ${state.filter === "completed"
        ? completedGrid(byMostRecent(completed))
        : state.filter === "cases"
            ? caseBoard(deriveCases(cases, actions, state).filter((c) => state.owner === null || c.assignedTo.name === state.owner))
            : cardGrid(view.cards)}
    </main>
    ${modal(view.openCard)}
  `;
    // The grid's markup is in the document now, so the cards can be measured
    // and packed. Layout has to follow every render because render() rebuilds
    // the grid wholesale and the new cards come back in plain CSS-grid flow.
    relayoutGrid();
}
/**
 * Delegated click handling, attached once to the stable #app container
 * during startup — never inside render(). render() reassigns innerHTML on
 * every state change, so a listener attached there would be re-added each
 * time and accumulate without bound. Later tasks add more `data-action`
 * branches to this same handler.
 *
 * The Escape key is bound here too, on the document rather than #app,
 * because the modal is dismissable no matter what currently holds focus.
 *
 * Each branch only reassigns `state`; the single render at the end runs if
 * anything changed. Every transition returns a new object, so identity is a
 * reliable dirty check — and it means a click that both dismisses a menu and
 * does something else renders once, not twice.
 */
/**
 * Clock label for a decision's history line, in the display-ready form the
 * payload uses ("09:14"). Built here, not in state.ts, so that module stays a
 * pure function of its inputs — a clock read inside it would make every
 * transition untestable.
 */
function nowLabel() {
    return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}
function bindEvents(root) {
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape")
            return;
        // Escape dismisses whatever is open: the overflow menu first, since it is
        // the shallower of the two and they are never open together.
        if (state.openMenuId !== null)
            state = closeMenu(state);
        else if (state.openCardId !== null)
            state = closeCard(state);
        else
            return;
        render();
    });
    root.addEventListener("click", (event) => {
        const target = event.target;
        const el = target.closest("[data-action]");
        const before = state;
        const { action, value, id } = el?.dataset ?? {};
        const inMenu = Boolean(target.closest(".card-menu"));
        // Clicking anywhere outside an open menu dismisses it, and that click is
        // consumed by the dismissal rather than also doing whatever it landed
        // on — otherwise a click on the card behind the menu would open the
        // detail view on the way past.
        if (state.openMenuId !== null && action !== "toggle-menu" && !inMenu) {
            state = closeMenu(state);
            render();
            return;
        }
        // The header switch crosses between the queue and the board. It restores
        // Needs You rather than whatever filter was last set: coming back to a
        // queue silently narrowed by a decision taken minutes ago reads as items
        // having gone missing.
        if (action === "switch-view") {
            state = setFilter(state, value === "cases" ? "cases" : "needs_you");
        }
        // An empty value is "everyone" — the chip carries no name because there
        // is no holder called everyone.
        // The design system lives on the document, not in UiState: it paints the
        // same application rather than changing what the application is, and
        // nothing derived from state depends on it.
        if (action === "set-ds" && value) {
            setDesignSystem(value === "fluent" ? "fluent" : "btrmnt");
            render();
            showToast(value === "fluent"
                ? "Fluent tokens. Same markup, same components — only the token values changed."
                : "btrmnt tokens.");
            return;
        }
        if (action === "toggle-rehearsal") {
            const leaving = state.rehearsal;
            const held = rehearsedCount(state);
            state = toggleRehearsal(state);
            showToast(leaving
                ? held > 0
                    ? `Rehearsal over. ${held} rehearsed decision${held === 1 ? "" : "s"} discarded — nothing was saved or sent.`
                    : "Rehearsal over."
                : "Rehearsal on. Decisions will compute and the queue will move; nothing is saved or sent.");
        }
        if (action === "owner") {
            state = setOwner(state, value ? value : null);
        }
        if (action === "filter") {
            state = value === "alerts"
                ? toggleRedAlerts(state)
                : setFilter(state, value);
        }
        if (action === "toggle-menu" && id) {
            state = toggleMenu(state, id);
        }
        if (action === "open" && id) {
            state = openCard(state, id);
        }
        if (action === "dismiss" && el === target) {
            state = closeCard(state);
        }
        // Approve and close-handled are different outcomes and land on different
        // statuses. Both used to resolve to "closed", which left the Sent column
        // unreachable and erased the distinction between "Mitch is acting on
        // this" and "someone dealt with it elsewhere".
        // The outcome comes from the item, not from here. Every primary button
        // used to run one hardcoded sentence about entering something in
        // PropertyMe, which was wrong for eleven of the twelve.
        if (action === "approve" && id) {
            const pa = actions.find((a) => a.id === id)?.primaryAction;
            const next = followOn(id);
            if (pa) {
                const entry = { time: nowLabel(), text: pa.history };
                state = applyDecision(state, id, pa.status, pa.note, entry, upstreamStatus(id));
                void remember(id, pa.status, pa.note, entry);
                if (next)
                    state = openCard(state, next.id);
                // Taking the decision closes the modal, so the card's new note and
                // history line land behind whatever the reader looks at next. The
                // toast carries the consequence forward — the same sentence the
                // button promised on hover, now as confirmation of what is running.
                showToast(next ? `${pa.does} Next on this property: ${next.title}.` : pa.does);
            }
        }
        if (action === "close-handled" && id) {
            const next = followOn(id);
            const entry = {
                time: nowLabel(), text: "Closed by you — handled outside Mitch",
            };
            state = applyDecision(state, id, "closed", "Closed — handled outside Mitch.", entry, upstreamStatus(id));
            void remember(id, "closed", "Closed — handled outside Mitch.", entry);
            if (next)
                state = openCard(state, next.id);
            showToast(next
                ? `Closed. Still open on this property: ${next.title}.`
                : "Closed. Mitch stops raising this action, and will not reopen it " +
                    "if the source changes.");
        }
        // A link to a system of record. With no url — which is every link in the
        // demo payloads — the button says what it would do rather than going
        // nowhere. This writes no state, so it is handled here and returns
        // before the identity check below.
        if (action === "open-system" && id) {
            const link = actions.find((a) => a.id === id)?.links?.[Number(el?.dataset.link)];
            if (link) {
                if (link.url)
                    window.open(link.url, "_blank", "noopener,noreferrer");
                else
                    showToast(link.opens);
            }
        }
        // "assign" and "redirect" still write no state — the routing they
        // describe needs a backend. They are no longer silent, though: shown
        // openly in the modal's tertiary rail, a click that did nothing at all
        // read as a broken button. Each says what it would do, the same way a
        // system-of-record link does.
        const ROUTING = {
            assign: "Opens a teammate picker. The action moves to their queue and stays open until they resolve it.",
            redirect: "Sends this action to another queue. Mitch keeps watching the source in case it resolves itself first.",
        };
        if (action && ROUTING[action])
            showToast(ROUTING[action]);
        // Adjusting the rule is how a class of exception stops recurring, rather
        // than how this one card gets answered.
        if (action === "adjust-rule" && id) {
            const adjust = actions.find((a) => a.id === id)?.ruleAdjust;
            if (adjust)
                showToast(adjust);
        }
        // Every menu item is terminal, so any click inside the menu shuts it.
        if (inMenu)
            state = closeMenu(state);
        if (state !== before)
            render();
    });
}
async function main() {
    // The swap point. A Highland-backed ActionSource replaces the right-hand
    // side of this one binding and nothing else here changes; the annotation
    // is what makes TypeScript check that whatever is bound conforms.
    source = fetchedActionSource(PAYLOAD_URL);
    completedSource = fetchedCompletedSource(PAYLOAD_URL);
    const loaded = await source();
    // The completed log is decoration for the queue, not a precondition for it.
    // A source that cannot answer it still gives a usable screen.
    completed = await completedSource().catch(() => []);
    caseSource = fetchedCaseSource(PAYLOAD_URL);
    cases = await caseSource().catch(() => []);
    // The runtime half of check:actions, at the source boundary. That check
    // only runs at authoring time over files in this repo; a live source's
    // output is not authored here. Rendering an item with an unknown status
    // throws before anything reaches the screen, so bad data stops here and
    // says why instead of failing silently.
    const issues = validateActionsPayload({ actions: loaded });
    const root = document.getElementById("app");
    if (!root)
        return;
    if (issues.length) {
        root.innerHTML = issueScreen(issues);
        return;
    }
    actions = loaded;
    try {
        decisions = storageDecisionStore(window.localStorage);
    }
    catch {
        decisions = null;
    }
    if (decisions) {
        const stored = await decisions.load().catch(() => []);
        const restored = restoreDecisions(actions, stored, state);
        state = restored.state;
        // Anything the source overtook while the tab was closed is dropped now,
        // rather than being re-tested on every load for the life of the browser.
        void decisions.forget(restored.stale).catch(() => { });
    }
    bindEvents(root);
    // The resize listener, attached once here for the same reason the click and
    // keydown listeners are — never from inside render().
    initTheme();
    initDesignSystem();
    initMasonry();
    // Coming back to this tab is the signal that something may have changed
    // elsewhere. Both events fire in practice — visibilitychange when Teams
    // switches tabs, focus when the window itself regains it — and refresh()
    // guards against overlapping runs.
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden)
            void refresh();
    });
    window.addEventListener("focus", () => void refresh());
    render();
}
main().catch((err) => {
    const root = document.getElementById("app");
    if (root)
        root.textContent = `Failed to start: ${String(err)}`;
});
