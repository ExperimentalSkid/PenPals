type FrontPageBirdProps = {
  className?: string;
};

/**
 * A small, decorative front-page flourish. The bird is intentionally kept in
 * one lightweight SVG so it never competes with the real page content or add
 * another image request to the hero.
 */
export default function FrontPageBird({ className }: FrontPageBirdProps) {
  return (
    <div className={`front-page-bird ${className ?? ""}`} aria-hidden="true">
      <svg viewBox="0 0 640 240" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">
        <defs>
          <linearGradient id="bird-wing" x1="250" y1="60" x2="398" y2="128" gradientUnits="userSpaceOnUse">
            <stop stopColor="#60A4E1" />
            <stop offset="1" stopColor="#073A73" />
          </linearGradient>
          <linearGradient id="bird-body" x1="345" y1="100" x2="454" y2="126" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#F1EBDF" />
          </linearGradient>
        </defs>

        <path className="front-page-bird-trail" d="M24 156C87 79 185 86 237 133c38 34 76 43 122 2" stroke="#60A4E1" strokeWidth="3" strokeLinecap="round" strokeDasharray="7 11" opacity=".66" />
        <path d="M181 159c-5-9-19-7-19 3 0 9 11 14 19 21 8-7 19-12 19-21 0-10-14-12-19-3Z" stroke="#60A4E1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity=".48" />

        <path d="M350 111C337 80 339 45 366 15c27 31 39 63 24 91-9 16-24 20-40 5Z" fill="url(#bird-wing)" />
        <path d="M348 114c-33-32-64-48-97-56 19 31 51 59 91 71 18 6 32-1 43-14-14 3-26 3-37-1Z" fill="#60A4E1" opacity=".88" />
        <path d="M354 118c-27 20-58 39-94 46 24-22 46-43 73-58 12-7 23-4 31 12Z" fill="#073A73" />
        <path d="M359 126c-17 23-36 42-58 55 28-9 53-27 72-52-5-1-9-2-14-3Z" fill="#073A73" opacity=".9" />

        <path d="M344 112c22-20 48-29 72-23 15 4 17 13 29 15 13 2 24-4 30-16 0 17-9 29-23 34-16 6-26-3-39 5-21 13-46 9-69-2Z" fill="url(#bird-body)" stroke="#D7E7F4" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M401 99c4-18 19-29 35-28 14 1 25 10 28 23-9-3-17-2-24 2-12 7-23 10-39 3Z" fill="#073A73" />
        <circle cx="438" cy="81" r="3.5" fill="#F8F5EE" />
        <circle cx="439" cy="81" r="1.5" fill="#073A73" />
        <path d="M463 91c10 1 19 3 29 7l-29 7c4-5 4-9 0-14Z" fill="#60A4E1" />
        <path d="M478 98c7 0 13 1 19 2" stroke="#073A73" strokeWidth="2" strokeLinecap="round" opacity=".8" />

        <g className="front-page-bird-letter">
          <image href="/assets/brand/icon/icon-primary.svg" x="486" y="75" width="78" height="59" opacity=".98" transform="rotate(7 525 104.5)" preserveAspectRatio="xMidYMid meet" />
        </g>
        <path d="M572 67l7-17M588 84l15-9M580 105l17 2" stroke="#60A4E1" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </div>
  );
}
