import { Text } from "@/components/ui";
import { searchStatusText } from "@/domain/search";

/**
 * Línea de estado bajo un buscador («Escribe al menos 2 letras», «Buscando…», «3 resultados»),
 * igual en todos. Una sola línea de alto fijo: no empuja nada al cambiar de texto.
 */
export function SearchStatus({ query, loading, count, noun, testID }: { query: string; loading: boolean; count: number | null; noun: readonly [string, string]; testID?: string }) {
  const text = searchStatusText(query, loading, count, noun);
  if (text === null) return null;
  return (
    <Text testID={testID ?? "search-status"} variant="caption" color="muted" numberOfLines={1} accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}
