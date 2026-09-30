import { Form } from "@vicinae/api";

/**
 * `@raycast/utils` is typed against `@raycast/api`, whose `Form.Values` is not
 * structurally identical to Vicinae's. `handleSubmit` behaves the same at
 * runtime, so the mismatch is bridged here instead of cast at every call site.
 */
export function asSubmitHandler(
  handleSubmit: unknown,
): (values: Form.Values) => Promise<boolean | void> {
  return (values: Form.Values) =>
    (handleSubmit as (v: unknown) => unknown)(values) as Promise<boolean | void>;
}
