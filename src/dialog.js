// Lightweight in-app replacement for window.prompt()/window.confirm().
// Native browser dialogs can't be styled and look out of place inside the app,
// so every call site asks DialogHost (mounted once in App) to render a themed
// modal instead and resolves a promise when the person responds.
let handler = null;

export function setDialogHandler(fn) {
  handler = fn;
}

export function showDialog(config) {
  return new Promise((resolve) => {
    if (!handler) {
      resolve(null);
      return;
    }
    handler({ ...config, resolve });
  });
}

// Resolves to an object of {[fieldKey]: value} or null if cancelled.
export const promptDialog = (config) => showDialog({ type: "prompt", ...config });

// Resolves to true if confirmed, or null if cancelled.
export const confirmDialog = (config) => showDialog({ type: "confirm", ...config });
