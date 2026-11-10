import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// 새 버전이 배포되면 앱을 자동으로 새로고침해서 최신 코드를 바로 받도록 함 (양궁 앱과 동일)
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    setInterval(() => registration.update(), 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update();
    });
  },
});

let refreshingForUpdate = false;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (refreshingForUpdate) return;
  refreshingForUpdate = true;
  window.location.reload();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
