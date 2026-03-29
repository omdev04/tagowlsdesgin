# QUICK START GUIDE

## 🚀 Get Started in 3 Steps

### Step 1: Install Dependencies

```bash
cd notion-clone-master
npm install
```

This will install the new dependency: `@radix-ui/react-select`

### Step 2: Start Convex

```bash
npx convex dev
```

This will:
- Sync the new schema tables (projects, issues, labels, etc.)
- Start the Convex development server
- Enable real-time subscriptions

### Step 3: Start Next.js

In a new terminal:

```bash
npm run dev
```

Open http://localhost:3000

---

## 📖 Using the Jira System

### 1. Select a Workspace

In the sidebar, select a workspace. If you don't have one:
1. Click the workspace dropdown
2. Create a new workspace
3. You'll be the admin automatically

### 2. Access Projects

Click **"Projects"** in the sidebar navigation (📁 Folder icon)

### 3. Create Your First Project (Admin Only)

1. Click **"New Project"** button
2. Fill in:
   - **Name**: e.g., "Mobile App Development"
   - **Key**: e.g., "MAD" (2-10 uppercase letters/numbers)
   - **Description**: Optional
   - **Icon**: Optional emoji
3. Click **"Create Project"**

### 4. Create Issues

1. Click on your project to open the Kanban board
2. Click the **"+"** button on any column (or top-right)
3. Fill in issue details:
   - **Title**: Short description
   - **Description**: Detailed info (optional)
   - **Priority**: LOW, MEDIUM, HIGH, or URGENT
   - **Due Date**: Optional deadline
4. Click **"Create Issue"**

### 5. Manage Issues

**Move issues**: Drag cards between columns (TODO → IN_PROGRESS → DONE)

**Edit issues**: Click on any issue card to open the detail modal where you can:
- Edit title, description, status, priority
- Add/remove assignees (team members)
- Add/remove labels
- Add comments
- View activity history

**Filter issues**: Use the filter bar at the top to filter by:
- Status
- Priority
- Assignee

---

## 🎯 Common Tasks

### Add Team Members to Workspace

1. Click **"Team"** in sidebar
2. Click **"Add Member"**
3. Enter email address
4. Select role (Admin or Editor)

### Create Labels

Labels are created automatically when needed, or you can:
1. Go to any issue detail modal
2. In the Labels section, create new labels with custom colors

### View Activity Log

1. Open any issue detail modal
2. Click the **"Activity"** tab
3. See complete history of all changes

### Assign Issues

1. Open issue detail modal
2. In the Assignees section, add team members
3. Multiple assignees supported

### Add Comments

1. Open issue detail modal
2. Type your comment in the text area
3. Click **"Comment"**
4. Edit/delete your own comments anytime

---

## 💡 Tips

- **Drag-and-drop**: The fastest way to update issue status
- **Filters**: Combine multiple filters to find specific issues
- **Activity Log**: Great for understanding issue history
- **Issue Numbers**: Auto-increment per project (e.g., MAD-1, MAD-2)
- **Real-time**: Changes appear instantly for all users
- **Keyboard shortcuts**: Press `Escape` to close modals

---

## 🔐 Permissions

**Admins can:**
- Create/delete projects
- Manage team members
- Delete any comments
- Full access to all features

**Members can:**
- Create issues
- Edit their own issues
- Edit issues they're assigned to
- Comment on any issue
- View all projects

---

## 📚 Documentation

For detailed documentation, see:
- `JIRA_SYSTEM_README.md` - Complete feature documentation
- `IMPLEMENTATION_SUMMARY.md` - Technical implementation details

---

## ❓ Troubleshooting

**Issue: Schema not syncing**
```bash
# Force sync
npx convex dev --once
```

**Issue: Dependencies not installing**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Issue: Can't create projects**
- Make sure you're an admin of the workspace
- Check that you selected a workspace first

**Issue: Can't see projects menu**
- Select a workspace first
- The Projects menu only appears when a workspace is active

---

## 🎉 You're Ready!

Start creating projects and managing issues with your new Jira-like system!

For questions or issues, check the documentation files or review the code in:
- `convex/` - Backend logic
- `components/issues/` - Frontend components
- `app/(main)/(routes)/projects/` - Project pages
