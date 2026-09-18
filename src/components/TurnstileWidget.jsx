import React, { useEffect, useRef } from 'react';

const SCRIPT_ID = 'cloudflare-turnstile-script';

export default function TurnstileWidget({ siteKey, onToken, onError, resetSignal = 0 }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  onTokenRef.current = onToken;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return undefined;
    let disposed = false;
    const render = () => {
      if (disposed || !window.turnstile || !containerRef.current) return;
      if (widgetIdRef.current !== null) window.turnstile.remove(widgetIdRef.current);
      containerRef.current.replaceChildren();
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(''),
        'error-callback': () => { onTokenRef.current(''); onErrorRef.current?.('驗證元件發生問題，請重新完成驗證。'); },
      });
    };
    const script = document.getElementById(SCRIPT_ID);
    if (window.turnstile) render();
    else if (script) script.addEventListener('load', render, { once: true });
    else {
      const nextScript = document.createElement('script');
      nextScript.id = SCRIPT_ID;
      nextScript.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      nextScript.async = true;
      nextScript.defer = true;
      nextScript.addEventListener('load', render, { once: true });
      nextScript.addEventListener('error', () => onErrorRef.current?.('驗證元件載入失敗，請稍後再試。'), { once: true });
      document.head.appendChild(nextScript);
    }
    return () => {
      disposed = true;
      if (widgetIdRef.current !== null && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [siteKey, resetSignal]);

  return <div className="turnstile-widget" ref={containerRef} aria-label="Cloudflare Turnstile 人機驗證" />;
}
