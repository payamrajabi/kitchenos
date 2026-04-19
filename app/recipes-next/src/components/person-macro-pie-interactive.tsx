"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

import { updatePersonMacrosAction } from "@/app/actions/people";
import {
  PersonMacroPie,
  type PersonMacroPieCommit,
} from "@/components/person-macro-pie";
import type { PersonMacroCalories } from "@/lib/people-macros";

type Props = {
  personId: number;
  name: string;
  macros: PersonMacroCalories;
};

export function PersonMacroPieInteractive({ personId, name, macros }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const onCommit = useCallback(
    (draft: PersonMacroPieCommit) => {
      startTransition(async () => {
        const res = await updatePersonMacrosAction(personId, draft);
        if (res.ok) router.refresh();
      });
    },
    [personId, router],
  );

  return (
    <PersonMacroPie
      name={name}
      macros={macros}
      interactive
      onCommit={onCommit}
    />
  );
}
