/**
 * Which theme to paint, given the page's query string and the OS preference.
 *
 * Teams substitutes `{theme}` in a tab's contentUrl with `default`, `dark` or
 * `contrast`, so the host's answer arrives in the URL and needs no SDK, no
 * CDN script and no bundler — which matters, because this page deliberately
 * has none of those.
 *
 * `contrast` is Teams' high-contrast mode. It maps to dark here, which is the
 * closer of the two; doing it properly means a third token set with hard
 * borders and no tints, and pretending otherwise would be worse than saying
 * so.
 *
 * Outside Teams there is no parameter and the OS preference decides.
 */
export function resolveTheme(search, prefersDark) {
    const param = new URLSearchParams(search).get("theme");
    if (param === "dark" || param === "contrast")
        return "dark";
    if (param === "default")
        return "light";
    return prefersDark ? "dark" : "light";
}
/**
 * Applies the theme and keeps it current.
 *
 * The attribute is also written by the inline snippet in index.html, before
 * any stylesheet loads — that is what stops the page painting light for a
 * frame and then flipping. This runs afterwards and owns the changes: a
 * browser whose owner switches dark mode while the tab is open.
 *
 * It does NOT re-read the Teams parameter: Teams cannot change a URL that has
 * already loaded. Reacting to a theme change inside a Teams session needs the
 * Teams JS SDK's registerOnThemeChangeHandler, which needs the SDK, which
 * needs a CDN. First paint is correct without it; live switching is not.
 */
export function initTheme() {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => {
        document.documentElement.dataset.theme = resolveTheme(window.location.search, media?.matches ?? false);
    };
    apply();
    media?.addEventListener?.("change", apply);
}
/**
 * Reads the design system from the query string.
 *
 * A comparison affordance rather than a product setting: it exists so the two
 * can be put side by side and judged with eyes rather than argued about in
 * the abstract. Defaults to ours, and an unrecognised value does not silently
 * become Fluent.
 */
export function resolveDesignSystem(search) {
    return new URLSearchParams(search).get("ds") === "fluent" ? "fluent" : "btrmnt";
}
/** Applies it, and returns what was applied. */
export function initDesignSystem() {
    const ds = resolveDesignSystem(window.location.search);
    document.documentElement.dataset.ds = ds;
    return ds;
}
/** Flips between the two without a reload, so they can be compared in place. */
export function setDesignSystem(ds) {
    document.documentElement.dataset.ds = ds;
}
/** What is painting right now. */
export function currentDesignSystem() {
    return document.documentElement.dataset.ds === "fluent" ? "fluent" : "btrmnt";
}
