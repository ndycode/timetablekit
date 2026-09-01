import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      {...props}
    >
      <path
        d="M2.75 8h10.5m-4-4 4 4-4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      {...props}
    >
      <path
        d="M4.25 11.75 11.75 4.25m-5.5 0h5.5v5.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 20 20"
      width="18"
      height="18"
      {...props}
    >
      <path
        d="M10 2.25 16 4.5v4.75c0 3.75-2.25 6.75-6 8.5-3.75-1.75-6-4.75-6-8.5V4.5l6-2.25Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="m7.25 9.75 1.75 1.75 3.75-4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      {...props}
    >
      <rect x="4" y="4" width="8" height="8" rx="1" />
    </svg>
  );
}

export function RotateCcwIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      {...props}
    >
      <path
        d="M3.25 5.75A5 5 0 1 1 3 9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <path
        d="M3.25 2.75v3h3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      {...props}
    >
      <path
        d="M10 13.75V3.5m0 0L6.5 7M10 3.5 13.5 7M4 11.75v2.5A2.25 2.25 0 0 0 6.25 16.5h7.5A2.25 2.25 0 0 0 16 14.25v-2.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      {...props}
    >
      <path
        d="m3 6 5 5 5-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 20 20"
      width="18"
      height="18"
      {...props}
    >
      <path
        d="m9.03 3.5-6.5 11.25a1.5 1.5 0 0 0 1.3 2.25h13.34a1.5 1.5 0 0 0 1.3-2.25L11.97 3.5a1.5 1.5 0 0 0-2.94 0Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M10 7v3.25m0 2.5v.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 20 20"
      width="18"
      height="18"
      {...props}
    >
      <circle
        cx="10"
        cy="10"
        r="7.75"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="m6.75 10 2.25 2.25 4.25-4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 20 20"
      width="18"
      height="18"
      {...props}
    >
      <circle
        cx="10"
        cy="10"
        r="7.75"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M10 9.25v4m0-6.5v-.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      {...props}
    >
      <path
        d="M8 2.5v7m0 0 2.75-2.75M8 9.5 5.25 6.75M3 10.75v1.5A1.25 1.25 0 0 0 4.25 13.5h7.5A1.25 1.25 0 0 0 13 12.25v-1.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function ClipboardIcon(props: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      {...props}
    >
      <rect
        x="4.25"
        y="3.25"
        width="8"
        height="9.5"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M6.25 3.25v-.5h3.5v.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
