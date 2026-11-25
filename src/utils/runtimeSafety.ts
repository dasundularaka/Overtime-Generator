/**
 * Runtime safety guards for third-party scripts (such as Google API / Firebase Auth
 * popup loader scripts) and opaque cross-origin browser Script errors inside iframes.
 */

const CROSS_ORIGIN_CORS_SCRIPT_PREFIXES = ['https://apis.google.com/'];

function shouldAttachAnonymousCors(url: string): boolean {
  if (!url) return false;
  return CROSS_ORIGIN_CORS_SCRIPT_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export function initRuntimeSafety(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const win = window as Window & { __otRuntimeSafetyInitialized?: boolean };
  if (win.__otRuntimeSafetyInitialized) return;
  win.__otRuntimeSafetyInitialized = true;

  // 1. Ensure dynamically injected CORS-enabled third-party scripts (like apis.google.com
  //    injected by Firebase Auth's GAPI loader) opt into crossOrigin="anonymous" so errors
  //    inside them never degrade into opaque browser "Script error." events.
  try {
    const originalCreateElement = document.createElement.bind(document);
    const patchedCreateElement = function (
      this: Document,
      tagName: string,
      options?: ElementCreationOptions
    ): HTMLElement {
      const el = originalCreateElement(tagName, options);
      if (typeof tagName === 'string' && tagName.toLowerCase() === 'script') {
        const scriptEl = el as HTMLScriptElement;
        const origSetAttribute = scriptEl.setAttribute.bind(scriptEl);
        scriptEl.setAttribute = function (name: string, value: string): void {
          if (
            name.toLowerCase() === 'src' &&
            shouldAttachAnonymousCors(String(value || '')) &&
            !scriptEl.hasAttribute('crossorigin')
          ) {
            try {
              origSetAttribute('crossorigin', 'anonymous');
            } catch {
              // ignore if attribute cannot be set
            }
          }
          origSetAttribute(name, value);
        };

        const srcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
        if (srcDesc?.set && srcDesc?.get) {
          Object.defineProperty(scriptEl, 'src', {
            configurable: true,
            enumerable: true,
            get() {
              return srcDesc.get!.call(scriptEl);
            },
            set(value: string) {
              if (
                shouldAttachAnonymousCors(String(value || '')) &&
                !scriptEl.hasAttribute('crossorigin')
              ) {
                try {
                  scriptEl.crossOrigin = 'anonymous';
                } catch {
                  // ignore
                }
              }
              srcDesc.set!.call(scriptEl, value);
            },
          });
        }
      }
      return el;
    } as typeof document.createElement;

    document.createElement = patchedCreateElement;
  } catch (err) {
    console.warn('Script CORS guard skipped:', err);
  }

  // 2. Capture truly opaque external cross-origin "Script error." events (no filename,
  //    no Error object, line 0, col 0) caused by third-party iframe/browser extensions so
  //    they do not crash the preview container, while keeping all app errors visible.
  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      const isOpaqueCrossOriginScriptError =
        event.message === 'Script error.' &&
        !event.error &&
        (!event.filename || event.filename === '') &&
        event.lineno === 0 &&
        event.colno === 0;

      if (isOpaqueCrossOriginScriptError) {
        console.warn(
          'Intercepted opaque cross-origin script error (likely external iframe/GAPI callback in preview sandbox).'
        );
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );
}

initRuntimeSafety();
