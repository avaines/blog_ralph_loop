const form = document.getElementById("todo-form");
const titleInput = document.getElementById("title");
const categoryInput = document.getElementById("category");
const groupInput = document.getElementById("group");
const categoryFilter = document.getElementById("filter-category");
const groupFilter = document.getElementById("filter-group");
const clearFiltersButton = document.getElementById("clear-filters");
const filterContext = document.getElementById("filter-context");
const todoList = document.getElementById("todo-list");
const loadingState = document.getElementById("loading-state");
const emptyState = document.getElementById("empty-state");
const errorElement = document.getElementById("error");
const submitButton = form.querySelector('button[type="submit"]');
let currentTodos = [];
const activeFilters = { category: "", group: "" };

function setFormDisabled(disabled) {
  titleInput.disabled = disabled;
  categoryInput.disabled = disabled;
  groupInput.disabled = disabled;
  submitButton.disabled = disabled;
}

function setTodoActionDisabled(todoId, disabled) {
  const controls = todoList.querySelectorAll(
    `button[data-todo-id="${todoId}"]`,
  );
  for (const control of controls) {
    control.disabled = disabled;
  }
}

function getFilterLabel(value) {
  return value || "All";
}

function updateFilterContext() {
  filterContext.textContent = `Category: ${getFilterLabel(activeFilters.category)} | Group: ${getFilterLabel(activeFilters.group)}`;
}

function setFilterOptions(select, values, allLabel, selectedValue) {
  select.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = allLabel;
  select.appendChild(allOption);

  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }

  const hasSelectedValue = selectedValue
    ? values.includes(selectedValue)
    : true;
  select.value = hasSelectedValue ? selectedValue : "";
}

function updateFiltersForTodos(todos) {
  const categories = [...new Set(todos.map((todo) => todo.category).filter(Boolean))].sort();
  const groups = [...new Set(todos.map((todo) => todo.group_name).filter(Boolean))].sort();

  setFilterOptions(
    categoryFilter,
    categories,
    "All categories",
    activeFilters.category,
  );
  if (categoryFilter.value !== activeFilters.category) {
    activeFilters.category = categoryFilter.value;
  }

  setFilterOptions(groupFilter, groups, "All groups", activeFilters.group);
  if (groupFilter.value !== activeFilters.group) {
    activeFilters.group = groupFilter.value;
  }
}

function applyActiveFilters(todos) {
  return todos.filter((todo) => {
    if (activeFilters.category && todo.category !== activeFilters.category) {
      return false;
    }
    if (activeFilters.group && todo.group_name !== activeFilters.group) {
      return false;
    }
    return true;
  });
}

function setError(message) {
  if (!message) {
    errorElement.hidden = true;
    errorElement.textContent = "";
    return;
  }

  errorElement.hidden = false;
  errorElement.textContent = message;
}

function setLoading(isLoading) {
  loadingState.hidden = !isLoading;
  if (isLoading) {
    emptyState.hidden = true;
  }
}

function renderTodos(todos) {
  currentTodos = Array.isArray(todos) ? todos : [];
  updateFiltersForTodos(currentTodos);
  const filteredTodos = applyActiveFilters(currentTodos);
  updateFilterContext();
  setLoading(false);
  todoList.innerHTML = "";

  if (filteredTodos.length === 0) {
    emptyState.hidden = false;
    const hasActiveFilters = Boolean(activeFilters.category || activeFilters.group);
    emptyState.textContent = hasActiveFilters
      ? "No TODOs match the current filters."
      : "No TODOs yet.";
    return;
  }

  emptyState.hidden = true;

  for (const todo of filteredTodos) {
    const item = document.createElement("li");
    item.className = `todo-item ${todo.completed ? "completed" : "active"}`;
    const state = todo.completed ? "Completed" : "Active";

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = todo.title;

    const category = document.createElement("span");
    category.className = "meta";
    category.textContent = `Category: ${todo.category || "-"}`;

    const group = document.createElement("span");
    group.className = "meta";
    group.textContent = `Group: ${todo.group_name || "-"}`;

    const completionState = document.createElement("span");
    completionState.className = `meta state-pill ${todo.completed ? "completed" : "active"}`;
    completionState.textContent = `State: ${state}`;

    const actions = document.createElement("div");
    actions.className = "todo-actions";

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "toggle-btn btn btn-secondary";
    toggleButton.dataset.action = "toggle";
    toggleButton.dataset.todoId = String(todo.id);
    toggleButton.textContent = todo.completed
      ? "Mark active"
      : "Mark complete";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-btn btn";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.todoId = String(todo.id);
    deleteButton.textContent = "Delete";

    actions.append(toggleButton, deleteButton);
    item.append(title, category, group, completionState, actions);
    todoList.appendChild(item);
  }
}

async function loadTodos() {
  setLoading(true);
  try {
    const response = await fetch("/api/todos");
    if (!response.ok) {
      throw new Error("Could not load TODOs");
    }
    const todos = await response.json();
    renderTodos(todos);
  } finally {
    setLoading(false);
  }
}

async function createTodo(payload) {
  const response = await fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || "Could not create TODO");
  }

  return response.json();
}

async function toggleTodo(todoId) {
  const response = await fetch(`/api/todos/${todoId}/toggle`, {
    method: "PATCH",
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(errorBody.error || "Could not toggle TODO");
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function deleteTodo(todoId) {
  const response = await fetch(`/api/todos/${todoId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(errorBody.error || "Could not delete TODO");
    error.status = response.status;
    throw error;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("");
  setFormDisabled(true);

  try {
    await createTodo({
      title: titleInput.value,
      category: categoryInput.value,
      group: groupInput.value,
    });
    form.reset();
    titleInput.focus();
    await loadTodos();
  } catch (error) {
    setError(error.message);
  } finally {
    setFormDisabled(false);
  }
});

categoryFilter.addEventListener("change", () => {
  activeFilters.category = categoryFilter.value;
  renderTodos(currentTodos);
});

groupFilter.addEventListener("change", () => {
  activeFilters.group = groupFilter.value;
  renderTodos(currentTodos);
});

clearFiltersButton.addEventListener("click", () => {
  activeFilters.category = "";
  activeFilters.group = "";
  categoryFilter.value = "";
  groupFilter.value = "";
  renderTodos(currentTodos);
});

todoList.addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-action][data-todo-id]");
  if (!target) {
    return;
  }

  const action = target.dataset.action;
  const todoId = Number(target.dataset.todoId);
  if (!Number.isInteger(todoId) || todoId <= 0) {
    return;
  }

  const previousTodos = currentTodos.slice();
  setError("");
  setTodoActionDisabled(todoId, true);

  try {
    if (action === "toggle") {
      const updatedTodos = currentTodos.map((todo) =>
        todo.id === todoId ? { ...todo, completed: !todo.completed } : todo,
      );
      renderTodos(updatedTodos);
      const updatedTodo = await toggleTodo(todoId);
      renderTodos(
        updatedTodos.map((todo) => (todo.id === todoId ? updatedTodo : todo)),
      );
      return;
    }

    if (action === "delete") {
      const updatedTodos = currentTodos.filter((todo) => todo.id !== todoId);
      renderTodos(updatedTodos);
      await deleteTodo(todoId);
      return;
    }
  } catch (error) {
    renderTodos(previousTodos);
    if (error.status === 404) {
      await loadTodos();
      setError("TODO no longer exists. List refreshed.");
      return;
    }
    setError(error.message);
  } finally {
    setTodoActionDisabled(todoId, false);
  }
});

loadTodos().catch((error) => {
  setError(error.message);
});
