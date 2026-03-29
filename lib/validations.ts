import { z } from "zod";

export const projectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  key: z
    .string()
    .min(2, "Key must be at least 2 characters")
    .max(10, "Key must be at most 10 characters")
    .regex(/^[A-Z0-9]+$/, "Key must be uppercase alphanumeric"),
  description: z.string().max(1000, "Description too long").optional(),
  icon: z.string().max(2, "Icon must be single character/emoji").optional(),
});

export const issueSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(5000, "Description too long").optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"], {
    errorMap: () => ({ message: "Invalid priority" }),
  }),
  dueDate: z
    .string()
    .refine((val) => !val || !isNaN(new Date(val).getTime()), "Invalid date")
    .optional(),
});

export const commentSchema = z.object({
  body: z.string().min(1, "Comment cannot be empty").max(5000, "Comment too long"),
});

export const labelSchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name too long"),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be valid hex (e.g., #FF5733)"),
});

export type ProjectInput = z.infer<typeof projectSchema>;
export type IssueInput = z.infer<typeof issueSchema>;
export type CommentInput = z.infer<typeof commentSchema>;
export type LabelInput = z.infer<typeof labelSchema>;
