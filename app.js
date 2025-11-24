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

 function renderEvents(events) {
  eventsContainer.innerHTML = '';

  if (!events || events.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';

  events.forEach((evt) => {
    const card = document.createElement('div');
    card.className = 'event-card';

    // ====== Event ID + Time ======
    const header = document.createElement('div');
    header.className = 'event-header';

    const idEl = document.createElement('div');
    idEl.className = 'event-id';
    idEl.textContent = `Event ID: ${evt.event_id}`;

    const timeEl = document.createElement('div');
    timeEl.className = 'event-time';
    timeEl.textContent = formatTime(evt.created_at);

    header.appendChild(idEl);
    header.appendChild(timeEl);

    // ====== Description ======
    const descriptionText =
      evt.event_description || '(Không có mô tả)';

    const descEl = document.createElement('div');
    descEl.className = 'event-desc';
    descEl.innerHTML = `
      <span class="field-label">Description:</span> ${descriptionText}
    `;

    // ====== Notes ======
    const notesText = evt.notes || '(Không có ghi chú)';

    const notesEl = document.createElement('div');
    notesEl.className = 'event-desc';
    notesEl.innerHTML = `
      <span class="field-label">Notes:</span> ${notesText}
    `;

    // ====== Images ======
    const imagesLabel = document.createElement('div');
    imagesLabel.className = 'field-label';
    imagesLabel.textContent = 'Images:';

    const imagesWrap = document.createElement('div');
    imagesWrap.className = 'images';
    imagesWrap.style.display = 'flex';

    if (evt.snapshot_id) {
      loadImagesForSnapshot(evt.snapshot_id, imagesWrap);
    } else {
      imagesWrap.textContent = 'Không có snapshot_id.';
    }

    // ====== Gắn vào card ======
    card.appendChild(header);
    card.appendChild(descEl);     // Description
    card.appendChild(notesEl);    // Notes
    card.appendChild(imagesLabel);
    card.appendChild(imagesWrap);

    eventsContainer.appendChild(card);
  });
}


  // ========= fetch + paginate =========
  async function fetchEvents(page = 1) {
    errorEl.style.display = "none";
    statusText.textContent = "Đang tải events…";

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await supabaseClient
      .from(TABLE_EVENTS)
      .select("event_id, snapshot_id, notes, event_description, created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(from, to);

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
