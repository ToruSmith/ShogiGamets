import { lazy, Suspense, useEffect } from 'react';
import { KomaDefs } from './board/Piece.tsx';
import { useRoute } from './router.ts';
import { applyTheme, settingsStore } from './state/settings.ts';
import { useStore } from './state/store.ts';
import { HomeView } from './views/HomeView.tsx';

// 首頁以外的畫面按需載入，首次開啟比較快
const PlayRoute = lazy(() =>
  import('./views/PlayView.tsx').then((m) => ({ default: m.PlayRoute })),
);
const ReviewView = lazy(() =>
  import('./views/ReviewView.tsx').then((m) => ({ default: m.ReviewView })),
);
const TsumeList = lazy(() =>
  import('./views/TsumeView.tsx').then((m) => ({ default: m.TsumeList })),
);
const TsumeView = lazy(() =>
  import('./views/TsumeView.tsx').then((m) => ({ default: m.TsumeView })),
);
const RecordsView = lazy(() =>
  import('./views/RecordsView.tsx').then((m) => ({ default: m.RecordsView })),
);
const OnlineView = lazy(() =>
  import('./views/OnlineView.tsx').then((m) => ({ default: m.OnlineView })),
);
const RoomRoute = lazy(() =>
  import('./views/OnlineView.tsx').then((m) => ({ default: m.RoomRoute })),
);
const SettingsView = lazy(() =>
  import('./views/SettingsView.tsx').then((m) => ({ default: m.SettingsView })),
);

export function App() {
  const route = useRoute();
  const settings = useStore(settingsStore);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);
  useEffect(() => {
    document.documentElement.lang = settings.locale === 'zh-TW' ? 'zh-Hant' : 'en';
  }, [settings.locale]);

  const [page, param] = route;
  let view;
  switch (page) {
    case 'play':
      view = <PlayRoute />;
      break;
    case 'review':
      view = <ReviewView id={param ?? ''} />;
      break;
    case 'tsume':
      view = param ? <TsumeView id={Number(param)} /> : <TsumeList />;
      break;
    case 'records':
      view = <RecordsView />;
      break;
    case 'online':
      view = <OnlineView />;
      break;
    case 'r':
      view = <RoomRoute code={param ?? ''} />;
      break;
    case 'settings':
      view = <SettingsView />;
      break;
    default:
      view = <HomeView />;
  }

  return (
    <>
      <KomaDefs />
      <Suspense fallback={<div className="gutter py-10 text-sm text-muted-foreground">…</div>}>
        {view}
      </Suspense>
    </>
  );
}
