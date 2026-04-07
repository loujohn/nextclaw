export type DepartmentView = {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type DepartmentTreeNode = DepartmentView & {
  children: DepartmentTreeNode[];
  employeeCount: number;
};

export type HumanMemberBrief = { id: string; name: string; title?: string | null };
export type DigitalMemberBrief = { id: string; name: string };
