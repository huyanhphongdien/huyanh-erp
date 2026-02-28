// src/utils/formHelpers.ts
// Helper functions for form handling

/**
 * Convert null values to undefined in an object
 * Useful for converting database records to form defaultValues
 * React Hook Form expects undefined, not null, for optional fields
 */
export function nullToUndefined<T extends Record<string, any>>(obj: T | null | undefined): T | undefined {
  if (obj === null || obj === undefined) return undefined
  
  const result = {} as T
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key]
      // @ts-ignore - we're intentionally converting null to undefined
      result[key] = value === null ? undefined : value
    }
  }
  return result
}

/**
 * Prepare data for form defaultValues
 * Converts null to undefined and can apply custom transformations
 */
export function prepareFormData<T extends Record<string, any>>(
  data: T | null | undefined,
  defaults: Partial<T> = {}
): Partial<T> | undefined {
  if (!data) return defaults as Partial<T>
  
  const converted = nullToUndefined(data)
  return { ...defaults, ...converted }
}

/**
 * Type-safe form submit handler wrapper
 * Ensures required fields are present before submission
 */
export function createSubmitHandler<TForm, TService>(
  transform: (data: TForm) => TService
) {
  return (data: TForm): TService => transform(data)
}