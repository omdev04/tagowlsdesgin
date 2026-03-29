"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useIssues } from "@/hooks/useIssues";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TextareaAutosize from "react-textarea-autosize";
import { AlertCircle, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const issueSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  dueDate: z.string().optional(),
});

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low", icon: Minus, color: "text-neutral-400" },
  { value: "MEDIUM", label: "Medium", icon: Minus, color: "text-blue-500" },
  { value: "HIGH", label: "High", icon: ArrowUp, color: "text-orange-500" },
  { value: "URGENT", label: "Urgent", icon: AlertCircle, color: "text-red-500" },
];

interface IssueCreateModalProps {
  projectId: Id<"projects">;
}

export const IssueCreateModal = ({ projectId }: IssueCreateModalProps) => {
  const { isIssueCreateOpen, closeIssueCreate } = useIssues();
  const createIssue = useMutation(api.issues.create);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "MEDIUM",
    dueDate: "",
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleClose = () => {
    closeIssueCreate();
    setFormData({ title: "", description: "", priority: "MEDIUM", dueDate: "" });
    setErrors({});
  };

  const handleSubmit = () => {
    try {
      const validated = issueSchema.parse(formData);

      const payload: any = {
        projectId,
        title: validated.title,
        description: validated.description,
        priority: validated.priority,
      };

      if (validated.dueDate) {
        payload.dueDate = new Date(validated.dueDate).getTime();
      }

      toast.promise(createIssue(payload), {
        loading: "Creating issue...",
        success: () => {
          handleClose();
          return "Issue created";
        },
        error: "Failed to create issue",
      });
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

  const selectedPriority = PRIORITY_OPTIONS.find((opt) => opt.value === formData.priority);

  return (
    <Dialog open={isIssueCreateOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl border-none p-4 shadow-2xl sm:p-6 dark:bg-[#191919]">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg font-medium text-neutral-900 dark:text-neutral-100">Create Issue</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Title</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enter issue title..."
              className="mt-0.5 border-none bg-transparent px-2 text-lg font-semibold shadow-none focus-visible:ring-0 dark:bg-transparent dark:border-none dark:focus-visible:ring-0"
              autoFocus
            />
            {errors.title && <p className="mt-1.5 text-xs text-red-500">{errors.title}</p>}
          </div>

          <div>
            <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Description</Label>
            <TextareaAutosize
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Add a description..."
              className="mt-1.5 w-full resize-none border-none bg-transparent p-2 text-sm outline-none placeholder:text-neutral-400 shadow-none focus-visible:ring-0 focus:ring-0 dark:bg-transparent dark:border-none dark:focus:ring-0"
              minRows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(val) => setFormData({ ...formData, priority: val })}
              >
                <SelectTrigger className="mt-1.5 h-8 border-none bg-transparent shadow-none hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:ring-0 dark:bg-transparent dark:border-none focus-visible:ring-0 dark:focus:ring-0">
                  <SelectValue>
                    {selectedPriority && (
                      <div className="flex items-center gap-2">
                        <selectedPriority.icon className={cn("h-3.5 w-3.5", selectedPriority.color)} />
                        {selectedPriority.label}
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <opt.icon className={cn("h-3.5 w-3.5", opt.color)} />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Due Date</Label>
              <Input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="mt-1.5 h-8 border-none bg-transparent shadow-none hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:ring-0 dark:bg-transparent dark:border-none focus:ring-0 dark:focus:ring-0"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={handleClose} className="text-neutral-600 dark:text-neutral-400">
              Cancel
            </Button>
            <Button onClick={handleSubmit}>Create Issue</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
