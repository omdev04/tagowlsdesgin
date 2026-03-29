"use client";

import { useState } from "react";
import { SimpleKanbanBoard } from "@/components/issues/SimpleKanbanBoard";
import { UserAccessModal } from "@/components/modals/UserAccessModal";

export default function KanbanPage() {
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);

  return (
    <div className="h-screen overflow-hidden">
      <SimpleKanbanBoard onOpenUserAccess={() => setIsAccessModalOpen(true)} />
      <UserAccessModal
        isOpen={isAccessModalOpen}
        onClose={() => setIsAccessModalOpen(false)}
      />
    </div>
  );
}