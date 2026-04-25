import type { SVGProps } from "react"

type ThunderdomeLogoProps = SVGProps<SVGSVGElement> & {
  showWordmark?: boolean
}

export function ThunderdomeLogo({
  showWordmark = true,
  ...props
}: ThunderdomeLogoProps) {
  return (
    <svg
      viewBox={showWordmark ? "0 0 560 164" : "0 0 164 164"}
      role="img"
      aria-label="THUNDERDOME lightning bolt logo"
      {...props}
    >
      <defs>
        <linearGradient id="td-bolt-gradient" x1="42" x2="122" y1="14" y2="148">
          <stop offset="0" stopColor="#f8fbff" />
          <stop offset="0.42" stopColor="#d7dde2" />
          <stop offset="1" stopColor="#7b858c" />
        </linearGradient>
        <filter id="td-metal-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="8" dy="8" floodColor="#000000" floodOpacity="0.78" stdDeviation="0" />
          <feDropShadow dx="-3" dy="-3" floodColor="#24f1df" floodOpacity="0.45" stdDeviation="0" />
          <feDropShadow dx="3" dy="0" floodColor="#ff2f7d" floodOpacity="0.45" stdDeviation="0" />
        </filter>
      </defs>

      <g filter="url(#td-metal-shadow)">
        <path
          d="M86 10 30 88h42l-18 66 82-94H94l18-50H86Z"
          fill="#050505"
          stroke="#050505"
          strokeLinejoin="miter"
          strokeWidth="14"
        />
        <path
          d="M86 10 30 88h42l-18 66 82-94H94l18-50H86Z"
          fill="url(#td-bolt-gradient)"
          stroke="#edf3f7"
          strokeLinejoin="round"
          strokeWidth="6"
        />
        <path
          d="M86 10 30 88h42l-18 66 82-94H94l18-50H86Z"
          fill="none"
          stroke="#060606"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M42 88h30L55 151l45-52"
          fill="none"
          stroke="#ffffff"
          strokeLinecap="square"
          strokeWidth="3"
        />
        <path
          d="M30 118h30M21 132h34"
          stroke="#28f0d4"
          strokeLinecap="square"
          strokeWidth="5"
        />
        <path
          d="M105 36h34M96 50h29"
          stroke="#ff2f7d"
          strokeLinecap="square"
          strokeWidth="5"
        />
      </g>

      {showWordmark ? (
        <g>
          <text
            x="178"
            y="80"
            fontFamily="var(--font-geist-mono), monospace"
            fontSize="45"
            fontWeight="900"
            letterSpacing="4"
            stroke="#050505"
            strokeLinejoin="miter"
            strokeWidth="7"
          >
            THUNDER
          </text>
          <text
            x="178"
            y="126"
            fontFamily="var(--font-geist-mono), monospace"
            fontSize="45"
            fontWeight="900"
            letterSpacing="4"
            stroke="#050505"
            strokeLinejoin="miter"
            strokeWidth="7"
          >
            DOME
          </text>
          <text
            x="178"
            y="80"
            fill="currentColor"
            fontFamily="var(--font-geist-mono), monospace"
            fontSize="45"
            fontWeight="900"
            letterSpacing="4"
          >
            THUNDER
          </text>
          <text
            x="178"
            y="126"
            fill="currentColor"
            fontFamily="var(--font-geist-mono), monospace"
            fontSize="45"
            fontWeight="900"
            letterSpacing="4"
          >
            DOME
          </text>
          <path d="M176 92h318l-18 7H176z" fill="#28f0d4" />
          <path d="M176 139h246l-18 7H176z" fill="#ff2f7d" />
          <path d="M188 55h72M312 55h38M228 103h116M372 103h51" stroke="#050505" strokeWidth="8" />
        </g>
      ) : null}
    </svg>
  )
}
