interface Widgets {
  createTimeline: (source: { sourceType: "url"; url: string }, element: HTMLElement, options: object) => Promise<HTMLElement | undefined>;
  createTweet: (id: string, element: HTMLElement, options: object) => Promise<HTMLElement | undefined>;
}

function availableWidgets(): Widgets | undefined {
  const widgets = (window as Window & { twttr?: { widgets?: Widgets } }).twttr?.widgets;
  return typeof widgets?.createTimeline === "function" && typeof widgets?.createTweet === "function" ? widgets : undefined;
}

let scriptTask: Promise<Widgets> | undefined;
/** Called only following an explicit action to load content from X. */
export function loadWidgets(): Promise<Widgets> {
  const existing = availableWidgets();
  if (existing) return Promise.resolve(existing);
  if (scriptTask) return scriptTask;
  scriptTask = new Promise<Widgets>((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const finish = (widgets?: Widgets) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (widgets) resolve(widgets);
      else { script.remove(); reject(new Error("X widgets are unavailable.")); }
    };
    const timeout = setTimeout(() => finish(), 8000);
    script.src = "https://platform.twitter.com/widgets.js";
    script.async = true;
    script.onload = () => finish(availableWidgets());
    script.onerror = () => finish();
    document.head.appendChild(script);
  }).catch((error) => { scriptTask = undefined; throw error; });
  return scriptTask;
}
