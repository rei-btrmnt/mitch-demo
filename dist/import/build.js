import { findAll } from "./rules.js?v=310f48d";
/** The onboarding stages, in workflow order. */
const STAGES = [
    "MAA received", "Entered", "Assigned", "Deposit", "Compliance", "Listed", "Live",
];
/** Which record field, if filled, means a stage has been reached. */
const STAGE_FIELD = {
    "MAA received": "maaExecuted",
    Entered: "enteredPropertyMe",
    Assigned: "silo",
    Deposit: "depositConfirmed",
    Compliance: "complianceGraded",
    Listed: "listed",
    Live: "live",
};
const filled = (v) => Boolean(v && v.trim());
/**
 * Maps an export's own column headings onto the normalised record.
 *
 * Unmapped fields are simply absent, which every rule already handles — a
 * spreadsheet that does not track ASIC directors produces no signature
 * findings rather than a crash, and that is the correct behaviour for a
 * partial export.
 */
export function normalise(rows, map) {
    const entries = Object.entries(map);
    return rows
        .map((row) => {
        // Built as a loose bag and asserted once at the end: every field on
        // OnboardingRecord is an optional string, so the shapes agree, but
        // TypeScript cannot see that through an index write.
        const record = {};
        for (const [field, column] of entries) {
            const value = row[column];
            if (value !== undefined && value.trim() !== "") {
                record[field] = value.trim();
            }
        }
        return record;
    })
        .filter((r) => filled(r.ref));
}
/** Where a record has got to: the last stage whose field is filled. */
function stagesFor(r) {
    const reached = STAGES.map((name) => filled(r[STAGE_FIELD[name]]));
    // The current stage is the first unreached one; everything past the last
    // reached stage is ahead of it.
    const lastReached = reached.lastIndexOf(true);
    const current = Math.min(lastReached + 1, STAGES.length - 1);
    return STAGES.map((name, i) => {
        if (i < current) {
            const at = r[STAGE_FIELD[name]];
            return { name, state: "done", ...(at ? { at } : {}) };
        }
        return { name, state: i === current ? "current" : "todo" };
    });
}
function toAction(r, f, index) {
    const subtitle = [r.ref, r.address].filter(Boolean).join(" · ");
    const assignedTo = {
        role: r.assignedRole ?? "New business (BDM)",
        name: r.assignedTo ?? "BDM team",
    };
    const base = {
        id: `${r.ref.replace(/\s+/g, "-").toLowerCase()}-${index + 1}`,
        title: f.title,
        subtitle,
        caseRef: r.ref,
        tag: f.tag,
        source: f.source,
        proposal: f.proposal,
        rule: f.rule,
        ruleNote: f.ruleNote,
        assignedTo,
        decidedBy: f.action ? "Held for you" : "Mitch, automatic hold",
        whoSees: "BDM + Operations",
        confidence: f.confidence,
        ...(f.flag ? { flag: f.flag } : {}),
        history: [
            { time: "Earlier", text: `Mitch read the source and applied ${f.rule}` },
            { time: "now", text: f.action ? "Awaiting your decision" : "Held, watching the source" },
        ],
    };
    // A finding with no action is something Mitch is waiting on rather than
    // something a person can resolve now — the queue must not offer a button
    // for work nobody can do yet.
    if (!f.action) {
        return { ...base, status: "waiting", note: f.proposal.split(". ")[0] + "." };
    }
    return {
        ...base,
        status: "needs_you",
        primaryAction: {
            label: f.action.label,
            does: f.action.does,
            status: f.action.note.startsWith("Waiting") ? "waiting" : "sent",
            note: f.action.note,
            history: f.action.history,
        },
    };
}
/**
 * Turns an export into a payload the UI can load unchanged.
 *
 * Records with no findings are not dropped — they become completed items, and
 * that is the point: a queue of exceptions with no denominator misrepresents
 * the staff member, and the records that passed every rule are the evidence
 * that it did anything at all.
 */
export function buildPayload(records, staffMember = "Mitch") {
    const results = findAll(records);
    const actions = results.flatMap(({ record, findings }) => findings.map((f, i) => toAction(record, f, i)));
    const completed = results
        .filter(({ findings }) => findings.length === 0)
        .map(({ record }) => ({
        id: `done-${record.ref.replace(/\s+/g, "-").toLowerCase()}`,
        title: "Onboarding progressed with no exceptions",
        subtitle: [record.ref, record.address].filter(Boolean).join(" · "),
        time: record.enteredPropertyMe ?? record.maaExecuted ?? "Earlier",
        summary: "Every rule passed on the inputs available: fees well formed, entity and authority consistent, compliance current.",
    }));
    const cases = records.map((r) => ({
        ref: r.ref,
        subject: r.address ?? r.ref,
        assignedTo: {
            role: r.assignedRole ?? "New business (BDM)",
            name: r.assignedTo ?? "BDM team",
        },
        stages: stagesFor(r),
    }));
    return { staffMember, actions, completed, cases };
}
