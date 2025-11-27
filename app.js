// ========= 0. CONFIG =========
const SUPABASE_URL = "https://undznprwlqjpnxqsgyiv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuZHpucHJ3bHFqcG54cXNneWl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwOTY4NTEsImV4cCI6MjA3MDY3Mjg1MX0.1G_N4o5lBErs8g-6vLvMOrXPtS5sKXkLkORbvAurGSQ";

const TABLE_EVENTS = "event_detections";
const TABLE_IMAGES = "snapshot_images";

const PAGE_SIZE = 12;

document.addEventListener("DOMContentLoaded", () => {
  const statusText = document.getElementById("status-text");
  const realtimeBadge = document.getElementById("realtime-badge");
  const eventsContainer = document.getElementById("events");
  const emptyEl = document.getElementById("empty");
  const errorEl = document.getElementById("error");
  const paginationEl = document.getElementById("pagination");
  const statusFilterEl = document.getElementById("status-filter");

  // modal xem ảnh
  const imageModal = document.getElementById("image-modal");
  const imageModalImg = document.getElementById("image-modal-img");

  if (!eventsContainer || !statusText) {
    console.error("Không tìm thấy DOM elements cần thiết");
    return;
  }

  let currentPage = 1;
  let totalPages = 1;
  let totalCount = 0;
  let currentStatusFilter = "danger_warning"; // default: danger + warning

  if (statusFilterEl) {
    // set default value (phòng trường hợp HTML chưa set)
    statusFilterEl.value = "danger_warning";

    statusFilterEl.addEventListener("change", () => {
      currentStatusFilter = statusFilterEl.value;
      // đổi filter thì nên quay về trang 1
      fetchEvents(1);
    });
  }

  statusText.textContent = "Đang kết nối Supabase...";

  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ========= helpers =========
  function formatTime(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    return d.toLocaleDateString("vi-VN") + " " + d.toLocaleTimeString("vi-VN");
  }

  // modal helpers
  function openImageModal(src) {
    if (!imageModal || !imageModalImg) return;
    imageModalImg.src = src;
    imageModal.classList.add("open");
  }

  function closeImageModal() {
    if (!imageModal) return;
    imageModal.classList.remove("open");
  }

  if (imageModal) {
    imageModal.addEventListener("click", (e) => {
      // click vùng tối hoặc ảnh đều đóng
      closeImageModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeImageModal();
      }
    });
  }

  // render thanh phân trang
  function renderPagination() {
    if (!paginationEl) return;

    paginationEl.innerHTML = "";

    if (totalPages <= 1) {
      return; // 1 trang thì thôi khỏi hiện
    }

    const btnPrev = document.createElement("button");
    btnPrev.textContent = "‹ Trước";
    btnPrev.disabled = currentPage <= 1;
    btnPrev.addEventListener("click", () => goToPage(currentPage - 1));

    const labelSpan = document.createElement("span");
    labelSpan.textContent = "Trang";

    const pageInput = document.createElement("input");
    pageInput.type = "number";
    pageInput.min = "1";
    pageInput.max = String(totalPages);
    pageInput.value = String(currentPage);
    pageInput.className = "pagination-input";

    // Enter để nhảy trang
    pageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const value = parseInt(pageInput.value, 10);
        if (!Number.isNaN(value)) {
          goToPage(value);
        }
      }
    });

    // blur thì sync lại nếu user gõ bậy
    pageInput.addEventListener("blur", () => {
      pageInput.value = String(currentPage);
    });

    const totalSpan = document.createElement("span");
    totalSpan.textContent = `/ ${totalPages}`;

    const btnNext = document.createElement("button");
    btnNext.textContent = "Sau ›";
    btnNext.disabled = currentPage >= totalPages;
    btnNext.addEventListener("click", () => goToPage(currentPage + 1));

    paginationEl.appendChild(btnPrev);
    paginationEl.appendChild(labelSpan);
    paginationEl.appendChild(pageInput);
    paginationEl.appendChild(totalSpan);
    paginationEl.appendChild(btnNext);
  }

  // load ảnh của 1 snapshot (auto load, không cần nút)
  async function loadImagesForSnapshot(snapshotId, imagesWrap) {
    imagesWrap.innerHTML = "<span>Đang tải ảnh...</span>";

    const { data, error } = await supabaseClient
      .from(TABLE_IMAGES)
      .select("image_id, cloud_url, image_path, created_at")
      .eq("snapshot_id", snapshotId)
      .order("created_at", { ascending: true });

    imagesWrap.innerHTML = "";

    if (error) {
      console.error("Lỗi load images:", error);
      imagesWrap.textContent = "Lỗi tải ảnh: " + error.message;
      return;
    }

    if (!data || data.length === 0) {
      imagesWrap.textContent = "Không có ảnh cho event này.";
      return;
    }

    data.forEach((row) => {
      const img = document.createElement("img");
      img.src = row.cloud_url || row.image_path || "";
      img.alt = "snapshot image";

      // click để xem to
      img.addEventListener("click", () => {
        if (img.src) {
          openImageModal(img.src);
        }
      });

      imagesWrap.appendChild(img);
    });
  }

  async function updateLifecycle(eventId, nextState, onDone) {
    try {
      statusText.textContent = "Đang cập nhật lifecycle…";

      const { error } = await supabaseClient
        .from(TABLE_EVENTS)
        .update({
          lifecycle_state: nextState,
          last_action_at: new Date().toISOString(),
        })
        .eq("event_id", eventId);

      if (error) {
        console.error("Lỗi update lifecycle:", error);
        alert("Lỗi cập nhật lifecycle: " + error.message);
        statusText.textContent = "Lỗi cập nhật lifecycle";
        onDone?.(false);
        return;
      }

      statusText.textContent = "Đã cập nhật lifecycle";
      // có realtime nên thực ra không cần, nhưng để chắc ăn:
      fetchEvents(currentPage);
      onDone?.(true);
    } catch (err) {
      console.error("Exception update lifecycle:", err);
      alert("Có lỗi xảy ra khi cập nhật lifecycle");
      statusText.textContent = "Lỗi cập nhật lifecycle";
      onDone?.(false);
    }
  }

  function renderEvents(events) {
    eventsContainer.innerHTML = "";

    if (!events || events.length === 0) {
      emptyEl.style.display = "block";
      return;
    }

    emptyEl.style.display = "none";

    events.forEach((evt) => {
      const card = document.createElement("div");
      card.className = "event-card";

      // ====== Header: ID + time ======
      const header = document.createElement("div");
      header.className = "event-header";

      const idEl = document.createElement("div");
      idEl.className = "event-id";
      idEl.textContent = `Event ID: ${evt.event_id}`;

      const timeEl = document.createElement("div");
      timeEl.className = "event-time";
      timeEl.textContent = formatTime(evt.created_at);

      header.appendChild(idEl);
      header.appendChild(timeEl);

      // ====== Lifecycle badge ======
      const metaRow = document.createElement("div");
      metaRow.className = "event-meta";

      const lifecycleLabel = document.createElement("div");
      lifecycleLabel.className = "event-lifecycle-pill";
      lifecycleLabel.textContent = `Lifecycle: ${evt.lifecycle_state || "N/A"}`;

      metaRow.appendChild(lifecycleLabel);

      // ====== Description ======
      const descriptionText = evt.event_description || "(Không có mô tả)";
      const descEl = document.createElement("div");
      descEl.className = "event-desc";
      descEl.innerHTML = `
      <span class="field-label">Description:</span> ${descriptionText}
    `;

      // ====== Notes ======
      const notesText = evt.notes || "(Không có ghi chú)";
      const notesEl = document.createElement("div");
      notesEl.className = "event-desc";
      notesEl.innerHTML = `
      <span class="field-label">Notes:</span> ${notesText}
    `;

      // ====== Images ======
      const imagesLabel = document.createElement("div");
      imagesLabel.className = "field-label";
      imagesLabel.textContent = "Images:";

      const imagesWrap = document.createElement("div");
      imagesWrap.className = "images";
      imagesWrap.style.display = "flex";

      if (evt.snapshot_id) {
        loadImagesForSnapshot(evt.snapshot_id, imagesWrap);
      } else {
        imagesWrap.textContent = "Không có snapshot_id.";
      }

      // ====== Lifecycle action button ======
      const actionsEl = document.createElement("div");

      let nextState = null;
      let buttonText = "";

      if (evt.lifecycle_state === "NOTIFIED") {
        nextState = "ALARM_ACTIVATED";
        buttonText = "Chuyển sang ALARM_ACTIVATED";
      } else if (evt.lifecycle_state === "ALARM_ACTIVATED") {
        nextState = "RESOLVED";
        buttonText = "Đánh dấu RESOLVED";
      }

      if (nextState) {
        const btn = document.createElement("button");
        btn.className = "lifecycle-btn";
        btn.textContent = buttonText;

        btn.addEventListener("click", () => {
          btn.disabled = true;
          const oldText = btn.textContent;
          btn.textContent = "Đang cập nhật…";

          updateLifecycle(evt.event_id, nextState, (ok) => {
            if (!ok) {
              btn.disabled = false;
              btn.textContent = oldText;
            }
            // nếu OK thì realtime hoặc fetchEvents sẽ redraw card
          });
        });

        actionsEl.appendChild(btn);
      }

      // ====== Gắn vào card ======
      card.appendChild(header);
      card.appendChild(metaRow);
      card.appendChild(descEl);
      card.appendChild(notesEl);
      card.appendChild(imagesLabel);
      card.appendChild(imagesWrap);
      if (actionsEl.children.length > 0) {
        card.appendChild(actionsEl);
      }

      eventsContainer.appendChild(card);
    });
  }

  // ========= fetch + paginate =========
  async function fetchEvents(page = 1) {
    errorEl.style.display = "none";
    statusText.textContent = "Đang tải events…";

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabaseClient
      .from(TABLE_EVENTS)
      .select(
        "event_id, snapshot_id, notes, event_description, created_at, status, lifecycle_state",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    // ====== Áp dụng filter theo status ======
    if (currentStatusFilter === "danger_warning") {
      // mặc định: chỉ danger + warning
      query = query.in("status", ["danger", "warning"]);
    } else if (currentStatusFilter === "common") {
      // danger + warning + normal
      query = query.in("status", ["danger", "warning", "normal"]);
    } else if (currentStatusFilter === "suspicious") {
      // unknowns + suspect
      query = query.in("status", ["unknowns", "suspect"]);
    } else if (currentStatusFilter === "all") {
      // không filter gì thêm
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Lỗi load events:", error);
      errorEl.textContent = "Lỗi khi load events: " + error.message;
      errorEl.style.display = "block";
      statusText.textContent = "Lỗi load events";
      return;
    }

    totalCount = typeof count === "number" ? count : totalCount;
    totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    currentPage = Math.min(Math.max(page, 1), totalPages);

    renderEvents(data || []);
    renderPagination();

    statusText.textContent = `Đã load ${data?.length || 0} event(s) – Tổng ${
      totalCount || 0
    } bản ghi`;
  }

  function goToPage(page) {
    if (page < 1 || page > totalPages) return;
    fetchEvents(page);
  }

  // ========= realtime =========
  function setupRealtime() {
    const channel = supabaseClient
      .channel("public:" + TABLE_EVENTS)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE_EVENTS },
        (payload) => {
          console.log("Realtime change:", payload);
          statusText.textContent =
            "Phát hiện thay đổi (" + payload.eventType + "). Reload events…";
          fetchEvents(currentPage); // reload trang hiện tại
        }
      )
      .subscribe((status) => {
        console.log("Realtime status:", status);
        if (status === "SUBSCRIBED") {
          realtimeBadge.textContent = "Realtime: ON";
        }
      });

    window.addEventListener("beforeunload", () => {
      supabaseClient.removeChannel(channel);
    });
  }

  // ========= init =========
  (async () => {
    try {
      await fetchEvents(1);
      setupRealtime();
    } catch (err) {
      console.error("Init error:", err);
      errorEl.textContent = "Có lỗi khi khởi tạo: " + String(err);
      errorEl.style.display = "block";
      statusText.textContent = "Lỗi khởi tạo";
    }
  })();
});
