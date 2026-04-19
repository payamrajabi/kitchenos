"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useTransition, type MouseEvent } from "react";

import { updatePersonMacrosAction } from "@/app/actions/people";
import {
  PersonMacroPie,
  type PersonMacroPieCommit,
} from "@/components/person-macro-pie";
import type { PersonMacroCalories } from "@/lib/people-macros";

type Props = {
  personId: number;
  name: string;
  macros: PersonMacroCalories | null;
};

export function PersonMacroPieCard({ personId, name, macros }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const didDragRef = useRef(false);

  const onDragChange = useCallback((isDragging: boolean) => {
    if (isDragging) {
      didDragRef.current = true;
    } else {
      // Keep the "just finished dragging" flag around until the click fires.
      window.setTimeout(() => {
        didDragRef.current = false;
      }, 250);
    }
  }, []);

  const onCommit = useCallback(
    (draft: PersonMacroPieCommit) => {
      startTransition(async () => {
        const res = await updatePersonMacrosAction(personId, draft);
        if (res.ok) router.refresh();
      });
    },
    [personId, router],
  );

  const onLinkClick = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    if (didDragRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const label = macros
    ? `${name}, macro mix pie chart, ${Math.round(macros.targetCalories)} calories per day target`
    : `${name}, open profile`;

  return (
    <Link
      href={`/people/${personId}`}
      className="people-card-link"
      aria-label={label}
      onClick={onLinkClick}
      draggable={false}
    >
      <article className="people-card">
        <div className="people-card-pie">
          {macros ? (
            <PersonMacroPie
              name={name}
              macros={macros}
              interactive
              onCommit={onCommit}
              onDragChange={onDragChange}
            />
          ) : (
            <div className="people-card-pie-placeholder" aria-hidden />
          )}
        </div>
        <h3 className="people-card-name">{name}</h3>
      </article>
    </Link>
  );
}
