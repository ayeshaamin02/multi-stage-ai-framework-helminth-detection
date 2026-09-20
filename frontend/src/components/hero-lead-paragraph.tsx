"use client";

export function HeroLeadParagraph() {
  return (
    <p className="text-lg leading-relaxed text-muted-foreground sm:text-xl">
      A{" "}
      <span className="group/pretext-phrase inline">
        <span className="pretext-underline-inner text-foreground/90 group-hover/pretext-phrase:bg-[length:100%_2px]">
          7 model ensemble
        </span>
      </span>{" "}
      screens every slide, a binary classifier separates helminth from{" "}
      <span className="whitespace-nowrap">Non Helminth</span>, and an
      object detection model pinpoints up to{" "}
      <span className="group/pretext-phrase inline">
        <span className="pretext-underline-inner text-foreground/90 group-hover/pretext-phrase:bg-[length:100%_2px]">
          11 parasitic species
        </span>
      </span>{" "}
      with bounding boxes, always with human judgment in the loop.
    </p>
  );
}
