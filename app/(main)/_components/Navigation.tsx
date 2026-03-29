"use client";

import React, { ComponentRef, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import { useMutation } from "convex/react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

import { cn } from "@/lib/utils";
import { api } from "@/convex/_generated/api";
import { DocumentList } from "./DocumentList";
import { Item } from "./Item";
import { UserItem } from "./UserItem";

import { toast } from "sonner";
import {
  ChevronsLeft,
  MenuIcon,
  MessageCircle,
  Plus,
  PlusCircle,
  Search,
  Settings,
  Trash,
  Users,
  Folder,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TrashBox } from "./TrashBox";
import { useSearch } from "@/hooks/useSearch";
import { useSettings } from "@/hooks/useSettings";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useChat } from "@/hooks/useChat";
import { Navbar } from "./Navbar";
import { ScrollableList } from "@/components/scrollable-list";
import { WorkspaceSelector } from "@/components/workspace-selector";
import { WorkspaceDocumentList } from "@/components/workspace-document-list";

const Navigation = () => {
  const search = useSearch();
  const settings = useSettings();
  const { activeWorkspaceId, onTeamModalOpen } = useWorkspace();
  const { toggleChat } = useChat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const create = useMutation(api.documents.create);
  const syncUser = useMutation(api.users.syncUser);
  const { user } = useUser();
  const createWsDoc = useMutation(api.workspaces.createDocument);

  // Sync user on mount
  useEffect(() => {
    if (user) {
      syncUser({
        name: user.fullName ?? user.firstName ?? "User",
        email: user.primaryEmailAddress?.emailAddress ?? "",
        imageUrl: user.imageUrl,
      }).catch(() => {});
    }
  }, [user, syncUser]);

  const isResizingRef = useRef(false);
  const sidebarRef = useRef<ComponentRef<"aside">>(null);
  const navbarRef = useRef<ComponentRef<"div">>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(isMobile);

  useEffect(() => {
    if (isMobile) {
      collapse();
    } else {
      resetWidth();
    }
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) {
      collapse();
    }
  }, [pathname, isMobile]);

  const handleMouseDown = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    isResizingRef.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizingRef.current) return;
    let newWidth = e.clientX;

    if (newWidth < 240) newWidth = 240;
    if (newWidth > 480) newWidth = 480;

    if (sidebarRef.current && navbarRef.current) {
      sidebarRef.current.style.width = `${newWidth}px`;
      navbarRef.current.style.setProperty("left", `${newWidth}px`);
      navbarRef.current.style.setProperty(
        "width",
        `calc(100% - ${newWidth}px)`,
      );
    }
  };

  const handleMouseUp = () => {
    isResizingRef.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  const resetWidth = () => {
    if (sidebarRef.current && navbarRef.current) {
      setIsCollapsed(false);
      setIsResetting(true);

      sidebarRef.current.style.width = isMobile ? "100%" : "240px";
      navbarRef.current.style.removeProperty("width");
      navbarRef.current.style.setProperty(
        "width",
        isMobile ? "0" : "calc(100%-240px)",
      );
      navbarRef.current.style.setProperty("left", isMobile ? "100%" : "240px");
      setTimeout(() => setIsResetting(false), 300);
    }
  };

  const collapse = () => {
    if (sidebarRef.current && navbarRef.current) {
      setIsCollapsed(true);
      setIsResetting(true);

      const collapsedWidth = isMobile ? 0 : 56;
      sidebarRef.current.style.width = `${collapsedWidth}px`;
      navbarRef.current.style.setProperty(
        "width",
        isMobile ? "100%" : `calc(100% - ${collapsedWidth}px)`,
      );
      navbarRef.current.style.setProperty(
        "left",
        isMobile ? "0" : `${collapsedWidth}px`,
      );
      setTimeout(() => setIsResetting(false), 300);
    }
  };

  const handleCreate = () => {
    if (activeWorkspaceId) {
      const promise = createWsDoc({
        workspaceId: activeWorkspaceId,
        title: "Untitled",
      }).then((documentId) => router.push(`/documents/${documentId}`));
      toast.promise(promise, {
        loading: "Creating a new note....",
        success: "New note created.",
        error: "Failed to create a note.",
      });
    } else {
      const promise = create({ title: "Untitled" }).then((documentId) =>
        router.push(`/documents/${documentId}`),
      );
      toast.promise(promise, {
        loading: "Creating a new note....",
        success: "New note created.",
        error: "Failed to create a note.",
      });
    }
  };

  return (
    <>
      <aside
        ref={sidebarRef}
        className={cn(
          "group/sidebar bg-secondary relative z-300 flex h-full w-60 flex-col overflow-hidden overflow-x-hidden pb-4",
          isResetting && "transition-all duration-300 ease-in-out",
          isMobile && "w-0",
        )}
      >
        <div
          onClick={collapse}
          role="button"
          className={cn(
            "text-muted-foreground absolute top-3 right-2 h-6 w-6 rounded-sm opacity-0 transition group-hover/sidebar:opacity-100 hover:bg-neutral-300 dark:hover:bg-neutral-600",
            isMobile && "opacity-100",
            isCollapsed && !isMobile && "hidden",
          )}
        >
          <ChevronsLeft className="h-6 w-6" />
        </div>
        {isCollapsed && !isMobile ? (
          /* ── Icon-only strip (desktop collapsed) ── */
          <div className="mt-2 flex flex-col">
            <Item label="Search" icon={Search} onClick={resetWidth} isCollapsed />
            <Item label="Settings" icon={Settings} onClick={resetWidth} isCollapsed />
            {activeWorkspaceId && (
              <Item label="Projects" icon={Folder} onClick={resetWidth} isCollapsed />
            )}
            {activeWorkspaceId && (
              <Item label="Team" icon={Users} onClick={resetWidth} isCollapsed />
            )}
            {activeWorkspaceId && (
              <Item label="Chat" icon={MessageCircle} onClick={resetWidth} isCollapsed />
            )}
            <Item label="New page" icon={PlusCircle} onClick={resetWidth} isCollapsed />
            <Item label="Trash" icon={Trash} onClick={resetWidth} isCollapsed />
          </div>
        ) : (
          <>
            <div>
              <UserItem />
              <WorkspaceSelector />
              <Item label="Search" icon={Search} isSearch onClick={search.onOpen} />
              <Item label="Settings" icon={Settings} onClick={settings.onOpen} />
              {activeWorkspaceId && (
                <Item label="Projects" icon={Folder} onClick={() => router.push("/projects")} />
              )}
              {activeWorkspaceId && (
                <Item label="Team" icon={Users} onClick={onTeamModalOpen} />
              )}
              {activeWorkspaceId && (
                <Item label="Chat" icon={MessageCircle} onClick={toggleChat} />
              )}
              <Item onClick={handleCreate} label="New page" icon={PlusCircle} />
            </div>
            <div className="mt-4">
              <div>
                <ScrollableList>
                  {activeWorkspaceId ? (
                    <WorkspaceDocumentList />
                  ) : (
                    <DocumentList />
                  )}
                </ScrollableList>
              </div>
              <Item onClick={handleCreate} icon={Plus} label="Add a page" />
              <Popover>
                <PopoverTrigger className="mt-3 w-full">
                  <Item label="Trash" icon={Trash} />
                </PopoverTrigger>
                <PopoverContent
                  side={isMobile ? "bottom" : "right"}
                  className="w-72 p-0"
                  collisionPadding={16}
                >
                  <TrashBox />
                </PopoverContent>
              </Popover>
            </div>
          </>
        )}
        <div
          onMouseDown={handleMouseDown}
          onClick={resetWidth}
          className="bg-primary/10 absolute top-0 right-0 h-full w-1 cursor-ew-resize opacity-0 transition group-hover/sidebar:opacity-100"
        ></div>
      </aside>
      <div
        ref={navbarRef}
        className={cn(
          "absolute top-0 left-60 z-40 w-[calc(100%-240px)]",
          isResetting && "transition-all duration-300 ease-in-out",
          isMobile && "left-0 w-full",
        )}
      >
        {!!params.documentId ? (
          (!isMobile || isCollapsed) && (
            <Navbar isCollapsed={isCollapsed} onResetWidth={resetWidth} />
          )
        ) : (
          <nav
            className={cn(
              "w-full bg-transparent px-3 py-2",
              !isCollapsed && "p-0",
            )}
          >
            {isCollapsed && isMobile && (
              <MenuIcon
                onClick={resetWidth}
                role="button"
                className="text-muted-foreground h-6 w-6"
              />
            )}
          </nav>
        )}
      </div>
    </>
  );
};
export default Navigation;
