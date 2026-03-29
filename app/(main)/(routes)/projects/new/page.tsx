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
import { ArrowLeft } from "lucide-react";

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
    <div className="h-full overflow-y-auto p-8">
      <Button variant="ghost" onClick={() => router.push("/projects")} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Projects
      </Button>

      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-3xl font-bold">Create New Project</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Projects help you organize and track issues across your team
        </p>

        <div className="space-y-6 rounded-lg border bg-white p-6 dark:bg-neutral-900 dark:border-neutral-800">
          <div>
            <Label>Project Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Mobile App Development"
              className="mt-1"
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          <div>
            <Label>Project Key</Label>
            <Input
              value={formData.key}
              onChange={(e) =>
                setFormData({ ...formData, key: e.target.value.toUpperCase() })
              }
              placeholder="e.g., MAD"
              className="mt-1"
              maxLength={10}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              2-10 uppercase letters/numbers. Used for issue prefixes (e.g., MAD-1, MAD-2)
            </p>
            {errors.key && <p className="mt-1 text-xs text-red-500">{errors.key}</p>}
          </div>

          <div>
            <Label>Description (Optional)</Label>
            <TextareaAutosize
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the project..."
              className="mt-1 w-full resize-none rounded-md border p-2 text-sm"
              minRows={3}
            />
          </div>

          <div>
            <Label>Icon (Optional)</Label>
            <Input
              value={formData.icon}
              onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
              placeholder="e.g., 🚀"
              className="mt-1"
              maxLength={2}
            />
            <p className="text-muted-foreground mt-1 text-xs">Single emoji or character</p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => router.push("/projects")}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>Create Project</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
