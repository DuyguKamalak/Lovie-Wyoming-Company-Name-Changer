"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import type { EntityType } from "@/lib/types";
import type { ChatMessage } from "@/lib/gemini";

export interface IntakeState {
  entityType: EntityType | null;
  history: ChatMessage[];
  knownFields: Record<string, string>;
  readyForReview: boolean;
}

export const initialState: IntakeState = {
  entityType: null,
  history: [],
  knownFields: {},
  readyForReview: false,
};

export type IntakeAction =
  | { type: "HYDRATE"; state: IntakeState }
  | { type: "SET_ENTITY_TYPE"; entityType: EntityType | null }
  | { type: "ADD_MESSAGE"; message: ChatMessage }
  | { type: "MERGE_KNOWN_FIELDS"; fields: Record<string, string> }
  | { type: "SET_FIELD"; field: string; value: string }
  | { type: "SET_READY_FOR_REVIEW"; ready: boolean }
  | { type: "START_OVER" };

export function reducer(state: IntakeState, action: IntakeAction): IntakeState {
  switch (action.type) {
    case "HYDRATE":
      return action.state;
    case "SET_ENTITY_TYPE":
      return { ...state, entityType: action.entityType };
    case "ADD_MESSAGE":
      return { ...state, history: [...state.history, action.message] };
    case "MERGE_KNOWN_FIELDS":
      return { ...state, knownFields: { ...state.knownFields, ...action.fields } };
    case "SET_FIELD":
      return { ...state, knownFields: { ...state.knownFields, [action.field]: action.value } };
    case "SET_READY_FOR_REVIEW":
      return { ...state, readyForReview: action.ready };
    case "START_OVER":
      return initialState;
    default:
      return state;
  }
}

// plan.md section 6, decision 2: survives a page refresh via sessionStorage
// (client-only — the server never sees this), clears on tab close or the
// explicit "Start over" action.
const STORAGE_KEY = "wyoming-name-changer:intake";

const IntakeStateContext = createContext<IntakeState | null>(null);
const IntakeDispatchContext = createContext<Dispatch<IntakeAction> | null>(null);
// True once the sessionStorage hydration attempt has finished (found data
// or not). Consumers that seed initial state client-side (e.g. the chat
// page's opening message) must wait for this — otherwise there's a race
// between "hydrate finished, found nothing" and "seed initial content",
// and whichever effect happens to run second wins unpredictably.
const IntakeHydratedContext = createContext(false);

export function IntakeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        dispatch({ type: "HYDRATE", state: JSON.parse(raw) as IntakeState });
      } catch {
        // Corrupted/unexpected storage contents — ignore and start fresh
        // rather than crash the app.
      }
    }
    // Intentional: this is the "syncing with an external system" case the
    // rule itself calls out as legitimate (reading sessionStorage once on
    // mount, a system React doesn't know about). The one extra render is
    // the point — consumers like the chat page need to distinguish "still
    // checking storage" from "checked, found nothing" (see useIntakeHydrated).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  return (
    <IntakeStateContext.Provider value={state}>
      <IntakeDispatchContext.Provider value={dispatch}>
        <IntakeHydratedContext.Provider value={hydrated}>{children}</IntakeHydratedContext.Provider>
      </IntakeDispatchContext.Provider>
    </IntakeStateContext.Provider>
  );
}

export function useIntakeState(): IntakeState {
  const ctx = useContext(IntakeStateContext);
  if (!ctx) throw new Error("useIntakeState must be used within IntakeProvider");
  return ctx;
}

export function useIntakeDispatch(): Dispatch<IntakeAction> {
  const ctx = useContext(IntakeDispatchContext);
  if (!ctx) throw new Error("useIntakeDispatch must be used within IntakeProvider");
  return ctx;
}

// See IntakeHydratedContext above for why this exists.
export function useIntakeHydrated(): boolean {
  return useContext(IntakeHydratedContext);
}

export function startOver(dispatch: Dispatch<IntakeAction>): void {
  sessionStorage.removeItem(STORAGE_KEY);
  dispatch({ type: "START_OVER" });
}
