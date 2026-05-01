import { describe, expect, it } from "bun:test";
import { 
  evaluateChiefComplaint, 
  evaluateVitals, 
  evaluateMedications,
  countHallucinations
} from "./evaluate.service";

describe("Evaluation Metrics", () => {
  describe("Chief Complaint (Fuzzy)", () => {
    it("should match identical strings", () => {
      expect(evaluateChiefComplaint("Headache", "Headache")).toBe(1);
    });

    it("should match case-insensitive strings", () => {
      expect(evaluateChiefComplaint("headache", "Headache")).toBe(1);
    });

    it("should handle partial matches", () => {
      const score = evaluateChiefComplaint("Severe migrane headache", "Headache");
      expect(score).toBeGreaterThan(0.3);
    });
  });

  describe("Vitals (Numeric Tolerant)", () => {
    it("should handle exact matches", () => {
      const pred = { bp: "120/80", hr: 72, temp_f: 98.6, spo2: 98 };
      const gold = { bp: "120/80", hr: 72, temp_f: 98.6, spo2: 98 };
      expect(evaluateVitals(pred, gold)).toBe(1);
    });

    it("should handle temperature tolerance", () => {
      const pred = { bp: "120/80", hr: 72, temp_f: 98.8, spo2: 98 };
      const gold = { bp: "120/80", hr: 72, temp_f: 98.6, spo2: 98 };
      expect(evaluateVitals(pred, gold)).toBe(1); // 98.8 - 98.6 = 0.2
    });

    it("should fail on out of tolerance temperature", () => {
      const pred = { bp: "120/80", hr: 72, temp_f: 99.0, spo2: 98 };
      const gold = { bp: "120/80", hr: 72, temp_f: 98.6, spo2: 98 };
      expect(evaluateVitals(pred, gold)).toBe(0.75); // 3 out of 4 fields match
    });
  });

  describe("Medications (Set F1 + Normalization)", () => {
    it("should match semantic equivalents", () => {
      const pred = [{ name: "Tylenol", dose: "500mg", frequency: "twice daily", route: "PO" }];
      const gold = [{ name: "Tylenol", dose: "500mg", frequency: "BID", route: "PO" }];
      expect(evaluateMedications(pred, gold)).toBe(1);
    });

    it("should calculate correct F1 for partial matches", () => {
      const pred = [{ name: "Tylenol", dose: "500mg", frequency: "QD", route: "PO" }];
      const gold = [
        { name: "Tylenol", dose: "500mg", frequency: "QD", route: "PO" },
        { name: "Advil", dose: "200mg", frequency: "PRN", route: "PO" }
      ];
      // Precision = 1/1 = 1, Recall = 1/2 = 0.5, F1 = 2*1*0.5 / (1+0.5) = 1/1.5 = 0.66
      expect(evaluateMedications(pred, gold)).toBeCloseTo(0.666);
    });
  });

  describe("Hallucination Detection", () => {
    const transcript = "Patient took Tylenol 500mg for headache.";

    it("should detect grounded fields", () => {
      const prediction = { medications: [{ name: "Tylenol" }] };
      expect(countHallucinations(prediction, transcript)).toBe(0);
    });

    it("should detect hallucinations", () => {
      const prediction = { medications: [{ name: "Amoxicillin" }] };
      expect(countHallucinations(prediction, transcript)).toBe(1);
    });
  });
});
