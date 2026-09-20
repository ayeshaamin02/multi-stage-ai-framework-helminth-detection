import { AnimatedCard } from "@/components/animated-card";
import { AnimatedCounter } from "@/components/animated-counter";
import { AnimatedVotingFlow } from "@/components/animated-voting-flow";
import { CustomCursor } from "@/components/custom-cursor";
import { PretextPageHeadline } from "@/components/pretext-page-headline";
import { ScrollFadeIn } from "@/components/scroll-fade-in";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WordHoverBlock } from "@/components/word-hover-block";
import { HELMINTH_SPECIES } from "@/lib/pipeline-data";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ExternalLink,
  Layers,
  ScanSearch,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Models",
  description:
    "Technical details on the 7 Phase 1 ensemble models, the Phase 2 helminth classifier, the Phase 3 object detection model, and how ensemble voting works.",
};

const PHASE1_MODELS = [
  {
    name: "VGG19",
    arch: "Deep CNN",
    detail:
      "19 weight layers, well studied baseline for transfer learning with strong feature extraction.",
  },
  {
    name: "ResNet50",
    arch: "Residual Network",
    detail:
      "50 layer residual network with skip connections that prevent vanishing gradients.",
  },
  {
    name: "DenseNet169",
    arch: "Dense Blocks",
    detail:
      "169 layer network where every layer is connected to every other, maximizing feature reuse.",
  },
  {
    name: "EfficientNetB0",
    arch: "Compound Scaling",
    detail:
      "Balanced depth, width, and resolution scaling for best accuracy per FLOP.",
  },
  {
    name: "MobileNetV2",
    arch: "Lightweight CNN",
    detail:
      "Inverted residuals and linear bottlenecks, optimized for mobile and edge deployment.",
  },
  {
    name: "NASNetMobile",
    arch: "NAS optimized",
    detail:
      "Architecture discovered via neural architecture search, tuned for mobile scale compute.",
  },
  {
    name: "ConvNeXtBase",
    arch: "Modern CNN",
    detail:
      "A pure ConvNet that matches vision transformers by modernizing classic design choices.",
  },
] as const;

export default function ModelsPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <CustomCursor />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28 sm:pb-20 lg:px-8">
          <ScrollFadeIn>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Technology
            </p>
          </ScrollFadeIn>
          <div className="mt-3">
            <PretextPageHeadline text="Models & architecture" />
          </div>
          <ScrollFadeIn className="mt-6" delay={0.2}>
            <WordHoverBlock
              text="Explore the models behind each phase of the pipeline, from the 7 model ensemble to the 11 class object detector."
              className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            />
          </ScrollFadeIn>
        </section>

        {/* At a glance counters */}
        <section className="border-y border-border bg-muted/20 py-14 sm:py-16">
          <div className="mx-auto grid max-w-5xl grid-cols-3 gap-6 px-4 text-center sm:px-6 lg:px-8">
            {[
              { value: 7, label: "Phase 1 models" },
              { value: 1, label: "Phase 2 classifier" },
              { value: 11, label: "Phase 3 classes" },
            ].map((stat) => (
              <ScrollFadeIn key={stat.label}>
                <div data-cursor-hover>
                  <p className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    <AnimatedCounter value={stat.value} />
                  </p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground sm:text-sm">
                    {stat.label}
                  </p>
                </div>
              </ScrollFadeIn>
            ))}
          </div>
        </section>

        {/* Phase 1 models */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <ScrollFadeIn>
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-chart-5 text-xs font-bold text-primary-foreground">
                  1
                </span>
                <h2
                  className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                  data-cursor-hover
                >
                  Phase 1: Fecal detection ensemble
                </h2>
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Seven TensorFlow / Keras architectures, each fine tuned
                independently on the same fecal detection dataset. Their outputs
                are combined through majority voting to produce a single fecal vs
                non fecal decision.
              </p>
            </ScrollFadeIn>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PHASE1_MODELS.map((m, i) => (
                <AnimatedCard key={m.name} index={i}>
                  <Card
                    className="h-full border-border/80 shadow-sm transition-shadow duration-300 hover:shadow-lg"
                    data-cursor-hover
                  >
                    <CardHeader className="gap-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">
                          {m.name}
                        </CardTitle>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {m.arch}
                        </span>
                      </div>
                      <CardDescription className="text-xs leading-relaxed">
                        {m.detail}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </AnimatedCard>
              ))}
            </div>
            <ScrollFadeIn className="mt-8" delay={0.1}>
              <a
                href="https://huggingface.co/ABCAgency/binaryFecal/tree/main"
                target="_blank"
                rel="noopener noreferrer"
                data-cursor-hover
                className={cn(
                  buttonVariants({ variant: "outline", size: "default" }),
                  "gap-2"
                )}
              >
                View on Hugging Face
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </ScrollFadeIn>
          </div>
        </section>

        {/* Phase 2 */}
        <section className="border-y border-border bg-muted/20 py-20 sm:py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <ScrollFadeIn>
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  2
                </span>
                <h2
                  className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                  data-cursor-hover
                >
                  Phase 2: Helminth screening
                </h2>
              </div>
            </ScrollFadeIn>
            <AnimatedCard index={0} direction="left" className="mt-6">
              <Card
                className="border-border/80 shadow-sm transition-shadow duration-300 hover:shadow-xl hover:shadow-primary/8"
                data-cursor-hover
              >
                <CardHeader className="gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50">
                      <Layers
                        className="size-5 text-foreground/70"
                        aria-hidden
                      />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        Binary classifier: Helminth vs Non Helminth
                      </CardTitle>
                      <CardDescription className="mt-1.5 text-sm leading-relaxed">
                        A single dedicated model receives confirmed fecal slides
                        and determines whether parasitic helminth eggs or
                        organisms are present. This binary gate prevents the
                        heavier object detection model from running on clean
                        samples, improving both speed and specificity.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </AnimatedCard>
          </div>
        </section>

        {/* Phase 3 */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <ScrollFadeIn>
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-chart-3 text-xs font-bold text-primary-foreground">
                  3
                </span>
                <h2
                  className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                  data-cursor-hover
                >
                  Phase 3: Species identification
                </h2>
              </div>
            </ScrollFadeIn>
            <AnimatedCard index={0} direction="right" className="mt-6">
              <Card
                className="border-border/80 shadow-sm transition-shadow duration-300 hover:shadow-xl hover:shadow-chart-3/15"
                data-cursor-hover
              >
                <CardHeader className="gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50">
                      <ScanSearch
                        className="size-5 text-foreground/70"
                        aria-hidden
                      />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        11 class object detection with bounding boxes
                      </CardTitle>
                      <CardDescription className="mt-1.5 text-sm leading-relaxed">
                        Helminth positive slides are scanned by an
                        object detection model trained to localize and classify
                        eggs or organisms from 11 parasitic species. Each
                        detection includes a bounding box drawn directly on the
                        microscopy image, along with a species label and
                        confidence score.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Detectable species
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {HELMINTH_SPECIES.map((sp) => (
                      <span
                        key={sp.id}
                        className="rounded-full border border-border bg-background px-3 py-1 text-xs italic text-foreground/80 transition-colors hover:border-primary/45 hover:bg-primary/8"
                        data-cursor-hover
                      >
                        {sp.name}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </AnimatedCard>
          </div>
        </section>

        {/* Ensemble voting visualization */}
        <section className="border-y border-border bg-muted/20 py-20 sm:py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <ScrollFadeIn>
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Interactive diagram
                </p>
                <h2
                  className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                  data-cursor-hover
                >
                  How ensemble voting works
                </h2>
                <p className="mt-3 mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                  Each Phase 1 model independently votes. A simple majority
                  (&ge;4 of 7) determines the outcome.
                </p>
              </div>
            </ScrollFadeIn>
            <div className="mt-12">
              <AnimatedVotingFlow />
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
                See the pipeline in action
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Create a free account, upload a microscopy slide, and watch each
                phase run in real time.
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
                  href="/learn"
                  data-cursor-hover
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-11 px-7"
                  )}
                >
                  Learn more
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
