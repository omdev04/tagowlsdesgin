"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useIssues } from "@/hooks/useIssues";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertCircle, ArrowUp, Filter, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low", icon: Minus, color: "text-neutral-400" },
  { value: "MEDIUM", label: "Medium", icon: Minus, color: "text-blue-500" },
  { value: "HIGH", label: "High", icon: ArrowUp, color: "text-orange-500" },
  { value: "URGENT", label: "Urgent", icon: AlertCircle, color: "text-red-500" },
];

const STATUS_OPTIONS = [
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
];

export const IssueFilters = () => {
  const { activeWorkspaceId } = useWorkspace();
  const {
    filterStatus,
    filterPriority,
    filterAssigneeId,
    setFilterStatus,
    setFilterPriority,
    setFilterAssigneeId,
    clearFilters,
  } = useIssues();

  const members = useQuery(
    api.workspaces.getMembers,
    activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
  );

  const hasFilters = filterStatus || filterPriority || filterAssigneeId;

  const selectedStatus = STATUS_OPTIONS.find((opt) => opt.value === filterStatus);
  const selectedPriority = PRIORITY_OPTIONS.find((opt) => opt.value === filterPriority);
  const selectedMember = members?.find((m) => m.userId === filterAssigneeId);

  return (
    <div className="flex items-center gap-3 border-b bg-neutral-50 px-6 py-3.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-neutral-400" />
        <span className="text-sm font-medium">Filters</span>
      </div>

      <Select value={filterStatus ?? "all"} onValueChange={(val) => setFilterStatus(val === "all" ? null : val)}>
        <SelectTrigger className="h-8 w-36 border-neutral-200 dark:border-neutral-800">
          <SelectValue>
            {filterStatus ? selectedStatus?.label : "All Status"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filterPriority ?? "all"}
        onValueChange={(val) => setFilterPriority(val === "all" ? null : val)}
      >
        <SelectTrigger className="h-8 w-36 border-neutral-200 dark:border-neutral-800">
          <SelectValue>
            {filterPriority && selectedPriority ? (
              <div className="flex items-center gap-2">
                <selectedPriority.icon className={cn("h-3.5 w-3.5", selectedPriority.color)} />
                {selectedPriority.label}
              </div>
            ) : (
              "All Priority"
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priority</SelectItem>
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

      <Select
        value={filterAssigneeId ?? "all"}
        onValueChange={(val) => setFilterAssigneeId(val === "all" ? null : val)}
      >
        <SelectTrigger className="h-8 w-40 border-neutral-200 dark:border-neutral-800">
          <SelectValue>
            {filterAssigneeId && selectedMember ? (
              <div className="flex items-center gap-2">
                <Avatar className="h-4 w-4">
                  <AvatarImage src={selectedMember.user?.imageUrl} />
                  <AvatarFallback className="text-[8px]">
                    {selectedMember.user?.name?.charAt(0).toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs">{selectedMember.user?.name ?? selectedMember.userEmail}</span>
              </div>
            ) : (
              "All Assignees"
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Assignees</SelectItem>
          {members
            ?.filter((m) => !m.isPending)
            .map((member) => (
              <SelectItem key={member._id} value={member.userId}>
                <div className="flex items-center gap-2">
                  <Avatar className="h-4 w-4">
                    <AvatarImage src={member.user?.imageUrl} />
                    <AvatarFallback className="text-[8px]">
                      {member.user?.name?.charAt(0).toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs">{member.user?.name ?? member.userEmail}</span>
                </div>
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800">
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
};
