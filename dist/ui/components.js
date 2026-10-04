import { esc } from "./escape.js?v=310f48d";
/** Human labels for each status, as the design system writes them. */
export const STATUS_LABEL = {
    needs_you: "Needs You",
    waiting: "Waiting",
    sent: "Sent",
    closed: "Closed",
};
export function statusBadge(status) {
    return `<span class="badge badge--${esc(status)}">${esc(STATUS_LABEL[status])}</span>`;
}
export function tagBadge(tag) {
    return `<span class="badge badge--tag">${esc(tag)}</span>`;
}
export function filterChip(opts) {
    const count = opts.count === undefined ? "" : ` · ${esc(String(opts.count))}`;
    const active = opts.active ? " chip--active" : "";
    return (`<button class="chip${active}" data-action="${esc(opts.action ?? "filter")}" ` +
        `data-value="${esc(opts.value)}">${esc(opts.label)}${count}</button>`);
}
/**
 * The three button tiers. One shape, three classes — the difference is
 * entirely visual, which is the point: nothing about what a button *does*
 * should depend on which tier it wears.
 *
 * Primary is the one decision a surface is asking for. Secondary is a real
 * alternative to it. Tertiary is a way out rather than a choice.
 */
/**
 * Primary and secondary labels come from the payload and from fixed copy that
 * is longer than the space allows — "Acknowledge & Request Pool Compliance"
 * beside "Close (Handled Outside Mitch)". They share one row and truncate, so
 * each carries the full label in `title` for hover.
 */
function button(cls, label, action, id, title = label) {
    return (`<button class="${esc(cls)}" data-action="${esc(action)}" ` +
        `data-id="${esc(id)}" title="${esc(title)}">${esc(label)}</button>`);
}
export function primaryButton(label, action, id, title) {
    return button("btn-primary", label, action, id, title);
}
export function secondaryButton(label, action, id) {
    return button("btn-secondary", label, action, id);
}
/**
 * `extraClass` exists for the overflow menu, whose entries are tertiary
 * buttons that additionally have to sit as full-width rows. The tier carries
 * the type; the extra class carries the arrangement.
 */
export function tertiaryButton(label, action, id, extraClass = "") {
    return button(extraClass ? `btn-tertiary ${extraClass}` : "btn-tertiary", label, action, id);
}
/**
 * The filter row: one chip per status, then the red-alert toggle. Takes the
 * counts and which filters are on, not the whole UiState — this module is
 * the design system in code and holds no app logic.
 */
export function chipRow(counts, active, redAlertsOnly, completedCount = 0) {
    const order = [
        { label: "All", value: "all" },
        { label: "Needs You", value: "needs_you" },
        { label: "Waiting", value: "waiting" },
        { label: "Sent", value: "sent" },
        { label: "Closed", value: "closed" },
    ];
    const chips = order
        .map((o) => filterChip({
        label: o.label,
        count: counts[o.value],
        value: o.value,
        active: active === o.value,
    }))
        .join("");
    const alerts = filterChip({
        label: "Red Alerts",
        value: "alerts",
        active: redAlertsOnly,
    });
    // After the divider with Red Alerts, because neither is a status: one
    // narrows the queue, the other swaps it for the work that needed nobody.
    const completed = completedCount
        ? filterChip({
            label: "Completed by Mitch",
            count: completedCount,
            value: "completed",
            active: active === "completed",
        })
        : "";
    return `${chips}<span class="chip-divider"></span>${alerts}${completed}`;
}
/** A card's red alert, or nothing. Shown identically on card and modal. */
function alertBlock(card) {
    return card.hasAlert
        ? `<div class="card-alert">${esc(card.flag ?? "")}</div>`
        : "";
}
/**
 * Stand-in for Font Awesome's `fa-circle-info`. The design system names Font
 * Awesome 6 solid, but this build has no Font Awesome and may not add a
 * dependency — and a CDN link would break a demo run offline. So the icons
 * it names are inlined as SVG at the same visual weight. The counter is from
 * the panel's own surface token rather than white, so it reads as punched
 * out of the disc the way the solid original does.
 */
const ICON_CIRCLE_INFO = `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">` +
    `<circle cx="8" cy="8" r="7.25" fill="currentColor"/>` +
    `<circle class="icon__counter" cx="8" cy="4.5" r="1.1"/>` +
    `<rect class="icon__counter" x="6.95" y="6.6" width="2.1" height="5.2" rx="1.05"/>` +
    `</svg>`;
/** Stand-in for `fa-ellipsis-vertical`, on the same terms. */
const ICON_ELLIPSIS_VERTICAL = `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">` +
    `<circle cx="8" cy="3.1" r="1.45" fill="currentColor"/>` +
    `<circle cx="8" cy="8" r="1.45" fill="currentColor"/>` +
    `<circle cx="8" cy="12.9" r="1.45" fill="currentColor"/>` +
    `</svg>`;
/**
 * The Context construct: plain-language reasoning for why this Action exists.
 * CJ — the reference build the design system is lifted from — attaches it to
 * the *opened detail*, tucked behind the panel, not beside every tile in the
 * queue.
 *
 * So this is rendered as a sibling of the modal inside `.modal-row`, and the
 * pairing has to stay that shape: the row's height is the modal's height,
 * which is the only thing that lets the panel stretch inside it and still be
 * inset 14px top and bottom. Nested in the modal, or parked loose in the
 * scrim, there is nothing for it to be shorter *than*.
 */
export function contextPanel(card) {
    // The pill truncates to one line, so the whole rule name goes in the title
    // as well — escaped exactly like the visible copy, since an attribute is
    // the easier of the two places to break out of. Rule names are verbatim
    // from the source documents and are not shortened to fit.
    const rule = `Rule: ${esc(card.rule)}`;
    // Only where the rule itself is the problem. On a card whose exception is
    // this property's data, changing the rule would be the wrong fix and
    // offering it invites exactly that.
    const adjust = card.ruleAdjust
        ? `<button class="btn-tertiary context-panel__adjust" data-action="adjust-rule" ` +
            `data-id="${esc(card.id)}" title="${esc(card.ruleAdjust)}">Adjust this rule</button>`
        : "";
    return `
    <aside class="context-panel">
      <div class="context-panel__eyebrow">${ICON_CIRCLE_INFO}<span>Context</span></div>
      <p class="context-panel__note">${esc(card.ruleNote)}</p>
      <span class="context-panel__rule" title="${rule}">${rule}</span>
      ${adjust}
    </aside>`;
}
/**
 * What a card or modal says in place of a button. Coloured from the same
 * status token as the badge — a Waiting note is amber and a Closed note is
 * grey, as the design system pairs them.
 */
export function statusNote(card) {
    return (`<div class="card-note card-note--${esc(card.status)}">` +
        `${esc(card.noteText)}</div>`);
}
/**
 * The card's overflow menu. Only the last item does anything this phase: it
 * applies the same close-handled decision the modal offers. The others are
 * inert — they carry a data-action so the delegated handler can recognise
 * and dismiss the menu, but nothing acts on those names.
 *
 * CJ's "Not Managed by Us" is deliberately absent. It belongs to a staff
 * member looking after an existing portfolio, where declining a property is
 * a real answer. Mitch onboards new business: everything in this queue is a
 * property being taken on, so the option would never be the right one.
 *
 * Out of scope, explicitly: CJ's `@assign` teammate-search popover behind
 * "Assign to a Teammate". That is a feature, not a visual treatment.
 */
export function cardMenu(card) {
    const item = (action, label) => tertiaryButton(label, action, card.id, "card-menu__item");
    return `
    <div class="card-menu" role="menu">
      ${item("assign", "Assign to a Teammate")}
      ${item("redirect", "Redirect")}
      ${item("close-handled", "Close (Handled Outside Mitch)")}
    </div>`;
}
/**
 * How many other live items share this card's case, on the line that already
 * names the subject. A count, not a list — a scanning reader needs to know
 * the property will come up again, and the detail belongs in the card they
 * open, not in the grid.
 */
function siblingCount(card) {
    if (!card.siblings.length)
        return "";
    const n = card.siblings.length;
    return ` <span class="card__siblings">· ${esc(String(n))} more open</span>`;
}
/**
 * CJ's card anatomy: the title leads on one truncated line, the badges sit
 * beneath it, and two 24px circular controls hold the top right — an "i"
 * opening the detail view and an ellipsis opening the overflow menu.
 */
export function actionCard(card) {
    const alert = alertBlock(card);
    // "Review", not the decision's own label. The card carried primaryLabel
    // here — the same words as the button in the modal that actually approves
    // — so a collapsed card appeared to offer a decision it cannot take. The
    // card's job is to get you to the detail; what is being asked is already
    // said by the title, the badges and the alert.
    const footer = card.isNeedsYou && card.primaryAction
        ? primaryButton("Review", "open", card.id, card.primaryAction.does)
        : statusNote(card);
    const menu = card.menuOpen ? cardMenu(card) : "";
    const open = card.menuOpen ? " card--menu-open" : "";
    return `
    <article class="card${open}" data-action="open" data-id="${esc(card.id)}">
      <div class="card__head">
        <div class="card__headings">
          <h2 class="card__title">${esc(card.title)}</h2>
          <div class="card__badges">${tagBadge(card.tag)}${statusBadge(card.status)}</div>
        </div>
        <div class="card__controls">
          <button class="card-ctl card-ctl--info" data-action="open"
                  data-id="${esc(card.id)}" aria-label="Open details">i</button>
          <button class="card-ctl card-ctl--menu" data-action="toggle-menu"
                  data-id="${esc(card.id)}" aria-haspopup="menu"
                  aria-expanded="${card.menuOpen ? "true" : "false"}"
                  aria-label="More actions">${ICON_ELLIPSIS_VERTICAL}</button>
          ${menu}
        </div>
      </div>
      <p class="card__subtitle">${esc(card.subtitle)}${siblingCount(card)}</p>
      ${alert}
      ${footer}
    </article>`;
}
export function cardGrid(cards) {
    if (!cards.length) {
        return `<div class="queue-empty">No actions match this filter</div>`;
    }
    return `<div class="card-grid">${cards.map(actionCard).join("")}</div>`;
}
function metaRow(label, value) {
    return `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`;
}
/**
 * The supporting actions: where a person would go to act on this — the
 * systems of record, not pages in this UI. Secondary, because going to
 * PropertyMe is a real alternative to approving Mitch's draft, not a way
 * out of the card.
 *
 * These belong in the pinned footer beside the primary. They spent one
 * revision as a section in the scrollable body, where a long card hid them
 * below the fold — which is exactly where the actions must never be.
 */
export function supportingActions(card) {
    if (!card.links?.length)
        return "";
    return card.links
        .map((l, i) => `<button class="btn-secondary link-btn" data-action="open-system" ` +
        `data-id="${esc(card.id)}" data-link="${esc(String(i))}" ` +
        `title="${esc(l.opens)}">${esc(l.label)}</button>`)
        .join("");
}
/**
 * The tertiary rail: the ways to push this action somewhere else rather than
 * resolve it here. Same four entries as the card's overflow menu, shown
 * openly in the modal — a reader deciding on a card should not have to know
 * they are hidden behind an ellipsis.
 *
 * "Close (Handled Outside Mitch)" lives here, not beside the primary. It is
 * not an alternative way to decide; it is a way to take the item off the
 * queue, which is what the rail is for.
 *
 * DO NOT ADD a "Withdrawn" / "Not proceeding" entry here. Onboarding does
 * have that failure mode — it is Notion scenario Mitch-030, Cancellation &
 * Withdrawal Handling — but cancelling an MAA is a consequential, externally
 * visible act: it stops in-flight work and closes a real piece of business.
 * A row of small text links in a queue is exactly where someone clicks the
 * wrong one, and this rail carries no confirmation step.
 *
 * Mitch-030 is Phase 2 and will need its own surface with its own
 * confirmation. Closing a case belongs there, deliberately, not one stray
 * click away from "Redirect". (Rei, 2026-09-18.)
 */
export function tertiaryRail(card) {
    const item = (action, label) => tertiaryButton(label, action, card.id, "modal__rail-item");
    return `
        <div class="modal__rail">
          ${item("assign", "Assign")}
          ${item("redirect", "Redirect")}
          ${item("close-handled", "Close (handled outside)")}
        </div>`;
}
/**
 * The heading over what Mitch has to say about an item, which depends on
 * whether it has happened yet.
 *
 * Both headings replaced "What Mitch drafted", inherited from CJ. There the
 * field held a literal draft — a letter you read and sent — so the word was
 * accurate. Mitch's field holds a decision: "Entry stopped before
 * PropertyMe. A dollar value in a percentage field is the error this hard
 * stop exists to catch." Nothing was drafted.
 *
 * Splitting on status matters because "proposes" is only true while the item
 * is waiting on a person. On the rest Mitch has already acted — the case was
 * opened, the ad was posted, the routing was applied — and calling that a
 * proposal would trade one inaccuracy for another.
 *
 * Its sibling heading moved to the plural present for the same reason: CJ
 * quoted back one received message, while Mitch reads a set of standing
 * records that still say what they say. That they can change underneath a
 * decision is the whole premise of reconcile().
 */
export function draftedHeading(card) {
    return card.isNeedsYou ? "What action Mitch proposes" : "What Mitch did";
}
/**
 * The other live items on this case, named. A reader deciding on SP 41102's
 * entity mismatch should know before they act that its signature authority is
 * also open — the two are one conversation with one person, and finding that
 * out afterwards means having it twice.
 */
export function siblingSection(card) {
    if (!card.siblings.length)
        return "";
    const items = card.siblings
        .map((s) => `<li>${esc(s.title)}</li>`)
        .join("");
    return `
          <section>
            <div class="modal__eyebrow">Also open on this property</div>
            <ul class="modal__siblings">${items}</ul>
          </section>`;
}
export function modal(card) {
    if (!card)
        return "";
    const alert = alertBlock(card);
    // Row one is the decision and the things that support making it; row two
    // is everything that moves the item elsewhere. Both pinned, because an
    // action a reader cannot reach without scrolling is an action they will
    // not take.
    const decision = card.isNeedsYou && card.primaryAction
        ? primaryButton(card.primaryAction.label, "approve", card.id, card.primaryAction.does)
        : statusNote(card);
    const footer = `
        <div class="modal__footer">
          <div class="modal__actions">
            ${decision}
            ${supportingActions(card)}
          </div>
          ${tertiaryRail(card)}
        </div>`;
    const history = card.history
        .map((h) => `<li><span class="modal__time">${esc(h.time)}</span>${esc(h.text)}</li>`)
        .join("");
    return `
    <div class="modal-scrim" data-action="dismiss">
      <div class="modal-row">
        <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(card.title)}">
          <header class="modal__head">
            <div>
              <h2 class="modal__title">${esc(card.title)}</h2>
              <p class="modal__subtitle">${esc(card.subtitle)}</p>
            </div>
            <button class="icon-btn" data-action="dismiss" aria-label="Close">&times;</button>
          </header>

          <section>
            <div class="modal__eyebrow">What the sources say</div>
            <div class="modal__quote">${esc(card.source)}</div>
          </section>

          <section>
            <div class="modal__eyebrow">${draftedHeading(card)}</div>
            <div class="modal__draft">${esc(card.proposal)}</div>
          </section>

          ${alert}

          <dl class="modal__meta">
            ${metaRow(card.assignedTo.role, card.assignedTo.name)}
            ${metaRow("Decided by", card.decidedBy)}
            ${metaRow("Who can see this", card.whoSees)}
            ${metaRow("Confidence", card.confidence)}
          </dl>

          ${siblingSection(card)}

          <section>
            <div class="modal__eyebrow">History</div>
            <ul class="modal__history">${history}</ul>
          </section>

          ${footer}
        </div>
        ${contextPanel(card)}
      </div>
    </div>`;
}
/**
 * What the page shows instead of the queue when a source hands back a payload
 * that does not satisfy the contract. It lists every problem rather than the
 * first, matching what `npm run check:actions` prints, because the person
 * looking at this is about to go and fix the payload.
 */
export function issueScreen(issues) {
    const rows = issues
        .map((i) => `<li><span class="issues__id">${esc(i.id ?? "(payload)")}</span>` +
        `${esc(i.message)}</li>`)
        .join("");
    return `
    <div class="issues">
      <h2 class="issues__title">This actions payload cannot be displayed</h2>
      <p class="issues__lede">
        ${esc(String(issues.length))} problem(s) found. Run
        <code>npm run check:actions</code> for the same list at the terminal.
      </p>
      <ul class="issues__list">${rows}</ul>
    </div>`;
}
/**
 * One piece of work Mitch finished on its own, as a card in the same grid.
 *
 * It was a list beneath the queue for one revision. Wrong twice over: it sat
 * below eighteen cards where nobody would reach it, and a row of muted text
 * read as an afterthought rather than as the evidence that Mitch is working.
 *
 * Carries no data-action anywhere. There is nothing to decide and nothing to
 * open — a card that looks clickable in the one collection that needs no
 * attention would undo the point of separating them.
 */
export function completedCard(item) {
    return `
    <article class="card card--completed">
      <div class="card__head">
        <div class="card__headings">
          <h2 class="card__title">${esc(item.title)}</h2>
          <div class="card__badges">
            <span class="badge badge--done">Completed</span>
            <span class="badge badge--time">${esc(item.time)}</span>
          </div>
        </div>
      </div>
      <p class="card__subtitle">${esc(item.subtitle)}</p>
      <div class="card-note card-note--done">${esc(item.summary)}</div>
    </article>`;
}
/**
 * A plain grid, not the masonry the queue uses — hence its own class, which
 * is also what keeps the masonry pass (which selects `.card-grid`) away from
 * it.
 *
 * Reading order is the whole point here. This collection is a log, so it runs
 * newest first, left to right and down; cards are sized to the tallest of
 * them so every row starts level and that order is never in doubt. The queue
 * cannot do this — its cards vary hugely in height and uniform sizing would
 * waste screens of space — but a log of one-line summaries can.
 */
export function completedGrid(items) {
    if (!items.length) {
        return `<div class="queue-empty">Nothing completed yet today</div>`;
    }
    return `<div class="completed-grid">${items.map(completedCard).join("")}</div>`;
}
/** Stand-in for `fa-table-columns`, on the same terms as the other icons. */
const ICON_BOARD = `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">` +
    `<rect x="1.2" y="2.4" width="3.4" height="11.2" rx="1" fill="currentColor"/>` +
    `<rect x="6.3" y="2.4" width="3.4" height="7.6" rx="1" fill="currentColor"/>` +
    `<rect x="11.4" y="2.4" width="3.4" height="9.6" rx="1" fill="currentColor"/>` +
    `</svg>`;
/** Stand-in for `fa-flask`. */
const ICON_FLASK = `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">` +
    `<path d="M6.4 1.6h3.2v1.2H9.1v3.3l3.9 6.2a1.6 1.6 0 0 1-1.35 2.45H4.35A1.6 1.6 0 0 1 3 12.3l3.9-6.2V2.8H6.4z" ` +
    `fill="currentColor"/></svg>`;
/** Stand-in for `fa-list-check`. */
const ICON_LIST = `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">` +
    `<rect x="1" y="3" width="3" height="3" rx="0.8" fill="currentColor"/>` +
    `<rect x="1" y="10" width="3" height="3" rx="0.8" fill="currentColor"/>` +
    `<rect x="6" y="3.9" width="9" height="1.6" rx="0.8" fill="currentColor"/>` +
    `<rect x="6" y="10.9" width="9" height="1.6" rx="0.8" fill="currentColor"/>` +
    `</svg>`;
/**
 * The header's view switch, tertiary because it is a way across rather than a
 * decision. It always names where it goes rather than where you are: a toggle
 * that reads "Dashboard" while you are on the dashboard has to be learned,
 * and a reader should not have to remember which of two states a single word
 * is describing.
 */
export function viewSwitch(onDashboard, counts) {
    const [label, icon, count] = onDashboard
        ? ["Actions", ICON_LIST, counts.open]
        : ["Dashboard", ICON_BOARD, counts.cases];
    return (`<button class="btn-tertiary view-switch" data-action="switch-view" ` +
        `data-value="${onDashboard ? "actions" : "cases"}">` +
        `${icon}<span>${esc(label)}</span>` +
        `<span class="view-switch__count">${esc(String(count))}</span></button>`);
}
/**
 * One onboarding, as a card in the column of the stage it has reached.
 *
 * The board replaced a track per property. A track shows one property's
 * journey well and ten of them not at all — and nobody works a whole office's
 * pipeline, so the useful question is "what is sitting at Compliance", which
 * is a column.
 */
export function caseCard(item) {
    const current = item.stages.find((s) => s.state === "current");
    const blocked = Boolean(current?.blocked);
    const done = item.stages.filter((s) => s.state === "done").length;
    // One line each, truncated. A card in a 160px column cannot carry a full
    // exception title, and three of them wrapping to four lines apiece buried
    // the property the card is about. The full title is on hover, and the card
    // it opens says it in full anyway.
    const blockers = item.blockers.length
        ? `<p class="case__blockers">${item.blockers
            .map((b, i) => `<button class="case__blocker" data-action="open" ` +
            `data-id="${esc(b.id)}" title="${esc(b.title)}">` +
            `<span class="case__blocker-n" aria-hidden="true">${esc(String(i + 1))}</span>` +
            `<span class="case__blocker-text">${esc(b.title)}</span></button>`)
            .join("")}</p>`
        : "";
    return `
        <article class="case-card${blocked ? " case-card--blocked" : ""}">
          <h3 class="case-card__ref">${esc(item.ref)}</h3>
          <p class="case-card__subject">${esc(item.subject)}</p>
          <p class="case-card__holder">${esc(item.assignedTo.name)}</p>
          <p class="case-card__progress"
             aria-label="${esc(String(done))} of ${esc(String(item.stages.length))} stages complete">
            <span class="case-card__progress-bar" aria-hidden="true">
              <span style="width: ${esc(String(Math.round((done / item.stages.length) * 100)))}%"></span>
            </span>
          </p>
          ${blockers}
        </article>`;
}
/**
 * The board: one column per stage, in workflow order, each holding the
 * properties currently at it.
 *
 * Columns come from the cases rather than from a constant, so the stage set
 * stays the payload's to define — a different staff member's workflow has
 * different stages and this component should not need to know them. Empty
 * columns are kept: a gap at Deposit is information, and a board whose
 * columns move about as work flows is unreadable.
 */
export function caseBoard(items) {
    if (!items.length) {
        return `<div class="queue-empty">No onboardings in progress</div>`;
    }
    const order = items[0].stages.map((s) => s.name);
    const columns = order
        .map((name) => {
        const here = items.filter((i) => i.stages.find((s) => s.state === "current")?.name === name);
        return `
      <section class="board__column">
        <h2 class="board__heading">
          ${esc(name)}<span class="board__count">${esc(String(here.length))}</span>
        </h2>
        <div class="board__cards">${here.map(caseCard).join("")}</div>
      </section>`;
    })
        .join("");
    return `<div class="board">${columns}</div>`;
}
/**
 * Whose onboardings the board shows.
 *
 * Occupies the row the status chips use on the queue, which is what keeps the
 * header the same height in both views — the board had no chip row at all, so
 * crossing to it used to shorten the header and shift the content up.
 *
 * Same chip shape as the queue's filters because it is the same kind of
 * control: narrowing what is shown, not deciding anything.
 */
export function ownerRow(owners, active) {
    const all = filterChip({
        label: "Everyone",
        count: owners.reduce((n, o) => n + o.count, 0),
        value: "",
        active: active === null,
        action: "owner",
    });
    const each = owners
        .map((o) => filterChip({
        label: o.name,
        count: o.count,
        value: o.name,
        active: active === o.name,
        action: "owner",
    }))
        .join("");
    return `${all}<span class="chip-divider"></span>${each}`;
}
/**
 * The rehearsal control, beside the view switch.
 *
 * Tertiary like its neighbour, and it states what turning it on would do
 * rather than what is currently true — a control reading "Rehearsal" while
 * you are already rehearsing has to be learned. While on, the strip below
 * says so plainly, which is the part that must not be missable.
 */
export function rehearsalSwitch(on, held) {
    const label = on ? "Leave rehearsal" : "Rehearsal";
    const count = on && held > 0
        ? `<span class="view-switch__count">${esc(String(held))}</span>`
        : "";
    return (`<button class="btn-tertiary view-switch rehearsal-switch${on ? " rehearsal-switch--on" : ""}" ` +
        `data-action="toggle-rehearsal" title="Work the queue for real and let nothing out of the building">` +
        `${ICON_FLASK}<span>${esc(label)}</span>${count}</button>`);
}
/**
 * The strip that makes rehearsal impossible to mistake for live work.
 *
 * Deliberately not a subtle tint on the header: a demo that quietly looks
 * slightly different is exactly the one somebody misreads in front of a
 * client. It states the two things that are true — nothing is saved, nothing
 * would be sent — and counts what is being held.
 */
export function rehearsalBanner(on, held) {
    if (!on)
        return "";
    const what = held === 0
        ? "Nothing held back yet."
        : `${esc(String(held))} decision${held === 1 ? "" : "s"} held back — computed, never sent.`;
    return `
    <div class="rehearsal-strip" role="status">
      <span class="rehearsal-strip__tag">Rehearsal</span>
      <span>${"Decisions compute and the queue moves. Nothing is saved, and " +
        "nothing would leave the building. " + what}</span>
    </div>`;
}
/**
 * Flips between our design system and Fluent, in place.
 *
 * Explicitly a comparison tool, not a product setting — which is why it names
 * the system it would switch TO. A client build would drop it and keep the
 * ?ds= parameter, or drop both.
 */
export function designSystemSwitch(current) {
    const next = current === "fluent" ? "btrmnt" : "fluent";
    const label = next === "fluent" ? "Fluent" : "btrmnt";
    return (`<button class="btn-tertiary view-switch ds-switch" data-action="set-ds" ` +
        `data-value="${esc(next)}" title="Re-skin with ${esc(label)}'s design tokens">` +
        `<span class="ds-switch__swatch" aria-hidden="true"></span>` +
        `<span>${esc(label)}</span></button>`);
}
