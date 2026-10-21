import { cn } from "@/lib/utils/cn";

export type LandscapeVariant = "hills" | "farmland" | "peaks" | "city";

/** Original SVG landscapes used for class cards, so each card is visually distinct. */
export function LandscapeArt({ variant, className }: { variant: LandscapeVariant; className?: string }) {
  return (
    <svg
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMid slice"
      className={cn("h-full w-full", className)}
      aria-hidden
    >
      {variant === "hills" && (
        <>
          <rect width="400" height="200" fill="#bfe0ec" />
          <circle cx="320" cy="48" r="22" fill="#fff6d6" />
          <path d="M0 120l70-52 60 44 70-60 90 70 110-40v98H0Z" fill="#6f9d86" />
          <path d="M0 150c60-30 120-20 190 0s140 10 210-18v68H0Z" fill="#3f7f4f" />
          <path d="M0 178c80-16 140-8 220 4s120 4 180-8v26H0Z" fill="#2c6a3e" />
        </>
      )}
      {variant === "farmland" && (
        <>
          <rect width="400" height="200" fill="#d8ecf3" />
          <path d="M0 96c80-22 150-16 220-2s130 6 180-6v112H0Z" fill="#7fb24e" />
          <path d="M0 130l400-18v90H0Z" fill="#a9cd5d" />
          <path d="M0 152l400-14v62H0Z" fill="#8fbd47" />
          <path d="M0 176l400-10v34H0Z" fill="#6aa23b" />
          <g stroke="#fff" strokeWidth="2" strokeLinecap="round">
            <path d="M300 92v-26M300 66l-14-6M300 66l14-6M300 66l0-16" />
            <path d="M350 98v-22M350 76l-12-5M350 76l12-5" />
          </g>
        </>
      )}
      {variant === "peaks" && (
        <>
          <rect width="400" height="200" fill="#cfe3f0" />
          <path d="M0 150l80-90 40 40 70-80 80 100 60-50 70 70v60H0Z" fill="#7c93a8" />
          <path d="M190 20l-34 44 20-8 14 14 12-12 20 8-32-46Z" fill="#fff" />
          <path d="M80 60l-22 26 14-4 8 8 10-6 10 6-20-30Z" fill="#fff" />
          <path d="M0 170c70-12 130-8 200 2s130 4 200-8v36H0Z" fill="#41667a" />
        </>
      )}
      {variant === "city" && (
        <>
          <rect width="400" height="200" fill="#c8def0" />
          <path d="M0 140l80-60 70 44 70-70 90 80 90-40v46H0Z" fill="#8aa1b6" opacity=".7" />
          <g fill="#2f4a5e">
            <rect x="40" y="96" width="30" height="104" />
            <rect x="78" y="70" width="26" height="130" />
            <rect x="112" y="108" width="34" height="92" />
            <rect x="156" y="56" width="28" height="144" />
            <rect x="192" y="90" width="36" height="110" />
            <rect x="238" y="66" width="26" height="134" />
            <rect x="272" y="104" width="32" height="96" />
            <rect x="314" y="80" width="30" height="120" />
          </g>
          <g fill="#f2d98a" opacity=".85">
            <rect x="48" y="108" width="5" height="7" />
            <rect x="60" y="124" width="5" height="7" />
            <rect x="86" y="86" width="5" height="7" />
            <rect x="164" y="72" width="5" height="7" />
            <rect x="246" y="84" width="5" height="7" />
            <rect x="322" y="98" width="5" height="7" />
          </g>
          <rect y="184" width="400" height="16" fill="#1f3646" />
        </>
      )}
    </svg>
  );
}
