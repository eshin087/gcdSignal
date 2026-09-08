// Single source of truth for the inline HTML and its report-only CSP hashes.
export const THEME_SCRIPT =
  "(function(){var t;try{t=localStorage.getItem('gcdsignal:theme')}catch(e){}document.documentElement.classList.toggle('dark',t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))})()";
export const TEXT_SCRIPT =
  "(function(){try{var t=JSON.parse(localStorage.getItem('gcdsignal:prefs')||'{}').textScale;if(t==='sm'||t==='lg'||t==='xl')document.documentElement.setAttribute('data-text',t)}catch(e){}})()";
