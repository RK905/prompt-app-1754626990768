// Main JavaScript file for your PWA (Simple Todo List App)
document.addEventListener('DOMContentLoaded', function() {
    console.log('Todo App loaded successfully!');
    
    // Initialize the app
    initApp();
});

let todos = [];
let filter = 'all'; // all | active | completed
let deferredPrompt = null;

function initApp() {
    // Add fade-in animation to main content
    const app = document.getElementById('app');
    if (app) {
        app.classList.add('fade-in');
    }
    
    // Register service worker for PWA functionality
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => {
                console.log('Service Worker registered successfully:', registration);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    }

    // Build initial UI and styles
    updateAppContent(buildInitialUI());

    // Inject app-specific styles
    injectStyles();

    // Load stored todos
    loadTodos();
    renderTodos();

    // Wire up UI events
    wireUIEvents();

    // Handle install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const installBtn = document.getElementById('install-btn');
        if (installBtn) installBtn.style.display = 'inline-block';
    });

    // Online/offline indicator
    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
}

// Add your custom app functionality here
function updateAppContent(content) {
    const app = document.getElementById('app');
    if (app) {
        app.innerHTML = content;
    }
}

// Example function to show a notification
function showNotification(message) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        new Notification('Todo List', { body: message, icon: '' });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification('Todo List', { body: message });
            }
        });
    }
}

/* ---------- UI & Data Functions ---------- */

function buildInitialUI() {
    return `
        <header class="header">
            <h1>Simple Todo List</h1>
            <div class="controls">
                <button id="install-btn" class="btn small" title="Install app" style="display:none">Install</button>
                <button id="notify-btn" class="btn small" title="Enable notifications">Notify</button>
                <span id="network-status" class="network-status">Checking...</span>
            </div>
        </header>

        <section class="add-todo">
            <input id="todo-input" type="text" placeholder="What do you need to do?" aria-label="New todo" />
            <input id="todo-due" type="date" aria-label="Due date" />
            <button id="add-btn" class="btn primary">Add</button>
        </section>

        <section class="filters">
            <div class="filter-buttons">
                <button class="btn filter active" data-filter="all">All</button>
                <button class="btn filter" data-filter="active">Active</button>
                <button class="btn filter" data-filter="completed">Completed</button>
            </div>
            <div class="actions">
                <button id="clear-completed" class="btn">Clear Completed</button>
                <button id="export-btn" class="btn">Export</button>
                <button id="import-btn" class="btn">Import</button>
                <input id="import-file" type="file" accept="application/json" style="display:none" />
            </div>
        </section>

        <section id="todo-list" class="todo-list" aria-live="polite"></section>

        <footer class="footer">
            <span id="todo-count">0 items</span>
            <span class="hint">Tip: Click a todo to edit, press Enter to save. Double-click to toggle complete.</span>
        </footer>

        <div id="toast" class="toast"></div>
    `;
}

function injectStyles() {
    const css = `
    :root { --bg:#f7f8fb; --card:#fff; --accent:#0b84ff; --muted:#6b7280; --success:#10b981; --danger:#ef4444; --glass: rgba(255,255,255,0.6);}
    .fade-in { animation: fadeIn 320ms ease both; }
    @keyframes fadeIn { from { opacity:0; transform: translateY(6px)} to { opacity:1; transform:none}}
    body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; background: var(--bg); margin:0; padding:20px; color:#0f172a; }
    #app { max-width:720px; margin:0 auto; }
    .header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
    .header h1 { margin:0; font-size:1.25rem; }
    .controls { display:flex; align-items:center; gap:8px; }
    .network-status { font-size:0.8rem; color:var(--muted); padding:6px 8px; border-radius:6px; background:var(--card); box-shadow:0 1px 2px rgba(0,0,0,0.04); }
    .add-todo { display:flex; gap:8px; margin-bottom:12px; align-items:center; }
    .add-todo input[type="text"] { flex:1; padding:10px 12px; border-radius:8px; border:1px solid #e6e9ef; background:var(--card); }
    .add-todo input[type="date"] { padding:8px; border-radius:8px; border:1px solid #e6e9ef; background:var(--card); }
    .btn { padding:8px 10px; border-radius:8px; border: none; background:transparent; cursor:pointer; font-weight:600; color:var(--accent); }
    .btn.small { padding:6px 8px; font-size:0.85rem; }
    .btn.primary { background:var(--accent); color:#fff; }
    .filters { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:8px; }
    .filter-buttons .filter { background:transparent; border-radius:8px; padding:6px 8px; }
    .filter.active { background:var(--card); box-shadow:0 1px 2px rgba(0,0,0,0.04); }
    .todo-list { background:transparent; display:flex; flex-direction:column; gap:8px; min-height:80px; }
    .todo { display:flex; align-items:center; gap:10px; padding:12px; border-radius:12px; background:var(--card); box-shadow:0 1px 3px rgba(16,24,40,0.04); }
    .todo .checkbox { width:18px; height:18px; border-radius:4px; border:1px solid #e6e9ef; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; }
    .todo.completed { opacity:0.6; text-decoration:line-through; }
    .todo .content { flex:1; display:flex; flex-direction:column; gap:4px; }
    .todo .title { font-weight:600; outline:none; }
    .todo .meta { font-size:0.8rem; color:var(--muted); }
    .todo .actions { display:flex; gap:6px; margin-left:8px; }
    .todo .action-btn { background:transparent; border:none; cursor:pointer; color:var(--muted); }
    .footer { display:flex; justify-content:space-between; margin-top:12px; color:var(--muted); font-size:0.9rem; align-items:center; gap:8px; }
    .toast { position:fixed; left:50%; transform:translateX(-50%); bottom:24px; background:rgba(15,23,42,0.9); color:#fff; padding:8px 12px; border-radius:8px; display:none; font-size:0.9rem; z-index:999; }
    @media (max-width:520px){ .add-todo { flex-direction:column; align-items:stretch; } .controls { gap:6px; } }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}

function wireUIEvents() {
    const input = document.getElementById('todo-input');
    const addBtn = document.getElementById('add-btn');
    const todoList = document.getElementById('todo-list');
    const filtersEl = document.querySelectorAll('.filter');
    const clearCompletedBtn = document.getElementById('clear-completed');
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const importFile = document.getElementById('import-file');
    const notifyBtn = document.getElementById('notify-btn');
    const installBtn = document.getElementById('install-btn');

    if (addBtn) addBtn.addEventListener('click', () => {
        const text = input.value.trim();
        const dueInput = document.getElementById('todo-due');
        const due = dueInput ? dueInput.value : '';
        if (text) {
            addTodo(text, due);
            input.value = '';
            if (dueInput) dueInput.value = '';
            showToast('Todo added');
            showNotification(`Added: ${text}`);
        } else {
            showToast('Please enter a todo');
        }
    });

    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                addBtn.click();
            }
        });
    }

    if (todoList) {
        todoList.addEventListener('click', handleTodoListClick);
        todoList.addEventListener('dblclick', handleTodoListDblClick);
        todoList.addEventListener('keydown', handleTodoKeyDown);
        todoList.addEventListener('focusout', handleTodoFocusOut);
    }

    filtersEl.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filtersEl.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setFilter(btn.getAttribute('data-filter'));
        });
    });

    if (clearCompletedBtn) clearCompletedBtn.addEventListener('click', () => {
        clearCompleted();
        showToast('Cleared completed todos');
    });

    if (exportBtn) exportBtn.addEventListener('click', exportTodos);
    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => importFile.click());
        importFile.addEventListener('change', handleImportFile);
    }

    if (notifyBtn) {
        notifyBtn.addEventListener('click', () => {
            if (!('Notification' in window)) {
                showToast('Notifications not supported');
                return;
            }
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    showToast('Notifications enabled');
                } else {
                    showToast('Notifications denied');
                }
            });
        });
    }

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const choice = await deferredPrompt.userChoice;
            if (choice.outcome === 'accepted') {
                showToast('Thanks for installing!');
            } else {
                showToast('Install dismissed');
            }
            deferredPrompt = null;
            installBtn.style.display = 'none';
        });
    }
}

/* ---------- CRUD and Storage ---------- */

function loadTodos() {
    try {
        const raw = localStorage.getItem('todos_v1');
        if (raw) {
            todos = JSON.parse(raw) || [];
        } else {
            todos = [];
        }
    } catch (e) {
        console.error('Failed to load todos', e);
        todos = [];
    }
}

function saveTodos() {
    try {
        localStorage.setItem('todos_v1', JSON.stringify(todos));
    } catch (e) {
        console.error('Failed to save todos', e);
    }
}

function addTodo(text, due) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
    const todo = { id, text, done: false, created: Date.now(), due: due || '' };
    todos.unshift(todo);
    saveTodos();
    renderTodos();
}

function toggleComplete(id) {
    const t = todos.find(x => x.id === id);
    if (t) {
        t.done = !t.done;
        saveTodos();
        renderTodos();
    }
}

function deleteTodo(id) {
    todos = todos.filter(x => x.id !== id);
    saveTodos();
    renderTodos();
}

function editTodo(id, newText) {
    const t = todos.find(x => x.id === id);
    if (t) {
        t.text = newText;
        saveTodos();
        renderTodos();
    }
}

function clearCompleted() {
    todos = todos.filter(x => !x.done);
    saveTodos();
    renderTodos();
}

function setFilter(f) {
    filter = f;
    renderTodos();
}

/* ---------- Rendering ---------- */

function renderTodos() {
    const list = document.getElementById('todo-list');
    if (!list) return;
    list.innerHTML = '';

    const filtered = todos.filter(t => {
        if (filter === 'active') return !t.done;
        if (filter === 'completed') return t.done;
        return true;
    });

    if (filtered.length === 0) {
        list.innerHTML = '<div class="todo" style="justify-content:center;color:var(--muted);">No todos yet — add one above</div>';
    } else {
        filtered.forEach(todo => {
            const item = document.createElement('div');
            item.className = 'todo' + (todo.done ? ' completed' : '');
            item.setAttribute('data-id', todo.id);
            item.setAttribute('tabindex', '0');

            const checkbox = document.createElement('div');
            checkbox.className = 'checkbox';
            checkbox.setAttribute('role', 'button');
            checkbox.setAttribute('aria-pressed', String(!!todo.done));
            checkbox.title = todo.done ? 'Mark as active' : 'Mark as completed';
            checkbox.innerHTML = todo.done ? '✓' : '';

            const content = document.createElement('div');
            content.className = 'content';

            const title = document.createElement('div');
            title.className = 'title';
            title.contentEditable = true;
            title.spellcheck = false;
            title.innerText = todo.text;
            title.setAttribute('data-id', todo.id);
            title.setAttribute('aria-label', 'Todo title');

            const meta = document.createElement('div');
            meta.className = 'meta';
            const created = new Date(todo.created);
            meta.innerText = `Added ${timeAgo(created)}${todo.due ? ' • Due ' + formatDate(todo.due) : ''}`;

            const actions = document.createElement('div');
            actions.className = 'actions';
            const editBtn = document.createElement('button');
            editBtn.className = 'action-btn';
            editBtn.title = 'Edit';
            editBtn.innerText = '✏️';
            editBtn.setAttribute('data-action', 'edit');
            editBtn.setAttribute('data-id', todo.id);

            const delBtn = document.createElement('button');
            delBtn.className = 'action-btn';
            delBtn.title = 'Delete';
            delBtn.innerText = '🗑️';
            delBtn.setAttribute('data-action', 'delete');
            delBtn.setAttribute('data-id', todo.id);

            actions.appendChild(editBtn);
            actions.appendChild(delBtn);
            content.appendChild(title);
            content.appendChild(meta);

            item.appendChild(checkbox);
            item.appendChild(content);
            item.appendChild(actions);

            list.appendChild(item);
        });
    }

    // Update count
    const countEl = document.getElementById('todo-count');
    if (countEl) {
        const active = todos.filter(t => !t.done).length;
        countEl.innerText = `${active} item${active === 1 ? '' : 's'} left`;
    }
}

/* ---------- Event Handlers for List ---------- */

function handleTodoListClick(e) {
    const target = e.target;
    const todoEl = target.closest('.todo');
    if (!todoEl) return;
    const id = todoEl.getAttribute('data-id');

    if (target.classList.contains('checkbox')) {
        toggleComplete(id);
    } else if (target.getAttribute('data-action') === 'delete') {
        deleteTodo(id);
        showToast('Todo deleted');
    } else if (target.getAttribute('data-action') === 'edit') {
        const title = todoEl.querySelector('.title');
        if (title) {
            title.focus();
            selectNodeText(title);
        }
    } else if (target.classList.contains('title')) {
        // clicking into title handled by focus/keydown for editing
    }
}

function handleTodoListDblClick(e) {
    // Double-click toggles complete for quicker interactions
    const todoEl = e.target.closest('.todo');
    if (!todoEl) return;
    const id = todoEl.getAttribute('data-id');
    toggleComplete(id);
}

function handleTodoKeyDown(e) {
    const el = e.target;
    if (!el.classList.contains('title')) return;
    const id = el.getAttribute('data-id');
    if (e.key === 'Enter') {
        e.preventDefault();
        el.blur();
    } else if (e.key === 'Escape') {
        // revert changes by re-rendering
        renderTodos();
    }
}

function handleTodoFocusOut(e) {
    const el = e.target;
    if (!el.classList.contains('title')) return;
    const id = el.getAttribute('data-id');
    const newText = el.innerText.trim();
    if (!newText) {
        // If empty after edit, delete
        deleteTodo(id);
        showToast('Todo removed (empty)');
    } else {
        editTodo(id, newText);
    }
}

/* ---------- Utility ---------- */

function formatDate(dateStr) {
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString();
    } catch (e) {
        return dateStr;
    }
}

function timeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    const intervals = [
        { label: 'year', sec: 31536000 },
        { label: 'month', sec: 2592000 },
        { label: 'day', sec: 86400 },
        { label: 'hour', sec: 3600 },
        { label: 'minute', sec: 60 },
        { label: 'second', sec: 1 }
    ];
    for (let i of intervals) {
        const count = Math.floor(seconds / i.sec);
        if (count >= 1) {
            return `${count} ${i.label}${count > 1 ? 's' : ''} ago`;
        }
    }
    return 'just now';
}

function selectNodeText(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

/* ---------- Import/Export ---------- */

function exportTodos() {
    const dataStr = JSON.stringify(todos, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `todos-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Exported todos');
}

function handleImportFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        try {
            const imported = JSON.parse(ev.target.result);
            if (!Array.isArray(imported)) throw new Error('Invalid format');
            // Simple merge: prepend imported items with new IDs if needed
            imported.forEach(item => {
                if (!item.id) item.id = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
            });
            todos = imported.concat(todos);
            saveTodos();
            renderTodos();
            showToast('Imported todos');
        } catch (err) {
            console.error('Import failed', err);
            showToast('Import failed: invalid file');
        }
    };
    reader.readAsText(f);
    // clear input
    e.target.value = '';
}

/* ---------- Online Status & Toast ---------- */

function updateOnlineStatus() {
    const el = document.getElementById('network-status');
    if (!el) return;
    if (navigator.onLine) {
        el.textContent = 'Online';
        el.style.color = 'var(--success)';
    } else {
        el.textContent = 'Offline';
        el.style.color = 'var(--danger)';
    }
}

let toastTimer = null;
function showToast(message, ms = 2500) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = message;
    t.style.display = 'block';
    t.style.opacity = '1';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => { t.style.display = 'none'; }, 320);
    }, ms);
}