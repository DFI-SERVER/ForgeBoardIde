// icons.tsx — bespoke 1.5px stroke icons in the ForgeBoard line-art style.
// All use currentColor; 24×24 viewBox. Ported from the Claude Design handoff.

import type { JSX } from "preact";

export interface IconProps {
  size?: number;
  style?: JSX.CSSProperties;
}

const ic =
  (path: JSX.Element, vb = "0 0 24 24") =>
  ({ size = 18, style }: IconProps) =>
    (
      <svg
        width={size}
        height={size}
        viewBox={vb}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={style}
      >
        {path}
      </svg>
    );

export const IconBack = ic(<path d="M14 6l-6 6 6 6" />);
export const IconClose = ic(<path d="M6 6l12 12M18 6L6 18" />);
export const IconMenu = ic(<path d="M4 7h16M4 12h16M4 17h16" />);
export const IconPlus = ic(<path d="M12 5v14M5 12h14" />);
export const IconSearch = ic(
  <>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4-4" />
  </>
);
export const IconFile = ic(
  <>
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v4h4" />
  </>
);
export const IconFolder = ic(
  <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
);
export const IconPlay = ic(<path d="M7 4l13 8-13 8z" />);
export const IconUpload = ic(
  <>
    <path d="M12 17V5" />
    <path d="M6 11l6-6 6 6" />
    <path d="M4 20h16" />
  </>
);
export const IconBolt = ic(<path d="M13 3L5 14h6l-1 7 8-11h-6z" />);
export const IconStop = ic(<rect x="6" y="6" width="12" height="12" rx="1" />);
export const IconTrash = ic(
  <>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
  </>
);
export const IconBoard = ic(
  <>
    <rect x="3" y="6" width="18" height="12" rx="1" />
    <circle cx="8" cy="10" r="1" />
    <circle cx="12" cy="10" r="1" />
    <circle cx="16" cy="10" r="1" />
    <path d="M3 14h18" />
  </>
);
export const IconChip = ic(
  <>
    <rect x="6" y="6" width="12" height="12" rx="1" />
    <path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3" />
  </>
);
export const IconUSB = ic(
  <>
    <path d="M12 3v15" />
    <path d="M12 18a3 3 0 003-3v-3l-3-2" />
    <path d="M9 6l3-3 3 3" />
    <circle cx="9" cy="14" r="1.2" />
  </>
);
export const IconWifi = ic(
  <>
    <path d="M3 9a14 14 0 0118 0" />
    <path d="M6 12.5a10 10 0 0112 0" />
    <path d="M9 16a6 6 0 016 0" />
    <circle cx="12" cy="19" r="0.8" fill="currentColor" />
  </>
);
export const IconCheck = ic(<path d="M5 12l5 5L20 6" />);
export const IconChevR = ic(<path d="M10 6l6 6-6 6" />);
export const IconChevD = ic(<path d="M6 10l6 6 6-6" />);
export const IconDot = ic(<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />);
export const IconSettings = ic(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.4.8a7 7 0 00-2.1-1.2L14 3h-4l-.4 2.5a7 7 0 00-2.1 1.2l-2.4-.8-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-.8a7 7 0 002.1 1.2L10 21h4l.4-2.5a7 7 0 002.1-1.2l2.4.8 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" />
  </>
);
export const IconCode = ic(<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 4l-4 16" />);
export const IconUndo = ic(
  <>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 010 12h-3" />
  </>
);
export const IconRedo = ic(
  <>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H10a6 6 0 000 12h3" />
  </>
);
export const IconTerm = ic(
  <>
    <rect x="3" y="4" width="18" height="16" rx="1" />
    <path d="M7 9l3 3-3 3M13 15h4" />
  </>
);
export const IconRefresh = ic(
  <>
    <path d="M4 12a8 8 0 0114-5l2-2v6h-6l2-2a6 6 0 100 8" />
    <path d="M20 12a8 8 0 01-14 5" />
  </>
);
export const IconLibrary = ic(
  <>
    <path d="M5 4h3v16H5zM10 4h3v16h-3z" />
    <path d="M16.5 5l3 .8-3.2 14.4-3-.8z" />
  </>
);
export const IconDownload = ic(
  <>
    <path d="M12 4v10" />
    <path d="M8 11l4 4 4-4" />
    <path d="M5 19h14" />
  </>
);
export const IconSave = ic(
  <>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8 4v5h7V4" />
    <path d="M8 14h8v6H8z" />
  </>
);
export const IconDot2 = ic(<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />);
export const IconDots = ic(
  <>
    <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </>
);
export const IconCopy = ic(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 012-2h8" />
  </>
);
export const IconShare = ic(
  <>
    <path d="M12 14V4" />
    <path d="M8 8l4-4 4 4" />
    <path d="M5 12v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
  </>
);
export const IconEdit = ic(
  <>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M14 6l4 4" />
  </>
);
