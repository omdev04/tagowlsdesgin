import { create } from "zustand";
import { Id } from "@/convex/_generated/dataModel";

interface WorkspaceStore {
  activeWorkspaceId: Id<"workspaces"> | null;
  setActiveWorkspace: (id: Id<"workspaces"> | null) => void;

  isTeamModalOpen: boolean;
  onTeamModalOpen: () => void;
  onTeamModalClose: () => void;

  isAccessModalOpen: boolean;
  accessDocumentId: Id<"documents"> | null;
  onAccessModalOpen: (documentId: Id<"documents">) => void;
  onAccessModalClose: () => void;
}

export const useWorkspace = create<WorkspaceStore>((set) => ({
  activeWorkspaceId: null,
  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

  isTeamModalOpen: false,
  onTeamModalOpen: () => set({ isTeamModalOpen: true }),
  onTeamModalClose: () => set({ isTeamModalOpen: false }),

  isAccessModalOpen: false,
  accessDocumentId: null,
  onAccessModalOpen: (documentId) =>
    set({ isAccessModalOpen: true, accessDocumentId: documentId }),
  onAccessModalClose: () =>
    set({ isAccessModalOpen: false, accessDocumentId: null }),
}));
