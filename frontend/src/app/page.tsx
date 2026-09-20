import { CustomCursor } from "@/components/custom-cursor";
import { HeroLeadParagraph } from "@/components/hero-lead-paragraph";
import { HeroPretextHeadline } from "@/components/hero-pretext-headline";
import { PretextCtaBlock } from "@/components/pretext-cta-block";
import { ScrollFadeIn } from "@/components/scroll-fade-in";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SpeciesGrid } from "@/components/species-grid";
import { WordHoverBlock } from "@/components/word-hover-block";
import { WorkflowStages } from "@/components/workflow-stages";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowDown, Box, Clock, Layers, Vote } from "lucide-react";
import Link from "next/link";

const ENSEMBLE_MODELS = [
  { name: "VGG19", tag: "Deep CNN" },
  { name: "ResNet50", tag: "Residual" },
  { name: "DenseNet169", tag: "Dense blocks" },
  { name: "EfficientNetB0", tag: "Compound scaling" },
  { name: "MobileNetV2", tag: "Lightweight" },
  { name: "NASNetMobile", tag: "NAS optimized" },
  { name: "ConvNeXtBase", tag: "Modern CNN" },
] as const;

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <CustomCursor />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section
          className="relative mx-auto max-w-6xl px-4 pt-20 pb-28 sm:px-6 sm:pt-28 sm:pb-36 lg:px-8 lg:pt-32 lg:pb-44"
          aria-labelledby="hero-heading"
        >
          <HeroPretextHeadline />
          <ScrollFadeIn className="mt-10 max-w-2xl sm:mt-12" delay={0.15}>
            <HeroLeadParagraph />
          </ScrollFadeIn>
          <ScrollFadeIn
            className="mt-10 flex flex-wrap items-center gap-3 sm:mt-12"
            delay={0.25}
          >
            <Link
              href="/register"
              data-cursor-hover
              className={cn(buttonVariants({ size: "lg" }), "h-11 px-7")}
            >
              Get started free
            </Link>
            <Link
              href="/login"
              data-cursor-hover
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-11 px-7"
              )}
            >
              Sign in
            </Link>
            <a
              href="#about"
              data-cursor-hover
              className={cn(
                buttonVariants({ variant: "ghost", size: "lg" }),
                "link-animated h-11 gap-2 text-muted-foreground"
              )}
            >
              How it works
              <ArrowDown className="size-4" />
            </a>
          </ScrollFadeIn>
        </section>

        {/* About */}
        <section
          id="about"
          className="scroll-mt-24 border-y border-border bg-muted/20 py-24 sm:py-32 lg:py-36"
          aria-labelledby="about-heading"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <ScrollFadeIn>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Why Helminth Detection
              </p>
              <h2
                id="about-heading"
                className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
              >
                Built for clinical lab workflows
              </h2>
              <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Designed for trained providers and laboratory staff, not for
                public self diagnosis. Models provide triage level signals while
                interpretation, documentation, and treatment decisions remain
                your responsibility.
              </p>
            </ScrollFadeIn>
            <ScrollFadeIn
              className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
              delay={0.08}
            >
              {([
                {
                  icon: Vote,
                  title: "Ensemble voting",
                  desc: "Seven fine tuned models vote on every slide. The majority decides, more robust than any single model.",
                },
                {
                  icon: Layers,
                  title: "3 stage pipeline",
                  desc: "Fecal Classification gates Helminth Screening, which gates Helminth Species Identification. Each stage narrows uncertainty.",
                },
                {
                  icon: Box,
                  title: "Bounding box overlays",
                  desc: "Object detection draws boxes around each helminth species found, so you see exactly what the model sees.",
                },
                {
                  icon: Clock,
                  title: "Prediction history",
                  desc: "Every result is stored with the original image. Review past predictions any time you sign back in.",
                },
              ] as const).map((c) => (
                <Card
                  key={c.title}
                  data-cursor-hover
                  className="border-border/80 shadow-none transition-shadow duration-300 hover:shadow-lg"
                >
                  <CardHeader className="gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/50">
                      <c.icon
                        className="size-5 text-foreground/70"
                        aria-hidden
                      />
                    </div>
                    <CardTitle className="text-base">{c.title}</CardTitle>
                    <CardDescription className="leading-relaxed">
                      {c.desc}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </ScrollFadeIn>
          </div>
        </section>

        {/* Workflow */}
        <section
          id="workflow"
          className="scroll-mt-24 py-24 sm:py-32 lg:py-36"
          aria-labelledby="workflow-heading"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <ScrollFadeIn>
              <div className="max-w-2xl space-y-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Pipeline
                </p>
                <h2
                  id="workflow-heading"
                  className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
                >
                  Three stages, one clear path
                </h2>
                <WordHoverBlock
                  text="Each stage narrows uncertainty before revealing detailed class predictions."
                  className="text-base leading-relaxed text-muted-foreground sm:text-lg"
                />
              </div>
            </ScrollFadeIn>
            <div className="mt-16 md:mt-24">
              <WorkflowStages />
            </div>
          </div>
        </section>

        {/* Ensemble models */}
        <section
          id="models"
          className="scroll-mt-24 border-y border-border bg-muted/20 py-24 sm:py-32 lg:py-36"
          aria-labelledby="models-heading"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <ScrollFadeIn>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Phase 1 ensemble
              </p>
              <h2
                id="models-heading"
                className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
              >
                7 models, 1 consensus
              </h2>
              <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Every uploaded slide is classified by seven independently
                fine tuned TensorFlow / Keras architectures. Their outputs are
                combined through majority voting for a more reliable fecal vs
                non fecal decision.
              </p>
            </ScrollFadeIn>
            <ScrollFadeIn
              className="mt-12 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
              delay={0.06}
            >
              {ENSEMBLE_MODELS.map((m) => (
                <Card
                  key={m.name}
                  data-cursor-hover
                  className="border-border/80 shadow-none transition-shadow duration-200 hover:shadow-md"
                >
                  <CardHeader className="gap-1.5">
                    <CardTitle className="text-sm font-semibold">
                      {m.name}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {m.tag} &middot; TensorFlow / Keras
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
              <Card className="flex items-center justify-center border-dashed border-border/80 shadow-none">
                <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                  <Vote className="size-5 text-muted-foreground" aria-hidden />
                  <p className="text-xs font-medium text-muted-foreground">
                    Majority vote
                  </p>
                </div>
              </Card>
            </ScrollFadeIn>
            <ScrollFadeIn className="mt-8" delay={0.1}>
              <Link
                href="/models"
                data-cursor-hover
                className={cn(
                  buttonVariants({ variant: "outline", size: "default" }),
                  "gap-2"
                )}
              >
                View all model details
              </Link>
            </ScrollFadeIn>
          </div>
        </section>

        {/* Detectable species */}
        <section
          id="species"
          className="scroll-mt-24 py-24 sm:py-32 lg:py-36"
          aria-labelledby="species-heading"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <ScrollFadeIn>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Phase 3 detection
              </p>
              <h2
                id="species-heading"
                className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
              >
                11 helminth species, localized on every slide
              </h2>
              <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                When helminth is confirmed, the object detection model
                identifies and draws bounding boxes around these parasitic
                species directly on the microscopy image.
              </p>
            </ScrollFadeIn>
            <ScrollFadeIn className="mt-12" delay={0.06}>
              <SpeciesGrid showNotes />
            </ScrollFadeIn>
            <ScrollFadeIn className="mt-8" delay={0.1}>
              <Link
                href="/learn"
                data-cursor-hover
                className={cn(
                  buttonVariants({ variant: "outline", size: "default" }),
                  "gap-2"
                )}
              >
                Learn about these species
              </Link>
            </ScrollFadeIn>
          </div>
        </section>

        {/* CTA */}
        <section
          id="clinicians"
          className="scroll-mt-24 border-t border-border bg-muted/15 py-24 sm:py-32 lg:py-36"
          aria-labelledby="clinicians-heading"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <ScrollFadeIn>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Access
              </p>
              <h2
                id="clinicians-heading"
                className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
              >
                Ready when you are
              </h2>
              <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground">
                Predictions are available after you{" "}
                <Link
                  href="/register"
                  data-cursor-hover
                  className="link-animated font-medium text-foreground"
                >
                  create an account
                </Link>{" "}
                and{" "}
                <Link
                  href="/login"
                  data-cursor-hover
                  className="link-animated font-medium text-foreground"
                >
                  sign in
                </Link>
                . This landing page is informational: no uploads or inference
                run here.
              </p>
            </ScrollFadeIn>

            <ScrollFadeIn className="mt-16 space-y-8" delay={0.1}>
              <PretextCtaBlock />
              <p className="max-w-xl text-sm text-muted-foreground">
                Create an account to unlock uploads and the full staged review
                workflow.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/register"
                  data-cursor-hover
                  className={cn(buttonVariants({ size: "lg" }), "h-11 px-7")}
                >
                  Get started free
                </Link>
                <Link
                  href="/login"
                  data-cursor-hover
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-11 px-7"
                  )}
                >
                  Sign in
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
