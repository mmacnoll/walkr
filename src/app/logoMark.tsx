// Walkr's mark (a walking loop with its start point), drawn for generated PNG icons.
// Keep in step with src/app/icon.svg.
export function LogoMark({ size, rounded }: { size: number; rounded: boolean }) {
  return (
    <div style={{ width: size, height: size, display: "flex", background: "#1f4d2b", borderRadius: rounded ? size * 0.22 : 0 }}>
      <svg width={size} height={size} viewBox="0 0 64 64">
        <path
          d="M19 45 C20 24 38 15 48 24 S48 49 31 47.5 C26 47 22 46.5 19 45 Z"
          fill="none"
          stroke="#f6f1e7"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="19" cy="45" r="5" fill="#c8873a" stroke="#f6f1e7" strokeWidth="2" />
      </svg>
    </div>
  );
}
