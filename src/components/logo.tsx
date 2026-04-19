import * as React from 'react';

export function Logo({
  className,
  variant = 'default',
  ...props
}: React.SVGProps<SVGSVGElement> & { variant?: 'default' | 'dark' }) {
  const textColor =
    variant === 'dark' ? 'hsl(var(--sidebar-foreground))' : 'hsl(var(--card-foreground))';

  return (
    <svg
      width="218.88"
      height="100.8"
      viewBox="0 0 152 84"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop
            offset="0%"
            style={{ stopColor: 'rgb(59, 130, 246)', stopOpacity: 1 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: 'rgb(45, 212, 191)', stopOpacity: 1 }}
          />
        </linearGradient>
        <linearGradient id="grad2" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop
            offset="0%"
            style={{ stopColor: 'rgb(251, 146, 60)', stopOpacity: 1 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: 'rgb(245, 158, 11)', stopOpacity: 1 }}
          />
        </linearGradient>
      </defs>
      {/* Arrows are narrower so the text stands out */}
      <path d="M76 10 L83.8 26 H68.2 L76 10Z" fill="url(#grad1)" />
      <path d="M76 74 L68.2 58 H83.8 L76 74Z" fill="url(#grad2)" />
      <text
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        fill={textColor}
        fontSize="16"
        fontFamily="Inter, sans-serif"
        fontWeight="bold"
        letterSpacing="1"
      >
        HISTOPAGO
      </text>
    </svg>
  );
}
