/* Avenix Overseas — Work Opportunity / Hiring public view. */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));

  let jobs = [];
  let activeJob = null;

  function supabaseClient() {
    if (!window.supabase?.createClient) return null;
    if (!window.AVENIX_SUPABASE_URL || !window.AVENIX_SUPABASE_ANON_KEY) return null;
    return window.supabase.createClient(window.AVENIX_SUPABASE_URL, window.AVENIX_SUPABASE_ANON_KEY);
  }

  function getImages(job) {
    const value = job?.image_url;
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    const text = String(value).trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
      } catch (_) {}
    }
    return [text];
  }

  function openJobModal(job) {
    const modal = $('#jobModal');
    const body = $('#jobModalBody');
    if (!modal || !body || !job) return;

    activeJob = job;
    const images = getImages(job);
    const meta = [job.country, job.location, job.salary, job.employment_type]
      .filter(Boolean)
      .map(value => `<span>${esc(value)}</span>`).join('');

    const sections = [
      ['Job description', job.description],
      ['Requirements', String(job.requirements || '').replace(/^Interview:\s*(Yes|No)\s*/i, '').trim()],
      ['Benefits', job.benefits],
      ['Accommodation', job.accommodation],
      ['Application information', job.application_information]
    ].filter(([, value]) => value);

    const interview = /Interview:\s*Yes/i.test(job.requirements || '') || job.employer === 'Interview:Yes'
      ? 'Yes'
      : /Interview:\s*No/i.test(job.requirements || '') ? 'No' : '';

    const gallery = images.length ? `
      <div class="job-modal-gallery" aria-label="Job images">
        ${images.map((url, index) => `
          <button class="job-image-trigger" type="button" data-full-image="${esc(url)}" data-image-alt="${esc(job.job_title || 'Work opportunity image')}" aria-label="Open job image ${index + 1}">
            <img src="${esc(url)}" alt="${esc(job.job_title || 'Work opportunity image')}" loading="lazy">
          </button>`).join('')}
      </div>` : '';

    body.innerHTML = `
      ${images[0] ? `<button class="job-modal-hero-image job-image-trigger" type="button" data-full-image="${esc(images[0])}" data-image-alt="${esc(job.job_title || 'Work opportunity image')}" aria-label="Open full job image"><img src="${esc(images[0])}" alt="${esc(job.job_title || 'Work opportunity image')}"></button>` : ''}
      <h2 id="jobModalTitle">${esc(job.job_title || 'Work opportunity')}</h2>
      ${meta ? `<div class="job-meta-line">${meta}</div>` : ''}
      ${interview ? `<div class="job-interview"><strong>Interview:</strong> ${interview}</div>` : ''}
      ${job.positions ? `<div class="job-detail-meta"><strong>Positions:</strong> ${esc(job.positions)}</div>` : ''}
      ${job.experience ? `<div class="job-detail-meta"><strong>Experience:</strong> ${esc(job.experience)}</div>` : ''}
      ${sections.map(([title, value]) => `<section class="job-detail-section"><h3>${esc(title)}</h3><div>${esc(value)}</div></section>`).join('')}
      ${images.length > 1 ? gallery : ''}
      <a class="btn btn-gold job-apply" href="contact.html#consultation">Enquire about this opportunity</a>`;

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    document.body.classList.add('job-modal-open');
    $('.job-modal-close', modal)?.focus();
  }

  function closeJobModal() {
    const modal = $('#jobModal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open', 'job-modal-open');
    activeJob = null;
  }

  function openFullImage(src, alt) {
    if (!src) return;
    let viewer = $('#jobImageViewer');
    if (!viewer) {
      viewer = document.createElement('div');
      viewer.id = 'jobImageViewer';
      viewer.className = 'job-image-viewer';
      viewer.hidden = true;
      viewer.innerHTML = `
        <div class="job-image-viewer-backdrop" data-image-viewer-close></div>
        <div class="job-image-viewer-panel" role="dialog" aria-modal="true" aria-label="Full size job image">
          <button type="button" class="job-image-viewer-close" data-image-viewer-close aria-label="Close image">&times;</button>
          <img id="jobFullImage" alt="">
        </div>`;
      document.body.appendChild(viewer);
    }
    const image = $('#jobFullImage', viewer);
    image.src = src;
    image.alt = alt || 'Full size job image';
    viewer.hidden = false;
    viewer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('image-viewer-open');
  }

  function closeFullImage() {
    const viewer = $('#jobImageViewer');
    if (!viewer) return;
    viewer.hidden = true;
    viewer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('image-viewer-open');
    const image = $('#jobFullImage', viewer);
    if (image) image.removeAttribute('src');
  }

  function renderJobs() {
    const host = $('#hiring-list');
    if (!host) return;

    if (!jobs.length) {
      host.innerHTML = '<div class="job-empty">No published openings are available right now. Please check back soon or contact Avenix for guidance.</div>';
      return;
    }

    host.innerHTML = jobs.map((job, index) => {
      const images = getImages(job);
      return `<article class="job-card">
        ${images[0] ? `<button class="job-card-image job-image-trigger" type="button" data-full-image="${esc(images[0])}" data-image-alt="${esc(job.job_title || 'Work opportunity image')}" aria-label="Open job image"><img src="${esc(images[0])}" alt="${esc(job.job_title || 'Work opportunity image')}" loading="lazy"></button>` : ''}
        <div class="job-card-top"><span class="job-country">${esc(job.country || 'International')}</span>${job.employment_type ? `<span class="job-type">${esc(job.employment_type)}</span>` : ''}</div>
        <h3>${esc(job.job_title || 'Work opportunity')}</h3>
        <p class="job-summary">${esc(job.location || '')}${job.salary ? ` · ${esc(job.salary)}` : ''}</p>
        ${job.description ? `<p class="job-excerpt">${esc(String(job.description).slice(0, 180))}${String(job.description).length > 180 ? '…' : ''}</p>` : ''}
        <button class="btn btn-dark job-view" type="button" data-job-index="${index}">View details</button>
      </article>`;
    }).join('');
  }

  async function loadJobs() {
    const host = $('#hiring-list');
    if (!host) return;
    const client = supabaseClient();
    if (!client) {
      host.innerHTML = '<div class="job-empty">Current openings are temporarily unavailable. Please refresh the page.</div>';
      return;
    }

    try {
      const { data, error } = await client
        .from('career_jobs')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      jobs = Array.isArray(data) ? data : [];
      renderJobs();
    } catch (error) {
      console.error('Supabase career_jobs load failed:', error);
      host.innerHTML = '<div class="job-empty">We could not load current openings right now. Please try again later.</div>';
    }
  }

  function init() {
    const host = $('#hiring-list');
    const modal = $('#jobModal');
    if (!host || !modal) return;

    host.addEventListener('click', event => {
      const viewButton = event.target.closest('.job-view[data-job-index]');
      if (viewButton) {
        event.preventDefault();
        event.stopPropagation();
        const index = Number(viewButton.dataset.jobIndex);
        if (Number.isInteger(index) && jobs[index]) openJobModal(jobs[index]);
        return;
      }

      const imageButton = event.target.closest('.job-image-trigger[data-full-image]');
      if (imageButton) {
        event.preventDefault();
        event.stopPropagation();
        openFullImage(imageButton.dataset.fullImage, imageButton.dataset.imageAlt);
      }
    });

    modal.addEventListener('click', event => {
      if (event.target.closest('[data-close-modal]')) {
        event.preventDefault();
        closeJobModal();
        return;
      }
      const imageButton = event.target.closest('.job-image-trigger[data-full-image]');
      if (imageButton) {
        event.preventDefault();
        event.stopPropagation();
        openFullImage(imageButton.dataset.fullImage, imageButton.dataset.imageAlt);
      }
    });

    document.addEventListener('click', event => {
      if (event.target.closest('[data-image-viewer-close]')) {
        event.preventDefault();
        closeFullImage();
      }
    });

    document.addEventListener('click', event => {
      if (event.target.closest('#jobImageViewer .job-image-viewer-panel img')) event.stopPropagation();
    }, true);

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (!$('#jobImageViewer')?.hidden) closeFullImage();
      else if (!modal.hidden) closeJobModal();
    });

    loadJobs();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
