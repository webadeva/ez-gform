declare module "virtual:generated-form/*" {
  import type { FormSchema } from "@ez-gform/types";
  import type { ReactElement } from "react";

  export const fixtureSchema: FormSchema;
  export const GeneratedForm: () => ReactElement;
}
