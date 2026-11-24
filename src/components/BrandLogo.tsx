import React, { useState } from 'react';
import { cn } from '../utils/cn';

export type BrandLogoVariant = 'header' | 'sidebar' | 'icon';
export type BrandLogoSize = 'sm' | 'md' | 'lg' | 'xl';

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  size?: BrandLogoSize;
  showText?: boolean;
  subtitle?: string;
  alt?: string;
  className?: string;
}

const VARIANT_SIZE_CLASSES: Record<BrandLogoVariant, Record<BrandLogoSize, string>> = {
  header: {
    sm: 'h-8 w-auto max-w-[140px]',
    md: 'h-10 w-auto max-w-[160px]',
    lg: 'h-12 w-auto max-w-[200px]',
    xl: 'h-16 w-auto max-w-[240px]',
  },
  sidebar: {
    sm: 'h-11 w-11',
    md: 'h-16 w-16',
    lg: 'h-20 w-20',
    xl: 'h-24 w-24',
  },
  icon: {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-14 w-14',
    xl: 'h-20 w-20',
  },
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'icon',
  size = 'md',
  showText = false,
  subtitle,
  alt,
  className,
}) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const baseUrl = import.meta.env.BASE_URL || './';

  const assetConfig =
    variant === 'header'
      ? {
          src: `${baseUrl}assets/branding/AgriCycle_Header_Logo_400x150.png`,
          srcSet: `${baseUrl}assets/branding/AgriCycle_Header_Logo_400x150.png 1x, ${baseUrl}assets/branding/AgriCycle_Header_Logo_400x150@2x.png 2x`,
          defaultAlt: 'AgriCycle official horizontal logo',
          width: 400,
          height: 150,
          includesWordmark: true,
        }
      : variant === 'sidebar'
      ? {
          src: `${baseUrl}assets/branding/AgriCycle_Sidebar_Logo_200x200.png`,
          srcSet: `${baseUrl}assets/branding/AgriCycle_Sidebar_Logo_200x200.png 1x, ${baseUrl}assets/branding/AgriCycle_Sidebar_Logo_200x200@2x.png 2x`,
          defaultAlt: 'AgriCycle official sidebar logo',
          width: 200,
          height: 200,
          includesWordmark: true,
        }
      : {
          src: `${baseUrl}assets/branding/AgriCycle_App_Icon_512x512.png`,
          srcSet: undefined,
          defaultAlt: 'AgriCycle official emblem',
          width: 512,
          height: 512,
          includesWordmark: false,
        };

  const hasError = failedSrc === assetConfig.src;
  const shouldRenderWordmark = showText && !assetConfig.includesWordmark;

  const handleImageError = () => {
    if (failedSrc === assetConfig.src) return;
    if (import.meta.env.DEV) {
      console.error(`[BrandLogo] Failed to load official branding asset: ${assetConfig.src}`);
    } else {
      console.warn(`[BrandLogo] Branding asset failed to load: ${assetConfig.src}`);
    }
    setFailedSrc(assetConfig.src);
  };

  return (
    <div className={cn('inline-flex items-center gap-2.5 shrink-0', className)}>
      {!hasError ? (
        <img
          src={assetConfig.src}
          srcSet={assetConfig.srcSet}
          width={assetConfig.width}
          height={assetConfig.height}
          alt={alt || assetConfig.defaultAlt}
          onError={handleImageError}
          draggable={false}
          className={cn(
            'object-contain select-none shrink-0',
            VARIANT_SIZE_CLASSES[variant][size]
          )}
        />
      ) : (
        <div
          role="img"
          aria-label={alt || 'AgriCycle'}
          data-logo-error={assetConfig.src}
          title={import.meta.env.DEV ? `Logo asset failed to load: ${assetConfig.src}` : 'AgriCycle'}
          className={cn(
            'inline-flex items-center justify-center rounded-lg bg-[#F7FAF7] text-[#1E3328] border border-[#E2EAE3] font-bold tracking-tight shrink-0 px-2.5',
            VARIANT_SIZE_CLASSES[variant][size]
          )}
        >
          <span className="text-xs whitespace-nowrap">
            {assetConfig.includesWordmark ? 'AgriCycle' : 'AC'}
          </span>
        </div>
      )}

      {(shouldRenderWordmark || subtitle) && (
        <div className="min-w-0 leading-tight">
          {shouldRenderWordmark && (
            <span className="block font-bold tracking-tight text-[#1E3328] text-base sm:text-lg whitespace-nowrap">
              Agri<span className="text-[#48A818]">Cycle</span>
            </span>
          )}
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
