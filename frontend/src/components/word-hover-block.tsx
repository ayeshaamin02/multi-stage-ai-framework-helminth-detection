"use client";

import { cn } from "@/lib/utils";
import { useReducedMotion } from "framer-motion";

/**
 * Single block only: hovering scales each character (letters stay grouped per word for wrapping).
 */
export function WordHoverBlock({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const words = text.split(/\s+/).filter(Boolean);

  if (reduceMotion) {
    return <p className={className}>{text}</p>;
  }

  return (
    <p className={cn("text-pretty", className)}>
      {words.map((word, wi) => (
        <span key={wi} className="inline">
          {Array.from(word).map((char, ci) => (
            <span
              key={`${wi}-${ci}`}
              className="inline-block cursor-default origin-bottom transition-[transform,color] duration-150 ease-out will-change-transform hover:scale-[1.22] hover:text-foreground"
            >
              {char}
            </span>
          ))}
          {wi < words.length - 1 ? " " : null}
        </span>
      ))}
    </p>
  );
}
