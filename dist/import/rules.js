import { parseFee, feeBand } from "./fee.js?v=310f48d";
const has = (v) => Boolean(v && v.trim());
const no = (v) => !has(v);
/** As above, in days. */
function olderThanDays(value, days) {
    if (!has(value))
        return false;
    const at = new Date(value.trim());
    if (Number.isNaN(at.getTime()))
        return false;
    return Date.now() - at.getTime() > days * 24 * 60 * 60 * 1000;
}
/** Roughly "is this date more than n months old", tolerant of loose formats. */
function olderThanMonths(value, months) {
    if (!has(value))
        return false;
    const at = new Date(value.trim());
    if (Number.isNaN(at.getTime()))
        return false;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    return at < cutoff;
}
/**
 * Every rule, applied to one record.
 *
 * Each returns at most one finding, and the set is deliberately small: these
 * are the exceptions Highland's scenario set actually names, not everything
 * that could conceivably be checked. A rule that fires on half the portfolio
 * is noise, and noise is what a queue exists to remove.
 */
export const RULES = [
    // ── Money ────────────────────────────────────────────────────────────────
    function feeIsFixedNotPercent(r) {
        const fee = parseFee(r.managementFee);
        if (fee.kind !== "fixed")
            return null;
        return {
            rule: "Money-Field Confirmation — Fixed $ Against a Percentage Norm",
            title: "Management Fee Is a Flat Dollar Amount",
            tag: "FEES",
            source: `MAA management fee reads "${fee.raw}". The rest of this portfolio expresses the management fee as a percentage of rent collected.`,
            proposal: "The fee is enterable as written — a flat dollar management fee is a valid form, not a malformed field. What cannot be settled here is whether it was intended: a flat amount stops tracking rent at every review after. Confirm the amount is deliberate, or supply the percentage it should have been.",
            ruleNote: "Matched inputs: the fee parses cleanly as a dollar amount, and the same field is a percentage elsewhere in this portfolio.",
            confidence: "Valid but atypical for this portfolio",
            action: {
                label: "Confirm Fee",
                does: "Records the management fee exactly as you confirm it and releases the fee schedule for entry into PropertyMe.",
                note: "Sent — fee confirmed and released for entry.",
                history: "You confirmed the management fee — Mitch released the fee schedule",
            },
        };
    },
    function feeOutsideBand(r, ctx) {
        const fee = parseFee(r.managementFee);
        if (fee.kind !== "percent" || fee.value === null || !ctx.band)
            return null;
        if (fee.value >= ctx.band.low && fee.value <= ctx.band.high)
            return null;
        const side = fee.value < ctx.band.low ? "below" : "above";
        return {
            rule: "Fee Integrity — Percentage Outside the Portfolio Band",
            title: `Management Fee Sits ${side === "below" ? "Below" : "Above"} the Portfolio Range`,
            tag: "FEES",
            source: `MAA management fee reads "${fee.raw}". This portfolio's management fees fall between ${ctx.band.low.toFixed(2)}% and ${ctx.band.high.toFixed(2)}%.`,
            proposal: `The fee is well formed and enterable. It sits ${side} the range every other agreement in this portfolio uses, which is worth a human look before it is locked in for the life of the management. Confirm the rate, or supply the intended one.`,
            ruleNote: "Matched inputs: the fee parses as a percentage and falls more than two standard deviations from this portfolio's mean.",
            confidence: `Outside the portfolio band (${ctx.band.low.toFixed(2)}–${ctx.band.high.toFixed(2)}%)`,
            action: {
                label: "Confirm Rate",
                does: "Records the management fee at the rate you confirm and releases the fee schedule for entry.",
                note: "Sent — rate confirmed and released for entry.",
                history: "You confirmed the management fee rate",
            },
        };
    },
    function gstUnstated(r) {
        const mgmt = parseFee(r.managementFee);
        const letting = parseFee(r.lettingFee);
        const unstated = [mgmt, letting].filter((f) => f.kind !== "unknown" && f.gst === "unstated");
        if (!unstated.length)
            return null;
        return {
            rule: "Fee Integrity — Percentage, Fixed $ and GST",
            title: "Fee Schedule Ambiguous — GST Treatment Unstated",
            tag: "FEES",
            source: `${unstated.map((f) => `"${f.raw}"`).join(" and ")} — neither line states whether the figure includes GST, and the fee schedule carries no GST clause.`,
            proposal: "Every fee must state its GST treatment. The values are clear; the treatment is absent, and inclusive versus exclusive differ by 10% on every invoice for the life of the management. State the treatment and Mitch records it against both fees.",
            ruleNote: "Matched inputs: fee values parse cleanly, GST presence is neither stated nor derivable from the schedule.",
            confidence: "Values clear, GST unstated",
            action: {
                label: "Confirm GST",
                does: "Records the GST treatment for the fees exactly as you state it and releases the fee schedule for entry.",
                note: "Sent — GST treatment recorded, fee schedule released.",
                history: "You confirmed the GST treatment — Mitch released the fee schedule",
            },
        };
    },
    // ── Identity and authority ───────────────────────────────────────────────
    function entityBranchMismatch(r) {
        if (no(r.abn) || no(r.abnBranch) || no(r.maaBranch))
            return null;
        if (r.abnBranch.trim().toLowerCase() === r.maaBranch.trim().toLowerCase()) {
            return null;
        }
        return {
            rule: "Company Verification — ASIC/ABN Branch Mismatch",
            title: "ASIC Check — Company Not Registered at MAA Branch",
            tag: "IDENTITY",
            flag: "The registered entity does not fully match the agreement. Confirm before entry.",
            source: `ABN ${r.abn} resolves to ${r.abnStatus ?? "an active company"}. Registered branch "${r.abnBranch}" differs from the branch on the MAA, "${r.maaBranch}".`,
            proposal: "The owner record must name an entity whose ASIC registration matches the MAA. The ABN resolves and the name matches, but the branch does not, so the match is incomplete. Confirm the entity or correct the branch on the MAA.",
            ruleNote: "Matched inputs: ABN active and name-matched, branch registration inconsistent with the document.",
            confidence: "Entity matched, branch not",
            action: {
                label: "Confirm Entity",
                does: "Accepts this as the same company and releases the owner record for entry into PropertyMe.",
                note: "Sent — entity confirmed, owner record released for entry.",
                history: "You confirmed the entity — Mitch released the owner record",
            },
        };
    },
    function signatoryNotADirector(r) {
        if (no(r.signatory) || no(r.directors))
            return null;
        // Surname alone is not enough, and the failure is not hypothetical: a
        // deed signed by "D. Marsh" against directors "J. Marsh; S. Marsh" is
        // precisely the case this rule exists for, and a surname match waves it
        // through. Compare the initial as well.
        const parts = (name) => {
            const words = name.trim().toLowerCase().replace(/[.]/g, "").split(/\s+/);
            return {
                initial: (words[0] ?? "").charAt(0),
                surname: words.length > 1 ? words[words.length - 1] : "",
            };
        };
        const signatory = parts(r.signatory);
        if (!signatory.surname)
            return null;
        const matched = r.directors
            .split(/[;,/]/)
            .map((d) => parts(d))
            .some((d) => d.surname === signatory.surname && d.initial === signatory.initial);
        if (matched)
            return null;
        return {
            rule: "Name/Title Discrepancy — Signature Authority",
            title: "Signatory Is Not a Listed Director",
            tag: "IDENTITY",
            flag: "Signature authority is unevidenced. No downstream task runs until it is resolved.",
            source: `MAA signed by "${r.signatory}". ASIC lists ${r.directors}.`,
            proposal: "An MAA is enforceable only if signed by someone with authority for the owning entity, and this signatory does not appear on the director list. Supply evidence of authority — a recent ASIC change, a trust deed, or a corrected signatory.",
            ruleNote: "Matched inputs: the signatory's name does not appear among the registered directors.",
            confidence: "No authority match found",
            action: {
                label: "Resolve Authority",
                does: "Records who holds signature authority, attaches the evidence to the file and lifts the compliance hold.",
                note: "Sent — signature authority recorded, hold lifted.",
                history: "You resolved signature authority — Mitch lifted the compliance hold",
            },
        };
    },
    function bankDetailsConflict(r) {
        if (no(r.bankDetails) || no(r.existingBankDetails))
            return null;
        if (r.bankDetails.trim() === r.existingBankDetails.trim())
            return null;
        return {
            rule: "Owner Entry — Existing Contact Conflict",
            title: "New Business — Owner Entry Needs Review",
            tag: "MAA INTAKE",
            source: `MAA gives bank details ${r.bankDetails}. The existing contact record carries ${r.existingBankDetails}.`,
            proposal: "Entry needs one set of bank details matching the executed MAA, and there are two with neither authoritative. Confirm which governs; Mitch enters the owner and supersedes the other as historic.",
            ruleNote: "Matched inputs: an existing contact record was found and its bank details differ from the MAA's.",
            confidence: "Conflict detected — human confirmation required",
            action: {
                label: "Confirm & Enter",
                does: "Enters the owner in PropertyMe against the details you confirm, keeping the other as historic.",
                note: "Sent — entered in PropertyMe against the confirmed details.",
                history: "You confirmed which bank details govern",
            },
        };
    },
    // ── Routing ──────────────────────────────────────────────────────────────
    function siloAmbiguous(r) {
        if (no(r.silo) || no(r.portfolioSilo))
            return null;
        if (r.silo.trim().toLowerCase() === r.portfolioSilo.trim().toLowerCase()) {
            return null;
        }
        return {
            rule: "Silo & Portfolio Assignment — Ambiguity Held for Review",
            title: "Silo Assignment Is Ambiguous",
            tag: "MAA INTAKE",
            source: `The MAA office reads "${r.silo}". The property's portfolio boundary resolves to "${r.portfolioSilo}".`,
            proposal: "A property must resolve to exactly one silo before any task is routed, and these resolve to two with no rule ranking them. Pick the silo; Mitch re-points every downstream task to it. Nothing has been routed while this was held.",
            ruleNote: "Matched inputs: MAA office and portfolio boundary disagree, and no tiebreak rule covers the pair.",
            confidence: "Two matches, no tiebreak",
            action: {
                label: "Choose Silo",
                does: "Assigns the property to the silo you pick and re-points every downstream task to it.",
                note: "Sent — silo assigned, downstream tasks re-pointed.",
                history: "You assigned the silo — Mitch re-pointed the downstream tasks",
            },
        };
    },
    // ── Compliance ───────────────────────────────────────────────────────────
    function poolCertificateMissing(r) {
        const inScope = /^(y|yes|true|1)$/i.test((r.poolInScope ?? "").trim());
        if (!inScope || has(r.poolCertificate))
            return null;
        return {
            rule: "Pool Compliance Gate",
            title: "Pool Compliance — Certificate Not On File",
            tag: "COMPLIANCE",
            flag: "This property cannot be leased until pool safety certification is on file.",
            source: "Section 25 is not struck out, so the pool is in scope. No pool safety certificate is on file.",
            proposal: "Full compliance requires pool safety certification wherever the pool is in scope. The input is missing rather than ambiguous, so the gate holds. Mitch has the request drafted; it goes to the owner from you.",
            ruleNote: "Matched inputs: pool in scope on the agreement, no certificate recorded.",
            confidence: "Required input absent",
            action: {
                label: "Review & Send",
                does: "Opens the request Mitch drafted for you to send from your own mailbox. Mitch then watches for the certificate and releases the listing gate when it arrives.",
                note: "Waiting — pool safety certificate requested from the owner.",
                history: "You sent the certificate request — Mitch is watching for it",
            },
        };
    },
    function smokeAlarmExpired(r) {
        if (no(r.smokeAlarmCertificate))
            return null;
        if (!olderThanMonths(r.smokeAlarmCertificate, 12))
            return null;
        return {
            rule: "Compliance Rubric — Conditional Grade Gates Listing",
            title: "Smoke Alarm Certificate Has Expired",
            tag: "COMPLIANCE",
            flag: "Certificate expired. The property cannot be leased until a current one is on file.",
            source: `Smoke alarm certificate on file is dated ${r.smokeAlarmCertificate}. The rubric requires one within twelve months.`,
            proposal: "A property cannot be leased without a smoke alarm certificate dated within twelve months. The required input exists but has expired, so the grade holds at conditional. Mitch has the request drafted; it goes to the owner from you.",
            ruleNote: "Matched inputs: a certificate is recorded and its date falls outside the twelve-month window.",
            confidence: "Required input expired",
            action: {
                label: "Review & Send",
                does: "Opens the request Mitch drafted for you to send from your own mailbox. Mitch re-grades and lifts the listing gate when a current certificate is filed.",
                note: "Waiting — current smoke alarm certificate requested.",
                history: "You sent the certificate request — Mitch is watching for it",
            },
        };
    },
    // ── Listing ──────────────────────────────────────────────────────────────
    function landlordRequirementsUnmapped(r) {
        if (no(r.specialInstructions))
            return null;
        return {
            rule: "Landlord Requirements — Retain and Surface",
            title: "Landlord Requirements Need a Home Leasing Can Enforce",
            tag: "LISTING",
            source: `MAA special instructions: "${r.specialInstructions}"`,
            proposal: "Landlord requirements have to land in fields the leasing system enforces. Free text carries into the listing brief but nothing checks it, so an ad can be drafted that contradicts it. Confirm a note is an acceptable home for these, or name the fields they should map to.",
            ruleNote: "Matched inputs: the agreement carries free-text special instructions that constrain leasing.",
            confidence: "Free text, no enforced field",
            action: {
                label: "Confirm Requirements",
                does: "Locks the requirements to the property so leasing cannot draft an ad that contradicts them.",
                note: "Sent — requirements locked to the property.",
                history: "You confirmed the landlord requirements",
            },
        };
    },
    // ── Identity (Mitch-011) ─────────────────────────────────────────────────
    function identityNotVerified(r) {
        // Fires only where documents exist and no decision has been recorded.
        // Absence of both means Mitch is still gathering, which is not a decision
        // anyone can take yet; firing on every blank column would bury the rest.
        if (no(r.identityDocuments) || has(r.identityVerified))
            return null;
        return {
            rule: "Identity Verification — Human Gate, Always",
            title: "Identity Verification Awaiting Your Decision",
            tag: "IDENTITY",
            flag: "Identity is unverified. It cannot be cleared by Mitch.",
            source: `Identity documents on file: ${r.identityDocuments}. No verification decision is recorded.`,
            proposal: "Identity documents must match the MAA and each other, and the decision is a person's by design — Mitch surfaces and highlights, it never clears. Record which document governs and what evidence closes any gap.",
            ruleNote: "Matched inputs: identity documents present, no verification decision recorded against the file.",
            confidence: "Not scored — human gate",
            action: {
                label: "Record Decision",
                does: "Records your identity verification against the file, with the documents attached. Mitch carries the decision; it never makes it.",
                note: "Closed — your identity decision recorded against the file.",
                history: "You recorded the identity decision — Mitch attached it to the file",
            },
        };
    },
    // ── The go-live gate (Mitch-015) ─────────────────────────────────────────
    function liveWithoutComplianceDecision(r) {
        if (no(r.listed) && no(r.live))
            return null;
        if (has(r.complianceGraded))
            return null;
        const how = has(r.live) ? "live" : "listed";
        return {
            rule: "No Property Goes Live Non-Compliant",
            title: `Property Is ${how === "live" ? "Live" : "Listed"} With No Recorded Compliance Decision`,
            tag: "LIVE GATE",
            flag: "This property reached market without a recorded compliance decision. It is the one thing the gate exists to prevent.",
            source: `The property is recorded as ${how} on ${(has(r.live) ? r.live : r.listed)}. No compliance grading is recorded against it.`,
            proposal: "A property cannot reach market without a recorded human compliance decision, and this one has. Either the decision was taken and never recorded, or the gate was bypassed. Record the decision and its evidence, or withdraw the listing until it can be.",
            ruleNote: "Matched inputs: a listing or go-live date exists and no compliance grading is recorded.",
            confidence: "Gate bypassed or unrecorded",
            action: {
                label: "Record Compliance",
                does: "Records the compliance decision and its evidence against the property, closing the gap the gate is meant to hold.",
                note: "Sent — compliance decision recorded against the property.",
                history: "You recorded the compliance decision behind the go-live",
            },
        };
    },
    // ── Feed placement (Mitch-016, Mitch-017) ────────────────────────────────
    function feedPlacementIncomplete(r) {
        if (no(r.listed))
            return null;
        const onAgentbox = has(r.agentboxListed);
        const onSnug = has(r.snugListed);
        if (onAgentbox === onSnug)
            return null; // both or neither is not this rule
        const live = onAgentbox ? "Agentbox" : "Snug";
        const missing = onAgentbox ? "Snug" : "Agentbox";
        return {
            rule: "Dual-System Partial Failure — Continue via the Other",
            title: `${missing} Post Missing — ${live} Live, Handoff Continued`,
            tag: "RESILIENCE",
            source: `The ad is live on ${live}. ${missing} carries no record of it.`,
            proposal: `The listing must exist on both feeds. ${live} accepted it and the handoff was not blocked, but ${missing} has nothing. Resend that feed alone; the ${live} listing is already live and is not touched.`,
            ruleNote: `Matched inputs: a listing date exists, ${live} confirms placement and ${missing} does not.`,
            confidence: "One feed live, one missing",
            action: {
                label: "Resend Feed",
                does: `Resends the listing to ${missing} alone, leaving the live ${live} ad untouched.`,
                note: `Waiting — listing resent to ${missing}.`,
                history: `You resent the listing to ${missing} — Mitch is watching for acceptance`,
            },
        };
    },
    // ── Timing ───────────────────────────────────────────────────────────────
    function entryStalledAfterDeposit(r) {
        // Distinct from a deposit that has not landed: the money is in and entry
        // still has not fired, which is the case nobody notices because nothing
        // is obviously wrong.
        if (no(r.depositConfirmed) || has(r.enteredPropertyMe))
            return null;
        if (!olderThanDays(r.depositConfirmed, 2))
            return null;
        return {
            rule: "Deposit Confirmation Fires Entry",
            title: "Deposit Confirmed, Entry Has Not Fired",
            tag: "MAA INTAKE",
            source: `Deposit confirmed ${r.depositConfirmed}. Nothing is recorded as entered in PropertyMe.`,
            proposal: "Entry fires on deposit confirmation, and the deposit is confirmed. Either entry failed and nothing reported it, or it was never triggered. Confirm and Mitch enters the record; nothing downstream has run in the meantime.",
            ruleNote: "Matched inputs: deposit confirmed more than two days ago, no entry recorded.",
            confidence: "Trigger met, outcome missing",
            action: {
                label: "Confirm & Enter",
                does: "Enters the prepared record into PropertyMe and releases the downstream tasks that were waiting on it.",
                note: "Sent — entered in PropertyMe, downstream tasks released.",
                history: "You confirmed entry — Mitch entered the record",
            },
        };
    },
    function depositOutstanding(r) {
        if (no(r.maaExecuted) || has(r.depositConfirmed) || has(r.enteredPropertyMe)) {
            return null;
        }
        return {
            rule: "Deposit Confirmation Fires Entry",
            title: "Entry Waiting on Deposit Confirmation",
            tag: "MAA INTAKE",
            waiting: true,
            source: `MAA executed ${r.maaExecuted}. The trust account shows no matching deposit against this property.`,
            proposal: "The record is prepared in full and held. Entry fires on deposit confirmation, not on signature, so no record exists before the money does.",
            ruleNote: "Matched inputs: MAA executed, deposit unconfirmed, nothing yet entered.",
            confidence: "Single confident match",
        };
    },
];
/** Applies every rule to every record, with the portfolio's own fee band. */
export function findAll(records) {
    const percentages = records
        .map((r) => parseFee(r.managementFee))
        .filter((f) => f.kind === "percent" && f.value !== null)
        .map((f) => f.value);
    const ctx = { band: feeBand(percentages) };
    return records.map((record) => ({
        record,
        findings: RULES.map((rule) => rule(record, ctx)).filter((f) => f !== null),
    }));
}
