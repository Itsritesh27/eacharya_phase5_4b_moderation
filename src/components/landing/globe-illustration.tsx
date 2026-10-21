/** Original SVG Earth illustration (no external images, so it can never 404). */
export function GlobeIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 520"
      className={className}
      role="img"
      aria-label="Illustration of the Earth with continents and mountain ranges"
    >
      <defs>
        <radialGradient id="ocean" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#3b8fb0" />
          <stop offset="0.6" stopColor="#1d5f86" />
          <stop offset="1" stopColor="#0d3552" />
        </radialGradient>
        <radialGradient id="shade" cx="30%" cy="28%" r="85%">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#031a14" stopOpacity="0.55" />
        </radialGradient>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0.82" stopColor="#80c9a9" stopOpacity="0.35" />
          <stop offset="1" stopColor="#80c9a9" stopOpacity="0" />
        </radialGradient>
        <clipPath id="disc">
          <circle cx="260" cy="260" r="200" />
        </clipPath>
      </defs>

      <circle cx="260" cy="260" r="248" fill="url(#glow)" />
      <circle cx="260" cy="260" r="200" fill="url(#ocean)" />

      <g clipPath="url(#disc)">
        {/* Eurasia / Africa style landmasses (stylised, not to scale) */}
        <path
          d="M250 90c28-14 66-8 92 10 20 14 38 12 56 30 10 10 6 24-8 30-14 6-12 20-30 22-20 2-26-12-44-10-22 2-30 18-52 12-18-5-14-24-32-28-20-4-34 6-46-8-12-14 2-34 18-44 12-8 24-8 46-14Z"
          fill="#5e9a4d"
        />
        <path
          d="M236 230c22-8 52-4 66 14 12 16 6 36 14 56 8 22 26 36 18 62-8 24-34 36-56 30-22-6-30-30-34-50-4-22-20-34-24-56-4-20 4-48 16-56Z"
          fill="#b69a55"
        />
        <path
          d="M96 200c18-16 48-18 68-6 16 10 14 30 2 42-14 14-12 32-30 40-20 8-44-4-54-24-8-16-2-38 14-52Z"
          fill="#4f8a47"
        />
        {/* Mountain ridges */}
        <path
          d="M280 130l14-20 10 12 12-18 14 26h-50Z M320 152l10-14 8 10 8-12 10 16h-36Z"
          fill="#e9efe9"
          opacity=".92"
        />
        {/* Cloud bands */}
        <path
          d="M70 150c40-12 70 6 110-4s70-6 110-18"
          stroke="#fff"
          strokeOpacity=".5"
          strokeWidth="9"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M110 340c36 10 66-4 100 6s60 8 96-6"
          stroke="#fff"
          strokeOpacity=".4"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
      </g>

      <circle cx="260" cy="260" r="200" fill="url(#shade)" />

      {/* Orbit and meridian lines */}
      <ellipse
        cx="260"
        cy="260"
        rx="236"
        ry="86"
        fill="none"
        stroke="#d9efe5"
        strokeOpacity=".55"
        strokeWidth="1.5"
        transform="rotate(-18 260 260)"
      />
      <circle cx="102" cy="318" r="5" fill="#fff" />
      <circle cx="424" cy="196" r="4" fill="#fff" fillOpacity=".8" />
    </svg>
  );
}
