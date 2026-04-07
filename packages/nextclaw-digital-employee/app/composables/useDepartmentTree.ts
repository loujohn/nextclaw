import type { DepartmentView, HumanMemberBrief, DigitalMemberBrief } from "~~/shared/department-types";
import type { EmployeeResponse } from "./useEmployeeList";

type HumanEmployeeApiItem = HumanMemberBrief & { departmentId: string | null };
type DeptTreeOption = { id: string; label: string };

export function useDepartmentTree(
  departmentPayload: Ref<{ ok: boolean; data: DepartmentView[] } | null | undefined>,
  humanEmployeePayload: Ref<{ ok: boolean; data: HumanEmployeeApiItem[] } | null | undefined>,
  employees: Ref<EmployeeResponse[]> | ComputedRef<EmployeeResponse[]>
) {
  const departments = computed(() => departmentPayload.value?.data ?? []);

  const deptEmployeeCounts = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const emp of employees.value) {
      if (emp.departmentId) {
        counts[emp.departmentId] = (counts[emp.departmentId] ?? 0) + 1;
      }
    }
    return counts;
  });

  const humanMembersMap = computed<Record<string, HumanMemberBrief[]>>(() => {
    const map: Record<string, HumanMemberBrief[]> = {};
    for (const m of (humanEmployeePayload.value?.data ?? [])) {
      const deptId = m.departmentId;
      if (deptId) {
        if (!map[deptId]) map[deptId] = [];
        map[deptId]!.push(m);
      }
    }
    return map;
  });

  const humanCountsMap = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const [deptId, members] of Object.entries(humanMembersMap.value)) {
      counts[deptId] = members.length;
    }
    return counts;
  });

  const totalHumanCount = computed(() => humanEmployeePayload.value?.data?.length ?? 0);

  const digitalMembersMap = computed<Record<string, DigitalMemberBrief[]>>(() => {
    const map: Record<string, DigitalMemberBrief[]> = {};
    for (const emp of employees.value) {
      if (emp.departmentId) {
        if (!map[emp.departmentId]) map[emp.departmentId] = [];
        map[emp.departmentId]!.push({ id: emp.id, name: emp.name });
      }
    }
    return map;
  });

  const deptTreeOptions = computed<DeptTreeOption[]>(() => {
    const depts = departments.value;
    const map = new Map<string, { dept: DepartmentView; children: string[] }>();
    for (const d of depts) map.set(d.id, { dept: d, children: [] });
    const roots: string[] = [];
    for (const d of depts) {
      if (d.parentId && map.has(d.parentId)) map.get(d.parentId)!.children.push(d.id);
      else roots.push(d.id);
    }
    const result: DeptTreeOption[] = [];
    function walk(id: string, depth: number) {
      const node = map.get(id);
      if (!node) return;
      const prefix = depth === 0 ? "" : "—".repeat(depth) + " ";
      result.push({ id, label: prefix + node.dept.name });
      for (const childId of node.children) walk(childId, depth + 1);
    }
    for (const rootId of roots) walk(rootId, 0);
    return result;
  });

  return {
    departments,
    deptEmployeeCounts,
    humanMembersMap,
    humanCountsMap,
    totalHumanCount,
    digitalMembersMap,
    deptTreeOptions,
  };
}

export type { DeptTreeOption, HumanEmployeeApiItem };
