// Hoja para añadir un alimento a mano o corregir uno que la IA vio mal: nombre, categoría, sitio
// (zona, balda, lado) y cantidad. Al guardar, el alimento queda colocado (`positioned: true`).
import { useState } from "react";
import { View } from "react-native";
import { BottomSheet, Button, Chip, ChipRow, FieldGroup, SegmentedControl, Stepper, TextField } from "@/components/ui";
import { parseNum } from "@/domain/format";
import { capitalize, CATEGORY_LABEL, defaultZone, FRIDGE_CATEGORIES, ZONE_LABEL, type FridgeCategory, type FridgeItem, type FridgeLayout, type FridgeZone } from "@/domain/fridge";
import { space } from "@/theme/tokens";

const SIDES = [
  { value: "0.2", label: "Izquierda" },
  { value: "0.5", label: "Centro" },
  { value: "0.8", label: "Derecha" },
] as const;
type Side = (typeof SIDES)[number]["value"];
const sideOf = (x: number): Side => (x < 0.35 ? "0.2" : x > 0.65 ? "0.8" : "0.5");

const newId = () => `f-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function FridgeItemSheet({
  visible,
  item,
  layout,
  onClose,
  onSave,
  onRemove,
}: {
  visible: boolean;
  /** `null` = alimento nuevo. */
  item: FridgeItem | null;
  layout: FridgeLayout;
  onClose: () => void;
  onSave: (item: FridgeItem) => void;
  onRemove?: (item: FridgeItem) => void;
}) {
  // Quien la usa le pone `key` por alimento: cada apertura parte del alimento elegido (o de cero).
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<FridgeCategory>(item?.category ?? "otros");
  const [zone, setZone] = useState<FridgeZone>(item?.zone ?? "shelf");
  const [level, setLevel] = useState(item?.level ?? 0);
  const [side, setSide] = useState<Side>(sideOf(item?.x ?? 0.5));
  const [qty, setQty] = useState(item?.quantity != null ? String(item.quantity).replace(".", ",") : "");
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [zoneTouched, setZoneTouched] = useState(!!item);

  const levels = zone === "shelf" ? layout.shelves : zone === "drawer" ? layout.drawers : zone === "door" ? layout.doorShelves : 1;
  const levelName = zone === "drawer" ? "Cajón" : zone === "door" ? "Estante de la puerta" : "Balda";
  const quantity = qty.trim() ? parseNum(qty) : undefined;
  const qtyOk = quantity === undefined || (quantity != null && quantity > 0);
  const valid = name.trim().length > 0 && qtyOk;

  const save = () => {
    if (!valid) return;
    onSave({
      id: item?.id ?? newId(),
      name: capitalize(name),
      category,
      zone,
      level: Math.min(level, levels - 1),
      x: Number(side),
      depth: item?.depth ?? "front",
      quantity: quantity ?? undefined,
      unit: quantity != null && unit.trim() ? unit.trim() : undefined,
      expiresHint: item?.expiresHint,
      positioned: true,
      seenAt: new Date().toISOString(),
    });
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={item ? "Editar alimento" : "Nuevo alimento"} subtitle={item ? undefined : "Lo que la foto no vio"}>
      <View style={{ gap: space.lg }}>
        <TextField testID="fridge-item-name" label="Nombre" value={name} onChangeText={setName} placeholder="Ej.: yogur natural" maxLength={60} autoFocus={!item} />
        <FieldGroup label="Tipo">
          <ChipRow wrap>
            {FRIDGE_CATEGORIES.map((cat) => (
              <Chip
                key={cat}
                label={CATEGORY_LABEL[cat]}
                selected={category === cat}
                onPress={() => {
                  setCategory(cat);
                  // Un alimento nuevo va a su sitio típico hasta que se elija uno a mano.
                  if (!zoneTouched) setZone(defaultZone(cat));
                }}
              />
            ))}
          </ChipRow>
        </FieldGroup>
        <FieldGroup label="Dónde está">
          <SegmentedControl
            role="radio"
            label="Zona"
            options={(["shelf", "drawer", "door", "freezer"] as const).map((z) => ({ value: z, label: ZONE_LABEL[z] }))}
            value={zone}
            onChange={(z) => {
              setZone(z);
              setZoneTouched(true);
              setLevel(0);
            }}
          />
          {levels > 1 ? (
            <Stepper label={levelName} layout="inline" value={level + 1} min={1} max={levels} onChange={(n) => setLevel(n - 1)} decLabel={`${levelName} de arriba`} incLabel={`${levelName} de abajo`} />
          ) : null}
          <SegmentedControl role="radio" label="Lado" options={[...SIDES]} value={side} onChange={setSide} />
        </FieldGroup>
        <View style={{ flexDirection: "row", gap: space.md }}>
          <TextField testID="fridge-item-qty" label="Cantidad (opcional)" value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="Ej.: 2" error={qtyOk ? undefined : "Pon un número mayor que 0"} />
          <TextField label="Unidad" value={unit} onChangeText={setUnit} placeholder="ud, g, l…" maxLength={12} autoCapitalize="none" />
        </View>
        <View style={{ gap: space.sm }}>
          <Button testID="fridge-item-save" label={item ? "Guardar cambios" : "Añadir a la nevera"} size="lg" fullWidth disabled={!valid} onPress={save} />
          {item && onRemove ? <Button label="Quitar de la nevera" icon="trash-outline" variant="ghost" fullWidth onPress={() => onRemove(item)} /> : null}
        </View>
      </View>
    </BottomSheet>
  );
}
