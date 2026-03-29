export type IssueStatus = "TODO" | "IN_PROGRESS" | "DONE";
export type IssuePriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type WorkspaceRole = "admin" | "editor" | "viewer";

export interface IssueWithRelations {
  _id: string;
  _creationTime: number;
  projectId: string;
  workspaceId: string;
  title: string;
  description?: string;
  status: IssueStatus;
  priority: IssuePriority;
  issueNumber: number;
  reporterId: string;
  dueDate?: number;
  isDeleted?: boolean;
  createdAt: number;
  updatedAt: number;
  assignees: Array<{
    _id: string;
    clerkId: string;
    name: string;
    email: string;
    imageUrl?: string;
  }>;
  labels: Array<{
    _id: string;
    name: string;
    color: string;
  }>;
  reporter?: {
    _id: string;
    clerkId: string;
    name: string;
    email: string;
    imageUrl?: string;
  };
  project?: {
    _id: string;
    name: string;
    key: string;
  };
}

export interface ActivityLog {
  _id: string;
  _creationTime: number;
  issueId: string;
  userId: string;
  action: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  createdAt: number;
  user?: {
    _id: string;
    clerkId: string;
    name: string;
    imageUrl?: string;
  };
}

export interface IssueComment {
  _id: string;
  _creationTime: number;
  issueId: string;
  userId: string;
  body: string;
  isEdited?: boolean;
  isDeleted?: boolean;
  createdAt: number;
  updatedAt: number;
  user?: {
    _id: string;
    clerkId: string;
    name: string;
    email: string;
    imageUrl?: string;
  };
}
