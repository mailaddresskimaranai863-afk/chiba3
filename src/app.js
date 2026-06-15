const STORAGE_KEY = "eigyo_material_shelf_products_v2";
const CLOUD_DELETE_QUEUE_KEY = "eigyo_material_shelf_deleted_ids_v1";
const CLOUD_CONFIG_ENDPOINT = "/api/config";

let cloudStore = null;
let cloudSyncTimer = null;
let cloudBooted = false;

    const sampleSvg = (label, color = "#16875a") => {
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480">
          <defs>
            <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stop-color="${color}"/>
              <stop offset="100%" stop-color="#9ed8bb"/>
            </linearGradient>
          </defs>
          <rect width="720" height="480" fill="#f5f7f6"/>
          <rect x="56" y="48" width="608" height="384" rx="36" fill="#fff" stroke="#dfe8e3" stroke-width="4"/>
          <rect x="92" y="88" width="250" height="34" rx="17" fill="url(#g)"/>
          <rect x="92" y="150" width="536" height="28" rx="14" fill="#dfe8e3"/>
          <rect x="92" y="196" width="440" height="22" rx="11" fill="#edf3f0"/>
          <rect x="92" y="238" width="500" height="22" rx="11" fill="#edf3f0"/>
          <rect x="92" y="300" width="180" height="72" rx="18" fill="#e5f5ee"/>
          <text x="360" y="392" text-anchor="middle" font-size="38" font-family="sans-serif" font-weight="900" fill="#14231c">${label}</text>
        </svg>`;
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    };

    const PRELOADED_MATERIALS = [];

    const materialCategories = ["すべて", "工事看板", "安全用品", "熱中症対策", "防犯対策", "レンタル", "屋外広告", "提案資料", "価格表", "社内資料", "その他"];
    const signCategories = ["すべて", "件名板", "掲示板", "その他看板類", "シート看板", "コーンサイン", "建築計画のお知らせ", "立体表示カバー", "ステッカー類", "チョッキ類"];
    const signCategorySet = new Set(signCategories.filter(cat => cat !== "すべて"));

    let currentType = "material";
    let materials = loadMaterials();
    let currentCategory = "すべて";
    let currentPreviewId = null;
    let currentPreviewFileIndex = 0;

    const el = {
      search: document.getElementById("searchInput"),
      categoryList: document.getElementById("categoryList"),
      grid: document.getElementById("grid"),
      empty: document.getElementById("empty"),
      resultText: document.getElementById("resultText"),
      listTitle: document.getElementById("listTitle"),
      totalCount: document.getElementById("totalCount"),
      totalLabel: document.getElementById("totalLabel"),
      pdfCount: document.getElementById("pdfCount"),
      imageCount: document.getElementById("imageCount"),
      favCount: document.getElementById("favCount"),
      sort: document.getElementById("sortSelect"),
      drawer: document.getElementById("drawer"),
      modalTitle: document.getElementById("modalTitle"),
      form: document.getElementById("materialForm"),
      editId: document.getElementById("editId"),
      title: document.getElementById("titleInput"),
      type: document.getElementById("typeInput"),
      category: document.getElementById("categoryInput"),
      tags: document.getElementById("tagsInput"),
      date: document.getElementById("dateInput"),
      memo: document.getElementById("memoInput"),
      file: document.getElementById("fileInput"),
      previewBody: document.getElementById("previewBody"),
      previewTitle: document.getElementById("previewTitle"),
      previewMeta: document.getElementById("previewMeta"),
      openPreview: document.getElementById("openPreview"),
      downloadPreview: document.getElementById("downloadPreview"),
      toast: document.getElementById("toast"),
      dropzone: document.getElementById("dropzone"),
      importInput: document.getElementById("importInput"),
      printbar: document.getElementById("printbar"),
      checkedCount: document.getElementById("checkedCount"),
      printSelected: document.getElementById("printSelected"),
      clearSelected: document.getElementById("clearSelected"),
      printSelectedTop: document.getElementById("printSelectedTop"),
      clearSelectedTop: document.getElementById("clearSelectedTop"),
      addBtn: document.getElementById("addBtn"),
      addBtnTop: document.getElementById("addBtnTop"),
      viewBtns: document.querySelectorAll(".view-btn")
    };

    document.getElementById("addBtn").addEventListener("click", () => openModal());
    document.getElementById("addBtnTop").addEventListener("click", () => openModal());
    document.getElementById("closeModal").addEventListener("click", closeModal);
    document.getElementById("cancelBtn").addEventListener("click", closeModal);
    document.getElementById("clearPreview").addEventListener("click", clearPreview);
    document.getElementById("toggleDrop").addEventListener("click", () => {
      el.dropzone.style.display = el.dropzone.style.display === "flex" ? "none" : "flex";
    });

    el.search.addEventListener("input", render);
    el.sort.addEventListener("change", render);
    el.form.addEventListener("submit", handleSubmit);
    el.type.addEventListener("change", () => updateCategoryOptions(el.type.value, el.category.value));
    el.viewBtns.forEach(btn => btn.addEventListener("click", () => setCurrentType(btn.dataset.view)));
    document.getElementById("exportBtn").addEventListener("click", exportJson);
    el.importInput.addEventListener("change", importJson);
    el.printSelected.addEventListener("click", printCheckedMaterials);
    el.printSelectedTop.addEventListener("click", printCheckedMaterials);
    el.clearSelected.addEventListener("click", clearCheckedMaterials);
    el.clearSelectedTop.addEventListener("click", clearCheckedMaterials);

    ["dragenter", "dragover"].forEach(evt => {
      el.dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        el.dropzone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach(evt => {
      el.dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        el.dropzone.classList.remove("dragover");
      });
    });
    el.dropzone.addEventListener("drop", async (e) => {
      const files = [...e.dataTransfer.files].filter(f => f.type === "application/pdf" || f.type.startsWith("image/"));
      if (!files.length) return;

      const fileItems = [];
      for (const file of files) {
        fileItems.push({
          fileName: file.name,
          mime: file.type || "application/octet-stream",
          dataUrl: await fileToDataUrl(file)
        });
      }

      const first = fileItems[0];
      const dropCategory = getDropCategory();
      materials.unshift({
        id: crypto.randomUUID(),
        title: files.length > 1 ? `${files[0].name.replace(/\.[^.]+$/, "")} ほか${files.length - 1}件` : files[0].name.replace(/\.[^.]+$/, ""),
        type: currentType,
        category: dropCategory,
        tags: [],
        memo: "",
        date: today(),
        files: fileItems,
        fileName: first.fileName,
        mime: first.mime,
        dataUrl: first.dataUrl,
        createdAt: new Date().toISOString(),
        checked: false
      });

      saveMaterials();
      render();
      setPreview(materials[0].id);
      showToast(files.length > 1 ? `1カードに${files.length}件まとめて追加しました` : "1件追加しました");
    });

    el.openPreview.addEventListener("click", () => {
      const item = materials.find(m => m.id === currentPreviewId);
      if (item) openFile(item, currentPreviewFileIndex);
    });

    el.downloadPreview.addEventListener("click", () => {
      const item = materials.find(m => m.id === currentPreviewId);
      if (item) downloadFile(item, currentPreviewFileIndex);
    });

    function loadMaterials() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          return JSON.parse(raw)
            .map(normalizeItem)
            .filter(item => !String(item.id || "").startsWith("seed-"));
        } catch (e) {}
      }
      return PRELOADED_MATERIALS.map(normalizeItem);
    }

    function normalizeItem(item) {
      const type = item.type || (signCategorySet.has(item.category) ? "sign" : "material");
      return {
        ...item,
        type,
        checked: item.checked || false
      };
    }

    function getItemType(item) {
      return item.type || (signCategorySet.has(item.category) ? "sign" : "material");
    }

    function getTypeLabel(type = currentType) {
      return type === "sign" ? "サイン" : "資料";
    }

    function getCurrentCategories(type = currentType) {
      return type === "sign" ? signCategories : materialCategories;
    }

    function getDropCategory() {
      if (currentCategory !== "すべて") return currentCategory;
      return currentType === "sign" ? "その他看板類" : "その他";
    }

    function updateCategoryOptions(type = currentType, selected = "") {
      const cats = getCurrentCategories(type).filter(cat => cat !== "すべて");
      el.category.innerHTML = cats.map(cat => `<option>${cat}</option>`).join("");
      el.category.value = cats.includes(selected) ? selected : cats[0];
    }

    function setCurrentType(type) {
      if (!type || currentType === type) return;
      currentType = type;
      currentCategory = "すべて";
      clearPreview();
      render();
      const first = getFiltered()[0];
      if (first) setPreview(first.id);
    }

    function saveMaterials() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(materials));
        scheduleCloudSync();
      } catch (e) {
        alert("保存容量を超えました。大容量PDFはサーバー保存版への移行がおすすめです。");
      }
    }

    function today() {
      return new Date().toISOString().slice(0, 10);
    }


    function getItemFiles(item) {
      if (Array.isArray(item.files) && item.files.length) {
        return item.files;
      }
      return [{
        fileName: item.fileName || `${item.title || "資料"}.file`,
        mime: item.mime || "",
        dataUrl: item.dataUrl || ""
      }];
    }

    function getPrimaryFile(item) {
      return getItemFiles(item)[0] || {};
    }

    function isPdfFile(file) {
      return (file.mime || "").includes("pdf") || /\.pdf$/i.test(file.fileName || "");
    }

    function isImageFile(file) {
      return (file.mime || "").startsWith("image/") || (file.mime || "").includes("svg");
    }

    function createThumbHtml(file) {
      const ext = getExt(file.fileName, file.mime);
      if (isImageFile(file)) {
        return `<img src="${file.dataUrl}" alt="">`;
      }
      if (isPdfFile(file)) {
        return `<iframe class="pdf-thumb" src="${file.dataUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0"></iframe>`;
      }
      return `<div class="doc-icon">${ext}</div>`;
    }

    function renderCategories() {
      el.categoryList.innerHTML = "";
      getCurrentCategories().forEach(cat => {
        const count = getCategoryCount(cat);
        const btn = document.createElement("button");
        btn.className = "category" + (cat === currentCategory ? " active" : "");
        btn.innerHTML = `<span>${catIcon(cat)} ${cat}</span><span class="count">${count}</span>`;
        btn.addEventListener("click", () => {
          currentCategory = cat;
          render();
        });
        el.categoryList.appendChild(btn);
      });
    }

    function catIcon(cat) {
      const map = {
        "すべて": "□",
        "工事看板": "▣",
        "安全用品": "◆",
        "熱中症対策": "☀",
        "防犯対策": "◎",
        "レンタル": "↻",
        "屋外広告": "◇",
        "提案資料": "◫",
        "価格表": "￥",
        "社内資料": "●",
        "件名板": "▤",
        "掲示板": "▥",
        "その他看板類": "▧",
        "シート看板": "▦",
        "コーンサイン": "△",
        "建築計画のお知らせ": "告",
        "立体表示カバー": "▰",
        "ステッカー類": "◇",
        "チョッキ類": "衣",
        "その他": "＋"
      };
      return map[cat] || "□";
    }

    function getCategoryCount(cat) {
      const byType = materials.filter(m => getItemType(m) === currentType);
      if (cat === "すべて") return byType.length;
      return byType.filter(m => m.category === cat).length;
    }

    function getFiltered() {
      const q = el.search.value.trim().toLowerCase();
      let list = materials.filter(m => getItemType(m) === currentType);

      if (currentCategory !== "すべて") {
        list = list.filter(m => m.category === currentCategory);
      }

      if (q) {
        list = list.filter(m => {
          const fileNames = getItemFiles(m).map(f => f.fileName).join(" ");
          const haystack = [
            m.title, m.category, m.memo, m.fileName, fileNames,
            ...(m.tags || [])
          ].join(" ").toLowerCase();
          return haystack.includes(q);
        });
      }

      const sort = el.sort.value;
      list.sort((a, b) => {
        if (sort === "old") return (a.date || "").localeCompare(b.date || "");
        if (sort === "title") return a.title.localeCompare(b.title, "ja");
        if (sort === "checked") return Number(b.checked) - Number(a.checked) || (b.date || "").localeCompare(a.date || "");
        return (b.date || "").localeCompare(a.date || "");
      });

      return list;
    }

    function render() {
      updateViewChrome();
      renderCategories();
      renderStats();

      const list = getFiltered();
      el.grid.innerHTML = "";
      el.empty.style.display = list.length ? "none" : "block";
      el.resultText.textContent = `${getTypeLabel()}を${list.length}件表示中`;

      list.forEach(item => {
        const card = document.createElement("article");
        card.className = "card" + (item.id === currentPreviewId ? " selected" : "");
        card.dataset.id = item.id;

        const files = getItemFiles(item);
        const primary = getPrimaryFile(item);
        const ext = getExt(primary.fileName, primary.mime);
        const thumb = createThumbHtml(primary);
        const fileCount = files.length > 1 ? `<span class="file-count">${files.length}ファイル</span>` : "";

        card.innerHTML = `
          <button class="fav ${item.checked ? "on" : ""}" title="印刷対象にする">✓</button>
          <div class="thumb">
            ${thumb}
            <span class="badge">${item.category}</span>
            ${fileCount}
          </div>
          <div class="card-body">
            <h3 class="card-title">${escapeHtml(item.title)}</h3>
            <div class="meta">
              <span>${files.length > 1 ? `${files.length}ファイル` : escapeHtml(ext)}</span>
              <span>・</span>
              <span>${formatDate(item.date)}</span>
            </div>
            <div class="tag-row">${(item.tags || []).slice(0, 3).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join("")}</div>
            <div class="card-actions">
              <button class="mini-btn open">開く</button>
              <button class="mini-btn edit">編集</button>
              <button class="mini-btn delete">削除</button>
            </div>
          </div>
        `;

        card.addEventListener("mouseenter", () => setPreview(item.id));
        card.addEventListener("focusin", () => setPreview(item.id));
        card.addEventListener("click", (e) => {
          if (e.target.closest(".fav")) return;
          if (e.target.closest(".open")) return openFile(item, currentPreviewId === item.id ? currentPreviewFileIndex : 0);
          if (e.target.closest(".edit")) return openModal(item);
          if (e.target.closest(".delete")) return deleteItem(item.id);
          setPreview(item.id);
        });

        card.querySelector(".fav").addEventListener("click", (e) => {
          e.stopPropagation();
          item.checked = !item.checked;
          saveMaterials();
          render();
          setPreview(item.id, currentPreviewId === item.id ? currentPreviewFileIndex : 0);
          showToast(item.checked ? "印刷対象に追加しました" : "印刷対象から外しました");
        });

        el.grid.appendChild(card);
      });
    }

    function updateViewChrome() {
      const label = getTypeLabel();
      document.body.dataset.theme = currentType;
      el.listTitle.textContent = `${label}一覧`;
      if (el.totalLabel) el.totalLabel.textContent = `登録${label}`;
      el.addBtn.textContent = `＋ ${label}を追加`;
      el.addBtnTop.textContent = `＋ ${label}追加`;
      el.viewBtns.forEach(btn => {
        const active = btn.dataset.view === currentType;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
      });
      el.dropzone.querySelector("span:first-child").textContent = `ここに${label}のPDF・画像をドラッグして追加`;
      el.dropzone.querySelector("span:last-child").textContent = `分類は「${getDropCategory()}」で仮登録されます`;
    }

    function renderStats() {
      const byType = materials.filter(m => getItemType(m) === currentType);
      const allFiles = byType.flatMap(getItemFiles);
      if (el.totalCount) el.totalCount.textContent = byType.length;
      if (el.pdfCount) el.pdfCount.textContent = allFiles.filter(isPdfFile).length;
      if (el.imageCount) el.imageCount.textContent = allFiles.filter(isImageFile).length;
      if (el.favCount) el.favCount.textContent = byType.filter(m => m.checked).length;
      updatePrintbar();
    }

    function setPreview(id, fileIndex = 0) {
      const item = materials.find(m => m.id === id);
      if (!item) return;
      currentPreviewId = id;

      const files = getItemFiles(item);
      currentPreviewFileIndex = Math.min(Math.max(fileIndex, 0), files.length - 1);
      const file = files[currentPreviewFileIndex];

      el.previewBody.innerHTML = "";

      if (isImageFile(file)) {
        const img = document.createElement("img");
        img.src = file.dataUrl;
        img.alt = item.title;
        el.previewBody.appendChild(img);
      } else if (isPdfFile(file)) {
        const iframe = document.createElement("iframe");
        iframe.src = `${file.dataUrl}#page=1&toolbar=0&navpanes=0`;
        el.previewBody.appendChild(iframe);
      } else {
        el.previewBody.innerHTML = `<div class="preview-placeholder"><div class="doc-icon">${getExt(file.fileName, file.mime)}</div><br>プレビュー未対応の形式です。</div>`;
      }

      el.previewTitle.textContent = item.title;

      const attachmentList = files.length > 1
        ? `<div class="attachment-list">${files.map((f, i) => `<button class="attachment-pill ${i === currentPreviewFileIndex ? "active" : ""}" data-index="${i}">${i + 1}. ${escapeHtml(f.fileName)}</button>`).join("")}</div>`
        : "";

      el.previewMeta.innerHTML = `${escapeHtml(item.category)} / ${formatDate(item.date)}<br>${escapeHtml(file.fileName)}<br>${(item.tags || []).map(t => "#" + escapeHtml(t)).join(" ")}${attachmentList}`;

      el.previewMeta.querySelectorAll(".attachment-pill").forEach(btn => {
        btn.addEventListener("click", () => setPreview(item.id, Number(btn.dataset.index)));
      });

      el.openPreview.disabled = false;
      el.downloadPreview.disabled = false;

      document.querySelectorAll(".card").forEach(c => c.classList.toggle("selected", c.dataset.id === id));
    }

    function clearPreview() {
      currentPreviewId = null;
      currentPreviewFileIndex = 0;
      el.previewBody.innerHTML = `<div class="preview-placeholder">カードにカーソルを乗せると、ここに大きく表示されます。</div>`;
      el.previewTitle.textContent = "未選択";
      el.previewMeta.textContent = `${getTypeLabel()}を選択してください。`;
      el.openPreview.disabled = true;
      el.downloadPreview.disabled = true;
      document.querySelectorAll(".card").forEach(c => c.classList.remove("selected"));
    }

    function openModal(item = null) {
      el.drawer.classList.add("open");
      el.drawer.setAttribute("aria-hidden", "false");
      el.form.reset();
      el.date.value = today();
      const type = item ? getItemType(item) : currentType;
      el.type.value = type;
      updateCategoryOptions(type, item?.category || getDropCategory());
      if (item) {
        el.modalTitle.textContent = `${getTypeLabel(type)}を編集`;
        el.editId.value = item.id;
        el.title.value = item.title || "";
        el.tags.value = (item.tags || []).join(", ");
        el.date.value = item.date || today();
        el.memo.value = item.memo || "";
      } else {
        el.modalTitle.textContent = `${getTypeLabel(type)}を追加`;
        el.editId.value = "";
      }
    }

    function closeModal() {
      el.drawer.classList.remove("open");
      el.drawer.setAttribute("aria-hidden", "true");
    }

    async function handleSubmit(e) {
      e.preventDefault();

      const editId = el.editId.value;
      const files = [...el.file.files];
      const existing = materials.find(m => m.id === editId);
      const baseTitle = el.title.value.trim();
      const selectedType = el.type.value || currentType;
      const selectedCategory = el.category.value;
      const selectedTags = el.tags.value.split(",").map(s => s.trim()).filter(Boolean);
      const selectedMemo = el.memo.value.trim();
      const selectedDate = el.date.value || today();

      const fileItems = [];
      for (const file of files) {
        fileItems.push({
          fileName: file.name,
          mime: file.type || "application/octet-stream",
          dataUrl: await fileToDataUrl(file)
        });
      }

      const existingFiles = existing ? getItemFiles(existing) : [];
      const finalFiles = fileItems.length ? fileItems : existingFiles;
      const primary = finalFiles[0];

      const titleFromFiles = finalFiles.length > 1 && primary
        ? `${primary.fileName.replace(/\.[^.]+$/, "")} ほか${finalFiles.length - 1}件`
        : primary ? primary.fileName.replace(/\.[^.]+$/, "") : "名称未設定";

      let payload = {
        id: editId || crypto.randomUUID(),
        title: baseTitle || existing?.title || titleFromFiles,
        type: selectedType,
        category: selectedCategory,
        tags: selectedTags,
        memo: selectedMemo,
        date: selectedDate,
        files: finalFiles,
        fileName: primary?.fileName || existing?.fileName || "",
        mime: primary?.mime || existing?.mime || "",
        dataUrl: primary?.dataUrl || existing?.dataUrl || "",
        createdAt: existing?.createdAt || new Date().toISOString(),
        checked: existing?.checked || false
      };

      if (!payload.dataUrl) {
        payload.mime = "image/svg+xml";
        payload.fileName = "placeholder.svg";
        payload.dataUrl = sampleSvg(payload.title.slice(0, 8) || getTypeLabel(selectedType));
        payload.files = [{ fileName: payload.fileName, mime: payload.mime, dataUrl: payload.dataUrl }];
      }

      if (editId) {
        materials = materials.map(m => m.id === editId ? payload : m);
      } else {
        materials.unshift(payload);
      }

      currentType = selectedType;
      currentCategory = "すべて";
      saveMaterials();
      closeModal();
      render();
      setPreview(payload.id);
      const fileCount = getItemFiles(payload).length;
      showToast(editId ? "更新しました" : fileCount > 1 ? `1カードに${fileCount}件登録しました` : "登録しました");
    }

    function deleteItem(id) {
      const item = materials.find(m => m.id === id);
      if (!item) return;
      if (!confirm(`「${item.title}」を削除しますか？`)) return;
      materials = materials.filter(m => m.id !== id);
      queueCloudDelete(id);
      saveMaterials();
      deleteCloudItem(id);
      if (currentPreviewId === id) clearPreview();
      render();
      showToast("削除しました");
    }


    function getCheckedMaterials() {
      return materials.filter(m => getItemType(m) === currentType && m.checked);
    }

    function updatePrintbar() {
      const count = getCheckedMaterials().length;
      el.checkedCount.textContent = `${count}件チェック中`;
      el.printbar.classList.toggle("show", count > 0);
      el.printSelectedTop.disabled = count === 0;
      el.clearSelectedTop.disabled = count === 0;
      el.printSelectedTop.style.opacity = count === 0 ? ".45" : "1";
      el.clearSelectedTop.style.opacity = count === 0 ? ".45" : "1";
    }

    function clearCheckedMaterials() {
      const count = getCheckedMaterials().length;
      if (!count) {
        showToast("チェックされた資料がありません");
        return;
      }
      materials = materials.map(m => getItemType(m) === currentType ? ({ ...m, checked: false }) : m);
      saveMaterials();
      render();
      showToast("チェックを解除しました");
    }

    function printCheckedMaterials() {
      const list = getCheckedMaterials();
      if (!list.length) {
        showToast("印刷する資料にチェックを入れてください");
        return;
      }

      const pages = [];
      list.forEach(item => {
        getItemFiles(item).forEach((file, fileIndex) => {
          pages.push({ item, file, fileIndex });
        });
      });

      const printable = pages.map((page) => {
        const file = page.file;
        const body = isPdfFile(file)
          ? `<iframe class="print-frame" src="${file.dataUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0"></iframe>`
          : `<img src="${file.dataUrl}" alt="">`;
        return `
          <section class="print-page">
            <div class="print-data">${body}</div>
          </section>
        `;
      }).join("");

      const win = window.open("", "_blank");
      if (!win) {
        alert("ポップアップがブロックされました。ブラウザ設定をご確認ください。");
        return;
      }

      win.document.write(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <title>印刷</title>
          <style>
            @page {
              size: A4;
              margin: 0;
            }

            * {
              box-sizing: border-box;
            }

            html,
            body {
              margin: 0;
              padding: 0;
              background: #fff;
            }

            .print-page {
              width: 210mm;
              height: 297mm;
              margin: 0 auto;
              padding: 0;
              background: #fff;
              page-break-after: always;
              overflow: hidden;
            }

            .print-page:last-child {
              page-break-after: auto;
            }

            .print-data {
              width: 100%;
              height: 100%;
              margin: 0;
              padding: 0;
              display: grid;
              place-items: center;
              overflow: hidden;
              background: #fff;
            }

            .print-data img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              display: block;
            }

            .print-frame {
              width: 100%;
              height: 100%;
              border: 0;
              display: block;
              background: #fff;
            }

            .screen-actions {
              position: sticky;
              top: 0;
              display: flex;
              justify-content: center;
              gap: 8px;
              padding: 12px;
              background: rgba(20,35,28,.92);
              z-index: 5;
            }

            .screen-actions button {
              border: 0;
              border-radius: 999px;
              padding: 10px 16px;
              font-weight: 900;
              cursor: pointer;
            }

            @media print {
              html,
              body {
                width: 210mm;
                margin: 0;
                padding: 0;
                background: #fff;
              }

              .screen-actions {
                display: none;
              }

              .print-page {
                width: 210mm;
                height: 297mm;
                margin: 0;
                padding: 0;
                page-break-after: always;
              }
            }
          </style>
        </head>
        <body>
          <div class="screen-actions">
            <button onclick="window.print()">印刷する</button>
            <button onclick="window.close()">閉じる</button>
          </div>
          ${printable}
          <script>
            window.addEventListener("load", () => {
              setTimeout(() => window.print(), 500);
            });
          <\/script>
        </body>
        </html>
      `);
      win.document.close();
    }

    function fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function openFile(item, fileIndex = 0) {
      const files = getItemFiles(item);
      const file = files[Math.min(Math.max(fileIndex, 0), files.length - 1)] || files[0];
      const win = window.open();
      if (!win) {
        alert("ポップアップがブロックされました。");
        return;
      }
      const content = isImageFile(file)
        ? `<img src="${file.dataUrl}" style="max-width:100vw;max-height:100vh;display:block;margin:auto;">`
        : `<iframe src="${file.dataUrl}" style="border:0;width:100vw;height:100vh;"></iframe>`;
      win.document.write(`
        <title>${escapeHtml(item.title)}</title>
        ${content}
      `);
    }

    function downloadFile(item, fileIndex = 0) {
      const files = getItemFiles(item);
      const file = files[Math.min(Math.max(fileIndex, 0), files.length - 1)] || files[0];
      const a = document.createElement("a");
      a.href = file.dataUrl;
      a.download = file.fileName || `${item.title}.file`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    function exportJson() {
      const blob = new Blob([JSON.stringify(materials, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `営業資料棚_backup_${today()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    function importJson(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!Array.isArray(data)) throw new Error("invalid");
          if (!confirm("現在の資料一覧を読み込みデータで置き換えますか？")) return;
          materials = data.map(item => ({ ...normalizeItem(item), files: getItemFiles(item) }));
          saveMaterials();
          clearPreview();
          render();
          showToast("読み込みました");
        } catch {
          alert("JSONの形式が正しくありません。");
        } finally {
          e.target.value = "";
        }
      };
      reader.readAsText(file);
    }

    function getExt(fileName = "", mime = "") {
      if (/pdf/i.test(mime) || /\.pdf$/i.test(fileName)) return "PDF";
      const ext = (fileName.split(".").pop() || "").toUpperCase();
      if (ext && ext !== fileName.toUpperCase()) return ext.slice(0, 5);
      if (mime.startsWith("image/")) return "IMG";
      if (mime.includes("svg")) return "SVG";
      return "FILE";
    }

    function formatDate(date) {
      if (!date) return "日付なし";
      return date.replaceAll("-", ".");
    }

    function escapeHtml(str = "") {
      return String(str).replace(/[&<>"']/g, m => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[m]));
    }

    function showToast(message) {
      el.toast.textContent = message;
      el.toast.classList.add("show");
      setTimeout(() => el.toast.classList.remove("show"), 1700);
    }

    render();
    setPreview(getFiltered()[0]?.id);
    initCloudStore();

    async function initCloudStore() {
      if (cloudBooted) return;
      cloudBooted = true;

      const config = await loadCloudConfig();
      if (!config) return;

      cloudStore = createSupabaseRestStore(config);

      try {
        const remoteMaterials = await cloudStore.list();
        if (remoteMaterials.length) {
          materials = mergeMaterials(materials, remoteMaterials);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(materials));
          render();
          setPreview(getFiltered()[0]?.id);
        }

        await flushCloudDeletes();
        await cloudStore.upsert(materials);
        showToast("Supabaseと同期しました");
      } catch (error) {
        console.warn("Supabase sync failed", error);
        showToast("端末内に保存しました");
      }
    }

    async function loadCloudConfig() {
      try {
        const response = await fetch(CLOUD_CONFIG_ENDPOINT, { cache: "no-store" });
        if (!response.ok) return null;
        const config = await response.json();
        if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
        return config;
      } catch {
        return null;
      }
    }

    function createSupabaseRestStore(config) {
      const baseUrl = config.supabaseUrl.replace(/\/$/, "");
      const headers = {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
        "Content-Type": "application/json"
      };

      async function request(path, options = {}) {
        const response = await fetch(`${baseUrl}${path}`, {
          ...options,
          headers: {
            ...headers,
            ...(options.headers || {})
          }
        });

        if (!response.ok) {
          throw new Error(`Supabase request failed: ${response.status}`);
        }

        if (response.status === 204) return null;
        return response.json();
      }

      return {
        async list() {
          const rows = await request("/rest/v1/materials?select=id,payload,updated_at&order=updated_at.desc");
          return rows.map(row => normalizeItem({
            ...row.payload,
            id: row.id,
            cloudUpdatedAt: row.updated_at
          }));
        },
        upsert(items) {
          if (!items.length) return Promise.resolve();
          const rows = items.map(item => ({
            id: item.id,
            payload: {
              ...item,
              cloudUpdatedAt: undefined
            }
          }));
          return request("/rest/v1/materials?on_conflict=id", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates" },
            body: JSON.stringify(rows)
          });
        },
        delete(id) {
          return request(`/rest/v1/materials?id=eq.${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: { Prefer: "return=minimal" }
          });
        }
      };
    }

    function mergeMaterials(localItems, remoteItems) {
      const byId = new Map();
      remoteItems.forEach(item => byId.set(item.id, item));
      localItems.forEach(item => byId.set(item.id, item));
      return [...byId.values()].map(item => ({ ...normalizeItem(item), files: getItemFiles(item) }));
    }

    function scheduleCloudSync() {
      if (!cloudStore) return;
      clearTimeout(cloudSyncTimer);
      cloudSyncTimer = setTimeout(async () => {
        try {
          await flushCloudDeletes();
          await cloudStore.upsert(materials);
        } catch (error) {
          console.warn("Supabase sync failed", error);
        }
      }, 700);
    }

    function getCloudDeleteQueue() {
      try {
        return JSON.parse(localStorage.getItem(CLOUD_DELETE_QUEUE_KEY) || "[]");
      } catch {
        return [];
      }
    }

    function queueCloudDelete(id) {
      const queue = new Set(getCloudDeleteQueue());
      queue.add(id);
      localStorage.setItem(CLOUD_DELETE_QUEUE_KEY, JSON.stringify([...queue]));
    }

    async function flushCloudDeletes() {
      if (!cloudStore) return;
      const queue = getCloudDeleteQueue();
      for (const id of queue) {
        await cloudStore.delete(id);
      }
      localStorage.removeItem(CLOUD_DELETE_QUEUE_KEY);
    }

    async function deleteCloudItem(id) {
      if (!cloudStore) return;
      try {
        await flushCloudDeletes();
      } catch (error) {
        console.warn("Supabase delete failed", error);
      }
    }
