# Jira-like Issue Tracking System

A production-grade issue tracking system integrated into the existing Notion-clone application.

## Features

- **Projects**: Create and manage multiple projects within workspaces
- **Issues**: Create, update, and track issues with statuses, priorities, and assignments
- **Kanban Board**: Drag-and-drop Kanban board with real-time updates
- **Comments**: Add comments to issues for collaboration
- **Labels**: Organize issues with custom labels
- **Activity Log**: Track all changes made to issues
- **Filters**: Filter issues by status, priority, and assignee
- **RBAC**: Role-based access control (Admin/Member permissions)
- **Real-time**: Live updates using Convex subscriptions

## Installation

1. Install dependencies:
```bash
npm install
```

The new dependencies include:
- `@radix-ui/react-select` - For dropdown selects

2. Run Convex migrations:
```bash
npx convex dev
```

This will automatically sync the new schema tables:
- `projects`
- `issues`
- `issueAssignees`
- `labels`
- `issueLabels`
- `issueComments`
- `activityLogs`

## Usage

### Accessing Projects

1. Select a workspace from the sidebar
2. Click on "Projects" in the navigation menu
3. Create a new project (Admin only)

### Creating a Project

1. Navigate to `/projects`
2. Click "New Project"
3. Fill in:
   - **Name**: Project name (e.g., "Mobile App Development")
   - **Key**: 2-10 uppercase letters/numbers (e.g., "MAD")
   - **Description**: Optional project description
   - **Icon**: Optional emoji icon

### Managing Issues

1. Click on a project to open the Kanban board
2. Issues are organized in three columns:
   - **To Do**: New issues
   - **In Progress**: Active work
   - **Done**: Completed issues

### Creating an Issue

1. Click the "+" button on any column or use the create button
2. Fill in:
   - **Title**: Short description
   - **Description**: Detailed information
   - **Priority**: LOW, MEDIUM, HIGH, or URGENT
   - **Due Date**: Optional deadline

### Editing Issues

1. Click on an issue card to open the detail modal
2. Edit fields inline:
   - Title, description, status, priority
   - Add/remove assignees
   - Add/remove labels
   - Add comments
   - View activity history

### Drag-and-Drop

- Drag issue cards between columns to update their status
- Real-time updates reflect changes to all users

### Filtering

Use the filter bar to narrow down issues:
- **Status**: Filter by TODO, IN_PROGRESS, or DONE
- **Priority**: Filter by LOW, MEDIUM, HIGH, or URGENT
- **Assignee**: Filter by assigned team member

## Architecture

### Database Schema

```
projects
├── workspaceId
├── name
├── description
├── key (unique per workspace)
├── icon
├── createdBy
├── isArchived
└── timestamps

issues
├── projectId
├── workspaceId
├── title
├── description
├── status (TODO, IN_PROGRESS, DONE)
├── priority (LOW, MEDIUM, HIGH, URGENT)
├── issueNumber (auto-increment per project)
├── reporterId
├── dueDate
├── isDeleted
└── timestamps

issueAssignees (many-to-many)
├── issueId
├── userId
├── assignedBy
└── assignedAt

labels
├── workspaceId
├── name (unique per workspace)
├── color
├── createdBy
└── createdAt

issueLabels (many-to-many)
├── issueId
├── labelId
├── addedBy
└── addedAt

issueComments
├── issueId
├── userId
├── body
├── isEdited
├── isDeleted
└── timestamps

activityLogs
├── issueId
├── userId
├── action (e.g., "issue_created", "status_changed")
├── field
├── oldValue
├── newValue
└── createdAt
```

### Access Control

**Admin Permissions:**
- Create/delete projects
- Create/update/delete issues
- Manage team members
- Delete comments from any user

**Member Permissions:**
- View all projects
- Create issues
- Update/delete own issues
- Update/delete issues they're assigned to
- Comment on issues
- Edit/delete own comments

### API Endpoints (Convex)

**Projects:**
- `projects.create` - Create new project (Admin only)
- `projects.getAll` - Get all workspace projects
- `projects.getById` - Get project details
- `projects.update` - Update project (Admin only)
- `projects.remove` - Archive project (Admin only)
- `projects.getStats` - Get issue statistics

**Issues:**
- `issues.create` - Create new issue
- `issues.getByProject` - Get issues with filters and pagination
- `issues.getById` - Get issue details
- `issues.update` - Update issue
- `issues.remove` - Soft delete issue
- `issues.addAssignee` - Assign user to issue
- `issues.removeAssignee` - Remove assignee
- `issues.addLabel` - Add label to issue
- `issues.removeLabel` - Remove label
- `issues.getActivities` - Get activity log

**Comments:**
- `comments.create` - Add comment
- `comments.getComments` - Get all comments for issue
- `comments.updateComment` - Edit comment
- `comments.deleteComment` - Soft delete comment

**Labels:**
- `labels.create` - Create label
- `labels.getAll` - Get all workspace labels
- `labels.update` - Update label
- `labels.remove` - Delete label (Admin only)

## File Structure

```
convex/
├── schema.ts (extended with Jira tables)
├── projects.ts (project mutations & queries)
├── issues.ts (issue mutations & queries)
├── comments.ts (comment mutations & queries)
└── labels.ts (label mutations & queries)

hooks/
└── useIssues.tsx (Zustand store for issue state)

components/
└── issues/
    ├── KanbanBoard.tsx (drag-and-drop board)
    ├── IssueCard.tsx (issue preview card)
    ├── IssueDetailModal.tsx (full issue view)
    ├── IssueCreateModal.tsx (create issue form)
    └── IssueFilters.tsx (filter controls)

app/(main)/(routes)/
└── projects/
    ├── page.tsx (project list)
    ├── new/page.tsx (create project)
    └── [projectId]/page.tsx (project board)
```

## Real-time Updates

The system uses Convex's built-in real-time subscriptions:
- Issue status changes reflected immediately
- New comments appear instantly
- Activity log updates in real-time
- Multi-user collaboration is seamless

## Performance Optimizations

- **Pagination**: Issues are paginated (customizable limit/offset)
- **Indexing**: All foreign keys and frequently queried fields are indexed
- **Soft Deletes**: Issues and comments use soft deletes for data integrity
- **Optimistic Updates**: UI updates optimistically for better UX

## Security

- All mutations verify authentication
- RBAC enforced on server-side
- Input validation using Zod schemas
- No client-side role trust
- XSS protection via React's automatic escaping

## Future Enhancements

- Sprint management
- Issue templates
- Custom workflows
- Time tracking
- Issue attachments
- Email notifications
- Advanced reporting/analytics
- Issue dependencies
- Sub-tasks
