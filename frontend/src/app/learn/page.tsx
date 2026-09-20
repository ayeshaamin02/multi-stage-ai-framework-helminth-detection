import { AnimatedCard } from "@/components/animated-card";
import { AnimatedCounter } from "@/components/animated-counter";
import { CustomCursor } from "@/components/custom-cursor";
import { PretextPageHeadline } from "@/components/pretext-page-headline";
import { ScrollFadeIn } from "@/components/scroll-fade-in";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SpeciesGrid } from "@/components/species-grid";
import { WordHoverBlock } from "@/components/word-hover-block";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  FlaskConical,
  Layers,
  Microscope,
  ScanSearch,
  Vote,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Learn",
  description:
    "Learn how fecal microscopy works, the three phase prediction pipeline, ensemble voting, and the 11 helminth species we detect.",
};

const PIPELINE_STEPS = [
  {
    phase: "Phase 1",
    title: "Fecal Classification",
    icon: Microscope,
    description:
      "Seven independently fine tuned TensorFlow models (VGG19, ResNet50, DenseNet169, EfficientNetB0, MobileNetV2, NASNetMobile, and ConvNeXtBase) each analyze the uploaded slide. Their binary outputs (fecal vs non fecal) are combined through majority voting. If four or more models agree the slide contains fecal matter, it advances. Otherwise the pipeline reports non fecal and stops.",
    accent: "bg-blue-600 dark:bg-blue-500",
  },
  {
    phase: "Phase 2",
    title: "Helminth Screening",
    icon: Layers,
    description:
      "A dedicated binary classifier examines the confirmed fecal sample to determine whether parasitic helminth is present. If no helminth is detected, the result is recorded and the pipeline stops. Helminth positive slides move to species level identification.",
    accent: "bg-violet-600 dark:bg-violet-500",
  },
  {
    phase: "Phase 3",
    title: "Helminth Species Identification",
    icon: ScanSearch,
    description:
      "An object detection model scans the slide for 11 known parasitic helminth species. For each species found, a bounding box is drawn directly on the microscopy image along with a confidence score, so clinicians can see exactly where the model attended.",
    accent: "bg-amber-600 dark:bg-amber-500",
  },
] as const;

export default function LearnPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <CustomCursor />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-4xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28 sm:pb-20 lg:px-8">
          <ScrollFadeIn>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Learn
            </p>
          </ScrollFadeIn>
          <div className="mt-3">
            <PretextPageHeadline text="How Helminth Detection works" />
          </div>
          <ScrollFadeIn className="mt-6" delay={0.2}>
            <WordHoverBlock
              text="From raw slide to annotated result in three gated phases. Every step is designed to reduce noise and surface actionable findings for trained clinicians."
              className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            />
          </ScrollFadeIn>
        </section>

        {/* At a glance counters */}
        <section className="border-y border-border bg-muted/20 py-14 sm:py-16">
          <div className="mx-auto grid max-w-4xl grid-cols-3 gap-6 px-4 text-center sm:px-6 lg:px-8">
            {[
              { value: 7, suffix: "", label: "Ensemble models" },
              { value: 3, suffix: "", label: "Pipeline phases" },
              { value: 11, suffix: "", label: "Detectable species" },
            ].map((stat) => (
              <ScrollFadeIn key={stat.label}>
                <div data-cursor-hover>
                  <p className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    <AnimatedCounter
                      value={stat.value}
                      suffix={stat.suffix}
                    />
                  </p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground sm:text-sm">
                    {stat.label}
                  </p>
                </div>
              </ScrollFadeIn>
            ))}
          </div>
        </section>

        {/* What is fecal microscopy */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <ScrollFadeIn>
              <div className="flex items-start gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50">
                  <FlaskConical
                    className="size-5 text-foreground/70"
                    aria-hidden
                  />
                </div>
                <div>
                  <h2
                    className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                    data-cursor-hover
                  >
                    What is fecal microscopy?
                  </h2>
                  <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    <p>
                      Fecal microscopy is a routine clinical laboratory technique
                      in which stool samples are examined under a microscope to
                      detect parasitic organisms, their eggs (ova), or larvae.
                      It remains a cornerstone of parasitology diagnostics
                      worldwide, especially in resource limited settings.
                    </p>
                    <p>
                      Experienced microscopists can identify helminth eggs by
                      their characteristic size, shape, and internal structures.
                      However, manual screening is time consuming, subjective,
                      and dependent on the operator&apos;s expertise. AI assisted
                      classification offers a way to standardize and accelerate
                      this process without replacing human judgment.
                    </p>
                  </div>
                </div>
              </div>
            </ScrollFadeIn>
          </div>
        </section>

        {/* Three phase pipeline */}
        <section className="border-y border-border bg-muted/20 py-20 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <ScrollFadeIn>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                The pipeline
              </p>
              <h2
                className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                data-cursor-hover
              >
                Three phases, each a gate
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Only slides that pass a phase advance to the next. This reduces
                false positives and ensures compute is spent where it matters
                most.
              </p>
            </ScrollFadeIn>

            <div className="relative mt-12">
              <div className="absolute left-5 top-0 bottom-0 hidden w-px bg-border sm:block" />
              <div className="space-y-10">
                {PIPELINE_STEPS.map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <AnimatedCard key={step.phase} index={i} direction="left">
                      <div className="relative flex gap-6 sm:pl-14">
                        <div className="absolute left-0 hidden sm:flex">
                          <span
                            className={cn(
                              "relative z-10 flex size-10 items-center justify-center rounded-full text-white shadow-sm",
                              step.accent
                            )}
                          >
                            <Icon className="size-4" aria-hidden />
                          </span>
                        </div>
                        <Card
                          className="w-full border-border/80 shadow-sm transition-shadow duration-300 hover:shadow-xl hover:shadow-primary/5"
                          data-cursor-hover
                        >
                          <CardHeader className="gap-2">
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                              {step.phase}
                            </p>
                            <CardTitle className="text-base sm:text-lg">
                              {step.title}
                            </CardTitle>
                            <CardDescription className="text-sm leading-relaxed">
                              {step.description}
                            </CardDescription>
                          </CardHeader>
                        </Card>
                      </div>
                    </AnimatedCard>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Ensemble voting explained */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <ScrollFadeIn>
              <div className="flex items-start gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50">
                  <Vote className="size-5 text-foreground/70" aria-hidden />
                </div>
                <div>
                  <h2
                    className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                    data-cursor-hover
                  >
                    Ensemble voting explained
                  </h2>
                  <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    <p>
                      Instead of relying on one model, Phase 1 runs the same
                      image through seven distinct architectures. Each model was
                      fine tuned on the same fecal detection dataset but learns
                      different features due to its unique network design.
                    </p>
                    <p>
                      The seven predictions are combined via simple majority
                      voting: if four or more models classify the slide as fecal,
                      the consensus is &ldquo;fecal.&rdquo; This ensemble
                      approach consistently outperforms any single model because
                      individual errors are diluted by the group&apos;s
                      agreement.
                    </p>
                    <p>
                      All seven models (VGG19, ResNet50, DenseNet169,
                      EfficientNetB0, MobileNetV2, NASNetMobile, ConvNeXtBase)
                      are available on{" "}
                      <a
                        href="https://huggingface.co/ABCAgency/binaryFecal/tree/main"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-foreground underline underline-offset-4 transition-opacity hover:opacity-70"
                        data-cursor-hover
                      >
                        Hugging Face
                      </a>
                      .
                    </p>
                  </div>
                </div>
              </div>
            </ScrollFadeIn>
          </div>
        </section>

        {/* Detectable species */}
        <section className="border-y border-border bg-muted/20 py-20 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <ScrollFadeIn>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Phase 3 species
              </p>
              <h2
                className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                data-cursor-hover
              >
                11 detectable helminth species
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                When helminth is confirmed in Phase 2, the object detection
                model localizes and labels eggs or organisms from these species.
              </p>
            </ScrollFadeIn>
            <div className="mt-10">
              <SpeciesGrid showNotes />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <ScrollFadeIn>
              <h2
                className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                data-cursor-hover
              >
                Ready to try it?
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Create a free account, upload a slide, and see the pipeline in
                action.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href="/register"
                  data-cursor-hover
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-11 gap-2 px-7"
                  )}
                >
                  Get started free
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/models"
                  data-cursor-hover
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-11 px-7"
                  )}
                >
                  View models
                </Link>
              </div>
            </ScrollFadeIn>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
