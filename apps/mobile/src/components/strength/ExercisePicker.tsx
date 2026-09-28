import { useEffect, useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { FullScreenModal } from "../FullScreenModal";
import { filterExercises } from "@/data/exerciseSearch";
import { useLibrary } from "@/data/strengthStore";
import { countLabel, effectiveQuery } from "@/domain/search";
import { type Equipment, EQUIPMENT_FILTERS, EQUIPMENT_LABEL, type Exercise, GROUP_LABEL, GROUP_ORDER, type MuscleGroup } from "@/domain/strength";
import { SearchStatus } from "../SearchStatus";
import { Text } from "../ui/Text";
import { space } from "@/theme/tokens";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { ChipRow } from "../ui/ChipRow";
import { EmptyState } from "../ui/EmptyState";
import { SearchField } from "../ui/SearchField";
import { ExerciseRow } from "./ExerciseRow";
import { Overline } from "../ui/Section";

/**
 * Selector de ejercicios en pantalla completa: buscar, filtrar por grupo y elegir.
 * Sirve para añadir a una rutina/entreno y para sustituir (con «sugeridos» arriba).
 */
export function ExercisePicker({
  visible,
  title,
  subtitle,
  onClose,
  onPick,
  suggested,
  excludeIds = [],
  onCreate,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onPick: (e: Exercise) => void;
  /** Alternativas al mismo músculo, que se enseñan primero mientras no se busca. */
  suggested?: Exercise[];
  excludeIds?: readonly string[];
  onCreate?: (name: string) => void;
}) {
  const library = useLibrary();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | "all">("all");
  const [equipment, setEquipment] = useState<Equipment | "all">("all");
  // El selector sigue montado entre usos (rutina, entreno): al abrirlo, siempre empieza limpio.
  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setGroup("all");
    setEquipment("all");
  }, [visible]);

  const q = effectiveQuery(query);
  const results = useMemo(
    () => filterExercises(library, { query: q, group, equipment }).filter((e) => !excludeIds.includes(e.id)),
    [library, q, group, equipment, excludeIds],
  );
  const showSuggested = !!suggested?.length && !q && group === "all" && equipment === "all";
  const suggestedIds = new Set(showSuggested ? suggested!.map((e) => e.id) : []);
  const data = [
    ...(showSuggested ? [{ key: "h-sug", header: `Mismo músculo (${suggested!.length})` } as const, ...suggested!.slice(0, 8).map((e) => ({ key: `s-${e.id}`, ex: e }))] : []),
    ...(showSuggested ? [{ key: "h-all", header: "Todos los ejercicios" } as const] : []),
    ...results.filter((e) => !suggestedIds.has(e.id)).map((e) => ({ key: e.id, ex: e })),
  ];

  return (
    <FullScreenModal visible={visible} onClose={onClose} title={title} subtitle={subtitle} testID="exercise-picker">
      <SearchField testID="picker-search" value={query} onChangeText={setQuery} placeholder="Buscar ejercicio" />
      {/* Mismos filtros y contador que la pestaña Ejercicios de Fuerza. */}
      <View style={{ paddingVertical: space.md, gap: space.md }}>
        <ChipRow>
          <Chip label="Todos" selected={group === "all"} onPress={() => setGroup("all")} />
          {GROUP_ORDER.filter((g) => g !== "other").map((g) => (
            <Chip key={g} testID={`pick-group-${g}`} label={GROUP_LABEL[g]} selected={group === g} onPress={() => setGroup(g)} />
          ))}
        </ChipRow>
        <ChipRow>
          <Chip label="Cualquier equipo" icon="options-outline" selected={equipment === "all"} onPress={() => setEquipment("all")} />
          {EQUIPMENT_FILTERS.map((e) => (
            <Chip key={e} label={EQUIPMENT_LABEL[e]} selected={equipment === e} onPress={() => setEquipment(e)} />
          ))}
        </ChipRow>
        {query.trim() ? (
          <SearchStatus query={query} loading={false} count={results.length} noun={["ejercicio", "ejercicios"]} />
        ) : (
          <Text variant="caption" color="muted" numberOfLines={1}>
            {countLabel(results.length, ["ejercicio", "ejercicios"])}
          </Text>
        )}
      </View>
      <FlatList
        data={data}
        keyExtractor={(x) => x.key}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title="Sin resultados"
            text="Prueba con otra palabra o crea el ejercicio."
            actionLabel={onCreate ? "Crear ejercicio" : undefined}
            onAction={() => onCreate?.(query.trim())}
          />
        }
        renderItem={({ item, index }) =>
          "header" in item ? (
            <Overline color="muted" style={{ paddingTop: space.md, paddingBottom: space.xs }}>{item.header}</Overline>
          ) : (
            <ExerciseRow exercise={item.ex} divider={index > 0 && !("header" in data[index - 1])} onPress={() => onPick(item.ex)} />
          )
        }
        ListFooterComponent={
          onCreate && data.length > 0 ? (
            <View style={{ paddingTop: space.lg }}>
              <Button label="¿No está? Crear ejercicio" icon="add" variant="ghost" onPress={() => onCreate(query.trim())} />
            </View>
          ) : null
        }
      />
    </FullScreenModal>
  );
}
