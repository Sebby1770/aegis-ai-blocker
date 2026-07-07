type Props = {
  text: string
  className?: string
}

// A soft light sweep travelling across text — the ReactBits "ShinyText" effect.
// Pure CSS; the sweep is disabled under reduced motion (see App.css).
export function ShinyText({ text, className = '' }: Props) {
  return <span className={`shiny-text ${className}`.trim()}>{text}</span>
}
