import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const shared = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": true
} as const;

export function PlayIcon(props: IconProps) {
  return (
    <svg {...shared} {...props} viewBox="0 0 32 32">
      <path d="M8.75 5.6c0-1.55 1.7-2.5 3.02-1.68l15.15 9.4a3.14 3.14 0 0 1 0 5.36l-15.15 9.4c-1.32.82-3.02-.13-3.02-1.68V5.6Z" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <svg {...shared} {...props} viewBox="0 0 32 32">
      <rect x="8" y="5" width="6" height="22" rx="2" fill="currentColor" />
      <rect x="18" y="5" width="6" height="22" rx="2" fill="currentColor" />
    </svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M3.75 7.25c0-1.1.9-2 2-2h4l2 2h6.5c1.1 0 2 .9 2 2v8.25c0 1.1-.9 2-2 2H5.75c-1.1 0-2-.9-2-2V7.25Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function ExportIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M12 3.5v11m0-11 4 4m-4-4-4 4M5 13.5v4.75c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V13.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M8.25 8.25v10m3.75-10v10m3.75-10v10M5.5 5.5h13M9 5.5l.75-2h4.5l.75 2m2.25 0-.65 15H7.4l-.65-15" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="m14.5 6.5-5.5 5.5 5.5 5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="m9.5 6.5 5.5 5.5-5.5 5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="m8 10 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M5 3.75h11.6L20.25 7.4v12.85H3.75V3.75H5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7 3.75v6h9v-6M7.5 20.25v-6.5h9v6.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function CubeIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="m12 2.8 8 4.6v9.2l-8 4.6-8-4.6V7.4l8-4.6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m4.4 7.6 7.6 4.3 7.6-4.3M12 12v8.7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="m6.5 6.5 11 11m0-11-11 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="m5.5 12.5 4 4 9-9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M12 3.5 21 20H3L12 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 9v5m0 2.7v.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <path d="M4 7h10m4 0h2M4 17h2m4 0h10M14 4v6M10 14v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function FilmIcon(props: IconProps) {
  return (
    <svg {...shared} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 5v14m10-14v14M3 9h4m10 0h4M3 15h4m10 0h4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
