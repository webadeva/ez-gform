export interface DateValue {
  year?: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
}

export interface TimeValue {
  hour: number;
  minute: number;
  /**
   * Seconds, for Duration questions only (sent as `entry.N_second`). Google
   * silently ignores it on time-of-day questions.
   */
  second?: number;
}

export interface OtherValue {
  other: string;
}

export type FieldValue =
  | string
  | number
  | string[]
  | (string | OtherValue)[]
  | OtherValue
  | DateValue
  | TimeValue
  | Record<string, string | string[]>
  | null
  | undefined;

export type FormValues = Record<string, FieldValue>;
