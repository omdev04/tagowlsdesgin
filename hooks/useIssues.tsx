import { create } from "zustand";
import { Id } from "@/convex/_generated/dataModel";

interface IssuesStore {
  activeProjectId: Id<"projects"> | null;
  activeIssueId: Id<"issues"> | null;
  isIssueDetailOpen: boolean;
  isIssueCreateOpen: boolean;

  filterStatus: string | null;
  filterPriority: string | null;
  filterAssigneeId: string | null;

  setActiveProject: (id: Id<"projects"> | null) => void;
  setActiveIssue: (id: Id<"issues"> | null) => void;
  openIssueDetail: (id: Id<"issues">) => void;
  closeIssueDetail: () => void;
  openIssueCreate: () => void;
  closeIssueCreate: () => void;

  setFilterStatus: (status: string | null) => void;
  setFilterPriority: (priority: string | null) => void;
  setFilterAssigneeId: (assigneeId: string | null) => void;
  clearFilters: () => void;
}

export const useIssues = create<IssuesStore>((set) => ({
  activeProjectId: null,
  activeIssueId: null,
  isIssueDetailOpen: false,
  isIssueCreateOpen: false,
  filterStatus: null,
  filterPriority: null,
  filterAssigneeId: null,

  setActiveProject: (id) => set({ activeProjectId: id }),
  setActiveIssue: (id) => set({ activeIssueId: id }),
  openIssueDetail: (id) => set({ activeIssueId: id, isIssueDetailOpen: true }),
  closeIssueDetail: () => set({ isIssueDetailOpen: false, activeIssueId: null }),
  openIssueCreate: () => set({ isIssueCreateOpen: true }),
  closeIssueCreate: () => set({ isIssueCreateOpen: false }),

  setFilterStatus: (status) => set({ filterStatus: status }),
  setFilterPriority: (priority) => set({ filterPriority: priority }),
  setFilterAssigneeId: (assigneeId) => set({ filterAssigneeId: assigneeId }),
  clearFilters: () => set({ filterStatus: null, filterPriority: null, filterAssigneeId: null }),
}));
