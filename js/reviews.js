/* Avenix Overseas — Public Reviews (Supabase-backed). */
(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const wordCount = (value) => {
    const text = String(value || '').trim();
    return text ? text.split(/\s+/).length : 0;
  };
  const labels = {
    1: 'Disappointing', 2: 'Below Expectations', 3: 'Needs Improvement',
    4: 'Fair Experience', 5: 'Satisfactory', 6: 'Good Experience',
    7: 'Very Good', 8: 'Excellent Experience', 9: 'Exceptional', 10: 'Outstanding'
  };
  const stars = (rating) => {
    const n = Math.min(10, Math.max(0, Number(rating) || 0));
    return '★'.repeat(n) + '☆'.repeat(10 - n);
  };

  let realtimeChannel = null;
  let reviewItems = [];
  let activeReviewIndex = 0;
  let rotationTimer = null;
  let rotationPaused = false;

  function client() {
    if (!window.supabase?.createClient || !window.AVENIX_SUPABASE_URL || !window.AVENIX_SUPABASE_ANON_KEY) return null;
    return window.supabase.createClient(window.AVENIX_SUPABASE_URL, window.AVENIX_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  function reviewCard(review) {
    const rating = Math.min(10, Math.max(1, Number(review.rating) || 10));
    const image = review.image_url
      ? `<button type="button" class="review-image-button lb-clickable" aria-label="View review image"><img class="review-image" src="${esc(review.image_url)}" alt="Image shared by ${esc(review.client_name || 'client')}" loading="lazy"></button>`
      : '';
    const video = review.video_url ? `<div class="review-video-wrap"><video class="review-video" controls preload="metadata" playsinline src="${esc(review.video_url)}"></video></div>` : '';
    const place = review.place ? `<span class="review-place"> · ${esc(review.place)}</span>` : '';
    const date = review.created_at ? new Date(review.created_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}) : '';
    const reply = review.admin_reply
      ? `<div class="review-reply"><strong>Avenix reply</strong><p>${esc(review.admin_reply)}</p></div>`
      : '';

    return `<article class="review-card" data-review-id="${esc(review.id)}">
      <div class="review-rating" aria-label="${rating} out of 10">${stars(rating)}</div>
      <div class="review-rating-label">${rating}/10 · ${esc(labels[rating])}</div>
      <blockquote>“${esc(review.review_text)}”</blockquote>
      <div class="review-author"><strong>${esc(review.client_name || 'Avenix client')}</strong>${place}<span>${esc(review.service || '')}</span></div><div class="review-date"><i class="fa-regular fa-calendar"></i> ${esc(date)}</div>
      ${reply}
      ${image}${video}
    </article>`;
  }

  function cardsPerView() { return window.matchMedia('(max-width: 700px)').matches ? 1 : 3; }

  function renderActiveReview(host) {
    const controls = $('#review-carousel-controls');
    if (!reviewItems.length) {
      host.innerHTML = '<div class="review-empty">No reviews yet. Be the first to share your experience.</div>';
      if (controls) controls.hidden = true;
      stopRotation();
      return;
    }
    const groupSize = cardsPerView();
    const groupCount = Math.ceil(reviewItems.length / groupSize);
    const groupIndex = Math.floor(activeReviewIndex / groupSize) % groupCount;
    activeReviewIndex = groupIndex * groupSize;
    host.innerHTML = reviewItems.slice(activeReviewIndex, activeReviewIndex + groupSize).map(reviewCard).join('');
    if (controls) controls.hidden = groupCount < 2;
    if (groupCount < 2) stopRotation();
    else startRotation();
  }

  function stopRotation() {
    if (rotationTimer) window.clearInterval(rotationTimer);
    rotationTimer = null;
  }

  function startRotation() {
    stopRotation();
    if (rotationPaused || Math.ceil(reviewItems.length / cardsPerView()) < 2 || !$('#reviews-list')) return;
    rotationTimer = window.setInterval(() => {
      activeReviewIndex = (activeReviewIndex + cardsPerView()) % reviewItems.length;
      const host = $('#reviews-list');
      if (host) renderActiveReview(host);
    }, 5000);
  }

  function renderReviews(host, data) {
    const previousId = reviewItems[activeReviewIndex]?.id;
    reviewItems = (Array.isArray(data) ? data : []).filter((review) => review && review.is_visible !== false);
    const preservedIndex = reviewItems.findIndex((review) => review.id === previousId);
    activeReviewIndex = preservedIndex >= 0 ? preservedIndex : 0;
    renderActiveReview(host);
  }

  async function loadReviews(db) {
    const host = $('#reviews-list');
    if (!host) return;
    host.innerHTML = '<div class="review-empty">Loading reviews…</div>';

    try {
      // Preferred query: only published reviews and only the fields used by the page.
      let result = await db
        .from('reviews')
        .select('id,client_name,place,service,rating,review_text,image_url,video_url,admin_reply,is_visible,created_at')
        .eq('is_visible', true)
        .order('created_at', { ascending: false });

      // Compatibility fallback: if an older reviews table is missing one of the
      // optional columns, fetch the available row shape and filter safely in JS.
      if (result.error) {
        console.warn('Preferred reviews query failed; trying compatibility query:', result.error.message);
        result = await db.from('reviews').select('id,client_name,place,service,rating,review_text,image_url,admin_reply,is_visible,created_at').eq('is_visible', true).order('created_at', { ascending: false });
        if (result.error) {
          result = await db.from('reviews').select('*').order('created_at', { ascending: false });
        }
      }

      if (result.error) throw result.error;
      renderReviews(host, result.data);
    } catch (error) {
      console.error('Supabase reviews read failed:', error);
      host.innerHTML = '<div class="review-empty">Reviews are temporarily unavailable. Please try again shortly.</div>';
    }
  }

  function setStatus(message, type = '') {
    const status = $('#revStatus');
    if (!status) return;
    status.className = `form-status${type ? ` ${type}` : ''}`;
    status.textContent = message;
  }

  async function submitReview(form) {
    const db = client();
    if (!db) throw new Error('Supabase is not configured on this page.');

    const name = $('#revName', form).value.trim();
    const place = $('#revPlace', form).value.trim();
    const service = $('#revService', form).value;
    const rating = Number($('#revRating', form).value);
    const reviewText = $('#revText', form).value.trim();
    const file = $('#revImage', form)?.files?.[0] || null;
    const videoFile = $('#revVideo', form)?.files?.[0] || null;

    if (!name || !service || !Number.isInteger(rating) || rating < 1 || rating > 10) {
      throw new Error('Please complete all required review fields.');
    }
    if (wordCount(reviewText) < 10) {
      throw new Error('Please write at least 10 words about your experience.');
    }
    if (file) { const allowed = /^(image\/(png|jpe?g|webp|gif))$/i.test(file.type); if (!allowed || file.size > 5 * 1024 * 1024) throw new Error('Please choose a PNG, JPEG, WebP or GIF image up to 5 MB.'); }
    if (videoFile) { const allowed = /^video\/(mp4|webm|quicktime)$/i.test(videoFile.type); if (!allowed || videoFile.size > 20 * 1024 * 1024) throw new Error('Please choose an MP4, WebM or MOV video up to 20 MB.'); }

    const row = {
      client_name: name,
      place: place || null,
      service,
      rating,
      review_text: reviewText,
      image_url: null,
      video_url: null,
      is_visible: true,
      admin_reply: null,
    };

    // Preferred path: direct Supabase insert/upload. This makes the public
    // review page work without depending on an Edge Function deployment.
    // The included SQL creates tightly-scoped anon INSERT/Storage policies.
    let uploadedPath = null;
    try {
      if (videoFile) {
        const probe = await db.from('reviews').select('video_url').limit(1);
        if (probe.error && /video_url.*schema cache|column.*video_url/i.test(probe.error.message || '')) {
          throw new Error('Video reviews are ready in the website, but your Supabase table still needs the video_url column. Run SUPABASE-FINAL-FIX.sql once, then try again.');
        }
      }
      if (file) {
        const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'review-image';
        uploadedPath = `reviews/${crypto.randomUUID()}-${safeName}`;
        const upload = await db.storage.from('site-images').upload(uploadedPath, file, {
          contentType: file.type,
          cacheControl: '3600',
          upsert: false,
        });
        if (upload.error) throw upload.error;
        row.image_url = db.storage.from('site-images').getPublicUrl(uploadedPath).data.publicUrl;
      }
      if (videoFile) {
        const safeVideo = videoFile.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'review-video';
        const videoPath = `reviews/videos/${crypto.randomUUID()}-${safeVideo}`;
        const uploadVideo = await db.storage.from('site-images').upload(videoPath, videoFile, { contentType: videoFile.type, cacheControl: '3600', upsert: false });
        if (uploadVideo.error) throw uploadVideo.error;
        row.video_url = db.storage.from('site-images').getPublicUrl(videoPath).data.publicUrl;
      }

      let insertResult = await db
        .from('reviews')
        .insert(row)
        .select('id,client_name,place,service,rating,review_text,image_url,video_url,is_visible,admin_reply,created_at')
        .single();

      // Older deployments may not yet have video_url. Image/text reviews should
      // still be publishable, while a selected video gets a clear migration message.
      if (insertResult.error && /video_url.*schema cache|column.*video_url/i.test(insertResult.error.message || '')) {
        if (videoFile) throw new Error('Video reviews need the supplied Supabase review migration first. Please run SUPABASE-FINAL-FIX.sql, then try again.');
        const legacyRow = { ...row }; delete legacyRow.video_url;
        insertResult = await db.from('reviews').insert(legacyRow).select('id,client_name,place,service,rating,review_text,image_url,is_visible,admin_reply,created_at').single();
      }
      if (insertResult.error) throw insertResult.error;
      if (!insertResult.data) throw new Error('Review was saved but no review record was returned.');
      return insertResult.data;
    } catch (directError) {
      if (uploadedPath) {
        try { await db.storage.from('site-images').remove([uploadedPath]); } catch (_) {}
      }
      console.warn('Direct public review submission unavailable; trying submit-review function:', directError?.message || directError);

      // Compatibility fallback for installations that still use the secure
      // server-side Edge Function path.
      const payload = new FormData();
      payload.append('client_name', name);
      payload.append('place', place);
      payload.append('service', service);
      payload.append('rating', String(rating));
      payload.append('review_text', reviewText);
      if (file) payload.append('image', file, file.name);
      if (videoFile) payload.append('video', videoFile, videoFile.name);

      const { data, error } = await db.functions.invoke('submit-review', { body: payload });
      if (error) {
        console.error('submit-review function error:', error);
        throw new Error('The review could not be saved. Please run the supplied Supabase review setup SQL and try again.');
      }
      if (!data?.ok || !data.review) throw new Error(data?.error || 'Review could not be published.');
      return data.review;
    }
  }

  function prependReview(review) {
    const host = $('#reviews-list');
    if (!host || !review || review.is_visible === false) return;
    if (review.id && reviewItems.some((item) => String(item.id) === String(review.id))) return;
    reviewItems.unshift(review);
    activeReviewIndex = 0;
    renderActiveReview(host);
  }

  function subscribeToReviews(db) {
    if (!db?.channel) return;
    try {
      realtimeChannel = db.channel('avenix-public-reviews')
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'reviews', filter: 'is_visible=eq.true'
        }, (payload) => prependReview(payload.new))
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'reviews', filter: 'is_visible=eq.true'
        }, (payload) => {
          const host = $('#reviews-list');
          const existing = host?.querySelector(`[data-review-id="${CSS.escape(String(payload.new?.id || ''))}"]`);
          if (existing) {
            const index = reviewItems.findIndex((item) => String(item.id) === String(payload.new?.id));
            if (index >= 0) reviewItems[index] = payload.new;
            const host = $('#reviews-list');
            if (host) renderActiveReview(host);
          } else prependReview(payload.new);
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') console.warn('Reviews realtime subscription unavailable; local publishing still works.');
        });
    } catch (error) {
      console.warn('Reviews realtime setup skipped:', error);
    }
  }

  function init() {
    const form = $('#publicReviewForm');
    const text = $('#revText', form || document);
    const count = $('#wordCount', form || document);
    if (!form) return;

    const db = client();
    if (!db) {
      setStatus('Review service is not configured. Please contact Avenix Overseas.', 'error');
      const host = $('#reviews-list');
      if (host) host.innerHTML = '<div class="review-empty">Review service is not configured. Please contact Avenix Overseas.</div>';
      return;
    }

    const carousel = $('#review-carousel');
    const pauseButton = $('#review-pause');
    const moveReview = (direction) => {
      const groupSize = cardsPerView();
      const groupCount = Math.ceil(reviewItems.length / groupSize);
      if (groupCount < 2) return;
      const groupIndex = Math.floor(activeReviewIndex / groupSize);
      activeReviewIndex = ((groupIndex + direction + groupCount) % groupCount) * groupSize;
      const host = $('#reviews-list');
      if (host) renderActiveReview(host);
    };
    $('#review-prev')?.addEventListener('click', () => moveReview(-1));
    $('#review-next')?.addEventListener('click', () => moveReview(1));
    const setPaused = (paused) => {
      rotationPaused = paused;
      if (pauseButton) {
        pauseButton.textContent = paused ? 'Resume rotation' : 'Pause rotation';
        pauseButton.setAttribute('aria-pressed', String(paused));
      }
      if (paused) stopRotation(); else startRotation();
    };
    pauseButton?.addEventListener('click', () => setPaused(!rotationPaused));
    carousel?.addEventListener('mouseenter', () => setPaused(true));
    carousel?.addEventListener('mouseleave', () => setPaused(false));
    carousel?.addEventListener('focusin', () => setPaused(true));
    carousel?.addEventListener('focusout', (event) => {
      if (!carousel.contains(event.relatedTarget)) setPaused(false);
    });
    carousel?.addEventListener('touchstart', () => setPaused(true), { passive: true });
    window.addEventListener('resize', () => { const host = $('#reviews-list'); if (host) renderActiveReview(host); });

    text?.addEventListener('input', () => {
      const n = wordCount(text.value);
      if (count) count.textContent = `${n} word${n === 1 ? '' : 's'}`;
    });

    $('#revImage')?.addEventListener('change', () => {
      const file = $('#revImage').files?.[0], host = $('#revImagePreview'); if (!host) return; host.innerHTML = '';
      if (!file) return; const url = URL.createObjectURL(file); host.innerHTML = `<div class="review-media-wrap"><img src="${url}" alt="Selected review image"><button type="button" class="review-media-trash" id="removeReviewImage" aria-label="Remove image"><i class="fa-solid fa-trash"></i></button></div>`;
      $('#removeReviewImage')?.addEventListener('click', () => { $('#revImage').value=''; host.innerHTML=''; URL.revokeObjectURL(url); });
    });
    $('#revVideo')?.addEventListener('change', () => {
      const file = $('#revVideo').files?.[0], host = $('#revVideoPreview'); if (!host) return; host.innerHTML = '';
      if (!file) return; const url = URL.createObjectURL(file); host.innerHTML = `<div class="review-media-wrap"><video src="${url}" controls muted playsinline></video><button type="button" class="review-media-trash" id="removeReviewVideo" aria-label="Remove video"><i class="fa-solid fa-trash"></i></button></div>`;
      $('#removeReviewVideo')?.addEventListener('click', () => { $('#revVideo').value=''; host.innerHTML=''; URL.revokeObjectURL(url); });
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', form);
      if (button?.disabled) return;

      setStatus('Publishing your review…');
      if (button) button.disabled = true;

      try {
        const review = await submitReview(form);
        prependReview(review);
        form.reset();
        if ($('#revImagePreview')) $('#revImagePreview').innerHTML = ''; if ($('#revVideoPreview')) $('#revVideoPreview').innerHTML = '';
        if (count) count.textContent = '0 words';
        setStatus('Thank you! Your review has been published successfully.', 'success');
      } catch (error) {
        console.error('Supabase review submission failed:', error);
        setStatus(error.message || 'We could not submit your review. Please try again.', 'error');
      } finally {
        if (button) button.disabled = false;
      }
    });

    loadReviews(db);
    subscribeToReviews(db);
  }

  window.addEventListener('beforeunload', () => {
    stopRotation();
    try { realtimeChannel?.unsubscribe(); } catch (_) {}
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
