"use client";

import { updatePersonPatchAction } from "@/app/actions/people";
import { PersonNutrientSliders } from "@/components/person-nutrient-sliders";
import { formatListValue } from "@/lib/text";
import type { PersonRow } from "@/types/database";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

type Props = {
  person: PersonRow;
};

function str(v: string | null | undefined) {
  return v ?? "";
}

function numField(v: string | null | undefined) {
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

function dateInputValue(v: string | null | undefined) {
  const s = str(v);
  if (!s) return "";
  return s.slice(0, 10);
}

export function PersonDetailForm({ person }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(() => str(person.name));
  const [birthDate, setBirthDate] = useState(() => dateInputValue(person.birth_date));
  const [weight, setWeight] = useState(() => numField(person.weight));
  const [height, setHeight] = useState(() => str(person.height));
  const [dailyBurn, setDailyBurn] = useState(() =>
    numField(person.daily_calorie_expenditure),
  );
  const [dietary, setDietary] = useState(() => formatListValue(person.dietary_restrictions));
  const [allergies, setAllergies] = useState(() => formatListValue(person.allergies));

  const save = useCallback(
    (patch: Record<string, unknown>) => {
      setError(null);
      startTransition(async () => {
        const r = await updatePersonPatchAction(person.id, patch);
        if (r.ok) router.refresh();
        else setError(r.error);
      });
    },
    [person.id, router],
  );

  const blurName = useCallback(() => {
    const next = name.trim();
    if (!next) {
      setName(str(person.name));
      return;
    }
    if (next === str(person.name)) return;
    save({ name: next });
  }, [name, person.name, save]);

  const blurBirth = useCallback(() => {
    if (birthDate === dateInputValue(person.birth_date)) return;
    save({ birth_date: birthDate });
  }, [birthDate, person.birth_date, save]);

  const blurHeight = useCallback(() => {
    const next = height.trim();
    if (next === str(person.height)) return;
    save({ height: next });
  }, [height, person.height, save]);

  const blurWeight = useCallback(() => {
    if (weight.trim() === numField(person.weight)) return;
    save({ weight: weight.trim() });
  }, [person.weight, save, weight]);

  const blurDailyBurn = useCallback(() => {
    if (dailyBurn.trim() === numField(person.daily_calorie_expenditure)) return;
    save({ daily_calorie_expenditure: dailyBurn.trim() });
  }, [dailyBurn, person.daily_calorie_expenditure, save]);

  const blurDietary = useCallback(() => {
    if (dietary.trim() === formatListValue(person.dietary_restrictions)) return;
    save({ dietary_restrictions: dietary });
  }, [dietary, person.dietary_restrictions, save]);

  const blurAllergies = useCallback(() => {
    if (allergies.trim() === formatListValue(person.allergies)) return;
    save({ allergies });
  }, [allergies, person.allergies, save]);

  return (
    <div className="person-detail-form">
      {error ? (
        <p className="person-detail-form-message person-detail-form-message--error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="person-detail-rows">
        <div className="person-detail-row person-detail-row--name">
          <label className="person-detail-field person-detail-field--full">
            <span className="recipe-meta-label">Name</span>
            <input
              className="person-detail-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={blurName}
              required
              autoComplete="name"
            />
          </label>
        </div>

        <div className="person-detail-row person-detail-row--3">
          <label className="person-detail-field">
            <span className="recipe-meta-label">Birth date</span>
            <input
              className="recipe-source-input"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              onBlur={blurBirth}
            />
          </label>
          <label className="person-detail-field">
            <span className="recipe-meta-label">Height</span>
            <input
              className="recipe-source-input"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              onBlur={blurHeight}
              placeholder="e.g. 5 ft 7 in"
            />
          </label>
          <label className="person-detail-field">
            <span className="recipe-meta-label">Weight (lbs)</span>
            <input
              className="recipe-source-input"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onBlur={blurWeight}
            />
          </label>
        </div>

        <div className="person-detail-row person-detail-row--full">
          <label className="person-detail-field person-detail-field--full">
            <span className="recipe-meta-label">Daily burn (cal)</span>
            <input
              className="recipe-source-input"
              inputMode="numeric"
              value={dailyBurn}
              onChange={(e) => setDailyBurn(e.target.value)}
              onBlur={blurDailyBurn}
            />
          </label>
        </div>

        <PersonNutrientSliders person={person} onError={setError} />

        <div className="person-detail-row person-detail-row--full">
          <label className="person-detail-field person-detail-field--full">
            <span className="recipe-meta-label">Dietary restrictions</span>
            <textarea
              className="recipe-source-input recipe-detail-textarea"
              value={dietary}
              onChange={(e) => setDietary(e.target.value)}
              onBlur={blurDietary}
              placeholder="Comma-separated, e.g. Dairy-free, Vegetarian"
              rows={3}
            />
          </label>
        </div>

        <div className="person-detail-row person-detail-row--full">
          <label className="person-detail-field person-detail-field--full">
            <span className="recipe-meta-label">Allergies</span>
            <textarea
              className="recipe-source-input recipe-detail-textarea"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              onBlur={blurAllergies}
              placeholder="Comma-separated"
              rows={3}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
