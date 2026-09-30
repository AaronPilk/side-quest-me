import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const slides = [
  {
    image: "city-detour",
    label: "TAKE THE DETOUR",
    title: "Your city. A new story.",
    copy: "Turn an ordinary plan into a little adventure.",
  },
  {
    image: "coastal-detour",
    label: "GO A LITTLE FURTHER",
    title: "Find your next ‘remember when’.",
    copy: "Pick your people. Bring a little curiosity.",
  },
  {
    image: "make-a-scene",
    label: "MAKE SOMETHING OF IT",
    title: "Live it. Keep the good bits.",
    copy: "Capture along the way, then share your story.",
  },
];

export function AdventureCarousel() {
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    setPlaying(!reduced.matches);
    const change = () => setPlaying(!reduced.matches);
    reduced.addEventListener("change", change);
    return () => reduced.removeEventListener("change", change);
  }, []);
  function show(index: number) {
    const element = track.current;
    if (!element) return;
    element.scrollTo({
      left: index * element.clientWidth,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) show((current + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [playing, current]);
  return (
    <section
      className="adventure-carousel"
      aria-label="A little inspiration"
      aria-roledescription="carousel"
    >
      <div
        className="adventure-slides"
        ref={track}
        onPointerDown={() => setPlaying(false)}
        onFocusCapture={() => setPlaying(false)}
        onScroll={() => {
          if (track.current)
            setCurrent(
              Math.round(track.current.scrollLeft / track.current.clientWidth),
            );
        }}
      >
        {slides.map((slide, index) => (
          <article
            className="adventure-slide"
            key={slide.image}
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}`}
          >
            <img
              src={`/artwork/${slide.image}.webp`}
              alt=""
              width="1200"
              height="800"
              loading={index ? "lazy" : "eager"}
            />
            <div className="adventure-slide-copy">
              <span>{slide.label}</span>
              <h2>{slide.title}</h2>
              <p>{slide.copy}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="adventure-carousel-controls">
        <span className="adventure-caption">
          A little imagination. Your real story comes next.
        </span>
        <div className="adventure-dots">
          {slides.map((slide, index) => (
            <button
              key={slide.image}
              type="button"
              aria-label={`Show inspiration ${index + 1}`}
              aria-pressed={current === index}
              onClick={() => {
                setPlaying(false);
                show(index);
              }}
            >
              <span />
            </button>
          ))}
          <button
            type="button"
            aria-label={playing ? "Pause inspiration" : "Play inspiration"}
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
        </div>
      </div>
    </section>
  );
}
