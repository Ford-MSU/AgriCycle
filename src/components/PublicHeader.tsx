import React, { useState } from 'react';
import { Menu, X, LogIn } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { Button } from './ui/Button';

interface PublicHeaderProps {
  onNavigateSection: (sectionId: string) => void;
  activeSection?: string;
}

const PUBLIC_NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'gis-map', label: 'GIS Map' },
  { id: 'validated-records', label: 'Validated Records' },
  { id: 'aggregation-summaries', label: 'Aggregation' },
  { id: 'planning-reports', label: 'Reports' },
];

export const PublicHeader: React.FC<PublicHeaderProps> = ({
  onNavigateSection,
  activeSection,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (id: string) => {
    setMobileMenuOpen(false);
    onNavigateSection(id);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-sm border-b border-[#E2EAE3]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => handleNavClick('overview')}
          className="flex items-center text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006B45] rounded-lg py-1 cursor-pointer"
          aria-label="AgriCycle Overview"
        >
          <BrandLogo variant="header" size="md" />
        </button>

        {/* Desktop Single-Row Horizontal Navigation */}
        <nav
          aria-label="Public Planning Navigation"
          className="hidden lg:flex items-center gap-1"
        >
          {PUBLIC_NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#EAF4EC] text-[#006B45] font-semibold'
                    : 'text-[#64756A] hover:text-[#1E3328] hover:bg-[#F7FAF7]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right Action + Mobile Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            onClick={() => handleNavClick('access-workspace')}
            icon={<LogIn size={15} />}
          >
            Sign In
          </Button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="lg:hidden p-2 rounded-lg text-[#1E3328] hover:bg-[#EAF4EC] border border-[#E2EAE3] transition-colors cursor-pointer"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Compact Top Dropdown Navigation on Mobile / Tablet (No Left Sidebar) */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-[#E2EAE3] bg-white px-4 py-3 space-y-1 shadow-sm">
          {PUBLIC_NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#EAF4EC] text-[#006B45] font-semibold'
                    : 'text-[#1E3328] hover:bg-[#F7FAF7]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
