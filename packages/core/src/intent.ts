/*! @smolter/prefetch:intent */
/** Attach intent handlers while preserving the consumer's existing callbacks. */
export function intentPrefetch(
  props: Record<string, unknown>,
  load: () => void,
): void {
  for (const name of ["onPointerEnter", "onFocus", "onTouchStart"]) {
    const handler = props[name] as ((event: unknown) => void) | undefined;
    props[name] = (event: unknown) => {
      handler?.(event);
      load();
    };
  }
}
