"use client";

import { useEffect, useState, use } from "react";
import { env } from "@test-evals/env/web";
import { Button, buttonVariants } from "@test-evals/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@test-evals/ui/components/card";
import { 
  Loader2Icon, 
  ArrowLeftIcon,
  CheckCircle2Icon,
  XCircleIcon,
  AlertCircleIcon,
  ExternalLinkIcon
} from "lucide-react";
import Link from "next/link";

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<any>(null);
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [caseLoading, setCaseLoading] = useState(false);

  const fetchRun = async () => {
    try {
      const runRes = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/v1/runs/${id}`);
      const runData = await runRes.json();
      setRun(runData);

      const casesRes = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/v1/runs/${id}/cases`);
      const casesData = await casesRes.json();
      setCases(casesData);
    } catch (error) {
      console.error("Failed to fetch run details:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRun();

    // SSE for updates if running
    const eventSource = new EventSource(`${env.NEXT_PUBLIC_SERVER_URL}/api/v1/runs/${id}/events`);
    
    eventSource.addEventListener("progress", (event) => {
      const data = JSON.parse(event.data);
      // Refresh run and cases
      fetchRun();
    });

    eventSource.addEventListener("complete", () => {
      fetchRun();
      eventSource.close();
    });

    return () => {
      eventSource.close();
    };
  }, [id]);

  const selectCase = async (caseId: string) => {
    setCaseLoading(true);
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/v1/cases/${caseId}`);
      const data = await res.json();
      setSelectedCase(data);
    } catch (error) {
      console.error("Failed to fetch case details:", error);
    } finally {
      setCaseLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2Icon className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertCircleIcon className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold">Run not found</h2>
        <Button asChild className="mt-4">
          <Link href="/runs">Back to Runs</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 h-full overflow-hidden flex flex-col">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/runs" className={buttonVariants({ variant: "ghost", size: "icon" })}>
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {run.strategy.toUpperCase()} Run
          </h1>
          <p className="text-sm text-muted-foreground">
            {run.model} • {new Date(run.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          {(run.status === "paused" || run.status === "failed" || run.status === "running") && (
            <Button size="sm" onClick={() => fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/v1/runs/${id}/resume`, { method: "POST" })}>
              {run.status === "running" ? "Force Refresh" : "Resume Run"}
            </Button>
          )}
          <Link href={`/compare?id1=${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Compare Run
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Status" value={run.status.toUpperCase()} />
        <StatCard label="Progress" value={`${run.completedCases} / ${run.totalCases}`} />
        <StatCard label="Total Cost" value={`$${run.costUsd.toFixed(4)}`} />
        <StatCard label="Cache Read" value={`${(run.tokensCacheRead || 0).toLocaleString()}`} />
        <StatCard label="Avg. Score" value={calculateAvgScore(cases)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
        <Card className="flex flex-col min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Cases</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-3 font-medium">Case ID</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">F1 Score</th>
                  <th className="text-right p-3 font-medium">Halluc.</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cases.map((c) => (
                  <tr 
                    key={c.id} 
                    className={`hover:bg-muted/30 cursor-pointer transition-colors ${selectedCase?.id === c.id ? "bg-muted/50" : ""}`}
                    onClick={() => selectCase(c.id)}
                  >
                    <td className="p-3 font-mono">{c.transcriptId}</td>
                    <td className="p-3">
                      {c.status === "completed" ? (
                        <CheckCircle2Icon className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircleIcon className="w-4 h-4 text-destructive" />
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {c.evaluation ? (getAggregateF1(c.evaluation.fieldScores) * 100).toFixed(0) + "%" : "-"}
                    </td>
                    <td className="p-3 text-right">
                      {c.evaluation?.hallucinationsCount ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="flex flex-col min-h-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              Detail View
              {selectedCase && (
                <span className="text-sm font-mono text-muted-foreground">{selectedCase.transcriptId}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-6">
            {!selectedCase ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <p>Select a case to see details</p>
              </div>
            ) : caseLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2Icon className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <CaseDetail caseData={selectedCase} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

function getAggregateF1(scores: any) {
  if (!scores) return 0;
  const fields = ["chief_complaint", "vitals", "medications", "diagnoses", "plan", "follow_up"];
  const sum = fields.reduce((acc, field) => acc + (scores[field] || 0), 0);
  return sum / fields.length;
}

function calculateAvgScore(cases: any[]) {
  const validCases = cases.filter(c => c.evaluation);
  if (validCases.length === 0) return "-";
  
  const sum = validCases.reduce((acc, c) => acc + getAggregateF1(c.evaluation.fieldScores), 0);
  const avg = sum / validCases.length;
  return (avg * 100).toFixed(1) + "%";
}

function CaseDetail({ caseData }: { caseData: any }) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-bold mb-2 uppercase text-muted-foreground">Gold Standard</h4>
          <pre className="bg-muted p-4 rounded text-xs overflow-auto max-h-[300px]">
            {JSON.stringify(caseData.gold, null, 2)}
          </pre>
        </div>
        <div>
          <h4 className="text-sm font-bold mb-2 uppercase text-muted-foreground">Predicted Output</h4>
          <pre className="bg-primary/5 p-4 rounded text-xs border border-primary/10 overflow-auto max-h-[300px]">
            {JSON.stringify(caseData.generation.rawOutput, null, 2)}
          </pre>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-bold mb-2 uppercase text-muted-foreground">Transcript Grounding</h4>
        <div className="bg-muted/30 p-4 rounded text-sm whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-auto">
          {highlightGrounding(caseData.transcript, caseData.generation.rawOutput)}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-bold mb-2 uppercase text-muted-foreground">LLM Trace</h4>
        <div className="space-y-4">
          {caseData.generation.trace.map((t: any, i: number) => (
            <details key={i} className="border rounded">
              <summary className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                Attempt {t.attempt} - {
                  t.response.usage?.input_tokens ?? t.response.usageMetadata?.promptTokenCount ?? 0
                } in / {
                  t.response.usage?.output_tokens ?? t.response.usageMetadata?.candidatesTokenCount ?? 0
                } out
              </summary>
              <div className="p-4 bg-muted/20 border-t space-y-4">
                {t.requestMessages.map((m: any, j: number) => (
                  <div key={j} className="space-y-1">
                    <span className="text-xs font-bold uppercase">{m.role}</span>
                    <pre className="text-[10px] whitespace-pre-wrap bg-white/50 p-2 rounded">
                      {JSON.stringify(m.content, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

// Simple highlighter for grounded text
function highlightGrounding(transcript: string, prediction: any) {
  // Extract all strings from prediction
  const strings: string[] = [];
  const collectStrings = (obj: any) => {
    if (typeof obj === "string" && obj.length > 5) strings.push(obj);
    else if (Array.isArray(obj)) obj.forEach(collectStrings);
    else if (obj && typeof obj === "object") Object.values(obj).forEach(collectStrings);
  };
  collectStrings(prediction);

  // This is a naive implementation. A real one would use ranges.
  // We'll just split and check.
  let content = transcript;
  
  // Sort strings by length to replace longer ones first
  strings.sort((a, b) => b.length - a.length);

  // We can't easily highlight with overlapping spans in React without a more complex structure.
  // For demo, we'll just return the text.
  return transcript;
}
