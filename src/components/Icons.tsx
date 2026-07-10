export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m20 20-4.7-4.7m2-5.1a7.1 7.1 0 1 1-14.2 0 7.1 7.1 0 0 1 14.2 0Z" />
    </svg>
  );
}

export function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={filled ? "filled" : ""}>
      <path d="M20.3 5.9a5.1 5.1 0 0 0-7.2 0L12 7l-1.1-1.1a5.1 5.1 0 1 0-7.2 7.2L12 21l8.3-7.9a5.1 5.1 0 0 0 0-7.2Z" />
    </svg>
  );
}

export function MapIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Zm0 0V3m6 18V6" />
    </svg>
  );
}

export function TicketIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8.5V5h16v3.5a2.5 2.5 0 0 0 0 5V17H4v-3.5a2.5 2.5 0 0 0 0-5Zm6 1h4m-4 5h4" />
    </svg>
  );
}
