const SUPABASE_URL = 'https://undznprwlqjpnxqsgyiv.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuZHpucHJ3bHFqcG54cXNneWl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwOTY4NTEsImV4cCI6MjA3MDY3Mjg1MX0.1G_N4o5lBErs8g-6vLvMOrXPtS5sKXkLkORbvAurGSQ'; // key "web" ở API Keys

const TABLE_EVENTS = 'event_detections';
const TABLE_IMAGES = 'snapshot_images';

const PAGE_SIZE = 12; 

document.addEventListener('DOMContentLoaded', () => {
  const statusText = document.getElementById('status-text');
  const realtimeBadge = document.getElementById('realtime-badge');
  const eventsContainer = document.getElementById('events');
  const emptyEl = document.getElementById('empty');
  const errorEl = document.getElementById('error');
  const paginationEl = document.getElementById('pagination');

  if (!eventsContainer || !statusText) {
    console.error('Không tìm thấy DOM elements cần thiết');
    return;
  }

  let currentPage = 1;
  let totalPages = 1;
  let totalCount = 0;

  statusText.textContent = 'Đang kết nối Supabase...';

  const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  // ========= helpers =========
  function formatTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return (
      d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN')
    );
  }

  // render thanh phân trang
  function renderPagination() {
    if (!paginationEl) return;

    paginationEl.innerHTML = '';

    if (totalPages <= 1) {
      return; // 1 trang thì ẩn luôn cho sạch
    }

    const info = document.createElement('span');
    info.textContent = `Trang ${currentPage} / ${totalPages}`;

    const btnPrev = document.createElement('button');
    btnPrev.textContent = '‹ Trước';
    btnPrev.disabled = currentPage <= 1;
    btnPrev.addEventListener('click', () => goToPage(currentPage - 1));

    const btnNext = document.createElement('button');
    btnNext.textContent = 'Sau ›';
    btnNext.disabled = currentPage >= totalPages;
    btnNext.addEventListener('click', () => goToPage(currentPage + 1));

    paginationEl.appendChild(info);
    paginationEl.appendChild(btnPrev);
    paginationEl.appendChild(btnNext);
  }

  // load ảnh của 1 snapshot
  async function loadImagesForSnapshot(snapshotId, imagesWrap) {
    imagesWrap.dataset.loaded = 'false';
    imagesWrap.innerHTML = '<span>Đang tải ảnh...</span>';

    const { data, error } = await supabaseClient
      .from(TABLE_IMAGES)
      .select('image_id, cloud_url, image_path, created_at')
      .eq('snapshot_id', snapshotId)
      .order('created_at', { ascending: true });

    imagesWrap.innerHTML = '';

    if (error) {
      console.error('Lỗi load images:', error);
      imagesWrap.textContent = 'Lỗi tải ảnh: ' + error.message;
      return;
    }

    if (!data || data.length === 0) {
      imagesWrap.textContent = 'Không có ảnh cho event này.';
      imagesWrap.dataset.loaded = 'true';
      return;
    }

    data.forEach((row) => {
      const img = document.createElement('img');
      img.src = row.cloud_url || row.image_path || '';
      img.alt = 'snapshot image';
      imagesWrap.appendChild(img);
    });

    imagesWrap.dataset.loaded = 'true';
  }

  // render list event
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

      const header = document.createElement('div');
      header.className = 'event-header';

      const idEl = document.createElement('div');
      idEl.className = 'event-id';
      idEl.textContent = evt.event_id;

      const timeEl = document.createElement('div');
      timeEl.className = 'event-time';
      timeEl.textContent = formatTime(evt.created_at);

      header.appendChild(idEl);
      header.appendChild(timeEl);

      const descEl = document.createElement('div');
      descEl.className = 'event-desc';
      descEl.textContent =
        evt.notes || evt.event_description || '(Không có mô tả)';

      const btn = document.createElement('button');
      btn.className = 'view-images-btn';
      btn.type = 'button';
      btn.textContent = 'Xem ảnh';

      const imagesWrap = document.createElement('div');
      imagesWrap.className = 'images';
      imagesWrap.style.display = 'none';
      imagesWrap.dataset.loaded = 'false';

      btn.addEventListener('click', async (e) => {
        e.stopPropagation();

        const visible = imagesWrap.style.display !== 'none';
        if (visible) {
          imagesWrap.style.display = 'none';
          btn.textContent = 'Xem ảnh';
          return;
        }

        if (imagesWrap.dataset.loaded !== 'true') {
          await loadImagesForSnapshot(evt.snapshot_id, imagesWrap);
        }

        imagesWrap.style.display = 'flex';
        btn.textContent = 'Ẩn ảnh';
      });

      card.appendChild(header);
      card.appendChild(descEl);
      card.appendChild(btn);
      card.appendChild(imagesWrap);

      eventsContainer.appendChild(card);
    });
  }

  // ========= fetch + paginate =========
  async function fetchEvents(page = 1) {
    errorEl.style.display = 'none';
    statusText.textContent = 'Đang tải events…';

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await supabaseClient
      .from(TABLE_EVENTS)
      .select('event_id, snapshot_id, notes, event_description, created_at', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Lỗi load events:', error);
      errorEl.textContent = 'Lỗi khi load events: ' + error.message;
      errorEl.style.display = 'block';
      statusText.textContent = 'Lỗi load events';
      return;
    }

    totalCount = typeof count === 'number' ? count : totalCount;
    totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    currentPage = page;

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
      .channel('public:' + TABLE_EVENTS)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE_EVENTS },
        (payload) => {
          console.log('Realtime change:', payload);
          statusText.textContent =
            'Phát hiện thay đổi (' + payload.eventType + '). Reload events…';
          fetchEvents(currentPage); // reload trang hiện tại
        }
      )
      .subscribe((status) => {
        console.log('Realtime status:', status);
        if (status === 'SUBSCRIBED') {
          realtimeBadge.textContent = 'Realtime: ON';
        }
      });

    window.addEventListener('beforeunload', () => {
      supabaseClient.removeChannel(channel);
    });
  }

  // ========= init =========
  (async () => {
    try {
      await fetchEvents(1);
      setupRealtime();
    } catch (err) {
      console.error('Init error:', err);
      errorEl.textContent = 'Có lỗi khi khởi tạo: ' + String(err);
      errorEl.style.display = 'block';
      statusText.textContent = 'Lỗi khởi tạo';
    }
  })();
});
