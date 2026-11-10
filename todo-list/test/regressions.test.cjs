const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const load = require("./load-source.cjs");
const storage = load("src/storage.ts");
const { shortcut } = load("src/shortcuts.ts");
const { dayFolder, todoFileFor } = load("src/path.ts");
const { getTags } = load("src/tags.ts");
const item = (title, extra = {}) => ({ title, completed: false, timeAdded: 123, ...extra });
const sections = (todo = []) => ({ pinned: [], todo, completed: [] });
function fixture(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "todo-list-test-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return { folder, file: path.join(folder, "todo.json") };
}

test("missing storage is an empty list without creating or modifying files", (t) => {
  const { folder, file } = fixture(t);
  assert.deepEqual(storage.readTodos(file), { sections: sections(), revision: null });
  assert.deepEqual(fs.readdirSync(folder), []);
});

test("legacy array format preserves completed pinned tasks and task metadata", () => {
  const pinned = item("Pinned", { completed: true, priority: 3, tag: "All", dueDate: 123 });
  const open = item("Open");
  const done = item("Done", { completed: true });
  const parsed = storage.parseTodos(JSON.stringify([[pinned], [done, open]]));
  assert.equal(parsed.pinned[0].completed, true);
  assert.equal(parsed.pinned[0].tag, "All");
  assert.equal(parsed.pinned[0].priority, 3);
  assert.equal(parsed.pinned[0].dueDate, 123);
  assert.equal(parsed.todo[0].title, "Open");
  assert.equal(parsed.completed[0].title, "Done");
});

test("corrupt, malformed, and unreadable files never become an empty list", (t) => {
  const { folder, file } = fixture(t);
  for (const content of ["{", "null", "{}", "[[],null]", JSON.stringify(sections([{ title: "Broken" }])), JSON.stringify(sections([item("Bad date", { dueDate: 9e20 })]))]) {
    fs.writeFileSync(file, content);
    assert.throws(() => storage.readTodos(file), /Could not read/);
    assert.equal(fs.readFileSync(file, "utf8"), content);
  }
  assert.throws(() => storage.readTodos(folder));
});

test("successful saves keep the previous file as a backup and leave no temporary files", (t) => {
  const { folder, file } = fixture(t);
  const previous = JSON.stringify(sections([item("Original")]));
  fs.writeFileSync(file, previous);
  const revision = storage.writeTodos(file, sections([item("Edited")]), previous);
  assert.equal(fs.readFileSync(file, "utf8"), revision);
  assert.equal(fs.readFileSync(`${file}.backup`, "utf8"), previous);
  assert.deepEqual(fs.readdirSync(folder).sort(), ["todo.json", "todo.json.backup"]);
});

test("a stale command cannot overwrite a newer list or its backup", (t) => {
  const { file } = fixture(t);
  const original = storage.writeTodos(file, sections([item("Original")]), null);
  const updated = storage.writeTodos(file, sections([item("Newer")]), original);
  assert.throws(() => storage.writeTodos(file, sections(), original), /changed in another command/);
  assert.equal(fs.readFileSync(file, "utf8"), updated);
  assert.equal(fs.readFileSync(`${file}.backup`, "utf8"), original);
});

test("invalid writes preserve the current file", (t) => {
  const { file } = fixture(t);
  const previous = storage.writeTodos(file, sections([item("Keep")]), null);
  assert.throws(() => storage.writeTodos(file, sections([item("Bad", { priority: 4 })]), previous));
  assert.equal(fs.readFileSync(file, "utf8"), previous);
});

test("backup failure prevents replacing the original list", (t) => {
  const { file } = fixture(t);
  const previous = storage.writeTodos(file, sections([item("Keep")]), null);
  fs.mkdirSync(`${file}.backup`);
  assert.throws(() => storage.writeTodos(file, sections(), previous));
  assert.equal(fs.readFileSync(file, "utf8"), previous);
});

test("import recovers from corrupt storage while preserving the original bytes", (t) => {
  const { folder, file } = fixture(t);
  fs.writeFileSync(file, "broken original");
  storage.importTodos(file, JSON.stringify([[], [item("Recovered")]]));
  assert.equal(storage.readTodos(file).sections.todo[0].title, "Recovered");
  const backup = fs.readdirSync(folder).find((name) => name.endsWith(".backup"));
  assert.equal(fs.readFileSync(path.join(folder, backup), "utf8"), "broken original");
});

test("invalid imports do not touch the current list", (t) => {
  const { folder, file } = fixture(t);
  fs.writeFileSync(file, "preserve even invalid bytes");
  assert.throws(() => storage.importTodos(file, "[]"));
  assert.equal(fs.readFileSync(file, "utf8"), "preserve even invalid bytes");
  assert.deepEqual(fs.readdirSync(folder), ["todo.json"]);
});

test("export and import round-trip without overwriting existing export files", (t) => {
  const { folder, file } = fixture(t);
  storage.writeTodos(file, { pinned: [item("Pin", { completed: true })], todo: [item("Work", { tag: "All", dueDate: 456, priority: 2 })], completed: [item("Done", { completed: true })] }, null);
  const destination = path.join(folder, "export.json");
  storage.exportTodos(file, destination);
  const exported = fs.readFileSync(destination, "utf8");
  assert.throws(() => storage.exportTodos(file, destination), /EEXIST/);
  const restored = storage.importTodos(path.join(folder, "restored.json"), exported);
  assert.deepEqual(restored, storage.readTodos(file).sections);
});

test("shortcuts collapse to the one binding Vicinae understands", () => {
  assert.deepEqual(shortcut("p", ["cmd", "opt"]), { key: "p", modifiers: ["ctrl", "alt"] });
  assert.deepEqual(shortcut("e", ["cmd", "shift"]), { key: "e", modifiers: ["ctrl", "shift"] });
});

test("the list lives in a folder dated in local time", () => {
  // Local, not UTC: a pick near midnight must not land in tomorrow's folder.
  assert.equal(dayFolder(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(dayFolder(new Date(2026, 10, 10, 0, 1)), "2026-11-10");
  assert.equal(todoFileFor(new Date(2026, 10, 10), "/home/x"), "/home/x/Documents/todo/2026-11-10/todo.json");
});

test("tag discovery includes literal All and deduplicates across sections", () => {
  assert.deepEqual(getTags({ pinned: [item("a", { tag: "All" })], todo: [item("b", { tag: "All" }), item("c", { tag: "Work" }), item("d", { tag: "" })], completed: [] }), ["All", "Work"]);
});

function uiMocks(saved, setSaved = () => {}) {
  const atoms = {
    todoAtom: Symbol("todos"), selectedTagAtom: Symbol("tag"), ALL_TAG_VALUE: "",
    editingAtom: Symbol("editing"), editingTagAtom: Symbol("editing-tag"), editingTagNameAtom: Symbol("tag-name"),
    searchBarTextAtom: Symbol("text"), editingDueDateAtom: Symbol("editing-date"), editingDueDateValueAtom: Symbol("date"),
  };
  const React = require("react");
  const config = {
    preferences: { sortOrder: "title_ascending" },
    SECTIONS_DATA: { pinned: { name: "Pinned" }, todo: { name: "Todo" }, completed: { name: "Completed" } },
  };
  return {
    atoms,
    mocks: {
      "./atoms": atoms, "../atoms": atoms,
      "./config": config, "../config": config,
      jotai: { useAtom: (atom) => atom === atoms.todoAtom ? [saved, setSaved] : ["All", () => {}] },
      react: { ...React, useEffect: () => {}, useMemo: (fn) => fn() },
      "@raycast/utils": { showFailureToast: async () => {} },
      "@vicinae/api": {
        List: { Section: "list-section", Dropdown: Object.assign(() => null, { Item: "dropdown-item" }) },
      },
    },
  };
}
function descendants(element) {
  if (!element || typeof element !== "object") return [];
  const children = [element.props?.children].flat(Infinity);
  return [element, ...children.flatMap(descendants)];
}

test("All tag dropdown has a separate value from the built-in all-tasks filter", () => {
  const { mocks } = uiMocks(sections([item("Tagged", { tag: "All" })]));
  const Dropdown = load("src/list_tags.tsx", mocks).default;
  const rendered = Dropdown();
  const options = descendants(rendered).filter((element) => element.type === "dropdown-item");
  assert.deepEqual(options.map((option) => [option.props.title, option.props.value]), [["All Todos", ""], ["All", "All"]]);
  assert.equal(rendered.props.value, "All");
});

test("sorting and filtering the main list preserve the original storage indices", () => {
  const data = sections([item("Zulu", { tag: "Work" }), item("Alpha", { tag: "All" }), item("Bravo", { tag: "All" })]);
  const { mocks } = uiMocks(data);
  // Child actions are tested through useTodo separately.
  mocks["./todo_item"] = { __esModule: true, default: "todo-item" };
  const Section = load("src/todo_section.tsx", mocks).default;
  const rendered = Section({ sectionKey: "todo", selectedTag: "All" });
  const rows = descendants(rendered).filter((element) => element.type === "todo-item");
  assert.deepEqual(rows.map((row) => [row.props.item.title, row.props.idx]), [["Alpha", 1], ["Bravo", 2]]);
  assert.deepEqual(data.todo.map((todo) => todo.title), ["Zulu", "Alpha", "Bravo"]);
});

test("failed task writes leave the previous UI state untouched", () => {
  const data = sections([item("Keep", { priority: 1 })]);
  const { mocks } = uiMocks(data, () => { throw new Error("disk full"); });
  const { useTodo } = load("src/hooks/useTodo.ts", mocks);
  const actions = useTodo({ item: data.todo[0], idx: 0, sectionKey: "todo" });
  assert.throws(() => actions.setPriority(3), /disk full/);
  assert.throws(() => actions.markCompleted(), /disk full/);
  assert.throws(() => actions.deleteTodo(), /disk full/);
  assert.equal(data.todo[0].priority, 1);
  assert.equal(data.todo[0].completed, false);
  assert.equal(data.todo.length, 1);
});

for (const change of ["another command save", "import", "deleted file"]) {
  test(`an open list recovers after a ${change} without overwriting the newer data`, (t) => {
    const { file } = fixture(t);
    const original = storage.writeTodos(file, sections([item("Original")]), null);
    const toasts = [];
    const atoms = load("src/atoms.ts", {
      "./config": { TODO_FILE: file },
      "@vicinae/api": { Toast: { Style: { Failure: "failure" } }, showToast: async (toast) => toasts.push(toast) },
    });
    const store = require("jotai/vanilla").createStore();
    const newer = change === "deleted file" ? sections() : sections([item("Newer")]);
    store.set(atoms.editingAtom, { sectionKey: "todo", index: 0 });
    store.set(atoms.editingTagAtom, { sectionKey: "todo", index: 0 });
    store.set(atoms.editingDueDateAtom, { sectionKey: "todo", index: 0 });
    if (change === "import") storage.importTodos(file, JSON.stringify(newer));
    else if (change === "deleted file") fs.unlinkSync(file);
    else storage.writeTodos(file, newer, original);
    assert.throws(() => store.set(atoms.todoAtom, sections([item("Stale edit")])), /changed in another command/);
    assert.deepEqual(store.get(atoms.todoAtom), storage.parseTodos(JSON.stringify(newer)));
    for (const atom of [atoms.editingAtom, atoms.editingTagAtom, atoms.editingDueDateAtom]) assert.equal(store.get(atom), false);
    assert.equal(toasts.length, 1);
    const next = structuredClone(store.get(atoms.todoAtom));
    next.todo.push(item("Retry"));
    store.set(atoms.todoAtom, next);
    assert.deepEqual(storage.readTodos(file).sections, storage.parseTodos(JSON.stringify(next)));
    if (change !== "deleted file") assert.equal(storage.readTodos(file).sections.todo[0].title, "Newer");
  });
}

test("refreshing a conflict never replaces visible tasks with corrupt storage", (t) => {
  const { file } = fixture(t);
  const original = sections([item("Keep")]);
  storage.writeTodos(file, original, null);
  const { todoAtom } = load("src/atoms.ts", {
    "./config": { TODO_FILE: file },
    "@vicinae/api": { Toast: { Style: { Failure: "failure" } }, showToast: async () => {} },
  });
  const store = require("jotai/vanilla").createStore();
  fs.writeFileSync(file, "broken");
  assert.throws(() => store.set(todoAtom, sections()));
  assert.deepEqual(store.get(todoAtom), storage.parseTodos(JSON.stringify(original)));
  assert.equal(fs.readFileSync(file, "utf8"), "broken");
});

test("backup launch failures show a toast without rejecting the action", async () => {
  const { mocks } = uiMocks(sections());
  const launches = [];
  const failures = [];
  mocks["@vicinae/api"] = {
    ...mocks["@vicinae/api"], Action: "action", Icon: {}, LaunchType: { UserInitiated: "user" },
    launchCommand: async (options) => { launches.push(options.name); throw new Error("Launch failed"); },
  };
  mocks["@raycast/utils"] = { showFailureToast: async (error, options) => failures.push([error.message, options.title]) };
  const Backup = load("src/backup_actions.tsx", mocks).default;
  for (const action of descendants(Backup()).filter((node) => node.type === "action")) await action.props.onAction();
  assert.deepEqual(launches, ["export-todos", "import-todos"]);
  assert.equal(failures.length, 2);
  assert.ok(failures.every(([message]) => message === "Launch failed"));
});

for (const kind of ["tag", "due_date"]) {
  for (const outcome of ["success", "conflict", "storage failure"]) {
    test(`${kind} form closes after ${outcome} only when its edit target is safe to leave`, (t) => {
      const { file } = fixture(t);
      const revision = storage.writeTodos(file, sections([item("Original")]), null);
      let popped = 0;
      const toasts = [];
      const host = {
        Toast: { Style: { Failure: "failure" } },
        showToast: async (toast) => toasts.push(toast),
        useNavigation: () => ({ pop: () => popped++ }),
        ActionPanel: "panel",
        Action: Object.assign(() => null, { SubmitForm: "submit" }),
        Form: Object.assign(() => null, {
          Dropdown: Object.assign(() => null, { Item: "option" }),
          TextField: "text", DatePicker: "date",
        }),
        Icon: {}, Color: {},
      };
      const atoms = load("src/atoms.ts", {
        "./config": { TODO_FILE: file }, "./storage": storage, "@vicinae/api": host,
      });
      const store = require("jotai/vanilla").createStore();
      const target = kind === "tag" ? atoms.editingTagAtom : atoms.editingDueDateAtom;
      store.set(target, { sectionKey: "todo", index: 0 });
      const Form = load(`src/todo_${kind}_form.tsx`, {
        "./atoms": atoms, "./storage": storage, "@vicinae/api": host,
        jotai: { useAtom: (atom) => [store.get(atom), (value) => store.set(atom, value)] },
        react: { useState: () => [kind === "tag" ? "Work" : new Date(2000), () => {}] },
      }).default;
      const submit = descendants(Form().props.actions).find((node) => node.type === "submit").props.onSubmit;
      if (outcome === "conflict") storage.writeTodos(file, sections([item("External")]), revision);
      if (outcome === "storage failure") fs.writeFileSync(file, "broken");
      if (outcome === "storage failure") {
        assert.throws(submit);
        assert.equal(popped, 0);
        assert.notEqual(store.get(target), false);
      } else {
        assert.doesNotThrow(submit);
        assert.equal(popped, 1);
        const saved = storage.readTodos(file).sections.todo[0];
        if (outcome === "conflict") {
          assert.equal(saved.title, "External");
          assert.equal(saved.tag, undefined);
          assert.equal(saved.dueDate, undefined);
          assert.equal(store.get(target), false);
          assert.equal(toasts.length, 1);
        } else {
          assert.equal(saved.title, "Original");
          assert.equal(kind === "tag" ? saved.tag : saved.dueDate, kind === "tag" ? "Work" : 2000);
        }
      }
    });
  }
}
