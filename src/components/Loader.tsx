import { useEffect, useState, type CSSProperties } from "react";

const messages = [
  "Digging through the crates…",
  "Soundchecking the venues…",
  "Tuning the PA…",
  "Asking El Raval what's on…",
  "Flipping the record…",
];

const ticker = [
  "Digging the crates",
  "Soundchecking",
  "Tuning the PA",
  "Dropping the needle",
  "Finding tonight's show",
];

const bars = Array.from({ length: 12 }, (_, bar) => bar);
const skeletons = [0, 1, 2];

function Deck() {
  return (
    <div className="m-deck" aria-hidden="true">
      <div className="m-platter">
        <div className="m-vinyl">
          <span>BSM</span>
        </div>
        <i className="m-glare" />
      </div>
      <div className="m-arm">
        <i />
      </div>
    </div>
  );
}

export function Loader({ compact = false }: { compact?: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(
      () => setIndex((current) => (current + 1) % messages.length),
      1800,
    );
    return () => window.clearInterval(id);
  }, []);

  const eq = (
    <div className="m-eq" aria-hidden="true">
      {bars.slice(0, compact ? 5 : bars.length).map((bar) => (
        <i key={bar} style={{ "--i": bar } as CSSProperties} />
      ))}
    </div>
  );

  if (compact) {
    return (
      <div className="m-loader m-loader-compact" role="status" aria-label="Fetching results">
        <div className="m-vinyl" aria-hidden="true">
          <span>BSM</span>
        </div>
        {eq}
        <p key={index} className="m-loader-line" aria-hidden="true">
          {messages[index]}
        </p>
      </div>
    );
  }

  const strip = [...ticker, ...ticker].map((item, position) => (
    <span key={position}>{item}</span>
  ));

  return (
    <>
      <div className="m-loader" role="status" aria-label="Fetching results">
        <Deck />
        <div className="m-loader-copy" aria-hidden="true">
          <p key={index} className="m-loader-line">
            {messages[index]}
          </p>
          {eq}
        </div>
      </div>
      <div className="m-ticker" aria-hidden="true">
        <div className="m-ticker-track">
          {strip}
          {strip}
        </div>
      </div>
      {skeletons.map((skeleton) => (
        <div
          key={skeleton}
          className="m-skel"
          aria-hidden="true"
          style={{ "--i": skeleton } as CSSProperties}
        >
          <div className="m-skel-main">
            <i className="m-skel-chip" />
            <i className="m-skel-title" />
            <i className="m-skel-line" />
          </div>
          <div className="m-skel-actions">
            <i />
            <i />
            <i />
          </div>
        </div>
      ))}
    </>
  );
}
