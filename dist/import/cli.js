#!/usr/bin/env node
/**
 * Turns a spreadsheet export into an actions payload.
 *
 *   npm run import -- --csv export.csv --map map.json --out payload.json
 *
 * The map is a JSON object of field -> column heading; `--map` may be omitted
 * when the export's headings already match the field names. Writing the
 * mapping down rather than inferring it is deliberate: a heading called
 * "Fee" could be either fee, and guessing wrong produces a payload that
 * validates and lies.
 */
import { readFile, writeFile } from "node:fs/promises";
import { parseCsv } from "./csv.js?v=310f48d";
import { normalise, buildPayload } from "./build.js?v=310f48d";
import { validateActionsPayload, validateCompleted, validateCases } from "../actions/validate.js?v=310f48d";
function arg(name) {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? undefined : process.argv[i + 1];
}
async function main() {
    const csvPath = arg("csv");
    const outPath = arg("out");
    if (!csvPath || !outPath) {
        console.error("usage: npm run import -- --csv <export.csv> --out <payload.json> [--map <map.json>]");
        process.exitCode = 1;
        return;
    }
    const mapPath = arg("map");
    const map = mapPath
        ? JSON.parse(await readFile(mapPath, "utf-8"))
        : identityMap();
    const rows = parseCsv(await readFile(csvPath, "utf-8"));
    const records = normalise(rows, map);
    if (!records.length) {
        console.error(`No rows with a ref. ${rows.length} row(s) read; check --map against the export's headings:\n  ` +
            Object.keys(rows[0] ?? {}).join("\n  "));
        process.exitCode = 1;
        return;
    }
    const payload = buildPayload(records);
    // The same validation the UI runs at its boundary. An importer that writes
    // a payload the UI will refuse has failed, and should say so here rather
    // than in a browser.
    const issues = [
        ...validateActionsPayload(payload),
        ...validateCompleted(payload),
        ...validateCases(payload),
    ];
    if (issues.length) {
        console.error(`${issues.length} problem(s) in the generated payload:`);
        for (const i of issues)
            console.error(`  ${i.id ?? "(payload)"}: ${i.message}`);
        process.exitCode = 1;
        return;
    }
    await writeFile(outPath, JSON.stringify(payload, null, 2) + "\n");
    const open = payload.actions.filter((a) => a.status === "needs_you").length;
    console.log(`${records.length} onboarding(s) -> ${payload.actions.length} action(s) ` +
        `(${open} needing a person), ${payload.completed?.length ?? 0} clean, ` +
        `${payload.cases?.length ?? 0} case(s)\n${outPath}`);
}
/** Field names as headings, for an export that already matches. */
function identityMap() {
    const fields = [
        "ref", "address", "owner", "ownerType", "abn", "abnStatus", "abnBranch",
        "maaBranch", "signatory", "directors", "managementFee", "lettingFee",
        "bankDetails", "existingBankDetails", "maaExecuted", "depositConfirmed",
        "enteredPropertyMe", "silo", "portfolioSilo", "poolInScope",
        "poolCertificate", "smokeAlarmCertificate", "complianceGraded", "listed",
        "live", "assignedTo", "assignedRole", "specialInstructions",
    ];
    return Object.fromEntries(fields.map((f) => [f, f]));
}
main().catch((err) => {
    console.error(String(err));
    process.exitCode = 1;
});
