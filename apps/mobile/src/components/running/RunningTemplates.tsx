// Pestaña «Plantillas» de Running.
import { router } from "expo-router";
import { View } from "react-native";
import { TemplateCard } from "@/components/running/TemplateCard";
import { Button, EmptyState, ResponsiveGrid } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useRunning } from "@/data/runningStore";
import { space } from "@/theme/tokens";

export function RunningTemplates({ onPlan }: { onPlan: (templateId: string) => void }) {
  const templates = useRunning((s) => s.templates);
  const duplicateTemplate = useRunning((s) => s.duplicateTemplate);
  return (
    <View style={{ gap: space.lg }}>
      <Button
        testID="new-template"
        label="Nueva plantilla"
        icon="add"
        onPress={() => router.push({ pathname: "/plantilla/[id]", params: { id: "new" } })}
      />
      {templates.length === 0 ? (
        <EmptyState icon="list-outline" title="Sin plantillas" text="Crea una para series, tiradas largas o sprints." />
      ) : (
        <ResponsiveGrid>
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onPlan={() => onPlan(t.id)}
              onEdit={() => router.push({ pathname: "/plantilla/[id]", params: { id: t.id } })}
              onDuplicate={() => {
                const copy = duplicateTemplate(t.id);
                if (copy) toast(`Duplicada como «${copy.name}»`);
              }}
            />
          ))}
        </ResponsiveGrid>
      )}
    </View>
  );
}
