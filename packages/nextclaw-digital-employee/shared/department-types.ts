export type DepartmentView = {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  sortOrder: number;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DepartmentTreeNode = DepartmentView & {
  children: DepartmentTreeNode[];
  employeeCount: number;
};

export type HumanMemberBrief = { id: string; name: string; title?: string | null };
export type DigitalMemberBrief = { id: string; name: string };
