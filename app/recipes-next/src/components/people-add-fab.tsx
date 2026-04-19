"use client";

import { createPersonAndRedirectAction } from "@/app/actions/people";
import { Plus } from "@phosphor-icons/react";
import { useTransition } from "react";

export function PeopleAddFab() {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="inventory-add-fab-wrap">
      <button
        type="button"
        className="inventory-add-fab"
        aria-label="Add person"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            await createPersonAndRedirectAction();
          });
        }}
      >
        <Plus size={20} weight="bold" color="var(--paper)" aria-hidden />
      </button>
    </div>
  );
}
