"use client";

// A language can be used across many countries, so these are compact
// representative flags for the language catalogue (not a claim about a
// member's location). Unknown/future catalogue entries keep the neutral globe.
const languageFlagCodes: Record<string, string> = {
  Arabic: "ae",
  Bengali: "bd",
  Bulgarian: "bg",
  Chinese: "cn",
  Czech: "cz",
  Danish: "dk",
  Dutch: "nl",
  English: "gb",
  Finnish: "fi",
  French: "fr",
  German: "de",
  Greek: "gr",
  Hebrew: "il",
  Hindi: "in",
  Hungarian: "hu",
  Icelandic: "is",
  Indonesian: "id",
  Italian: "it",
  Japanese: "jp",
  Korean: "kr",
  Malay: "my",
  Norwegian: "no",
  Persian: "ir",
  Polish: "pl",
  Portuguese: "pt",
  Romanian: "ro",
  Russian: "ru",
  Slovak: "sk",
  Spanish: "es",
  Swedish: "se",
  Tagalog: "ph",
  Thai: "th",
  Turkish: "tr",
  Ukrainian: "ua",
  Urdu: "pk",
  Vietnamese: "vn",
  Swahili: "ke",
};

export default function LanguageFlag({ name }: { name: string }) {
  const code = languageFlagCodes[name];
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 0.35 };

  return <span role="img" aria-label={`${name} flag`} className="inline-flex h-4 w-5 shrink-0 overflow-hidden rounded-[2px] border border-black/10 bg-[#f4f2ec] align-[-2px]">
    <svg viewBox="0 0 20 14" className="h-full w-full" aria-hidden="true">
      {code === "gb" && <><rect width="20" height="14" fill="#183b70" /><path d="M0 0 20 14M20 0 0 14" stroke="#fff" strokeWidth="4" /><path d="M0 0 20 14M20 0 0 14" stroke="#c92b3c" strokeWidth="1.6" /><path d="M10 0v14M0 7h20" stroke="#fff" strokeWidth="4" /><path d="M10 0v14M0 7h20" stroke="#c92b3c" strokeWidth="1.8" /></>}
      {code === "es" && <><rect width="20" height="14" fill="#f6c343" /><rect width="20" height="3.5" fill="#c8323e" /><rect y="10.5" width="20" height="3.5" fill="#c8323e" /></>}
      {code === "pt" && <><rect width="8" height="14" fill="#17724b" /><rect x="8" width="12" height="14" fill="#d54245" /><circle cx="8" cy="7" r="2.4" fill="#f2c84b" /></>}
      {code === "fr" && <><rect width="6.7" height="14" fill="#1d4f91" /><rect x="6.7" width="6.6" height="14" fill="#fff" /><rect x="13.3" width="6.7" height="14" fill="#d8444b" /></>}
      {code === "de" && <><rect width="20" height="4.7" fill="#222" /><rect y="4.7" width="20" height="4.6" fill="#c9474c" /><rect y="9.3" width="20" height="4.7" fill="#e1b84b" /></>}
      {code === "it" && <><rect width="6.7" height="14" fill="#2b8a60" /><rect x="6.7" width="6.6" height="14" fill="#fff" /><rect x="13.3" width="6.7" height="14" fill="#d8444b" /></>}
      {code === "jp" && <><rect width="20" height="14" fill="#fff" /><circle cx="10" cy="7" r="4" fill="#d8444b" /></>}
      {code === "kr" && <><rect width="20" height="14" fill="#fff" /><circle cx="10" cy="7" r="3" fill="#d8444b" /><path d="M10 4a3 3 0 0 0 0 6 3 3 0 0 1 0-6Z" fill="#285a9f" /></>}
      {code === "cn" && <><rect width="20" height="14" fill="#d8444b" /><path d="m4 2 .7 1.5 1.7.2-1.2 1.1.3 1.7L4 5.7 2.5 6.5l.3-1.7L1.6 3.7l1.7-.2Z" fill="#f6c343" /></>}
      {code === "in" && <><rect width="20" height="4.7" fill="#ef9f42" /><rect y="4.7" width="20" height="4.6" fill="#fff" /><rect y="9.3" width="20" height="4.7" fill="#2f875c" /><circle cx="10" cy="7" r="1.3" fill="none" stroke="#2f5a9c" strokeWidth=".7" /></>}
      {code === "ru" && <><rect width="20" height="4.7" fill="#fff" /><rect y="4.7" width="20" height="4.6" fill="#3e6ea9" /><rect y="9.3" width="20" height="4.7" fill="#d8444b" /></>}
      {code === "tr" && <><rect width="20" height="14" fill="#d8444b" /><circle cx="8" cy="7" r="3" fill="#fff" /><circle cx="9.2" cy="7" r="2.4" fill="#d8444b" /><path d="m12 5.2.6 1.3 1.4.1-1.1.9.3 1.4L12 8.2l-1.2.7.3-1.4-1.1-.9 1.4-.1Z" fill="#fff" /></>}
      {code === "ae" && <><rect width="20" height="4.7" fill="#3b8b5d" /><rect y="4.7" width="20" height="4.6" fill="#fff" /><rect y="9.3" width="20" height="4.7" fill="#222" /><rect width="5" height="14" fill="#d8444b" /></>}
      {code === "bd" && <><rect width="20" height="14" fill="#176b4b" /><circle cx="10" cy="7" r="4" fill="#d8444b" /></>}
      {code === "bg" && <><rect width="20" height="4.7" fill="#fff" /><rect y="4.7" width="20" height="4.6" fill="#2f875c" /><rect y="9.3" width="20" height="4.7" fill="#d8444b" /></>}
      {code === "cz" && <><rect width="20" height="7" fill="#fff" /><rect y="7" width="20" height="7" fill="#d8444b" /><path d="M0 0v14l10-7Z" fill="#285a9f" /></>}
      {code === "dk" && <><rect width="20" height="14" fill="#d8444b" /><path d="M6 0v14M0 6.5h20" stroke="#fff" strokeWidth="2.2" /></>}
      {code === "nl" && <><rect width="20" height="4.7" fill="#d8444b" /><rect y="4.7" width="20" height="4.6" fill="#fff" /><rect y="9.3" width="20" height="4.7" fill="#285a9f" /></>}
      {code === "fi" && <><rect width="20" height="14" fill="#fff" /><path d="M6 0v14M0 6.5h20" stroke="#285a9f" strokeWidth="2.3" /></>}
      {code === "gr" && <><rect width="20" height="14" fill="#285a9f" /><path d="M0 3h20M0 6h20M0 9h20M0 12h20" stroke="#fff" strokeWidth="1.4" /><rect width="8" height="8" fill="#285a9f" /><path d="M4 0v8M0 4h8" stroke="#fff" strokeWidth="1.7" /></>}
      {code === "il" && <><rect width="20" height="14" fill="#fff" /><rect y="1.5" width="20" height="2.2" fill="#285a9f" /><rect y="10.3" width="20" height="2.2" fill="#285a9f" /><path d="m10 3.8 2.5 4.2L10 12.2 7.5 8Z" fill="none" stroke="#285a9f" strokeWidth="1.1" /></>}
      {code === "hu" && <><rect width="20" height="4.7" fill="#d8444b" /><rect y="4.7" width="20" height="4.6" fill="#fff" /><rect y="9.3" width="20" height="4.7" fill="#2f875c" /></>}
      {code === "is" && <><rect width="20" height="14" fill="#285a9f" /><path d="M6 0v14M0 6.5h20" stroke="#fff" strokeWidth="4" /><path d="M6 0v14M0 6.5h20" stroke="#d8444b" strokeWidth="1.8" /></>}
      {code === "id" && <><rect width="20" height="7" fill="#d8444b" /><rect y="7" width="20" height="7" fill="#fff" /></>}
      {code === "my" && <><rect width="20" height="14" fill="#d8444b" /><path d="M0 2h20M0 5h20M0 8h20M0 11h20" stroke="#fff" strokeWidth="1.8" /><path d="M0 0h9v8H0Z" fill="#285a9f" /><circle cx="4.2" cy="4" r="2.1" fill="#f6c343" /></>}
      {code === "no" && <><rect width="20" height="14" fill="#d8444b" /><path d="M6 0v14M0 6.5h20" stroke="#fff" strokeWidth="4" /><path d="M6 0v14M0 6.5h20" stroke="#285a9f" strokeWidth="1.8" /></>}
      {code === "ir" && <><rect width="20" height="4.7" fill="#2f875c" /><rect y="4.7" width="20" height="4.6" fill="#fff" /><rect y="9.3" width="20" height="4.7" fill="#d8444b" /><path d="M10 5.5v3M8.5 7h3M9 6l2 2M11 6 9 8" stroke="#d8444b" strokeWidth=".55" /></>}
      {code === "pl" && <><rect width="20" height="7" fill="#fff" /><rect y="7" width="20" height="7" fill="#d8444b" /></>}
      {code === "ro" && <><rect width="6.7" height="14" fill="#285a9f" /><rect x="6.7" width="6.6" height="14" fill="#f6c343" /><rect x="13.3" width="6.7" height="14" fill="#d8444b" /></>}
      {code === "sk" && <><rect width="20" height="4.7" fill="#fff" /><rect y="4.7" width="20" height="4.6" fill="#285a9f" /><rect y="9.3" width="20" height="4.7" fill="#d8444b" /><path d="m5 5 2 1.5v3.2c0 1.1-.8 2-2 2.5-1.2-.5-2-1.4-2-2.5V6.5Z" fill="#d8444b" stroke="#fff" strokeWidth=".45" /></>}
      {code === "se" && <><rect width="20" height="14" fill="#285a9f" /><path d="M6 0v14M0 6.5h20" stroke="#f6c343" strokeWidth="2.2" /></>}
      {code === "ph" && <><rect width="20" height="7" fill="#285a9f" /><rect y="7" width="20" height="7" fill="#d8444b" /><path d="M0 0 10 7 0 14Z" fill="#fff" /><circle cx="3.2" cy="7" r="1" fill="#f6c343" /></>}
      {code === "th" && <><rect width="20" height="14" fill="#d8444b" /><rect y="2.3" width="20" height="9.4" fill="#fff" /><rect y="4.2" width="20" height="5.6" fill="#285a9f" /></>}
      {code === "ua" && <><rect width="20" height="7" fill="#285a9f" /><rect y="7" width="20" height="7" fill="#f6c343" /></>}
      {code === "pk" && <><rect width="20" height="14" fill="#176b4b" /><rect width="4" height="14" fill="#fff" /><circle cx="11" cy="7" r="3" fill="#fff" /><circle cx="12" cy="6" r="3" fill="#176b4b" /><path d="m14 4 .5 1.1 1.2.1-.9.7.3 1.2-1.1-.6-1 .6.3-1.2-.9-.7 1.2-.1Z" fill="#fff" /></>}
      {code === "vn" && <><rect width="20" height="14" fill="#d8444b" /><path d="m10 2.5.9 2.8h3l-2.4 1.7.9 2.8L10 8.1 7.6 9.8l.9-2.8-2.4-1.7h3Z" fill="#f6c343" /></>}
      {code === "ke" && <><rect width="20" height="4.7" fill="#222" /><rect y="4.7" width="20" height="4.6" fill="#d8444b" /><rect y="9.3" width="20" height="4.7" fill="#2f875c" /><path d="M8 3 12 11M12 3 8 11" stroke="#fff" strokeWidth="1.1" /></>}
      {!code && <><circle cx="10" cy="7" r="5.5" fill="#e5ebe4" stroke="#658273" strokeWidth=".8" /><path d="M4.5 7h11M10 1.5c1.4 1.5 2.1 3.4 2.1 5.5S11.4 11 10 12.5C8.6 11 7.9 9.1 7.9 7S8.6 3 10 1.5Z" {...common} /></>}
    </svg>
  </span>;
}
