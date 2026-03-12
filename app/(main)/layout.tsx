"use client";

import { Spinner } from "@/components/spinner";
import { useConvexAuth } from "convex/react";
import { redirect } from "next/navigation";
import Navigation from "./_components/Navigation";
import { SearchCommand } from "@/components/search-command";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useChat } from "@/hooks/useChat";
import { useWorkspace } from "@/hooks/useWorkspace";

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { isChatOpen } = useChat();
  const { activeWorkspaceId } = useWorkspace();

  if (isLoading) {
    return (
      <div className="dark:bg-dark flex h-full items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return redirect("/");
  }

  const showChat = isChatOpen && !!activeWorkspaceId;

  return (
    <div className="dark:bg-dark flex h-full">
      <Navigation />
      <main className="relative h-full flex-1 overflow-hidden">
        <SearchCommand />
        {showChat ? (
          <div className="absolute inset-0 z-50 h-full w-full">
            <ChatPanel />
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            {children}
          </div>
        )}
      </main>
    </div>
  );
};
export default MainLayout;
