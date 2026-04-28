export type MobileTab = 'message' | 'notification' | 'tasks' | 'settings' | 'more';

interface Props {
  active: MobileTab;
  onSelect: (tab: MobileTab) => void;
}

interface TabDef {
  id: MobileTab;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: 'message', label: 'Message', icon: '💬' },
  { id: 'notification', label: 'Notification', icon: '🔔' },
  { id: 'tasks', label: 'Tasks', icon: '✅' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
  { id: 'more', label: 'More', icon: '…' },
];

// MobileTabBar renders the bottom navigation described in PROPOSAL.md
// section 4.2. It is rendered by AppShell when the layout drops to the
// single-column mobile view (≤768 px).
export function MobileTabBar({ active, onSelect }: Props) {
  return (
    <nav className="mobile-tabbar" aria-label="Mobile navigation" data-testid="mobile-tabbar">
      {TABS.map((t) => (
        <button
          type="button"
          key={t.id}
          className={`mobile-tabbar__item${t.id === active ? ' mobile-tabbar__item--active' : ''}`}
          onClick={() => onSelect(t.id)}
          aria-current={t.id === active ? 'page' : undefined}
          data-testid={`mobile-tab-${t.id}`}
        >
          <span className="mobile-tabbar__icon" aria-hidden>
            {t.icon}
          </span>
          <span className="mobile-tabbar__label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
