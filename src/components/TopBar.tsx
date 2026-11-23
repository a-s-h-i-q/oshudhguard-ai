import React from 'react';

export type ActiveTab = 'scanner' | 'blister' | 'caregiver' | 'dgda';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onNewScan: () => void;
  lang: 'en' | 'bn';
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onNewScan,
  lang,
}) => {
  const navItems: Array<{ id: ActiveTab; labelEn: string; labelBn: string }> = [
    { id: 'scanner', labelEn: 'Rx Scanner', labelBn: 'প্রেসক্রিপশন' },
    { id: 'blister', labelEn: 'Blister Check', labelBn: 'পাতা যাচাই' },
    { id: 'caregiver', labelEn: 'Caregiver Card', labelBn: 'ওষুধের কার্ড' },
    { id: 'dgda', labelEn: 'DGDA Index', labelBn: 'ওষুধের তালিকা' },
  ];

  return (
    <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-13 sm:h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('scanner')}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 cursor-pointer"
        >
          OshudhGuard AI
        </button>

        {/* Zone 2: 4 Concise Single-Line Navigation Links */}
        <nav
          aria-label="Primary Workspace Views"
          className="hidden md:flex items-center gap-7"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectTab(item.id)}
                className={`relative py-5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                  isActive
                    ? 'text-teal-800'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lang === 'bn' ? item.labelBn : item.labelEn}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-teal-700"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onNewScan}
            className="px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            {lang === 'bn' ? 'নতুন স্ক্যান' : 'New Scan'}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Bar (compact single row, strictly below 15% mobile sticky cap) */}
      <nav
        aria-label="Mobile Workspace Views"
        className="md:hidden border-t border-slate-100 px-3 flex items-center justify-between overflow-x-auto"
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectTab(item.id)}
              className={`py-2 px-2 text-xs font-semibold whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                isActive
                  ? 'border-teal-700 text-teal-800'
                  : 'border-transparent text-slate-600'
              }`}
            >
              {lang === 'bn' ? item.labelBn : item.labelEn}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
