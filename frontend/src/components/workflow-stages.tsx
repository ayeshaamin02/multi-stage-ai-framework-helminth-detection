"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { Layers, Microscope, ScanSearch, type LucideIcon } from "lucide-react";

type WorkflowStep = {
  step: string;
  title: string;
  subtitle: string;
  description: string;
  icon: LucideIcon;
};

const workflowSteps: readonly WorkflowStep[] = [
  {
    step: "1",
    title: "Fecal Classification",
    subtitle: "7 models \u00b7 majority vote",
    description:
      "Seven fine tuned TensorFlow models (VGG19, ResNet50, DenseNet169, EfficientNetB0, MobileNetV2, NASNetMobile, and ConvNeXtBase) each classify the slide independently. A majority vote system combines their outputs: fecal or non fecal. Non fecal slides stop here.",
    icon: Microscope,
  },
  {
    step: "2",
    title: "Helminth Screening",
    subtitle: "Binary classifier",
    description:
      "Confirmed fecal samples pass to a dedicated binary classifier that distinguishes helminth from Non Helminth. Non Helminth results are reported and the pipeline stops. Helminth positive slides advance to species identification.",
    icon: Layers,
  },
  {
    step: "3",
    title: "Helminth Species Identification",
    subtitle: "11 class object detection",
    description:
      "An object detection model scans the slide for 11 parasitic helminth species, including Ascaris, Hookworm, Trichuris, and Taenia, drawing bounding boxes around each finding so clinicians see exactly where the model attended.",
    icon: ScanSearch,
  },
];

const hoverSpring = { type: "spring" as const, stiffness: 320, damping: 26 };

function StepCard({
  item,
  index,
  reduceMotion,
  className,
}: {
  item: WorkflowStep;
  index: number;
  reduceMotion: boolean | null;
  className?: string;
}) {
  const Icon = item.icon;

  return (
    <motion.div
      className={cn("flex h-full min-h-0 flex-col", className)}
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{
        type: "spring",
        stiffness: 85,
        damping: 20,
        delay: index * 0.07,
      }}
    >
      <motion.div
        whileHover={
          reduceMotion ? undefined : { y: -6, scale: 1.02, rotate: -0.5 }
        }
        transition={hoverSpring}
        className="h-full"
      >
        <Card
          data-cursor-hover
          className={cn(
            "flex h-full min-h-0 flex-col border-border/80 shadow-sm transition-shadow duration-500 ease-out",
            "hover:shadow-xl hover:shadow-primary/10"
          )}
        >
          <CardHeader className="flex flex-1 flex-col items-stretch gap-5 text-left">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold tabular-nums text-primary-foreground">
                {item.step}
              </span>
              <motion.div
                className="flex size-11 items-center justify-center rounded-xl border border-border bg-muted/50"
                whileHover={
                  reduceMotion ? undefined : { scale: 1.08, rotate: -6 }
                }
                transition={hoverSpring}
              >
                <Icon className="size-5 text-foreground" aria-hidden />
              </motion.div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Stage {item.step}
              </p>
              <CardTitle className="mt-2 text-lg font-semibold leading-snug tracking-tight xl:text-xl">
                {item.title}
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.subtitle}</p>
            </div>
            <CardDescription className="flex-1 text-[0.9375rem] leading-relaxed">
              {item.description}
            </CardDescription>
          </CardHeader>
        </Card>
      </motion.div>
    </motion.div>
  );
}

function DesktopSpineCard({
  item,
  index,
  reduceMotion,
}: {
  item: WorkflowStep;
  index: number;
  reduceMotion: boolean | null;
}) {
  const Icon = item.icon;

  return (
    <motion.div
      className="w-full max-w-md"
      initial={reduceMotion ? false : { opacity: 0, x: index % 2 === 0 ? -40 : 40 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{
        type: "spring",
        stiffness: 72,
        damping: 18,
        delay: index * 0.06,
      }}
    >
      <motion.div
        whileHover={
          reduceMotion ? undefined : { y: -10, scale: 1.025, rotate: index % 2 === 0 ? 0.4 : -0.4 }
        }
        transition={hoverSpring}
      >
        <Card
          data-cursor-hover
          className={cn(
            "border-border/80 shadow-md transition-shadow duration-500 ease-out",
            "hover:shadow-2xl hover:shadow-primary/15"
          )}
        >
          <CardHeader className="gap-5 text-left">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold tabular-nums text-primary-foreground">
                {item.step}
              </span>
              <motion.div
                className="flex size-12 items-center justify-center rounded-xl border border-border bg-muted/50"
                whileHover={
                  reduceMotion ? undefined : { scale: 1.1, rotate: index % 2 === 0 ? -8 : 8 }
                }
                transition={hoverSpring}
              >
                <Icon className="size-6 text-foreground" aria-hidden />
              </motion.div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Stage {item.step}
              </p>
              <CardTitle className="mt-2 text-xl font-semibold leading-snug tracking-tight">
                {item.title}
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.subtitle}</p>
            </div>
            <CardDescription className="text-[0.9375rem] leading-relaxed">
              {item.description}
            </CardDescription>
          </CardHeader>
        </Card>
      </motion.div>
    </motion.div>
  );
}

export function WorkflowStages() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative">
      {/* Desktop: vertical spine + alternating left / right cards */}
      <div className="relative hidden lg:mx-auto lg:block lg:max-w-5xl xl:max-w-6xl">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-8 bottom-8 z-0 hidden w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-border to-transparent lg:block"
          initial={reduceMotion ? false : { scaleY: 0 }}
          whileInView={reduceMotion ? undefined : { scaleY: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: "top" }}
        />

        <div className="relative z-10 flex flex-col gap-24 xl:gap-32">
          {workflowSteps.map((item, i) => {
            const isLeft = i % 2 === 0;
            return (
              <div
                key={item.step}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-6 xl:gap-x-12"
              >
                {isLeft ? (
                  <>
                    <div className="flex min-w-0 justify-end">
                      <DesktopSpineCard
                        item={item}
                        index={i}
                        reduceMotion={reduceMotion}
                      />
                    </div>
                    <div className="relative flex w-12 shrink-0 justify-center xl:w-14">
                      <motion.div
                        className="relative z-20 size-5 rounded-full border-[3px] border-background bg-primary shadow-md ring-4 ring-background"
                        initial={reduceMotion ? false : { scale: 0 }}
                        whileInView={reduceMotion ? undefined : { scale: 1 }}
                        viewport={{ once: true }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 22,
                          delay: 0.1 + i * 0.07,
                        }}
                        whileHover={
                          reduceMotion ? undefined : { scale: 1.15 }
                        }
                      />
                    </div>
                    <div className="min-w-0" />
                  </>
                ) : (
                  <>
                    <div className="min-w-0" />
                    <div className="relative flex w-12 shrink-0 justify-center xl:w-14">
                      <motion.div
                        className="relative z-20 size-5 rounded-full border-[3px] border-background bg-primary shadow-md ring-4 ring-background"
                        initial={reduceMotion ? false : { scale: 0 }}
                        whileInView={reduceMotion ? undefined : { scale: 1 }}
                        viewport={{ once: true }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 22,
                          delay: 0.1 + i * 0.07,
                        }}
                        whileHover={
                          reduceMotion ? undefined : { scale: 1.15 }
                        }
                      />
                    </div>
                    <div className="flex min-w-0 justify-start">
                      <DesktopSpineCard
                        item={item}
                        index={i}
                        reduceMotion={reduceMotion}
                      />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tablet */}
      <div className="hidden md:grid md:grid-cols-2 md:gap-8 lg:hidden">
        {workflowSteps.map((item, i) => (
          <StepCard
            key={item.step}
            item={item}
            index={i}
            reduceMotion={reduceMotion}
            className={cn(
              i === 2 && "md:col-span-2 md:mx-auto md:w-full md:max-w-xl"
            )}
          />
        ))}
      </div>

      {/* Mobile */}
      <div className="relative space-y-0 md:hidden">
        <div className="absolute bottom-3 left-[15px] top-3 w-px bg-border" />
        {workflowSteps.map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={item.step} className="relative pb-10 pl-10 last:pb-0">
              <motion.div
                className="absolute left-0 top-3 z-10 flex size-8 -translate-x-[calc(50%-0.5px)] items-center justify-center rounded-full border-2 border-background bg-primary text-xs font-bold text-primary-foreground"
                initial={reduceMotion ? false : { scale: 0 }}
                whileInView={reduceMotion ? undefined : { scale: 1 }}
                viewport={{ once: true }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 22,
                  delay: i * 0.08,
                }}
              >
                {item.step}
              </motion.div>
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, x: 14 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-5% 0px" }}
                transition={{
                  type: "spring",
                  stiffness: 80,
                  damping: 18,
                  delay: i * 0.05,
                }}
              >
                <motion.div
                  whileHover={
                    reduceMotion ? undefined : { y: -4, scale: 1.01 }
                  }
                  transition={hoverSpring}
                >
                  <Card
                    data-cursor-hover
                    className="border-border/80 shadow-sm transition-shadow duration-300 hover:shadow-lg"
                  >
                    <CardHeader className="gap-4 text-left">
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/40">
                          <Icon className="size-5" aria-hidden />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">
                          Stage {item.step} of 3
                        </span>
                      </div>
                      <CardTitle className="text-lg">{item.title}</CardTitle>
                      <CardDescription className="text-sm leading-relaxed">
                        {item.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </motion.div>
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
