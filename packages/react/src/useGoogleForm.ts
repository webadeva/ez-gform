import { buildPrefillUrl, submitForm, validateValues } from "@ez-gform/core";
import type {
  FieldValue,
  FormSchema,
  FormValues,
  SubmitResult,
} from "@ez-gform/types";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

export type Status =
  "idle" | "validating" | "submitting" | "sent" | "ok" | "error";

export interface FieldError {
  entryId: string;
  message: string;
}

export interface UseGoogleFormOptions {
  formId: string;
  schema?: FormSchema;
  initialValues?: FormValues;
  /** Validate against `schema` before submitting. Defaults to `true` when `schema` is given. */
  validate?: boolean;
  fetch?: typeof fetch;
  mode?: "no-cors" | "cors";
  onSent?: (result: SubmitResult) => void;
  onError?: (result: SubmitResult, errors?: FieldError[]) => void;
  /** Reset `values` back to `initialValues` after a successful submit. Defaults to `false`. */
  resetOnSent?: boolean;
}

type FieldInputElement =
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface RegisteredField {
  name: string;
  value: string;
  onChange: (event: ChangeEvent<FieldInputElement>) => void;
}

export interface RegisteredCheckboxField {
  name: string;
  value: string;
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export interface UseGoogleFormReturn {
  values: FormValues;
  status: Status;
  result?: SubmitResult;
  errors: FieldError[];
  isSubmitting: boolean;
  setValue: (entryId: string, value: FieldValue) => void;
  setValues: (patch: FormValues) => void;
  reset: () => void;
  submit: (event?: { preventDefault?: () => void }) => Promise<SubmitResult>;
  register: (entryId: string) => RegisteredField;
  registerCheckbox: (
    entryId: string,
    option: string,
  ) => RegisteredCheckboxField;
  prefillUrl: string;
}

interface State {
  values: FormValues;
  status: Status;
  result?: SubmitResult;
  errors: FieldError[];
}

type Action =
  | { type: "set_value"; entryId: string; value: FieldValue }
  | { type: "set_values"; patch: FormValues }
  | {
      type: "toggle_checkbox";
      entryId: string;
      option: string;
      checked: boolean;
    }
  | { type: "reset"; values: FormValues }
  | { type: "validate_start" }
  | { type: "validate_fail"; errors: FieldError[] }
  | { type: "submit_start" }
  | { type: "submit_settle"; status: Status; result: SubmitResult };

const withoutFieldError = (
  errors: FieldError[],
  entryId: string,
): FieldError[] => {
  return errors.filter((e) => {
    return e.entryId !== entryId;
  });
};

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "set_value":
      return {
        ...state,
        values: { ...state.values, [action.entryId]: action.value },
        errors: withoutFieldError(state.errors, action.entryId),
      };
    case "set_values":
      return { ...state, values: { ...state.values, ...action.patch } };
    case "toggle_checkbox": {
      const raw = state.values[action.entryId];
      const current = Array.isArray(raw) ? raw : [];
      const next = action.checked
        ? current.includes(action.option)
          ? current
          : [...current, action.option]
        : current.filter((v) => {
            return v !== action.option;
          });
      return {
        ...state,
        values: { ...state.values, [action.entryId]: next },
        errors: withoutFieldError(state.errors, action.entryId),
      };
    }
    case "reset":
      return { values: action.values, status: "idle", errors: [] };
    case "validate_start":
      return { ...state, status: "validating", errors: [] };
    case "validate_fail":
      return { ...state, status: "error", errors: action.errors };
    case "submit_start":
      return { ...state, status: "submitting", errors: [] };
    case "submit_settle":
      return { ...state, status: action.status, result: action.result };
  }
};

/**
 * Submits a controlled-values form to a Google Form, exposing an explicit
 * `status` state machine (`idle` → `validating`? → `submitting` →
 * `sent`/`ok`/`error`) and a promise-returning `submit`.
 */
export const useGoogleForm = (
  options: UseGoogleFormOptions,
): UseGoogleFormReturn => {
  const {
    formId,
    schema,
    validate = schema !== undefined,
    fetch: fetchImpl,
    mode,
    onSent,
    onError,
    resetOnSent = false,
  } = options;

  const [state, rawDispatch] = useReducer(reducer, undefined, (): State => {
    return {
      values: options.initialValues ?? {},
      status: "idle",
      errors: [],
    };
  });

  // Mirrors the reducer state synchronously on every dispatch so submit() sees
  // values set earlier in the same tick (before React re-renders).
  const stateRef = useRef(state);
  const dispatch = useCallback((action: Action) => {
    stateRef.current = reducer(stateRef.current, action);
    rawDispatch(action);
  }, []);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const inFlightRef = useRef<Promise<SubmitResult> | null>(null);
  const changeHandlersRef = useRef(
    new Map<string, (event: ChangeEvent<FieldInputElement>) => void>(),
  );
  const checkboxHandlersRef = useRef(
    new Map<string, (event: ChangeEvent<HTMLInputElement>) => void>(),
  );

  const setValue = useCallback(
    (entryId: string, value: FieldValue) => {
      dispatch({ type: "set_value", entryId, value });
    },
    [dispatch],
  );

  const setValues = useCallback(
    (patch: FormValues) => {
      dispatch({ type: "set_values", patch });
    },
    [dispatch],
  );

  const reset = useCallback(() => {
    dispatch({ type: "reset", values: options.initialValues ?? {} });
  }, [dispatch, options.initialValues]);

  const submit = useCallback(
    (event?: { preventDefault?: () => void }): Promise<SubmitResult> => {
      event?.preventDefault?.();

      if (inFlightRef.current) {
        return inFlightRef.current;
      }

      const run = (async (): Promise<SubmitResult> => {
        const currentValues = stateRef.current.values;

        if (schema && validate) {
          dispatch({ type: "validate_start" });
          const validation = validateValues(currentValues, schema);
          if (!validation.ok) {
            dispatch({ type: "validate_fail", errors: validation.errors });
            const result: SubmitResult = {
              status: "error",
              error: new Error(
                "useGoogleForm: validation failed, submission was not sent",
              ),
            };
            onError?.(result, validation.errors);
            return result;
          }
        }

        dispatch({ type: "submit_start" });

        const result = await submitForm(formId, currentValues, {
          schema,
          fetch: fetchImpl,
          mode,
        });

        if (mountedRef.current) {
          dispatch({ type: "submit_settle", status: result.status, result });
        }

        if (result.status === "error") {
          onError?.(result);
        } else {
          onSent?.(result);
          if (resetOnSent && mountedRef.current) {
            dispatch({ type: "reset", values: options.initialValues ?? {} });
          }
        }

        return result;
      })();

      inFlightRef.current = run;
      void run.finally(() => {
        inFlightRef.current = null;
      });
      return run;
    },
    [
      dispatch,
      formId,
      schema,
      validate,
      fetchImpl,
      mode,
      onSent,
      onError,
      resetOnSent,
      options.initialValues,
    ],
  );

  const register = useCallback(
    (entryId: string): RegisteredField => {
      const raw = state.values[entryId];
      let value = "";
      if (typeof raw === "string") {
        value = raw;
      } else if (typeof raw === "number") {
        value = String(raw);
      }

      let onChange = changeHandlersRef.current.get(entryId);
      if (!onChange) {
        onChange = (event: ChangeEvent<FieldInputElement>) => {
          setValue(entryId, event.target.value);
        };
        changeHandlersRef.current.set(entryId, onChange);
      }

      return { name: entryId, value, onChange };
    },
    [state.values, setValue],
  );

  const registerCheckbox = useCallback(
    (entryId: string, option: string): RegisteredCheckboxField => {
      const raw = state.values[entryId];
      const checked = Array.isArray(raw)
        ? raw.some((v) => {
            return v === option;
          })
        : false;

      const key = `${entryId}::${option}`;
      let onChange = checkboxHandlersRef.current.get(key);
      if (!onChange) {
        onChange = (event: ChangeEvent<HTMLInputElement>) => {
          dispatch({
            type: "toggle_checkbox",
            entryId,
            option,
            checked: event.target.checked,
          });
        };
        checkboxHandlersRef.current.set(key, onChange);
      }

      return { name: entryId, value: option, checked, onChange };
    },
    [state.values, dispatch],
  );

  const prefillUrl = useMemo(() => {
    try {
      return buildPrefillUrl(formId, state.values, schema);
    } catch {
      return "";
    }
  }, [formId, state.values, schema]);

  return {
    values: state.values,
    status: state.status,
    result: state.result,
    errors: state.errors,
    isSubmitting:
      state.status === "submitting" || state.status === "validating",
    setValue,
    setValues,
    reset,
    submit,
    register,
    registerCheckbox,
    prefillUrl,
  };
};
