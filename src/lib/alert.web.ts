// @ts-nocheck
// ---------------------------------------------------------------------------
// WEB ALERT  (browser build only)
// ---------------------------------------------------------------------------
// React Native's Alert.alert() does nothing in a browser, so confirm dialogs
// (delete, reset, …) would silently fail. This version shows the browser's
// own alert/confirm box and calls the matching button's onPress.
// ---------------------------------------------------------------------------

function text(title, message) {
  return [title, message].filter(Boolean).join('\n\n');
}

export const Alert = {
  alert(title, message, buttons) {
    const list = Array.isArray(buttons) ? buttons : [];
    if (list.length <= 1) {
      window.alert(text(title, message));
      if (list[0] && typeof list[0].onPress === 'function') list[0].onPress();
      return;
    }
    const cancel = list.find((b) => b && b.style === 'cancel') || null;
    const actions = list.filter((b) => b && b !== cancel);
    const main = actions[actions.length - 1];
    const ok = window.confirm(text(title, message) + (main && main.text ? '\n\nOK = ' + main.text : ''));
    const chosen = ok ? main : cancel;
    if (chosen && typeof chosen.onPress === 'function') chosen.onPress();
  }
};
