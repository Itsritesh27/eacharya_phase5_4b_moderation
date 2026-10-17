import { FileText, ExternalLink, Image as ImageIcon, NotebookText, Presentation, type LucideIcon } from "lucide-react";
import type { ResourceType } from "@/types/app";

export const RESOURCE_TYPE_INFO: Record<ResourceType, { label: string; icon: LucideIcon }> = {
  pdf: { label: "PDF", icon: FileText },
  notes: { label: "Text notes", icon: NotebookText },
  presentation: { label: "Presentation", icon: Presentation },
  image: { label: "Image / infographic", icon: ImageIcon },
  link: { label: "External link", icon: ExternalLink },
};

export const RESOURCE_TYPES = Object.keys(RESOURCE_TYPE_INFO) as ResourceType[];

export function isResourceType(value: unknown): value is ResourceType {
  return typeof value === "string" && (RESOURCE_TYPES as string[]).includes(value);
}

export function ResourceIcon({ type, className }: { type: ResourceType; className?: string }) {
  const Icon = RESOURCE_TYPE_INFO[type].icon;
  return <Icon className={className} aria-hidden />;
}
