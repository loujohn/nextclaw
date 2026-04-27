import type { ChatAttachmentView } from "../../shared/ui-models";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import {
  createEmployeeChatStoreState,
  getOrCreateEmployeeChatStoreController,
  type EmployeeChatStoreController,
  type EmployeeChatStoreState
} from "../lib/employee-chat-store-controller";

export * from "../lib/employee-chat-store-controller";

export function useEmployeeChatStore(employeeIdInput: MaybeRefOrGetter<string>) {
  const normalizedEmployeeId = computed(() => String(toValue(employeeIdInput)).trim());
  const employeeChatStates = useState<Record<string, EmployeeChatStoreState>>(
    "employee-chat-states",
    () => ({})
  );

  function resolveController(): EmployeeChatStoreController {
    const employeeId = normalizedEmployeeId.value;
    if (!employeeChatStates.value[employeeId]) {
      employeeChatStates.value[employeeId] = createEmployeeChatStoreState();
    }
    return getOrCreateEmployeeChatStoreController(employeeId, employeeChatStates.value[employeeId]);
  }

  const controller = computed(() => resolveController());

  return {
    state: computed(() => controller.value.state),
    currentSessionState: computed(() => controller.value.getSelectedSessionState()),
    displayMessages: computed(() => controller.value.getDisplayMessages()),
    initializeChat: () => controller.value.initializeChat(),
    selectSession: (sessionKey: string) => controller.value.selectSession(sessionKey),
    createSession: (selectAfterCreate = true) => controller.value.createSession(selectAfterCreate),
    loadOlderMessages: () => controller.value.loadOlderMessages(),
    loadMoreSessions: () => controller.value.loadMoreSessions(),
    syncChatWithExternalRuns: () => controller.value.syncChatWithExternalRuns(),
    sendMessage: (input: string) => controller.value.sendMessage(input),
    cancelRun: (sessionKey?: string) => controller.value.cancelRun(sessionKey),
    appendPendingUploads: (items: ChatAttachmentView[]) => controller.value.appendPendingUploads(items),
    removePendingUpload: (relativePath: string) => controller.value.removePendingUpload(relativePath),
    setPendingUploads: (items: ChatAttachmentView[]) => controller.value.setPendingUploads(items)
  };
}