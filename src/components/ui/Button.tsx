import React from 'react';
import { cn } from '../../utils/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, icon, children, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006B45] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer';

    const variants = {
      primary: 'bg-[#006B45] text-white hover:bg-[#005838] shadow-xs',
      secondary: 'bg-[#EAF4EC] text-[#006B45] hover:bg-[#DCEEE0] border border-[#E2EAE3]',
      outline: 'border border-[#E2EAE3] bg-white hover:bg-[#EAF4EC] hover:border-[#006B45]/40 text-[#1E3328] hover:text-[#006B45]',
      ghost: 'hover:bg-[#EAF4EC] text-[#1E3328] hover:text-[#006B45]',
      danger: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200',
      gold: 'bg-[#E8A800] text-[#1E3328] hover:bg-[#D49700] shadow-xs',
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs gap-1.5',
      md: 'h-10 px-4 py-2 gap-2',
      lg: 'h-11 px-6 py-2.5 text-base gap-2',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading ? (
          <svg
            className="animate-spin h-4 w-4 text-current shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : icon ? (
          <span className="inline-flex items-center shrink-0">{icon}</span>
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
