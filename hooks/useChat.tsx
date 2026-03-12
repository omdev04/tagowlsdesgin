import { create } from "zustand";
import { Id } from "@/convex/_generated/dataModel";

interface ChatStore {
  isChatOpen: boolean;
  activeChannelId: Id<"chatChannels"> | null;
  replyToMessageId: Id<"chatMessages"> | null;

  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  setActiveChannel: (id: Id<"chatChannels"> | null) => void;
  setReplyTo: (id: Id<"chatMessages"> | null) => void;
}

export const useChat = create<ChatStore>((set) => ({
  isChatOpen: false,
  activeChannelId: null,
  replyToMessageId: null,

  openChat: () => set({ isChatOpen: true }),
  closeChat: () => set({ isChatOpen: false }),
  toggleChat: () => set((s) => ({ isChatOpen: !s.isChatOpen })),
  setActiveChannel: (id) => set({ activeChannelId: id, replyToMessageId: null }),
  setReplyTo: (id) => set({ replyToMessageId: id }),
}));
