import { useState } from "react";
import { View } from "react-native";
import { FullScreenModal } from "@/components/FullScreenModal";
import { Screen, ScreenHeader } from "@/components/Screen";
import {
  ActionRow,
  Badge,
  BottomSheet,
  BottomSheetForm,
  ConfirmSheet,
  Button,
  Callout,
  Card,
  Chip,
  ChipRow,
  CheckRow,
  CollapsibleSection,
  DurationField,
  EmptyState,
  FieldGroup,
  IconButton,
  ListGroup,
  ListRow,
  Overline,
  ProgressBar,
  RadioCard,
  RadioGroup,
  ResponsiveGrid,
  Ring,
  SearchField,
  SegmentedControl,
  Section,
  Skeleton,
  Stat,
  StatGrid,
  Stepper,
  Text,
  TextField,
} from "@/components/ui";
import { useTheme, type ThemePref } from "@/theme/ThemeProvider";
import { radius, space, typeScale } from "@/theme/tokens";

/**
 * Galería de componentes (solo desarrollo): todas las variantes del sistema de diseño en un
 * único sitio, en claro y oscuro, para comprobar coherencia visual antes de dar una pantalla
 * por buena. No enlazada desde ninguna pestaña; se abre entrando a `/galeria` a mano. Pasa axe
 * en `e2e/accesibilidad.spec.ts`.
 */
export default function GalleryScreen() {
  const { pref, setPref } = useTheme();
  const [chip, setChip] = useState(0);
  const [check, setCheck] = useState(true);
  const [radio, setRadio] = useState("a");
  const [step, setStep] = useState(3);
  const [text, setText] = useState("");
  const [sheet, setSheet] = useState(false);
  const [form, setForm] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [full, setFull] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [duration, setDuration] = useState<number | null>(1830);

  return (
    <Screen variant="detail" testID="screen-galeria">
      <ScreenHeader title="Galería de componentes" subtitle="Referencia visual · solo desarrollo" back />
      <View style={{ gap: space.xxl }}>
        <Section kind="overline" title="Apariencia">
          <SegmentedControl<ThemePref>
            value={pref}
            onChange={setPref}
            options={[
              { value: "dark", label: "Oscuro" },
              { value: "light", label: "Claro" },
              { value: "system", label: "Sistema" },
            ]}
          />
        </Section>

        <Section kind="overline" title="Tipografía">
          <View style={{ gap: space.sm }}>
            {(Object.keys(typeScale) as (keyof typeof typeScale)[]).map((v) => (
              <Text key={v} variant={v}>
                {v} — Aa 0123
              </Text>
            ))}
          </View>
        </Section>

        <Section kind="overline" title="Botones">
          <View style={{ gap: space.md }}>
            {(["primary", "secondary", "ghost", "danger"] as const).map((variant) => (
              <View key={variant} style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap", alignItems: "center" }}>
                <Button label={variant} variant={variant} size="sm" onPress={() => {}} />
                <Button label={variant} variant={variant} size="md" onPress={() => {}} />
                <Button label={variant} variant={variant} size="lg" onPress={() => {}} />
                <Button label="Deshabilitado" variant={variant} disabled onPress={() => {}} />
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
              <IconButton icon="add" label="Añadir" onPress={() => {}} size="sm" />
              <IconButton icon="add" label="Añadir" onPress={() => {}} size="md" />
              <IconButton icon="add" label="Añadir" onPress={() => {}} size="lg" />
              <IconButton icon="add" label="Añadir" onPress={() => {}} filled />
              <IconButton icon="add" label="Añadir" onPress={() => {}} filled="brand" color="onBrand" />
            </View>
          </View>
        </Section>

        <Section kind="overline" title="Chips y segmentos">
          <View style={{ gap: space.md }}>
            <ChipRow>
              {["Todos", "Fuerza", "Running", "Nutrición", "Descanso"].map((l, i) => (
                <Chip key={l} label={l} selected={chip === i} onPress={() => setChip(i)} />
              ))}
            </ChipRow>
            <SegmentedControl
              value={String(chip)}
              onChange={(v) => setChip(Number(v))}
              options={[
                { value: "0", label: "Uno" },
                { value: "1", label: "Dos" },
                { value: "2", label: "Tres" },
              ]}
            />
          </View>
        </Section>

        <Section kind="overline" title="Insignias">
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            <Badge label="Neutral" tone="neutral" />
            <Badge label="Éxito" tone="success" icon="checkmark-circle" />
            <Badge label="Aviso" tone="warning" icon="warning" />
            <Badge label="Peligro" tone="danger" icon="alert-circle" />
            <Badge label="Marca" tone="brand" icon="star" />
          </View>
        </Section>

        <Section kind="overline" title="Tarjetas y avisos">
          <View style={{ gap: space.md }}>
            <ResponsiveGrid>
              <Card>
                <Text variant="bodyStrong">Card tone=surface</Text>
              </Card>
              <Card tone="alt">
                <Text variant="bodyStrong">Card tone=alt</Text>
              </Card>
              <Card accent="brand">
                <Text variant="bodyStrong">accent=brand</Text>
              </Card>
              <Card accent="warning">
                <Text variant="bodyStrong">accent=warning</Text>
              </Card>
            </ResponsiveGrid>
            <Callout icon="information-circle-outline">Callout neutral: un dato informativo.</Callout>
            <Callout tone="brand" icon="sparkles" title="Callout de marca">Con título y texto.</Callout>
            <Callout tone="success" icon="checkmark-circle" title="Éxito" dense>Texto denso para notas cortas.</Callout>
            <Callout tone="warning" icon="warning" title="Aviso" action={<Button label="Acción" size="sm" variant="secondary" onPress={() => {}} />}>
              Con un botón de acción.
            </Callout>
            <Callout tone="danger" icon="alert-circle" title="Peligro">Algo va mal.</Callout>
          </View>
        </Section>

        <Section kind="overline" title="Cifras">
          <StatGrid>
            <Stat label="Distancia" value="10,4" unit="km" size="md" />
            <Stat label="Tiempo" value="52:10" size="md" />
            <Stat label="Ritmo" value="5:01" unit="/km" size="lg" />
            <Stat label="Calorías" value="612" unit="kcal" size="xl" color="brandText" />
          </StatGrid>
        </Section>

        <Section kind="overline" title="Listas">
          <ListGroup>
            <ListRow icon="barbell-outline" title="Fila con icono" subtitle="Subtítulo secundario" chevron onPress={() => {}} />
            <ListRow icon="walk-outline" title="Otra fila" subtitle="Con valor a la derecha" value={<Text variant="bodyStrong">42</Text>} onPress={() => {}} />
            <ListRow icon="nutrition-outline" title="Fila sin acción" subtitle="No pulsable" />
          </ListGroup>
        </Section>

        <Section kind="content" title="Secciones" subtitle="kind=content: título grande + subtítulo">
          <Overline>Overline suelto (para cabeceras de columna)</Overline>
          <CollapsibleSection title="Subsección plegable" subtitle="Toca para expandir/contraer" defaultOpen={collapsed}>
            <Text variant="body" color="muted">
              Contenido que se muestra u oculta. Útil para ajustes avanzados o grupos largos.
            </Text>
            <Button label={collapsed ? "Colapsar de nuevo" : "Ya expandido"} size="sm" variant="ghost" onPress={() => setCollapsed((v) => !v)} />
          </CollapsibleSection>
        </Section>

        <Section kind="overline" title="Formularios">
          <View style={{ gap: space.md }}>
            <TextField label="Campo de texto" value={text} onChangeText={setText} placeholder="Escribe algo…" />
            <SearchField testID="gallery-search" value={text} onChangeText={setText} placeholder="Buscar…" />
            <DurationField label="Duración" value={duration} onChange={setDuration} />
            <FieldGroup label="Grupo de campo" hint="Ayuda opcional bajo el control">
              <ChipRow>
                <Chip label="Opción A" selected={chip === 0} onPress={() => setChip(0)} />
                <Chip label="Opción B" selected={chip === 1} onPress={() => setChip(1)} />
              </ChipRow>
            </FieldGroup>
            <Stepper label="Series" value={step} onChange={setStep} min={1} max={10} />
            <CheckRow kind="checkbox" checked={check} onChange={setCheck} label="Casilla" hint="Con texto de ayuda" />
            <CheckRow kind="switch" checked={check} onChange={setCheck} label="Interruptor" />
            <RadioGroup label="Opción única">
              <RadioCard selected={radio === "a"} title="Opción A" hint="Primera alternativa" onPress={() => setRadio("a")} />
              <RadioCard selected={radio === "b"} title="Opción B" hint="Segunda alternativa" onPress={() => setRadio("b")} />
            </RadioGroup>
          </View>
        </Section>

        <Section kind="overline" title="Progreso">
          <View style={{ gap: space.lg }}>
            <ProgressBar value={68} max={100} label="Proteína: 68 de 100 gramos" />
            <View style={{ alignItems: "center" }}>
              <Ring value={1420} max={2200} size={140} stroke={12}>
                <Text variant="numeralS" tabular>1.420</Text>
              </Ring>
            </View>
          </View>
        </Section>

        <Section kind="overline" title="Estados">
          <View style={{ gap: space.md }}>
            <Skeleton style={{ height: 64, borderRadius: radius.md }} />
            <EmptyState icon="search-outline" title="Sin resultados" text="Prueba con otra palabra." actionLabel="Reintentar" onAction={() => {}} />
          </View>
        </Section>

        <Section kind="overline" title="Menús y modales">
          <View style={{ gap: space.sm }}>
            <ActionRow icon="create-outline" label="Fila de acción" onPress={() => {}} />
            <ActionRow icon="trash-outline" label="Fila de acción destructiva" tone="danger" onPress={() => {}} />
            <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
              <Button label="Abrir hoja" variant="secondary" size="sm" onPress={() => setSheet(true)} />
              <Button label="Abrir formulario" variant="secondary" size="sm" onPress={() => setForm(true)} />
              <Button label="Abrir confirmación" variant="secondary" size="sm" onPress={() => setConfirm(true)} />
              <Button label="Abrir modal a pantalla completa" variant="secondary" size="sm" onPress={() => setFull(true)} />
            </View>
          </View>
        </Section>
      </View>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Hoja inferior" subtitle="Ejemplo de BottomSheet">
        <View style={{ gap: space.sm }}>
          <ActionRow icon="checkmark" label="Una opción" onPress={() => setSheet(false)} />
          <Button label="Cerrar" variant="ghost" fullWidth onPress={() => setSheet(false)} />
        </View>
      </BottomSheet>
      <ConfirmSheet
        visible={confirm}
        title="¿Vaciarlo todo?"
        message="Acción que no se puede deshacer: pide confirmación con el texto de lo que se pierde."
        confirmLabel="Vaciar todo"
        onClose={() => setConfirm(false)}
        onConfirm={() => {}}
      />
      <BottomSheetForm
        visible={form}
        title="Formulario en hoja"
        label="Nombre"
        initialValue=""
        confirmLabel="Guardar"
        onClose={() => setForm(false)}
        onSubmit={() => setForm(false)}
      />
      <FullScreenModal visible={full} onClose={() => setFull(false)} title="Modal a pantalla completa" subtitle="Misma cabecera que Screen">
        <Text variant="body" color="muted">
          Se usa para selectores (ejercicios) y para fotos ampliadas.
        </Text>
      </FullScreenModal>
    </Screen>
  );
}
