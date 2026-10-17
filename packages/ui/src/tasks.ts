import type { createPrimitives } from "./primitives";
import type {
  ElementFactory,
  TaskDetailProps,
  TaskListProps,
  TaskPreviewProps,
  TaskSearchProps,
} from "./types";

type TaskControls<N> = Pick<
  ReturnType<typeof createPrimitives<N>>,
  "Button" | "Panel"
>;

export function createTasks<N>(
  h: ElementFactory<N>,
  { Button, Panel }: TaskControls<N>,
) {
  function TaskList({
    tasks,
    state,
    message,
    form,
    preview,
    link: renderLink,
  }: TaskListProps<N>) {
    return Panel(
      "tasks._index/route.ts",
      h(
        "div",
        { className: "task-body" },
        h("h2", null, "Tasks"),
        h(
          "ul",
          { className: "task-list" },
          ...tasks.map((task) =>
            h(
              "li",
              { key: task.id },
              renderLink(`/tasks/${task.id}`, task.title),
            ),
          ),
        ),
        form([
          h(
            "label",
            null,
            "New task",
            h("input", {
              name: "title",
              required: true,
              placeholder: "Task title",
            }),
          ),
          Button({ type: "submit", disabled: state !== "idle" }, "Create task"),
        ]),
        h("p", { role: "status" }, message ?? "POST /tasks"),
        ...(preview ? [preview] : []),
      ),
    );
  }

  function TaskPreview({ task, state, load }: TaskPreviewProps) {
    return h(
      "section",
      { className: "fetcher-preview" },
      h("h2", null, "Fetcher data"),
      Button({ onClick: load, disabled: state !== "idle" }, "Fetch task 1"),
      h(
        "p",
        { "data-testid": "fetcher-data" },
        task?.title ?? "Nothing fetched yet.",
      ),
    );
  }

  function TaskDetail({
    task,
    state,
    message,
    form,
    link: renderLink,
  }: TaskDetailProps<N>) {
    return Panel(
      "tasks.$id/route.ts",
      h(
        "div",
        { className: "task-body" },
        h("h2", null, "Edit task"),
        form([
          h(
            "label",
            null,
            "Title",
            h("input", {
              key: task?.id,
              name: "title",
              defaultValue: task?.title,
              required: true,
            }),
          ),
          Button({ type: "submit", disabled: state !== "idle" }, "Save task"),
          Button(
            {
              type: "submit",
              formMethod: "delete",
              formNoValidate: true,
              className: "secondary",
              disabled: state !== "idle",
            },
            "Delete task",
          ),
        ]),
        h("p", { role: "status" }, message ?? `PATCH /tasks/${task?.id ?? ""}`),
        renderLink("/tasks", "← All tasks"),
      ),
    );
  }

  function TaskSearch({
    query,
    tasks,
    form,
    link: renderLink,
  }: TaskSearchProps<N>) {
    return Panel(
      "tasks.search/route.ts",
      h(
        "div",
        { className: "task-body" },
        h("h2", null, "Search tasks"),
        h(
          "p",
          null,
          "A GET form updates the URL. The route loader filters the results.",
        ),
        form([
          h(
            "label",
            null,
            "Search query",
            h("input", {
              key: query,
              name: "q",
              defaultValue: query,
              placeholder: "Try edit",
            }),
          ),
          Button({ type: "submit" }, "Search tasks"),
        ]),
        h("p", { role: "status" }, `${tasks.length} results`),
        h(
          "ul",
          { className: "task-list" },
          ...tasks.map((task) =>
            h(
              "li",
              { key: task.id },
              renderLink(`/tasks/${task.id}`, task.title),
            ),
          ),
        ),
        renderLink("/tasks", "← All tasks"),
      ),
    );
  }

  return { TaskList, TaskPreview, TaskDetail, TaskSearch };
}
