"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { env } from "@test-evals/env/web";
import { Button, buttonVariants } from "@test-evals/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@test-evals/ui/components/card";
import { 
  Loader2Icon, 
  ArrowLeftIcon,
  ChevronRightIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  MinusIcon
} from "lucide-react";
import Link from "next/link";

function CompareContent() {
  const searchParams = useSearchParams();
  const id1 = searchParams.get("id1");
  const id2 = searchParams.get("id2");

  const [runs, setRuns] = useState<any[]>([]);
  const [run1, setRun1] = useState<any>(null);
  const [run2, setRun2] = useState<any>(null);
  const [stats1, setStats1] = useState<any>(null);
  const [stats2, setStats2] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchRuns = async () => {
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/v1/runs`);
      const data = await res.json();
      setRuns(data);

      if (id1) {
        const r1 = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/v1/runs/${id1}`).then(r => r.json());
        const c1 = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/v1/runs/${id1}/cases`).then(r => r.json());
        setRun1(r1);
        setStats1(aggregateStats(c1));
      }

      if (id2) {
        const r2 = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/v1/runs/${id2}`).then(r => r.json());
        const c2 = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/v1/runs/${id2}/cases`).then(r => r.json());
        setRun2(r2);
        setStats2(aggregateStats(c2));
      }
    } catch (error) {
      console.error("Failed to fetch runs for comparison:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, [id1, id2]);

  const aggregateStats = (cases: any[]) => {
    const validCases = cases.filter(c => c.evaluation);
    const fields = ["chief_complaint", "vitals", "medications", "diagnoses", "plan", "follow_up"];
    
    const aggregates: any = {};
    fields.forEach(f => {
      const sum = validCases.reduce((acc, curr) => acc + curr.evaluation.fieldScores[f], 0);
      aggregates[f] = sum / validCases.length;
    });

    aggregates.totalF1 = Object.values(aggregates).reduce((a: any, b: any) => (a as number) + (b as number), 0) / fields.length;
    aggregates.hallucinations = validCases.reduce((acc, curr) => acc + curr.evaluation.hallucinationsCount, 0) / validCases.length;
    
    return aggregates;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2Icon className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 h-full overflow-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/runs" className={buttonVariants({ variant: "ghost", size: "icon" })}>
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Compare Runs</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        <RunSelector 
          label="Run A (Baseline)" 
          selected={run1} 
          runs={runs} 
          onSelect={(id: string) => window.location.href = `/compare?id1=${id}&id2=${id2 || ""}`} 
        />
        <RunSelector 
          label="Run B (Challenger)" 
          selected={run2} 
          runs={runs} 
          onSelect={(id: string) => window.location.href = `/compare?id1=${id1 || ""}&id2=${id}`} 
        />
      </div>

      {stats1 && stats2 ? (
        <div className="space-y-8 pb-12">
          <Card>
            <CardHeader>
              <CardTitle>Metric Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <CompareRow label="Overall F1 Score" val1={stats1.totalF1} val2={stats2.totalF1} isPercentage showWinner />
                <div className="h-px bg-muted" />
                <CompareRow label="Chief Complaint" val1={stats1.chief_complaint} val2={stats2.chief_complaint} isPercentage showWinner />
                <CompareRow label="Vitals" val1={stats1.vitals} val2={stats2.vitals} isPercentage showWinner />
                <CompareRow label="Medications" val1={stats1.medications} val2={stats2.medications} isPercentage showWinner />
                <CompareRow label="Diagnoses" val1={stats1.diagnoses} val2={stats2.diagnoses} isPercentage showWinner />
                <CompareRow label="Plan" val1={stats1.plan} val2={stats2.plan} isPercentage showWinner />
                <CompareRow label="Follow Up" val1={stats1.follow_up} val2={stats2.follow_up} isPercentage showWinner />
                <div className="h-px bg-muted" />
                <CompareRow label="Avg. Hallucinations" val1={stats1.hallucinations} val2={stats2.hallucinations} inverse showWinner />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Efficiency Comparison</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CompareRow label="Avg. Cost / Case" val1={run1.costUsd / run1.totalCases} val2={run2.costUsd / run2.totalCases} format={(v: number) => `$${v.toFixed(4)}`} inverse />
                <CompareRow label="Total Tokens" val1={run1.tokensInput + run1.tokensOutput} val2={run2.tokensInput + run2.tokensOutput} inverse />
                <CompareRow label="Cache Hit Rate" val1={run1.tokensCacheRead / (run1.tokensInput + run1.tokensCacheRead)} val2={run2.tokensCacheRead / (run2.tokensInput + run2.tokensCacheRead)} isPercentage />
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Summary</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">Strategy Winner</p>
                  <p className="text-4xl font-black text-primary">
                    {stats2.totalF1 > stats1.totalF1 ? run2.strategy.toUpperCase() : run1.strategy.toUpperCase()}
                  </p>
                  <p className="text-sm mt-4 text-muted-foreground max-w-[200px]">
                    {run2.strategy.toUpperCase()} is {Math.abs(((stats2.totalF1 - stats1.totalF1) / stats1.totalF1) * 100).toFixed(1)}% {stats2.totalF1 > stats1.totalF1 ? "better" : "worse"} than {run1.strategy.toUpperCase()}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border-2 border-dashed rounded-xl">
          <p>Select two runs to compare their performance</p>
        </div>
      )}
    </div>
  );
}

function RunSelector({ label, selected, runs, onSelect }: any) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</label>
      <select 
        className="w-full h-12 px-4 rounded-lg border bg-background"
        value={selected?.id || ""}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">Select a run...</option>
        {runs.map((r: any) => (
          <option key={r.id} value={r.id}>
            {new Date(r.createdAt).toLocaleDateString()} - {r.strategy.toUpperCase()} ({r.model})
          </option>
        ))}
      </select>
      {selected && (
        <div className="p-4 bg-muted/30 rounded-lg mt-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium">{selected.status}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground">Cases</span>
            <span className="font-medium">{selected.completedCases} / {selected.totalCases}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CompareRow({ label, val1, val2, isPercentage, inverse, format, showWinner }: any) {
  const delta = val2 - val1;
  const isBetter = inverse ? delta < 0 : delta > 0;
  const isNeutral = Math.abs(delta) < 0.0001;

  const displayVal1 = format ? format(val1) : (isPercentage ? (val1 * 100).toFixed(1) + "%" : val1.toFixed(2));
  const displayVal2 = format ? format(val2) : (isPercentage ? (val2 * 100).toFixed(1) + "%" : val2.toFixed(2));
  const displayDelta = isPercentage ? (Math.abs(delta) * 100).toFixed(1) + "%" : Math.abs(delta).toFixed(2);

  return (
    <div className={`flex items-center justify-between py-2 rounded-lg px-2 ${showWinner && !isNeutral ? (isBetter ? "bg-green-50/30" : "bg-red-50/30") : ""}`}>
      <span className="font-medium text-sm w-1/3">{label}</span>
      <div className="flex-1 grid grid-cols-3 items-center">
        <span className={`text-center font-mono text-sm ${showWinner && !isBetter && !isNeutral ? "text-muted-foreground line-through opacity-50" : ""}`}>{displayVal1}</span>
        <div className="flex items-center justify-center">
          {isNeutral ? (
            <MinusIcon className="w-4 h-4 text-muted-foreground" />
          ) : isBetter ? (
            <div className="flex items-center gap-1 text-green-600 font-bold text-[10px] bg-green-100 px-2 py-0.5 rounded-full border border-green-200">
              <TrendingUpIcon className="w-3 h-3" />
              +{displayDelta}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-red-600 font-bold text-[10px] bg-red-100 px-2 py-0.5 rounded-full border border-red-200">
              <TrendingDownIcon className="w-3 h-3" />
              -{displayDelta}
            </div>
          )}
        </div>
        <span className={`text-center font-mono text-sm font-bold ${showWinner && isBetter ? "text-green-700" : ""}`}>{displayVal2}</span>
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2Icon className="w-8 h-8 animate-spin" /></div>}>
      <CompareContent />
    </Suspense>
  );
}
