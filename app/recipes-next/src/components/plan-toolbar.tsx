"use client";

import { suggestMealPlanWithAiAction } from "@/app/actions/meal-plan";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const DEFAULT_MODEL = "gpt-4o-mini";

export function PlanToolbar() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aiBusy, setAiBusy] = useState(false);

  const refresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const runAi = async () => {
    setAiBusy(true);
    try {
      const result = await suggestMealPlanWithAiAction(DEFAULT_MODEL);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      const tips = result.shoppingSuggestions?.slice(0, 8) ?? [];
      if (tips.length) {
        window.alert(`Plan updated.\n\nShopping ideas:\n${tips.join("\n")}`);
      }
      router.refresh();
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="plan-week-actions">
      <button
        type="button"
        className="secondary"
        onClick={refresh}
        disabled={pending}
      >
        Refresh
      </button>
      <button
        type="button"
        className="primary"
        onClick={() => void runAi()}
        disabled={aiBusy || pending}
      >
        AI suggest week
      </button>
    </div>
  );
}
