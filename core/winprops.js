/**
 * Pure window-rule matching.
 *
 * Rules come from GSettings and `user` defaults; matching only reads them.
 * `title` is coerced to a string for regular expressions, so a missing title
 * cannot throw where the legacy code called `.match` on null.
 */

export function winpropMatches({ wmClass, title }, prop) {
    const cls = wmClass || '';

    if (prop.wm_class) {
        if (prop.wm_class instanceof RegExp) {
            if (!cls.match(prop.wm_class))
                return false;
        } else if (prop.wm_class !== cls) {
            return false;
        }
    }

    if (prop.title) {
        if (prop.title instanceof RegExp) {
            if (!String(title ?? '').match(prop.title))
                return false;
        } else if (prop.title !== title) {
            return false;
        }
    }

    return true;
}

/**
 * First matching rule, then the first catch-all (`*`) rule, else null.
 * The caller keeps rule ordering and persistence.
 */
export function selectWinprop({ wmClass, title, props }) {
    const matched = props.filter(prop => winpropMatches({ wmClass, title }, prop));
    if (matched.length > 0)
        return matched[0];

    const star = props.find(prop => prop.wm_class === '*' || prop.title === '*');
    return star ?? null;
}
