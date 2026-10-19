import { useCallback, useEffect, useState } from 'react';
import { asVarbankTab, getActiveVarbankTab } from './api.js';
import { useSettings } from './state/settings.js';
import { useConversations } from './state/conversations.js';
import TablesView from './tables/TablesView.jsx';
import ChatView from './chat/ChatView.jsx';
import SettingsView from './settings/SettingsView.jsx';
import { TextSizeStepper, useApplyTextSize } from './settings/TextSize.jsx';

const VIEWS = [
  ['tables', 'Tables'],
  ['chat', 'Chat'],
  ['settings', 'Settings'],
];

// Geliştirme/test kolaylığı: panel bir sekmede açıldığında ?tabId=N ile hedef sekme seçilebilir.
// Hedefin gerçekten bir Varbank sekmesi olduğu yine doğrulanır.
const pinnedTabId = Number(new URLSearchParams(location.search).get('tabId')) || null;

const WIDE_WINDOW = { width: 760, height: 900 };

function openWideWindow(tabId) {
  chrome.windows.create({
    url: chrome.runtime.getURL(`sidepanel.html?tabId=${tabId}`),
    type: 'popup',
    ...WIDE_WINDOW,
  });
}

async function resolveTab() {
  try {
    return pinnedTabId ? await asVarbankTab(await chrome.tabs.get(pinnedTabId)) : await getActiveVarbankTab();
  } catch {
    return null;
  }
}

export default function App() {
  const [view, setView] = useState('tables');
  const [tab, setTab] = useState(undefined);
  const [pendingData, setPendingData] = useState(null);
  const [settings, updateSettings] = useSettings();
  const store = useConversations(settings?.saveHistory);
  useApplyTextSize(settings?.textSize);

  const refreshTab = useCallback(() => {
    // null = "Varbank sekmesi yok"; undefined yalnızca ilk yükleme. Aynı sekmeyse nesneyi koru
    // (gereksiz yeniden yüklemeyi önler).
    resolveTab().then((t) =>
      setTab((prev) => (prev !== undefined && prev?.id === t?.id && prev?.url === t?.url ? prev : t)),
    );
  }, []);

  useEffect(() => {
    refreshTab();
    const onActivated = () => refreshTab();
    const onUpdated = (_id, info) => (info.status === 'complete' || 'url' in info) && refreshTab();
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.windows.onFocusChanged.addListener(onActivated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.windows.onFocusChanged.removeListener(onActivated);
    };
  }, [refreshTab]);

  const attach = useCallback((data) => {
    setPendingData(data);
    setView('chat');
  }, []);

  if (!settings || tab === undefined) return <p className="empty">Loading…</p>;

  return (
    <div className="app">
      <nav className="tabs" role="tablist">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={view === id ? 'active' : ''}
            onClick={() => setView(id)}
          >
            {label}
            {id === 'chat' && pendingData ? ' •' : ''}
          </button>
        ))}
        <span className="divider" aria-hidden="true" />
        <TextSizeStepper value={settings.textSize} onChange={(textSize) => updateSettings({ textSize })} />
        {/* Chrome yan panel genişliğini eklentiye ayarlatmaz; geniş görünüm için ayrı pencere. */}
        {!pinnedTabId && tab && (
          <button type="button" className="tool" title="Open in a wide window" aria-label="Open in a wide window" onClick={() => openWideWindow(tab.id)}>
            ⧉
          </button>
        )}
      </nav>
      <main>
        {/* Sohbet görünümü sekme değişince de bağlı kalır ki akış kesilmesin. */}
        <div hidden={view !== 'tables'}>
          {/* key yok: sekme algılaması bir an boş dönse de seçimler korunur (TablesView sekme değişimini kendisi izler). */}
          <TablesView tab={tab} onAttach={attach} />
        </div>
        <div hidden={view !== 'chat'} className="fill">
          <ChatView
            settings={settings}
            update={updateSettings}
            store={store}
            pendingData={pendingData}
            setPendingData={setPendingData}
            active={view === 'chat'}
          />
        </div>
        {view === 'settings' && <SettingsView settings={settings} update={updateSettings} onClearHistory={store.removeAll} />}
      </main>
    </div>
  );
}
