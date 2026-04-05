"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

export interface TamagotchiState {
  id: string;
  hunger: number;
  happy: number;
  care_mistakes: number;
  age: number;
  born_at: string;
  last_fed: string;
  last_played: string;
  last_hunger_zero: string | null;
  last_happy_zero: string | null;
  play_count_today: number;
  play_count_date: string;
  last_routine_bonus: string | null;
  last_diary_bonus: string | null;
  last_visit: string;
  poop: number;
  sick: boolean;
}

const HUNGER_DECAY_MS = 2 * 60 * 60 * 1000; // 2h
const HAPPY_DECAY_MS = 1 * 60 * 60 * 1000;  // 1h
const CARE_MISS_MS = 30 * 60 * 1000;         // 30min

const MAX_HUNGER = 4;
const MAX_HAPPY = 8;
const MAX_POOP = 3;
const MAX_PLAY_PER_DAY = 4;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── accurateInterval: drift-free timer (from elisavetTriant) ──
function accurateInterval(callback: () => void, time: number) {
  let nextAt = Date.now() + time;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  function tick() {
    if (cancelled) return;
    callback();
    nextAt += time;
    const delay = Math.max(0, nextAt - Date.now());
    timer = setTimeout(tick, delay);
  }

  timer = setTimeout(tick, time);
  return {
    cancel() {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  };
}

function applyDecay(state: TamagotchiState): TamagotchiState {
  const now = Date.now();
  const s = { ...state };

  // Reset play count if date changed
  if (s.play_count_date !== todayStr()) {
    s.play_count_today = 0;
    s.play_count_date = todayStr();
  }

  // Hunger decay: -1 per 2h since last_fed (2x if sick)
  const hungerInterval = s.sick ? HUNGER_DECAY_MS / 2 : HUNGER_DECAY_MS;
  const fedElapsed = now - new Date(s.last_fed).getTime();
  const hungerTicks = Math.floor(fedElapsed / hungerInterval);
  if (hungerTicks > 0) {
    s.hunger = Math.max(0, s.hunger - hungerTicks);
    s.last_fed = new Date(
      new Date(s.last_fed).getTime() + hungerTicks * hungerInterval
    ).toISOString();

    // Poop chance per tick
    for (let i = 0; i < hungerTicks && s.poop < MAX_POOP; i++) {
      const chance = s.hunger >= 3 ? 0.3 : 0.15;
      if (Math.random() < chance) {
        s.poop = Math.min(MAX_POOP, s.poop + 1);
      }
    }

    // Sick chance if poop=3
    if (s.poop >= MAX_POOP && !s.sick && Math.random() < 0.1) {
      s.sick = true;
    }
  }

  // Happy decay: -1 per 1h since last_played
  const playedElapsed = now - new Date(s.last_played).getTime();
  const happyTicks = Math.floor(playedElapsed / HAPPY_DECAY_MS);
  if (happyTicks > 0) {
    s.happy = Math.max(0, s.happy - happyTicks);
    s.last_played = new Date(
      new Date(s.last_played).getTime() + happyTicks * HAPPY_DECAY_MS
    ).toISOString();
  }

  // Care mistakes: if hunger=0 for 30+ min
  if (s.hunger === 0) {
    if (!s.last_hunger_zero) {
      s.last_hunger_zero = new Date().toISOString();
    } else {
      const zeroElapsed = now - new Date(s.last_hunger_zero).getTime();
      const missTicks = Math.floor(zeroElapsed / CARE_MISS_MS);
      if (missTicks > 0) {
        s.care_mistakes += missTicks;
        s.last_hunger_zero = new Date(
          new Date(s.last_hunger_zero).getTime() + missTicks * CARE_MISS_MS
        ).toISOString();
      }
    }
  } else {
    s.last_hunger_zero = null;
  }

  // Care mistakes: if happy=0 for 30+ min
  if (s.happy === 0) {
    if (!s.last_happy_zero) {
      s.last_happy_zero = new Date().toISOString();
    } else {
      const zeroElapsed = now - new Date(s.last_happy_zero).getTime();
      const missTicks = Math.floor(zeroElapsed / CARE_MISS_MS);
      if (missTicks > 0) {
        s.care_mistakes += missTicks;
        s.last_happy_zero = new Date(
          new Date(s.last_happy_zero).getTime() + missTicks * CARE_MISS_MS
        ).toISOString();
      }
    }
  } else {
    s.last_happy_zero = null;
  }

  // Age: days since born
  s.age = Math.floor(
    (now - new Date(s.born_at).getTime()) / (24 * 60 * 60 * 1000)
  );

  s.last_visit = new Date().toISOString();
  return s;
}

export function useTamagotchi() {
  const [state, setState] = useState<TamagotchiState | null>(null);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const actionLock = useRef(false);
  const hungerTimer = useRef<{ cancel: () => void } | null>(null);
  const happyTimer = useRef<{ cancel: () => void } | null>(null);

  const save = useCallback(async (s: TamagotchiState) => {
    const { id, ...rest } = s;
    await supabase
      .from("tamagotchi_state")
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq("id", id);
  }, []);

  const debouncedSave = useCallback(
    (s: TamagotchiState) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(s), 500);
    },
    [save]
  );

  // Load state and apply decay
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("tamagotchi_state")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (data) {
        const decayed = applyDecay(data as TamagotchiState);
        setState(decayed);
        save(decayed);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Live decay timers (accurateInterval) ──
  useEffect(() => {
    if (!state) return;

    // Hunger: -1 every 2h (1h if sick)
    const hungerMs = state.sick ? HUNGER_DECAY_MS / 2 : HUNGER_DECAY_MS;
    hungerTimer.current = accurateInterval(() => {
      setState((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        next.hunger = Math.max(0, next.hunger - 1);
        next.last_fed = new Date().toISOString();
        // Poop chance
        if (next.poop < MAX_POOP) {
          const chance = next.hunger >= 3 ? 0.3 : 0.15;
          if (Math.random() < chance) next.poop = Math.min(MAX_POOP, next.poop + 1);
        }
        if (next.poop >= MAX_POOP && !next.sick && Math.random() < 0.1) {
          next.sick = true;
        }
        debouncedSave(next);
        return next;
      });
    }, hungerMs);

    // Happy: -1 every 1h
    happyTimer.current = accurateInterval(() => {
      setState((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        next.happy = Math.max(0, next.happy - 1);
        next.last_played = new Date().toISOString();
        debouncedSave(next);
        return next;
      });
    }, HAPPY_DECAY_MS);

    return () => {
      hungerTimer.current?.cancel();
      happyTimer.current?.cancel();
    };
    // Only restart timers when sick status changes (affects hunger rate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.sick]);

  // Check app bonuses (routine & diary)
  useEffect(() => {
    if (!state) return;
    (async () => {
      const today = todayStr();
      let updated = { ...state };
      let changed = false;

      if (updated.last_routine_bonus !== today) {
        const { count } = await supabase
          .from("routine_checks")
          .select("id", { count: "exact", head: true })
          .eq("date", today);
        if (count && count > 0) {
          updated.happy = Math.min(MAX_HAPPY, updated.happy + 2);
          updated.last_routine_bonus = today;
          changed = true;
        }
      }

      if (updated.last_diary_bonus !== today) {
        const { count } = await supabase
          .from("diary_entries")
          .select("id", { count: "exact", head: true })
          .eq("date", today);
        if (count && count > 0) {
          updated.happy = Math.min(MAX_HAPPY, updated.happy + 1);
          updated.last_diary_bonus = today;
          changed = true;
        }
      }

      if (changed) {
        setState(updated);
        save(updated);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.last_routine_bonus, state?.last_diary_bonus]);

  const feed = useCallback(() => {
    if (actionLock.current) return;
    actionLock.current = true;
    setState((prev) => {
      if (!prev) { actionLock.current = false; return prev; }
      const next = {
        ...prev,
        hunger: Math.min(MAX_HUNGER, prev.hunger + 1),
        last_fed: new Date().toISOString(),
        last_hunger_zero: null,
      };
      debouncedSave(next);
      setTimeout(() => { actionLock.current = false; }, 300);
      return next;
    });
  }, [debouncedSave]);

  const play = useCallback(() => {
    if (actionLock.current) return;
    actionLock.current = true;
    setState((prev) => {
      if (!prev) { actionLock.current = false; return prev; }
      const today = todayStr();
      const countToday =
        prev.play_count_date === today ? prev.play_count_today : 0;
      if (countToday >= MAX_PLAY_PER_DAY) { actionLock.current = false; return prev; }
      const next = {
        ...prev,
        happy: Math.min(MAX_HAPPY, prev.happy + 1),
        last_played: new Date().toISOString(),
        last_happy_zero: null,
        play_count_today: countToday + 1,
        play_count_date: today,
      };
      debouncedSave(next);
      setTimeout(() => { actionLock.current = false; }, 300);
      return next;
    });
  }, [debouncedSave]);

  const cleanPoop = useCallback(() => {
    if (actionLock.current) return;
    actionLock.current = true;
    setState((prev) => {
      if (!prev || prev.poop <= 0) { actionLock.current = false; return prev; }
      const next = { ...prev, poop: 0 };
      debouncedSave(next);
      setTimeout(() => { actionLock.current = false; }, 300);
      return next;
    });
  }, [debouncedSave]);

  const heal = useCallback(() => {
    if (actionLock.current) return;
    actionLock.current = true;
    setState((prev) => {
      if (!prev || !prev.sick) { actionLock.current = false; return prev; }
      const next = { ...prev, sick: false };
      debouncedSave(next);
      setTimeout(() => { actionLock.current = false; }, 300);
      return next;
    });
  }, [debouncedSave]);

  const resetStats = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      const now = new Date().toISOString();
      const next: TamagotchiState = {
        ...prev,
        hunger: MAX_HUNGER,
        happy: MAX_HAPPY,
        poop: 0,
        sick: false,
        care_mistakes: 0,
        last_fed: now,
        last_played: now,
        last_hunger_zero: null,
        last_happy_zero: null,
      };
      save(next);
      return next;
    });
  }, [save]);

  return { state, loading, feed, play, cleanPoop, heal, resetStats };
}
