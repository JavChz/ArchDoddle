import React, { useId } from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 28, className = '' }) => {
  const uid = useId().replace(/:/g, '');
  const bgId = `arch-bg-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label="ArchDoddle"
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0F172A" />
          <stop offset="100%" stopColor="#1E293B" />
        </linearGradient>
      </defs>
      <rect
        x="16"
        y="16"
        width="480"
        height="480"
        rx="112"
        fill={`url(#${bgId})`}
        stroke="#334155"
        strokeWidth="12"
      />
      <g
        fill="none"
        stroke="#F1F5F9"
        strokeWidth="30"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M132 378 L256 122 L380 378" />
        <line x1="176.5" y1="286" x2="335.5" y2="286" />
      </g>
      <circle cx="256" cy="286" r="22" fill="#0F172A" stroke="#38BDF8" strokeWidth="10" />
      <rect
        x="208"
        y="90"
        width="96"
        height="66"
        rx="18"
        fill="#38BDF8"
        stroke="#0F172A"
        strokeWidth="12"
      />
      <rect
        x="84"
        y="345"
        width="96"
        height="66"
        rx="18"
        fill="#818CF8"
        stroke="#0F172A"
        strokeWidth="12"
      />
      <rect
        x="332"
        y="345"
        width="96"
        height="66"
        rx="18"
        fill="#2DD4BF"
        stroke="#0F172A"
        strokeWidth="12"
      />
    </svg>
  );
};
