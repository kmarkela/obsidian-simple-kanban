const { Plugin, ItemView, FileView } = require('obsidian');

const VIEW_TYPE        = 'simple-kanban';
const VIEW_TYPE_FILE   = 'simple-kanban-file';
const COLUMNS          = ['Plan', 'Todo', 'In Progress', 'Done'];
const MD_PATH          = 'kanban.md';

// --- Colors (Obsidian CSS variables — adapts to any theme) ---
const C = {
  bg:         'var(--background-primary)',
  colBg:      'var(--background-secondary)',
  cardBg:     'var(--background-primary-alt)',
  cardHover:  'var(--background-modifier-hover)',
  border:     'var(--background-modifier-border)',
  dropTarget: 'var(--background-modifier-border-hover)',
  text:       'var(--text-normal)',
  subtext:    'var(--text-muted)',
  accent:     'var(--text-accent)',
  link:       '#ffffff',
  del:        'var(--text-error)',
};

// --- Color coding: matches path patterns to card colors ---
// Patterns are checked against the linked file's full path.
// Add/edit entries here to match your vault's naming convention.
const COLOR_RULES = [
  { pattern: '0p0', bg: '#e3b719', text: 'black' },
  { pattern: '0p1', bg: '#c8e319', text: 'black' },
  { pattern: '0p2', bg: '#e8e8e8', text: 'black' },
  { pattern: '0p3', bg: '#e8e8e8', text: 'black' },
];

function getCardColor(app, linkTarget, text) {
  // For link cards: match against the resolved file path
  if (linkTarget) {
    const file = app.metadataCache.getFirstLinkpathDest(linkTarget, '');
    if (file) {
      for (const rule of COLOR_RULES) {
        if (file.path.includes(rule.pattern)) return rule;
      }
    }
  }
  // For all cards: also match against the raw card text
  for (const rule of COLOR_RULES) {
    if (text.includes(rule.pattern)) return rule;
  }
  return null;
}

// --- Card parsing ---
// Full:   "[[My Note]]"          -> { label: 'My Note',  linkTarget: 'My Note' }
// Alias:  "[[My Note|Title]]"    -> { label: 'Title',    linkTarget: 'My Note' }
// Inline: "Do [[My Note]] thing" -> { label: text,       linkTarget: 'My Note' }
// Plain:  "plain text"           -> { label: text,       linkTarget: null }
function parseCard(text) {
  const full = text.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
  if (full) return { label: full[2] || full[1], linkTarget: full[1] };
  const inline = text.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
  if (inline) return { label: text, linkTarget: inline[1] };
  return { label: text, linkTarget: null };
}

// --- Global board (kanban.md) serialization ---
function toMd(cards) {
  let out = '# Kanban Board\n\n';
  for (const col of COLUMNS) {
    out += `## ${col}\n\n`;
    for (const c of cards[col] || []) out += `- ${c}\n`;
    out += '\n';
  }
  return out.trimEnd() + '\n';
}

function fromMd(raw) {
  const cards = {};
  for (const c of COLUMNS) cards[c] = [];
  let cur = null;
  for (const line of raw.split('\n')) {
    const h = line.match(/^## (.+)/);
    if (h && cards[h[1]] !== undefined) { cur = h[1]; continue; }
    const item = line.match(/^- (.+)/);
    if (item && cur) cards[cur].push(item[1]);
  }
  return cards;
}

// --- File board serialization ---
function parseFrontmatter(raw) {
  if (!raw.startsWith('---\n')) return { fm: '', body: raw };
  const end = raw.indexOf('\n---\n', 4);
  if (end === -1) return { fm: '', body: raw };
  return { fm: raw.slice(0, end + 5), body: raw.slice(end + 5) };
}

function fromMdFile(raw) {
  const { body } = parseFrontmatter(raw);
  const cols = [], cards = {};
  let cur = null;
  for (const line of body.split('\n')) {
    const h = line.match(/^## (.+)/);
    if (h) {
      cur = h[1].trim();
      if (!cards[cur]) { cols.push(cur); cards[cur] = []; }
      continue;
    }
    const item = line.match(/^- (.+)/);
    if (item && cur) cards[cur].push(item[1]);
  }
  // no headings found — use defaults
  if (!cols.length) {
    for (const c of COLUMNS) { cols.push(c); cards[c] = []; }
  }
  return { cols, cards };
}

function toMdFile(fm, cols, cards) {
  let out = fm;
  for (const col of cols) {
    out += `## ${col}\n\n`;
    for (const c of cards[col] || []) out += `- ${c}\n`;
    out += '\n';
  }
  return out.trimEnd() + '\n';
}

// --- Shared board renderer ---
// Renders board UI into `root`. Mutates `cards` directly and calls `saveFn` after changes.
function buildBoardUI(app, root, cols, cards, saveFn, sourcePath = '') {
  root.empty();
  root.style.cssText = `display:flex;gap:16px;padding:16px;height:100%;box-sizing:border-box;overflow-x:auto;align-items:flex-start;background:${C.bg};`;

  for (const col of cols) {
    const column = root.createDiv();
    column.style.cssText = `background:${C.colBg};border-radius:10px;padding:12px;width:260px;min-width:260px;display:flex;flex-direction:column;gap:8px;border:1px solid ${C.border};`;

    const header = column.createDiv();
    header.style.cssText = `font-weight:700;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:${C.accent};margin-bottom:4px;`;
    header.setText(col);

    const cardList = column.createDiv();
    cardList.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-height:40px;border-radius:6px;transition:background .15s;';

    for (const text of cards[col] || []) {
      cardList.appendChild(createCard(app, text, col, cards, saveFn, () => buildBoardUI(app, root, cols, cards, saveFn, sourcePath), sourcePath));
    }

    cardList.addEventListener('dragover', (e) => { e.preventDefault(); cardList.style.background = C.dropTarget; });
    cardList.addEventListener('dragleave', () => { cardList.style.background = ''; });
    cardList.addEventListener('drop', async (e) => {
      e.preventDefault();
      cardList.style.background = '';
      const fromCol = e.dataTransfer.getData('fromCol');
      const text = e.dataTransfer.getData('text');
      if (fromCol === col) return;
      cards[fromCol] = (cards[fromCol] || []).filter(c => c !== text);
      if (!cards[col]) cards[col] = [];
      cards[col].push(text);
      await saveFn();
      buildBoardUI(app, root, cols, cards, saveFn, sourcePath);
    });

    const addBtn = column.createEl('button');
    addBtn.setText('+ Add card');
    addBtn.style.cssText = `margin-top:4px;padding:6px 8px;border:none;background:transparent;cursor:pointer;text-align:left;color:${C.subtext};border-radius:6px;font-size:13px;width:100%;`;
    addBtn.addEventListener('mouseenter', () => addBtn.style.color = C.text);
    addBtn.addEventListener('mouseleave', () => addBtn.style.color = C.subtext);
    addBtn.addEventListener('click', () => showAddInput(app, col, column, cards, saveFn, () => buildBoardUI(app, root, cols, cards, saveFn, sourcePath)));

    column.appendChild(cardList);
    column.appendChild(addBtn);
    root.appendChild(column);
  }
}

function renderLabel(container, text, linkColor) {
  // Replace all [[target]] and [[target|alias]] with styled spans, keep surrounding text
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) container.appendText(text.slice(last, m.index));
    const link = container.createSpan();
    link.setText(m[2] || m[1]);
    link.style.cssText = `color:${linkColor};text-decoration:underline;text-decoration-color:${linkColor};`;
    last = re.lastIndex;
  }
  if (last < text.length) container.appendText(text.slice(last));
}

function createCard(app, text, col, cards, saveFn, rerender, sourcePath = '') {
  const { linkTarget } = parseCard(text);
  const colorRule = getCardColor(app, linkTarget, text);
  const bg        = colorRule ? colorRule.bg    : C.cardBg;
  const textColor = colorRule ? colorRule.text  : C.text;

  const card = document.createElement('div');
  card.draggable = true;
  const rightPad = linkTarget ? '52px' : '28px';
  card.style.cssText = `background:${bg};border-radius:6px;padding:10px ${rightPad} 10px 12px;cursor:grab;font-size:13px;position:relative;color:${textColor};border:1px solid ${C.border};transition:background .15s;`;

  const labelSpan = card.createSpan();
  if (linkTarget) renderLabel(labelSpan, text, colorRule ? colorRule.text : C.link);
  else labelSpan.setText(text);

  card.addEventListener('mouseenter', () => card.style.background = colorRule ? colorRule.bg : C.cardHover);
  card.addEventListener('mouseleave', () => card.style.background = bg);
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text', text);
    e.dataTransfer.setData('fromCol', col);
    setTimeout(() => card.style.opacity = '0.4', 0);
  });
  card.addEventListener('dragend', () => { card.style.opacity = '1'; });

  if (linkTarget) {
    const linkBtn = card.createSpan();
    linkBtn.setText('↗');
    linkBtn.title = `Open "${linkTarget}"`;
    linkBtn.style.cssText = `position:absolute;top:50%;right:28px;transform:translateY(-50%);cursor:pointer;color:${colorRule ? colorRule.text : C.link};font-size:13px;line-height:1;`;
    linkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      app._kanbanSkipIntercept = true;
      app.workspace.openLinkText(linkTarget, sourcePath, true);
    });
  }

  const del = card.createSpan();
  del.setText('×');
  del.style.cssText = `position:absolute;top:50%;right:8px;transform:translateY(-50%);cursor:pointer;color:${C.subtext};font-size:16px;line-height:1;display:none;`;
  card.addEventListener('mouseenter', () => del.style.display = 'block');
  card.addEventListener('mouseleave', () => del.style.display = 'none');
  del.addEventListener('mouseenter', () => del.style.color = C.del);
  del.addEventListener('mouseleave', () => del.style.color = C.subtext);
  del.addEventListener('click', async (e) => {
    e.stopPropagation();
    cards[col] = cards[col].filter(c => c !== text);
    await saveFn();
    rerender();
  });

  return card;
}

function showAddInput(app, col, column, cards, saveFn, rerender) {
  const addBtn = column.querySelector('button');
  if (addBtn) addBtn.style.display = 'none';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;width:100%;';

  const input = document.createElement('textarea');
  input.placeholder = 'Card title or [[Note Name]]...';
  input.rows = 2;
  input.style.cssText = `width:100%;padding:8px;border-radius:6px;border:1px solid ${C.accent};background:${C.cardBg};color:${C.text};resize:none;font-size:13px;box-sizing:border-box;outline:none;`;
  wrapper.appendChild(input);

  const dropdown = document.createElement('div');
  dropdown.style.cssText = `display:none;position:absolute;top:100%;left:0;right:0;background:${C.colBg};border:1px solid ${C.border};border-radius:6px;max-height:180px;overflow-y:auto;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,0.4);`;
  wrapper.appendChild(dropdown);

  column.appendChild(wrapper);
  input.focus();

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:6px;margin-top:4px;';

  const confirmBtn = document.createElement('button');
  confirmBtn.setText('Add');
  confirmBtn.style.cssText = `padding:4px 12px;background:${C.accent};color:${C.bg};border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;`;

  const cancelBtn = document.createElement('button');
  cancelBtn.setText('Cancel');
  cancelBtn.style.cssText = `padding:4px 10px;background:transparent;border:none;cursor:pointer;font-size:13px;color:${C.subtext};`;

  actions.appendChild(confirmBtn);
  actions.appendChild(cancelBtn);
  column.appendChild(actions);

  let selectedIdx = -1, suggestions = [];

  const closeDropdown = () => { dropdown.style.display = 'none'; dropdown.empty(); selectedIdx = -1; suggestions = []; };

  const getLinkQuery = () => {
    const before = input.value.slice(0, input.selectionStart);
    const open = before.lastIndexOf('[[');
    if (open === -1 || before.slice(open).includes(']]')) return null;
    return before.slice(open + 2);
  };

  const highlightSelected = () => {
    Array.from(dropdown.children).forEach((el, i) => { el.style.background = i === selectedIdx ? C.dropTarget : ''; });
  };

  const pickSuggestion = (basename) => {
    const cur = input.selectionStart;
    const before = input.value.slice(0, cur);
    const open = before.lastIndexOf('[[');
    input.value = before.slice(0, open) + `[[${basename}]]` + input.value.slice(cur);
    const newPos = open + basename.length + 4;
    input.setSelectionRange(newPos, newPos);
    closeDropdown();
    input.focus();
  };

  const renderDropdown = (query) => {
    suggestions = app.vault.getMarkdownFiles()
      .filter(f => f.basename.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10);
    if (!suggestions.length) { closeDropdown(); return; }
    dropdown.empty();
    selectedIdx = -1;
    suggestions.forEach((file, i) => {
      const item = dropdown.createDiv();
      item.style.cssText = `padding:7px 10px;cursor:pointer;font-size:13px;color:${C.text};border-bottom:1px solid ${C.border};`;
      item.setText(file.basename);
      item.addEventListener('mouseenter', () => { selectedIdx = i; highlightSelected(); });
      item.addEventListener('mousedown', (e) => { e.preventDefault(); pickSuggestion(file.basename); });
    });
    dropdown.style.display = 'block';
  };

  input.addEventListener('input', () => {
    const q = getLinkQuery();
    if (q !== null) renderDropdown(q); else closeDropdown();
  });

  const finish = async (doSave) => {
    closeDropdown();
    if (doSave && input.value.trim()) {
      if (!cards[col]) cards[col] = [];
      cards[col].push(input.value.trim());
      await saveFn();
    }
    rerender();
  };

  input.addEventListener('keydown', (e) => {
    if (dropdown.style.display === 'block') {
      if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, suggestions.length - 1); highlightSelected(); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); highlightSelected(); return; }
      if (e.key === 'Enter' && selectedIdx >= 0) { e.preventDefault(); pickSuggestion(suggestions[selectedIdx].basename); return; }
      if (e.key === 'Escape') { closeDropdown(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') finish(false);
  });

  confirmBtn.addEventListener('click', () => finish(true));
  cancelBtn.addEventListener('click', () => finish(false));
}

// --- Global board view (reads kanban.md) ---
class KanbanView extends ItemView {
  constructor(leaf) {
    super(leaf);
    this.cards = {};
    for (const c of COLUMNS) this.cards[c] = [];
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Kanban Board'; }

  async onOpen() {
    try {
      const raw = await this.app.vault.adapter.read(MD_PATH);
      this.cards = fromMd(raw);
    } catch {
      await this.app.vault.adapter.write(MD_PATH, toMd(this.cards));
    }
    this.render();
  }

  async save() {
    await this.app.vault.adapter.write(MD_PATH, toMd(this.cards));
  }

  render() {
    buildBoardUI(this.app, this.containerEl.children[1], COLUMNS, this.cards, () => this.save(), MD_PATH);
  }
}

// --- File board view (reads any .md with kanban: true) ---
class KanbanFileView extends FileView {
  constructor(leaf) {
    super(leaf);
    this.cols = [...COLUMNS];
    this.cards = {};
    this.fm = '';
  }

  getViewType() { return VIEW_TYPE_FILE; }
  getDisplayText() { return this.file?.basename || 'Kanban'; }
  canAcceptExtension(ext) { return ext === 'md'; }

  async onLoadFile(file) {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm?.kanban) {
      // Not a kanban note — hand back to the default markdown view
      setTimeout(() => {
        this.leaf.setViewState({ type: 'markdown', state: { file: file.path } });
      }, 0);
      return;
    }
    const raw = await this.app.vault.read(file);
    const { fm: fmText } = parseFrontmatter(raw);
    const { cols, cards } = fromMdFile(raw);
    this.fm = fmText;
    this.cols = cols;
    this.cards = cards;
    this.render();
  }

  async save() {
    if (!this.file) return;
    await this.app.vault.modify(this.file, toMdFile(this.fm, this.cols, this.cards));
  }

  render() {
    buildBoardUI(this.app, this.containerEl.children[1], this.cols, this.cards, () => this.save(), this.file?.path ?? '');
  }
}

// --- Plugin ---
class SimpleKanbanPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE,      (leaf) => new KanbanView(leaf));
    this.registerView(VIEW_TYPE_FILE, (leaf) => new KanbanFileView(leaf));

    this.addRibbonIcon('layout-dashboard', 'Open Kanban Board', () => this.openBoard());
    this.addCommand({ id: 'open-kanban', name: 'Open Kanban Board', callback: () => this.openBoard() });
    this.addCommand({
      id: 'open-as-kanban',
      name: 'Open current note as Kanban board',
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return;
        const leaf = this.app.workspace.getMostRecentLeaf();
        if (!leaf) return;
        await leaf.setViewState({ type: VIEW_TYPE_FILE, state: { file: file.path } });
      }
    });

    // Intercept file-open: if frontmatter has kanban: true, show as board
    this.registerEvent(this.app.workspace.on('file-open', (file) => {
      if (!file || file.extension !== 'md') return;
      if (this.app._kanbanSkipIntercept) {
        this.app._kanbanSkipIntercept = false;
        return;
      }
      setTimeout(async () => {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!fm?.kanban) return;
        const leaf = this.app.workspace.getMostRecentLeaf();
        if (!leaf) return;
        if (leaf.view.getViewType() === VIEW_TYPE_FILE) return;
        await leaf.setViewState({ type: VIEW_TYPE_FILE, state: { file: file.path } });
      }, 50);
    }));
  }

  async openBoard() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) { this.app.workspace.revealLeaf(existing[0]); return; }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
}

module.exports = SimpleKanbanPlugin;
