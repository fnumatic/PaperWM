/** Pure window-rule matching; rule order remains the caller's responsibility. */
function matches(value, pattern) {
    // Clone regexes: global/sticky matching must not change a rule's lastIndex.
    return pattern instanceof RegExp
        ? new RegExp(pattern.source, pattern.flags).test(String(value ?? ''))
        : !pattern || pattern === value;
}

export function winpropMatches({ wmClass, title }, prop) {
    return matches(wmClass || '', prop.wm_class) && matches(title, prop.title);
}

/** Preserve first-match precedence and the legacy catch-all fallback. */
export function selectWinprop(window) {
    return window.props.find(prop => winpropMatches(window, prop)) ??
        window.props.find(prop => prop.wm_class === '*' || prop.title === '*') ??
        null;
}
