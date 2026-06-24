/**
 * Whole-day ISO range params for the range-based energy endpoints.
 * Pass `limit = null` to fetch the full day without a record cap.
 */
export function dayRange(date: string, limit: number | null = 500) {
  return {
    fromDate: `${date}T00:00:00.000Z`,
    toDate: `${date}T23:59:59.999Z`,
    sortBy: 'ASC' as const,
    ...(limit == null ? {} : { limit }),
  }
}
