import { KTAssignment, WorkspaceResponse } from "../types";
import { delay, fallbackWorkspace, mockWorkspaceByProject, setMockAssignments } from "./mockData";

export const workspaceService = {
  async getWorkspace(projectId: string): Promise<WorkspaceResponse> {
    return delay(mockWorkspaceByProject[projectId] ?? fallbackWorkspace);
  },

  async createAssignment(assignment: KTAssignment): Promise<KTAssignment> {
    const workspace = mockWorkspaceByProject["alpha-payments"] ?? fallbackWorkspace;
    const nextAssignment = { ...assignment, id: `assign-${Date.now()}` };
    setMockAssignments([nextAssignment, ...workspace.assignments]);
    return delay(nextAssignment, 300);
  },

  async updateAssignment(assignment: KTAssignment): Promise<KTAssignment> {
    const workspace = mockWorkspaceByProject["alpha-payments"] ?? fallbackWorkspace;
    setMockAssignments(workspace.assignments.map((item) => (item.id === assignment.id ? assignment : item)));
    return delay(assignment, 300);
  },

  async cancelAssignment(assignmentId: string): Promise<void> {
    const workspace = mockWorkspaceByProject["alpha-payments"] ?? fallbackWorkspace;
    setMockAssignments(workspace.assignments.filter((item) => item.id !== assignmentId));
    return delay(undefined, 300);
  },
};
