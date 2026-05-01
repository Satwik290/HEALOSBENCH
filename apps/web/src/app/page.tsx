"use client";

import Link from "next/link";
import { buttonVariants } from "@test-evals/ui/components/button";

const TITLE_TEXT = `
 ██████╗ ███████╗████████╗████████╗███████╗██████╗
 ██╔══██╗██╔════╝╚══██╔══╝╚══██╔══╝██╔════╝██╔══██╗
 ██████╔╝█████╗     ██║      ██║   █████╗  ██████╔╝
 ██╔══██╗██╔══╝     ██║      ██║   ██╔══╝  ██╔══██╗
 ██████╔╝███████╗   ██║      ██║   ███████╗██║  ██║
 ╚═════╝ ╚══════╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═╝

 ████████╗    ███████╗████████╗ █████╗  ██████╗██╗  ██╗
 ╚══██╔══╝    ██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝
    ██║       ███████╗   ██║   ███████║██║     █████╔╝
    ██║       ╚════██║   ██║   ██╔══██║██║     ██╔═██╗
    ██║       ███████║   ██║   ██║  ██║╚██████╗██║  ██╗
    ╚═╝       ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝
 `;

export default function Home() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-20 flex flex-col items-center text-center">
      <pre className="overflow-x-auto font-mono text-xs text-primary mb-12 opacity-80">{TITLE_TEXT}</pre>
      
      <h1 className="text-5xl font-black tracking-tighter mb-4">
        Benchmark Your Prompts. <br />
        <span className="text-muted-foreground">Ship with Confidence.</span>
      </h1>
      
      <p className="text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
        HEALOSBENCH is a high-performance evaluation harness for clinical extraction. 
        Compare strategies, detect hallucinations, and optimize cost.
      </p>

      <div className="flex gap-4">
        <Link
          href="/runs"
          className={buttonVariants({ size: "lg" }) + " h-14 px-8 text-lg font-bold rounded-2xl shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95"}
        >
          Launch Dashboard
        </Link>
        <Link
          href="https://github.com/healos/healosbench"
          target="_blank"
          className={buttonVariants({ size: "lg", variant: "outline" }) + " h-14 px-8 text-lg font-bold rounded-2xl transition-all hover:bg-muted"}
        >
          Documentation
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 w-full">
        <FeatureCard 
          title="Fuzzy Matching" 
          description="Metrics tailored to clinical fields: string similarity, numeric tolerance, and set-based F1." 
        />
        <FeatureCard 
          title="Groundedness" 
          description="Automatic hallucination detection verifies every fact against source transcripts." 
        />
        <FeatureCard 
          title="Cost Tracking" 
          description="Real-time USD tracking and prompt caching verification for production readiness." 
        />
      </div>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6 rounded-2xl border bg-card text-left hover:border-primary/50 transition-colors">
      <h3 className="font-bold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </div>
  );
}
