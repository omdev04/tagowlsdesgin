"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import TextareaAutosize from "react-textarea-autosize";
import { ArrowLeft, Sparkles, KeyRound, ShieldCheck } from "lucide-react";

const projectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  key: z.string().min(2, "Key must be at least 2 characters").max(10).regex(/^[A-Z0-9]+$/, "Key must be uppercase alphanumeric"),
  description: z.string().optional(),
  icon: z.string().optional(),
});

export default function NewProjectPage() {
  const router = useRouter();
  const { activeWorkspaceId } = useWorkspace();
  const createProject = useMutation(api.projects.create);

  const [formData, setFormData] = useState({
    name: "",
    key: "",
    description: "",
    icon: "",
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleSubmit = () => {
    if (!activeWorkspaceId) {
      toast.error("No workspace selected");
      return;
    }

    try {
      const validated = projectSchema.parse(formData);

        toast.promise(
          createProject({
            workspaceId: activeWorkspaceId,
            name: validated.name,
            key: validated.key,
            description: validated.description,
            icon: validated.icon,
          }),
          {
            loading: "Creating project...",
            success: (id) => {
              router.push(`/projects/${id}`);
              return "Project created";
            },
            error: (err) => {
              return err instanceof Error ? err.message : "Failed to create project";
            },
          },
        );
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors: { [key: string]: string } = {};
        err.errors.forEach((e) => {
          if (e.path[0]) newErrors[e.path[0] as string] = e.message;
        });
        setErrors(newErrors);
      }
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background p-5 md:p-8">
      <div className="mx-auto max-w-3xl">
        <Button variant="ghost" onClick={() => router.push("/projects")} className="mb-4 px-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>

        <div className="mb-5 rounded-xl border bg-card/70 p-5 backdrop-blur-sm">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="h-3 w-3" />
            Nano Setup
          </div>
          <h1 className="text-2xl font-semibold md:text-3xl">Create New Project</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define identity, key, and context so your team can ship with clarity.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_240px]">
          <div className="space-y-5 rounded-xl border bg-card p-5">
            <div>
              <Label>Project Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Mobile App Development"
                className="mt-1.5"
              />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
            </div>

            <div>
              <Label>Project Key</Label>
              <div className="relative mt-1.5">
                <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={formData.key}
                  onChange={(e) =>
                    setFormData({ ...formData, key: e.target.value.toUpperCase() })
                  }
                  placeholder="e.g., MAD"
                  className="pl-9"
                  maxLength={10}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                2-10 uppercase letters/numbers. Example issue IDs: {formData.key || "PRJ"}-1, {formData.key || "PRJ"}-2
              </p>
              {errors.key && <p className="mt-1 text-xs text-red-500">{errors.key}</p>}
            </div>

            <div>
              <Label>Description (Optional)</Label>
              <TextareaAutosize
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the project goals and boundaries..."
                className="mt-1.5 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                minRows={4}
              />
            </div>

            <div>
              <Label>Icon (Optional)</Label>
              <Input
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                placeholder="e.g., 🚀"
                className="mt-1.5"
                maxLength={2}
              />
              <p className="mt-1 text-xs text-muted-foreground">Single emoji or character</p>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => router.push("/projects")}>
                Cancel
              </Button>
              <Button onClick={handleSubmit}>Create Project</Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border bg-card p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Preview
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                  {formData.icon || formData.key?.charAt(0) || "P"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{formData.name || "Untitled Project"}</p>
                  <p className="text-xs text-muted-foreground">{formData.key || "PROJECT"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                Note
              </div>
              <p className="text-xs text-muted-foreground">
                Project key cannot be changed after creation. Choose a short, memorable identifier.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
