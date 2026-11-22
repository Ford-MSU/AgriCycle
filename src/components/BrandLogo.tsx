import React, { useState } from 'react';
import { Leaf } from 'lucide-react';
import { cn } from '../utils/cn';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  subtitle?: string;
  className?: string;
}

const SIZE_MAP = {
  sm: 'h-8 w-auto',
  md: 'h-10 w-auto',
  lg: 'h-14 w-auto',
  xl: 'h-20 w-auto',
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showText = false,
  subtitle,
  className,
}) => {
  const [imgError, setImgError] = useState(false);
  const logoSrc = `${import.meta.env.BASE_URL}assets/aistudio/AgriCycle_Logo_88669f33.png`;

  return (
    <div className={cn('inline-flex items-center gap-2.5 shrink-0', className)}>
      {!imgError ? (
        <img
          src={logoSrc}
          alt="AgriCycle official logo"
          onError={() => setImgError(true)}
          className={cn('object-contain select-none shrink-0', SIZE_MAP[size])}
        />
      ) : (
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#EAF4EC] text-[#006B45] border border-[#E2EAE3] shrink-0">
          <Leaf size={22} />
        </div>
      )}

      {showText && (
        <div className="min-w-0 leading-tight">
          <span className="block font-bold tracking-tight text-[#1E3328] text-base sm:text-lg whitespace-nowrap">
            Agri<span className="text-[#48A818]">Cycle</span>
          </span>
          {subtitle && (
            <span className="block text-[11px] font-medium text-[#64756A] truncate">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
