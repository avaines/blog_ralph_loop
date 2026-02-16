const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { initDb } = require("./db");

const { db, dbPath } = initDb();
const port = Number(process.env.PORT) || 8080;
const publicDir = path.join(__dirname, "public");
const staticPrefix = "/static/";

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, body, contentType) {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(body);
}

function contentTypeForPublicPath(filePath) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  return null;
}

function servePublicFile(res, relativePath) {
  const normalizedPath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, normalizedPath);
  const contentType = contentTypeForPublicPath(filePath);
  if (!contentType || !filePath.startsWith(publicDir)) {
    sendJson(res, 404, { error: "not found" });
    return;
  }

  try {
    const fileContents = fs.readFileSync(filePath);
    sendText(res, 200, fileContents, contentType);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    sendJson(res, 500, { error: "internal server error" });
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

function mapTodoRow(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    group_name: row.group_name,
    completed: Boolean(row.completed),
    created_at: row.created_at,
  };
}

const insertTodo = db.prepare(`
  INSERT INTO todos (title, category, group_name, completed, created_at)
  VALUES (?, ?, ?, 0, ?);
`);
const selectTodoById = db.prepare(`
  SELECT id, title, category, group_name, completed, created_at
  FROM todos
  WHERE id = ?;
`);
const selectTodosNewestFirst = db.prepare(`
  SELECT id, title, category, group_name, completed, created_at
  FROM todos
  ORDER BY created_at DESC, id DESC;
`);
const toggleTodoCompletedById = db.prepare(`
  UPDATE todos
  SET completed = CASE completed WHEN 0 THEN 1 ELSE 0 END
  WHERE id = ?;
`);
const deleteTodoById = db.prepare(`
  DELETE FROM todos
  WHERE id = ?;
`);

function handlePostTodos(payload) {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (!title) {
    return {
      statusCode: 400,
      body: { error: "title must be a non-empty string" },
    };
  }

  const category =
    typeof payload.category === "string" ? payload.category.trim() : "";
  const groupNameRaw =
    typeof payload.group === "string"
      ? payload.group
      : typeof payload.group_name === "string"
        ? payload.group_name
        : "";
  const groupName = groupNameRaw.trim();
  const createdAt = new Date().toISOString();
  const result = insertTodo.run(title, category, groupName, createdAt);
  const createdRow = selectTodoById.get(result.lastInsertRowid);

  return {
    statusCode: 201,
    body: mapTodoRow(createdRow),
  };
}

function handleGetTodos() {
  const rows = selectTodosNewestFirst.all();
  return {
    statusCode: 200,
    body: rows.map(mapTodoRow),
  };
}

function handleToggleTodo(idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return {
      statusCode: 404,
      body: { error: "todo not found" },
    };
  }

  const result = toggleTodoCompletedById.run(id);
  if (!result.changes) {
    return {
      statusCode: 404,
      body: { error: "todo not found" },
    };
  }

  const updatedRow = selectTodoById.get(id);
  return {
    statusCode: 200,
    body: mapTodoRow(updatedRow),
  };
}

function handleDeleteTodo(idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return {
      statusCode: 404,
      body: { error: "todo not found" },
    };
  }

  const result = deleteTodoById.run(id);
  if (!result.changes) {
    return {
      statusCode: 404,
      body: { error: "todo not found" },
    };
  }

  return {
    statusCode: 204,
    body: null,
  };
}

async function requestHandler(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/") {
    servePublicFile(res, "index.html");
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith(staticPrefix)) {
    const relativePath = url.pathname.slice(staticPrefix.length);
    servePublicFile(res, relativePath);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/todos") {
    const response = handleGetTodos();
    sendJson(res, response.statusCode, response.body);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/todos") {
    try {
      const payload = await readJsonBody(req);
      const response = handlePostTodos(payload);
      sendJson(res, response.statusCode, response.body);
    } catch (error) {
      if (error.message === "Invalid JSON body") {
        sendJson(res, 400, { error: "invalid JSON body" });
        return;
      }

      sendJson(res, 500, { error: "internal server error" });
    }
    return;
  }

  const toggleMatch =
    req.method === "PATCH"
      ? url.pathname.match(/^\/api\/todos\/(\d+)\/toggle$/)
      : null;
  if (toggleMatch) {
    const response = handleToggleTodo(toggleMatch[1]);
    sendJson(res, response.statusCode, response.body);
    return;
  }

  const deleteMatch =
    req.method === "DELETE" ? url.pathname.match(/^\/api\/todos\/(\d+)$/) : null;
  if (deleteMatch) {
    const response = handleDeleteTodo(deleteMatch[1]);
    if (response.statusCode === 204) {
      res.writeHead(204);
      res.end();
      return;
    }
    sendJson(res, response.statusCode, response.body);
    return;
  }

  sendJson(res, 404, { error: "not found" });
}

function startServer() {
  const server = http.createServer(requestHandler);
  server.listen(port, () => {
    console.log(`SQLite ready at ${dbPath}`);
    console.log(`Server listening on http://localhost:${port}`);
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  requestHandler,
  handlePostTodos,
  handleGetTodos,
  handleToggleTodo,
  handleDeleteTodo,
  startServer,
};
