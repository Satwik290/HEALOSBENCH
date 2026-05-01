"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { env } from "@test-evals/env/web";
import { Button } from "@test-evals/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@test-evals/ui/components/card";
import { 
  PlusIcon, 
  PlayIcon, 
  PauseIcon, 
  CheckCircle2Icon, 
  XCircleIcon,
  Loader2Icon,
  ChevronRightIcon
} from "lucide-react";

export default function RunsPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = async () => {
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/v1/runs`);
      const data = await res.json();
      setRuns(data);
    } catch (error) {
      console.error("Failed to fetch runs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const startNewRun = async (strategy: string) => {
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/v1/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy })
      });
      const data = await res.json();
      setRuns([data, ...runs]);
    } catch (error) {
      console.error("Failed to start run:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2Icon className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Evaluation Runs</h1>
          <p className="text-muted-foreground mt-1">Track and compare different prompt strategies.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => startNewRun("zero_shot")}>
            <PlusIcon className="w-4 h-4 mr-2" />
            Zero Shot
          </Button>
          <Button onClick={() => startNewRun("few_shot")} variant="outline">
            <PlusIcon className="w-4 h-4 mr-2" />
            Few Shot
          </Button>
          <Button onClick={() => startNewRun("cot")} variant="secondary">
            <PlusIcon className="w-4 h-4 mr-2" />
            CoT
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {runs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">No evaluation runs yet.</p>
              <Button onClick={() => startNewRun("zero_shot")}>Start your first run</Button>
            </CardContent>
          </Card>
        ) : (
          runs.map((run) => (
            <Link key={run.id} href={`/runs/${run.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer group">
                <CardContent className="p-0">
                  <div className="flex items-center p-6">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted mr-4">
                      {run.status === "running" && <Loader2Icon className="w-5 h-5 animate-spin text-primary" />}
                      {run.status === "completed" && <CheckCircle2Icon className="w-5 h-5 text-green-500" />}
                      {run.status === "failed" && <XCircleIcon className="w-5 h-5 text-destructive" />}
                      {run.status === "paused" && <PauseIcon className="w-5 h-5 text-yellow-500" />}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">
                          {run.strategy.toUpperCase()} - {run.model}
                        </h3>
                        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
                          {new Date(run.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                        <span>Progress: {run.completedCases} / {run.totalCases}</span>
                        <span>Cost: ${run.costUsd.toFixed(4)}</span>
                        {run.durationMs > 0 && <span>Duration: {(run.durationMs / 1000).toFixed(1)}s</span>}
                      </div>
                    </div>

                    <div className="ml-4">
                      <ChevronRightIcon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                  
                  {run.status === "running" && (
                    <div className="h-1 bg-muted overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-500" 
                        style={{ width: `${(run.completedCases / run.totalCases) * 100}%` }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
