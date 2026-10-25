(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const allowed = ['affysiddiqui98@gmail.com', 'avenixoverseas@gmail.com', 'avenixoverseas1@gmail.com', 'contact@avenixoverseas.com'];
  const owner = 'affysiddiqui98@gmail.com';
  let adminStarted = false;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const status = (id, msg, error = false) => {
    const x = $(id);
    if (x) { x.textContent = msg; x.className = 'form-status ' + (error ? 'error' : 'success'); }
  };
  const words = (v) => (v && v.trim() ? v.trim().split(/\s+/).length : 0);

  function waitAndStart() {
    let tries = 0;
    const tick = () => {
      tries++;
      if (window.supabase && window.AVENIX_SUPABASE_URL && window.AVENIX_SUPABASE_ANON_KEY) {
        startAdmin(window.supabase.createClient(window.AVENIX_SUPABASE_URL, window.AVENIX_SUPABASE_ANON_KEY));
        return;
      }
      if (tries > 50) {
        status('#loginStatus', 'Could not load auth. Check supabase-config.js and refresh.', true);
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  }

  async function startAdmin(db) {
    if (adminStarted) return;
    adminStarted = true;
    let jobImageUrls = [];
    let reviewImageUrl = null;
    let reviewVideoUrl = null;
    let dashboardJobs = [];
    let dashboardReviews = [];

    async function upload(file, folder, maxBytes = 5 * 1024 * 1024, kind = 'image') {
      if (!file) return null;
      if (file.size > maxBytes) throw new Error(`${kind === 'video' ? 'Video' : 'Image'} must be ${kind === 'video' ? '20 MB' : '5 MB'} or smaller.`);
      if (kind === 'image' && !/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) throw new Error('Please choose a PNG, JPEG, WebP or GIF image.');
      if (kind === 'video' && !/^video\/(mp4|webm|quicktime)$/i.test(file.type)) throw new Error('Please choose an MP4, WebM or MOV video.');
      const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
      const path = folder + '/' + crypto.randomUUID() + '-' + safe;
      const { error } = await db.storage.from('site-images').upload(path, file, {
        cacheControl: '3600', upsert: false, contentType: file.type || 'image/jpeg'
      });
      if (error) throw error;
      return db.storage.from('site-images').getPublicUrl(path).data.publicUrl;
    }

    function renderJobImagePreviews() {
      const host = $('#jobImagePreviews');
      if (!host) return;
      host.innerHTML = jobImageUrls.map((url, i) =>
        '<div class="img-preview"><img src="' + esc(url) + '" alt=""/><button type="button" class="trash-btn" data-rm-job-img="' + i + '"><i class="fa-solid fa-trash"></i></button></div>'
      ).join('');
      $$('[data-rm-job-img]').forEach((b) => b.addEventListener('click', () => {
        jobImageUrls.splice(Number(b.dataset.rmJobImg), 1);
        renderJobImagePreviews();
      }));
    }

    function lockAdminPage() {
      document.body.classList.add('admin-session-active');
      // Soft lock: do not hijack history (that freezes some browsers)
    }
    function unlockAdminPage() {
      document.body.classList.remove('admin-session-active');
    }

    function setPasswordUi(user) {
      const isOwner = (user?.email || '').toLowerCase() === owner;
      const panel = $('#passwordPanel');
      const tab = $('#passwordTabBtn');
      if (panel) panel.hidden = !isOwner;
      if (tab) tab.hidden = !isOwner;
    }

    async function openDashboard(user) {
      const email = (user.email || '').toLowerCase();
      if (!allowed.includes(email)) {
        await db.auth.signOut({ scope: 'local' });
        status('#loginStatus', 'This account is not authorised for Avenix Admin.', true);
        return;
      }
      $('#loginBox').hidden = true;
      $('#dashboard').hidden = false;
      if ($('#logoutBtn')) $('#logoutBtn').hidden = false;
      if ($('#refreshBtn')) $('#refreshBtn').hidden = false;
      lockAdminPage();
      setPasswordUi(user);
      armHistoryGuard();
      Promise.resolve().then(() => loadReviews()).catch(() => {});
      Promise.resolve().then(() => loadJobs()).catch(() => {});
    }

    function updateStats(jobs, reviews) {
      const list = Array.isArray(jobs) ? jobs : [];
      const pub = list.filter(j => j.is_published !== false && (j.is_published === true || j.is_active !== false));
      const live = pub.filter(j => Boolean(j.is_hiring_live));
      const set = (id, value) => { const el = $('#' + id); if (el) el.textContent = String(value); };
      set('statLiveJobs', live.length); set('statPublishedJobs', pub.length); set('statClosedJobs', pub.filter(j => !j.is_hiring_live).length); set('statReviews', Array.isArray(reviews) ? reviews.length : dashboardReviews.length);
    }

    async function loadReviews() {
      const host = $('#reviewAdmin');
      if (!host) return;
      let result = await db.from('reviews').select('*').order('created_at', { ascending: false });
      if (result.error && /video_url.*schema cache|column.*video_url/i.test(result.error.message || '')) {
        result = await db.from('reviews').select('id,client_name,place,service,rating,review_text,image_url,is_visible,admin_reply,created_at').order('created_at', { ascending: false });
      }
      const data = result.data; const error = result.error;
      if (error) { host.innerHTML = '<div class="empty">Unable to load reviews. Check RLS policies.</div>'; return; }
      if (!data?.length) { host.innerHTML = '<div class="empty">No reviews yet.</div>'; dashboardReviews = []; updateStats(dashboardJobs, dashboardReviews); return; }
      const reviewRows = data;
      dashboardReviews = reviewRows;
      updateStats(dashboardJobs, dashboardReviews);
      host.innerHTML = data.map((r) => {
        const stars = '★'.repeat(Math.min(10, Math.max(0, Number(r.rating) || 0))) + '☆'.repeat(Math.max(0, 10 - (Number(r.rating) || 0)));
        const img = r.image_url ? '<img class="admin-full-img lb-clickable" src="' + esc(r.image_url) + '" alt=""/>' : '';
        const video = r.video_url ? '<video class="admin-full-img" controls preload="metadata" src="' + esc(r.video_url) + '"></video>' : '';
        return '<article class="admin-item ' + (r.is_visible ? '' : 'admin-hidden') + '">' +
          '<div class="job-meta"><span class="pill">' + (r.is_visible ? 'PUBLISHED' : 'HIDDEN') + '</span>' +
          '<span class="pill">' + esc(r.rating) + '/10</span><span class="pill">' + esc(r.service) + '</span></div>' +
          '<strong>' + esc(r.client_name) + '</strong><div class="admin-listing-meta">Posted ' + esc(r.created_at ? new Date(r.created_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}) : '') + '</div><div class="stars-line">' + stars + '</div>' +
          '<p>' + esc(r.review_text) + '</p>' + img + video +
          '<div class="field"><label>Avenix reply</label><textarea id="reply-' + r.id + '">' + esc(r.admin_reply || '') + '</textarea></div>' +
          '<div class="admin-item-actions">' +
          '<button class="btn gold small" type="button" data-edit-review="' + r.id + '">Edit</button>' +
          '<button class="btn gold small" type="button" data-save-review="' + r.id + '">Save Reply</button>' +
          '<button class="btn line small" type="button" data-toggle-review="' + r.id + '" data-current="' + r.is_visible + '">' + (r.is_visible ? 'Hide' : 'Publish') + '</button>' +
          '<button class="btn line small" type="button" data-delete-review="' + r.id + '">Delete</button></div></article>';
      }).join('');
      $$('[data-edit-review]').forEach((b) => b.addEventListener('click', async () => {
        let result = await db.from('reviews').select('*').eq('id', b.dataset.editReview).single();
        if (result.error && /video_url.*schema cache|column.*video_url/i.test(result.error.message || '')) {
          result = await db.from('reviews').select('id,client_name,place,service,rating,review_text,image_url,is_visible,admin_reply,created_at').eq('id', b.dataset.editReview).single();
        }
        const data = result.data; const error = result.error;
        if (error) return alert('Unable to load review.');
        $('#adminReviewId').value = data.id;
        $('#adminReviewName').value = data.client_name || '';
        $('#adminReviewService').value = data.service || 'Other';
        $('#adminReviewRating').value = String(data.rating || 10);
        $('#adminReviewText').value = data.review_text || '';
        reviewImageUrl = data.image_url || null; reviewVideoUrl = data.video_url || null;
        if ($('#reviewImagePreview') && reviewImageUrl) $('#reviewImagePreview').innerHTML = '<div class="img-preview"><img src="' + esc(reviewImageUrl) + '" alt=""><button type="button" class="trash-btn" id="rmReviewImg"><i class="fa-solid fa-trash"></i></button></div>';
        if ($('#reviewVideoPreview') && reviewVideoUrl) $('#reviewVideoPreview').innerHTML = '<div class="img-preview" style="width:180px;height:110px"><video src="' + esc(reviewVideoUrl) + '" controls style="width:100%;height:100%;object-fit:cover"></video><button type="button" class="trash-btn" id="rmReviewVideo"><i class="fa-solid fa-trash"></i></button></div>';
        window.scrollTo({ top: $('#adminReviewForm').offsetTop - 30, behavior: 'smooth' });
      }));
      $$('[data-save-review]').forEach((b) => b.addEventListener('click', async () => {
        const id = b.dataset.saveReview;
        const reply = ($('#reply-' + id)?.value || '').trim();
        const { error } = await db.from('reviews').update({ admin_reply: reply || null }).eq('id', id);
        if (error) alert('Unable to save reply.'); else loadReviews();
      }));
      $$('[data-toggle-review]').forEach((b) => b.addEventListener('click', async () => {
        const { error } = await db.from('reviews').update({ is_visible: b.dataset.current !== 'true' }).eq('id', b.dataset.toggleReview);
        if (error) alert('Unable to update.'); else loadReviews();
      }));
      $$('[data-delete-review]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Delete this review permanently?')) return;
        const { error } = await db.from('reviews').delete().eq('id', b.dataset.deleteReview);
        if (error) alert('Unable to delete.'); else loadReviews();
      }));
    }

    async function saveReview(e) {
      e.preventDefault();
      const id = $('#adminReviewId')?.value;
      const row = {
        client_name: $('#adminReviewName').value.trim(),
        service: $('#adminReviewService').value,
        rating: Number($('#adminReviewRating').value) || 10,
        review_text: $('#adminReviewText').value.trim(),
        is_visible: true,
        image_url: reviewImageUrl || null,
        video_url: reviewVideoUrl || null
      };
      if (!row.client_name || !row.review_text) {
        status('#adminReviewStatus', 'Name and review text are required.', true);
        return;
      }

      try {
        let result = id ? await db.from('reviews').update(row).eq('id', id) : await db.from('reviews').insert(row);
        if (result.error && /video_url.*schema cache|column.*video_url/i.test(result.error.message || '')) {
          if (reviewVideoUrl) throw new Error('Video reviews need the supplied Supabase review migration first. Please run SUPABASE-FINAL-FIX.sql, then try again.');
          const legacyRow = { ...row }; delete legacyRow.video_url;
          result = id ? await db.from('reviews').update(legacyRow).eq('id', id) : await db.from('reviews').insert(legacyRow);
        }
        if (result.error) throw result.error;
        e.target.reset();
        if ($('#adminReviewId')) $('#adminReviewId').value = '';
        reviewImageUrl = null;
        reviewVideoUrl = null;
        const videoPrev = $('#reviewVideoPreview'); if (videoPrev) videoPrev.innerHTML = '';
        const prev = $('#reviewImagePreview');
        if (prev) prev.innerHTML = '';
        status('#adminReviewStatus', 'Review saved.');
        loadReviews();
      } catch (err) {
        status('#adminReviewStatus', (err && err.message) || 'Unable to save review.', true);
      }
    }

    function parseImages(job) {
      if (!job) return [];
      if (job.image_url && String(job.image_url).startsWith('[')) {
        try { return JSON.parse(job.image_url); } catch (_) {}
      }
      if (job.image_url) return [job.image_url];
      return [];
    }

    async function loadJobs() {
      const host = $('#jobAdmin');
      if (!host) return;
      const { data, error } = await db.from('career_jobs').select('*').order('created_at', { ascending: false });
      if (error) { host.innerHTML = '<div class="empty">Unable to load openings.</div>'; return; }
      if (!data?.length) { host.innerHTML = '<div class="empty">No career listings yet.</div>'; dashboardJobs = []; updateStats(dashboardJobs, dashboardReviews); return; }
      dashboardJobs = data;
      updateStats(dashboardJobs, dashboardReviews);
      host.innerHTML = data.map((j) => {
        const imgs = parseImages(j);
        const thumbs = imgs.map((u) => '<img class="admin-thumb lb-clickable" src="' + esc(u) + '" alt=""/>').join('');
        return '<article class="admin-item ' + ((j.is_published !== false && (j.is_published === true || j.is_active !== false)) ? '' : 'admin-hidden') + '">' +
          '<div class="job-meta"><span class="pill">' + ((j.is_published !== false && (j.is_published === true || j.is_active !== false)) ? 'PUBLISHED' : 'HIDDEN') + '</span>' +
          '<span class="pill">' + (j.is_hiring_live ? 'LIVE HIRING' : 'NOT LIVE') + '</span>' +
          '<span class="pill">' + esc(j.country) + '</span></div>' +
          '<strong>' + esc(j.job_title) + '</strong>' +
          '<p>' + esc(j.city || j.location || '') + ' · ' + esc(j.estimated_salary || j.salary || '') + '</p>' +
          '<p class="admin-listing-meta">' + esc(j.opportunity_type || 'Opportunity') + ' · Posted ' + esc(j.posting_date || (j.created_at ? String(j.created_at).slice(0,10) : '')) + '</p>' +
          '<div class="thumb-row">' + thumbs + '</div>' +
          '<div class="admin-item-actions">' +
          '<button class="btn gold small" type="button" data-edit-job="' + j.id + '">Edit</button>' +
          '<button class="btn line small" type="button" data-toggle-job="' + j.id + '" data-current="' + (j.is_published !== false && (j.is_published === true || j.is_active !== false)) + '">' + ((j.is_published !== false && (j.is_published === true || j.is_active !== false)) ? 'Hide' : 'Publish') + '</button>' +
          '<button class="btn ' + (j.is_hiring_live ? 'btn-live' : 'line') + ' small" type="button" data-toggle-live-job="' + j.id + '" data-current="' + Boolean(j.is_hiring_live) + '">' + (j.is_hiring_live ? 'Unlive' : 'Currently Hiring') + '</button>' +
          '<button class="btn line small" type="button" data-delete-job="' + j.id + '">Delete</button></div></article>';
      }).join('');
      $$('[data-edit-job]').forEach((b) => b.addEventListener('click', async () => {
        const { data, error } = await db.from('career_jobs').select('*').eq('id', b.dataset.editJob).single();
        if (error) return alert('Unable to load listing.');
        $('#jobId').value = data.id;
        $('#jobActive').value = String(Boolean(data.is_active));
        $('#jobPublished').checked = data.is_published !== false && (data.is_published === true || data.is_active !== false);
        $('#jobLive').checked = Boolean(data.is_hiring_live);
        $('#jobTitle').value = data.job_title || '';
        $('#jobCountry').value = data.country || '';
        $('#jobCity').value = data.city || data.location || '';
        $('#jobPosition').value = data.position || data.employment_type || '';
        $('#jobSector').value = data.sector || '';
        $('#jobEmploymentType').value = data.employment_type || 'Full-time';
        $('#jobSalary').value = data.estimated_salary || data.salary || '';
        $('#jobSalaryPeriod').value = data.salary_period || 'As stated';
        $('#jobOpportunityType').value = data.opportunity_type || 'Visit to Work';
        $('#jobPostDate').value = data.posting_date || (data.created_at ? String(data.created_at).slice(0,10) : new Date().toISOString().slice(0,10));
        $('#jobPositions').value = data.positions || '';
        $('#jobExperience').value = data.experience || '';
        $('#jobInterview').checked = typeof data.interview_required === 'boolean' ? data.interview_required : (/Interview:\s*Yes/i.test(data.requirements || '') || data.employer === 'Interview:Yes');
        $('#jobRequirements').value = (data.requirements || '').replace(/^Interview:\s*(Yes|No)\n?/i, '');
        $('#jobDescription').value = data.description || '';
                jobImageUrls = parseImages(data);
        renderJobImagePreviews();
        window.scrollTo({ top: $('#jobForm').offsetTop - 40, behavior: 'smooth' });
      }));
      $$('[data-toggle-job]').forEach((b) => b.addEventListener('click', async () => {
        const next = b.dataset.current !== 'true'; const { error } = await db.from('career_jobs').update({ is_active: next, is_published: next }).eq('id', b.dataset.toggleJob);
        if (error) alert('Unable to update.'); else loadJobs();
      }));
      $$('[data-toggle-live-job]').forEach((b) => b.addEventListener('click', async () => {
        const next = b.dataset.current !== 'true';
        const { error } = await db.from('career_jobs').update({ is_hiring_live: next }).eq('id', b.dataset.toggleLiveJob);
        if (error) alert('Unable to update live hiring status. Please run the supplied database migration if the column is not yet available.'); else loadJobs();
      }));
      $$('[data-delete-job]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Delete this hiring post permanently?')) return;
        const { error } = await db.from('career_jobs').delete().eq('id', b.dataset.deleteJob);
        if (error) alert('Unable to delete.'); else loadJobs();
      }));
    }

    async function saveJob(e) {
      e.preventDefault();
      const id = $('#jobId').value;
      const description = $('#jobDescription').value.trim();
      const requirementsRaw = $('#jobRequirements').value.trim();
      const interview = $('#jobInterview')?.checked;
      if (words(description) < 10) {
        status('#jobStatus', 'Description must contain at least 10 words.', true);
        return;
      }
      const row = {
        job_title: $('#jobTitle').value.trim(), country: $('#jobCountry').value.trim(),
        city: $('#jobCity').value.trim() || null, location: $('#jobCity').value.trim() || null,
        position: $('#jobPosition').value.trim(), sector: $('#jobSector').value || null, opportunity_type: $('#jobOpportunityType').value || null,
        employment_type: $('#jobEmploymentType').value || null, salary: $('#jobSalary').value.trim(), estimated_salary: $('#jobSalary').value.trim(),
        salary_period: $('#jobSalaryPeriod').value || null, positions: $('#jobPositions').value ? Number($('#jobPositions').value) : null,
        experience: $('#jobExperience').value.trim() || null, interview_required: Boolean(interview),
        requirements: requirementsRaw, description,
        posting_date: $('#jobPostDate').value || new Date().toISOString().slice(0,10),
        employer: null, is_active: $('#jobPublished').checked, is_published: $('#jobPublished').checked,
        is_hiring_live: $('#jobLive').checked
      };
      if (!row.job_title || !row.country || !row.position || !row.salary || !requirementsRaw) {
        status('#jobStatus', 'Complete all required fields (*).', true);
        return;
      }
      if (!jobImageUrls.length && !id) {
        status('#jobStatus', 'Please add at least one image.', true);
        return;
      }
      if (jobImageUrls.length === 1) row.image_url = jobImageUrls[0];
      else if (jobImageUrls.length > 1) row.image_url = JSON.stringify(jobImageUrls);
      try {
        let result = id ? await db.from('career_jobs').update(row).eq('id', id) : await db.from('career_jobs').insert(row);
        if (result.error && /schema cache|column .*career_jobs/i.test(result.error.message || '')) {
          // Compatibility path for a project that has not run the new job migration.
          // The original database columns remain usable, so saving a core hiring post
          // should not be blocked by optional new fields.
          const legacyRow = {
            job_title: row.job_title, country: row.country, location: row.city || null,
            employment_type: row.position || row.employment_type || null, salary: row.salary,
            description: row.description, requirements: row.requirements,
            image_url: row.image_url || null, is_active: row.is_active,
          };
          result = id ? await db.from('career_jobs').update(legacyRow).eq('id', id) : await db.from('career_jobs').insert(legacyRow);
          if (!result.error) {
            status('#jobStatus', 'Hiring post saved. Run SUPABASE-FINAL-FIX.sql to enable the new Admin fields and live-hiring controls.');
          }
        }
        if (result.error) throw result.error;
        e.target.reset();
        $('#jobId').value = '';
        $('#jobActive').value = 'true';
        $('#jobLive').checked = false;
        if ($('#jobPostDate')) $('#jobPostDate').value = new Date().toISOString().slice(0,10);
        jobImageUrls = [];
        renderJobImagePreviews();
        status('#jobStatus', 'Hiring post saved.');
        loadJobs();
      } catch (err) {
        status('#jobStatus', (err && err.message) || 'Unable to save.', true);
      }
    }

    async function changePassword(e) {
      e.preventDefault();
      const { data: { user } } = await db.auth.getUser();
      if ((user?.email || '').toLowerCase() !== owner) {
        status('#passwordStatus', 'Only the primary Admin can change passwords.', true);
        return;
      }
      const target = $('#passwordTarget').value;
      const newPass = $('#newPassword').value;
      const confirmPass = $('#confirmPassword').value;
      const current = $('#currentPassword').value;
      if (!allowed.includes(target)) { status('#passwordStatus', 'Select an authorised account.', true); return; }
      if (newPass.length < 8) { status('#passwordStatus', 'Min 8 characters.', true); return; }
      if (newPass !== confirmPass) { status('#passwordStatus', 'Passwords do not match.', true); return; }
      if (target === owner) {
        if (!current) { status('#passwordStatus', 'Enter current Admin password.', true); return; }
        const check = await db.auth.signInWithPassword({ email: owner, password: current });
        if (check.error) { status('#passwordStatus', 'Current Admin password is incorrect.', true); return; }
      }
      status('#passwordStatus', 'Updating…');
      try {
        const { error } = await db.functions.invoke('admin-change-password', {
          body: { target_email: target, new_password: newPass, current_admin_password: target === owner ? current : '' }
        });
        if (error) throw error;
        e.target.reset();
        $('#passwordTarget').value = owner;
        status('#passwordStatus', 'Password updated successfully.');
      } catch (err) {
        status('#passwordStatus', 'Password could not be updated.', true);
      }
    }


    // ---------- Admin UI controls ----------
    $('#toggleAdminPassword')?.addEventListener('click', () => {
      const input = $('#adminPassword');
      const icon = $('#toggleAdminPassword')?.querySelector('i');
      if (!input) return;
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      $('#toggleAdminPassword').setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
      $('#toggleAdminPassword').title = visible ? 'Show password' : 'Hide password';
      icon?.classList.toggle('fa-eye', visible);
      icon?.classList.toggle('fa-eye-slash', !visible);
    });

    $$('.admin-tabs button[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        $$('.admin-tabs button').forEach((b) => b.classList.remove('active'));
        button.classList.add('active');
        $$('.panel-section').forEach((panel) => panel.classList.remove('active'));
        $('#panel-' + button.dataset.tab)?.classList.add('active');
      });
    });

    // ---------- Session lifecycle security ----------
    let inactivityTimer = null;
    let warningTimer = null;
    const INACTIVITY_MS = 60 * 1000;
    const WARNING_MS = 50 * 1000;
    let leaveHandled = false;

    function clearSessionTimers() {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (warningTimer) clearTimeout(warningTimer);
      inactivityTimer = warningTimer = null;
    }

    async function forceLogout(reason) {
      clearSessionTimers();
      if (!currentUser && !document.body.classList.contains('admin-session-active')) return;
      currentUser = null;
      historyGuardArmed = false;
      leaveHandled = true;
      try { await db.auth.signOut({ scope: 'local' }); } catch (_) {}
      unlockAdminPage();
      if ($('#dashboard')) $('#dashboard').hidden = true;
      if ($('#loginBox')) $('#loginBox').hidden = false;
      $('#loginForm')?.reset();
      if ($('#logoutBtn')) $('#logoutBtn').hidden = true;
      if ($('#refreshBtn')) $('#refreshBtn').hidden = true;
      setPasswordUi(null);
      if (reason) status('#loginStatus', reason);
    }

    function armInactivityTimer() {
      clearSessionTimers();
      if (!currentUser) return;
      warningTimer = setTimeout(() => {
        status('#loginStatus', 'You will be logged out after 60 seconds of inactivity.');
      }, WARNING_MS);
      inactivityTimer = setTimeout(() => {
        forceLogout('You were logged out after 60 seconds of inactivity.');
      }, INACTIVITY_MS);
    }

    const activityEvents = ['pointerdown', 'pointermove', 'touchstart', 'keydown', 'wheel', 'scroll', 'input'];
    activityEvents.forEach((eventName) => {
      document.addEventListener(eventName, () => {
        if (currentUser && !leaveHandled) armInactivityTimer();
      }, { passive: true });
    });

    // Leaving/backgrounding the Admin Panel starts a one-minute standby window.
    // Returning within that minute keeps the session; returning later logs out.
    const ADMIN_STANDBY_MS = 60 * 1000;
    let leaveTimeout = null;
    function markAdminLeave() {
      if (!currentUser) return;
      try { sessionStorage.setItem('avenix_admin_left_at', String(Date.now())); } catch (_) {}
      if (leaveTimeout) clearTimeout(leaveTimeout);
      leaveTimeout = setTimeout(() => {
        if (document.visibilityState === 'hidden') {
          forceLogout('You were logged out after 1 minute away from the Admin Panel.');
        }
      }, ADMIN_STANDBY_MS);
    }
    function cancelAdminLeave() {
      if (leaveTimeout) { clearTimeout(leaveTimeout); leaveTimeout = null; }
      try { sessionStorage.removeItem('avenix_admin_left_at'); } catch (_) {}
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') markAdminLeave();
      else if (document.visibilityState === 'visible') cancelAdminLeave();
    });
    window.addEventListener('pagehide', () => {
      if (currentUser) { try { sessionStorage.setItem('avenix_admin_left_at', String(Date.now())); } catch (_) {} }
    });
    window.addEventListener('pageshow', async () => {
      try {
        const leftAt = Number(sessionStorage.getItem('avenix_admin_left_at') || 0);
        if (!leftAt) return;
        const elapsed = Date.now() - leftAt;
        if (elapsed >= ADMIN_STANDBY_MS) {
          await forceLogout('You were logged out after 1 minute away from the Admin Panel.');
        } else {
          cancelAdminLeave();
        }
      } catch (_) {}
    });


    // ---------- Admin history guard ----------
    let historyGuardArmed = false;
    function armHistoryGuard() {
      if (historyGuardArmed) return;
      historyGuardArmed = true;
      try { history.pushState({ avenixAdminGuard: true }, '', location.href); } catch (_) {}
    }
    window.addEventListener('popstate', async () => {
      if (!currentUser) return;
      await forceLogout('Admin session ended because you left the Admin Panel.');
      location.replace('admin.html');
    });

    // ---------- Authentication ----------
    let authBusy = false;
    let currentUser = null;

    function authMessage(err) {
      const msg = String(err?.message || err || '').toLowerCase();
      if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
        return 'Email or password is incorrect. Please use the latest password for this account.';
      }
      if (msg.includes('email not confirmed')) {
        return 'This email is not confirmed. Please confirm the account before signing in.';
      }
      if (msg.includes('too many requests') || msg.includes('rate limit')) {
        return 'Too many login attempts. Please wait a few minutes and try again.';
      }
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch')) {
        return 'Unable to reach the authentication service. Check your internet connection and try again.';
      }
      return err?.message || 'Login failed. Please check the account and try again.';
    }

    function setLoginBusy(busy) {
      authBusy = busy;
      const btn = $('#loginForm button[type="submit"]');
      if (btn) {
        btn.disabled = busy;
        btn.setAttribute('aria-busy', busy ? 'true' : 'false');
        btn.innerHTML = busy ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Signing in…' : '<i class="fa-solid fa-right-to-bracket"></i> Sign in';
      }
    }

    async function handleSession(session) {
      if (!session?.user) {
        currentUser = null;
        unlockAdminPage();
        if ($('#dashboard')) $('#dashboard').hidden = true;
        if ($('#loginBox')) $('#loginBox').hidden = false;
        if ($('#logoutBtn')) $('#logoutBtn').hidden = true;
        if ($('#refreshBtn')) $('#refreshBtn').hidden = true;
        setPasswordUi(null);
        return;
      }
      currentUser = session.user;
      leaveHandled = false;
      await openDashboard(session.user);
      armInactivityTimer();
    }

    // Restore an existing Supabase session, then keep the UI synced with auth events.
    try {
      const { data, error } = await db.auth.getSession();
      if (error) throw error;
      await handleSession(data.session);
    } catch (err) {
      status('#loginStatus', 'Could not initialise secure login: ' + authMessage(err), true);
    }

    db.auth.onAuthStateChange((event, session) => {
      // Avoid doing network-heavy dashboard work inside the auth callback itself.
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        setTimeout(() => handleSession(session).catch((err) => status('#loginStatus', authMessage(err), true)), 0);
      }
      if (event === 'SIGNED_OUT') setTimeout(() => handleSession(null), 0);
    });

    $('#loginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (authBusy) return;
      const email = ($('#adminEmail')?.value || '').trim().toLowerCase();
      const password = $('#adminPassword')?.value || '';
      if (!email || !password) {
        status('#loginStatus', 'Enter your email and password.', true);
        return;
      }
      setLoginBusy(true);
      status('#loginStatus', 'Signing in securely…');
      try {
        // Clear any stale client session before a new sign-in attempt.
        await db.auth.signOut({ scope: 'local' });
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data?.user || !data?.session) throw new Error('No active session was returned. Check that Email/Password sign-in is enabled for this account.');
        if ((data.user.email || '').toLowerCase() !== email) {
          await db.auth.signOut({ scope: 'local' });
          throw new Error('The authenticated account does not match the requested admin account.');
        }
        status('#loginStatus', 'Login successful. Opening admin panel…');
        await openDashboard(data.user);
      } catch (err) {
        status('#loginStatus', authMessage(err), true);
      } finally {
        setLoginBusy(false);
      }
    });

    $('#logoutBtn')?.addEventListener('click', async () => {
      clearSessionTimers();
      leaveHandled = true;
      await db.auth.signOut();
      unlockAdminPage();
      $('#loginForm')?.reset();
      try { sessionStorage.removeItem('avenix_admin_left_at'); } catch (_) {}
      location.replace('reviews.html');
    });
    $('#refreshBtn')?.addEventListener('click', () => { loadReviews(); loadJobs(); });
    $('#adminReviewForm')?.addEventListener('submit', saveReview);
    $('#jobForm')?.addEventListener('submit', saveJob);
    $('#passwordForm')?.addEventListener('submit', changePassword);

    document.addEventListener('click', (e) => {
      if (e.target.closest('#rmReviewImg')) { reviewImageUrl = null; $('#reviewImagePreview').innerHTML = ''; }
      if (e.target.closest('#rmReviewVideo')) { reviewVideoUrl = null; $('#reviewVideoPreview').innerHTML = ''; $('#adminReviewVideo').value = ''; }
    });

    $('#adminReviewVideo')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      try {
        const probe = await db.from('reviews').select('video_url').limit(1);
        if (probe.error && /video_url.*schema cache|column.*video_url/i.test(probe.error.message || '')) {
          throw new Error('Video reviews need the supplied Supabase migration first. Run SUPABASE-FINAL-FIX.sql once, then choose the video again.');
        }
        reviewVideoUrl = await upload(f, 'reviews', 20 * 1024 * 1024, 'video'); const prev = $('#reviewVideoPreview'); if (prev && reviewVideoUrl) { prev.innerHTML = '<div class="img-preview" style="width:180px;height:110px"><video src="' + esc(reviewVideoUrl) + '" controls style="width:100%;height:100%;object-fit:cover"></video><button type="button" class="trash-btn" id="rmReviewVideo" aria-label="Remove video"><i class="fa-solid fa-trash"></i></button></div>'; $('#rmReviewVideo')?.addEventListener('click', () => { reviewVideoUrl = null; prev.innerHTML = ''; $('#adminReviewVideo').value = ''; }); } } catch (err) { status('#adminReviewStatus', err.message || 'Video upload failed.', true); }
      e.target.value = '';
    });

    $('#jobImages')?.addEventListener('change', async (e) => {
      const files = [...(e.target.files || [])];
      status('#jobStatus', 'Uploading…');
      try {
        for (const f of files) {
          const url = await upload(f, 'careers');
          if (url) jobImageUrls.push(url);
        }
        renderJobImagePreviews();
        status('#jobStatus', jobImageUrls.length + ' image(s) ready.');
      } catch (err) {
        status('#jobStatus', err.message || 'Upload failed.', true);
      }
      e.target.value = '';
    });

    $('#adminReviewImage')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        reviewImageUrl = await upload(f, 'reviews');
        const prev = $('#reviewImagePreview');
        if (prev && reviewImageUrl) {
          prev.innerHTML = '<div class="img-preview"><img src="' + esc(reviewImageUrl) + '" alt=""/><button type="button" class="trash-btn" id="rmReviewImg"><i class="fa-solid fa-trash"></i></button></div>';
          $('#rmReviewImg')?.addEventListener('click', () => { reviewImageUrl = null; prev.innerHTML = ''; });
        }
      } catch (err) {
        status('#adminReviewStatus', err.message || 'Upload failed.', true);
      }
    });

    $('#jobClear')?.addEventListener('click', () => {
      jobImageUrls = [];
      renderJobImagePreviews();
      if ($('#jobId')) $('#jobId').value = '';
      if ($('#jobPostDate')) $('#jobPostDate').value = new Date().toISOString().slice(0,10);
    });

    const target = $('#passwordTarget');
    if (target) {
      const updateCurrent = () => {
        const own = target.value === owner;
        const current = $('#currentPasswordField');
        const currentInput = $('#currentPassword');
        if (current) current.hidden = !own;
        if (currentInput) { currentInput.required = own; if (!own) currentInput.value = ''; }
      };
      target.onchange = updateCurrent;
      updateCurrent();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitAndStart);
  else waitAndStart();
})();
