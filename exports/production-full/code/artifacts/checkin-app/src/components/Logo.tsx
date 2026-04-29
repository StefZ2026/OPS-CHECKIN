interface LogoProps {
  className?: string;
  variant?: "color" | "white";
}

export default function Logo({ className = "", variant = "color" }: LogoProps) {
  const textColor = variant === "white" ? "#ffffff" : "#1a2f6e";
  const pinColor = variant === "white" ? "#ffffff" : "#1a4fd6";
  const pinShadow = variant === "white" ? "#ffffff" : "#0d3299";
  const checkBg = variant === "white" ? "rgba(255,255,255,0.3)" : "#f5a31a";
  const checkStroke = variant === "white" ? "#ffffff" : "#ffffff";

  return (
    <svg
      viewBox="0 0 280 60"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="OpsCheckIn"
      role="img"
    >
      {/* Location pin icon */}
      <g transform="translate(4, 2)">
        {/* Pin body */}
        <path
          d="M22 0 C10 0 0 10 0 22 C0 34 22 54 22 54 C22 54 44 34 44 22 C44 10 34 0 22 0 Z"
          fill={pinColor}
        />
        {/* Pin inner circle highlight */}
        <circle cx="22" cy="20" r="14" fill={pinShadow} opacity="0.4" />
        {/* Gold/white checkmark background circle */}
        <circle cx="22" cy="20" r="11" fill={checkBg} />
        {/* Checkmark */}
        <polyline
          points="15,20 20,26 30,14"
          fill="none"
          stroke={checkStroke}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* OPSCHECKIN wordmark */}
      <text
        x="60"
        y="40"
        fontFamily="'Arial Black', 'Impact', sans-serif"
        fontWeight="900"
        fontSize="26"
        letterSpacing="1"
        fill={textColor}
      >
        OPSCHECKIN
      </text>
    </svg>
  );
}
